import { cortexVersion } from '../../../cortex/core.mjs';
import { Refused } from '../store.mjs';

const invalid = message => { throw new Refused(400, 'InvalidTool', message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const line = (value, limit) => typeof value === 'string' && Boolean(value.trim()) && [...value].length <= limit && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(value);
const known = name => typeof name === 'string' && name.length <= 100 && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(name) ? name : invalid('name is lowercase words joined with hyphens or underscores, at most 100 characters');
const current = (db, did, name) => db.prepare('SELECT * FROM cortex_tools WHERE did = ?1 AND name = ?2').bind(did, name).first();
const changed = (name, held) => new Refused(409, 'Changed', 'The tool has changed since this version', { name, current: held?.version ?? null });
const next = '(SELECT COALESCE(MAX(seq), 0) + 1 FROM cortex_tools WHERE did = ?1)';

async function member(context) {
  if (!context.user || context.request.headers.has('Authorization')) throw new Refused(401, 'SignInRequired', 'Sign in to ohm to change the list of tools');
  const did = await context.linked.didOf(context.user.id);
  if (!did) throw new Refused(409, 'NotConnected', 'Connect your AT Protocol account first');
  return did;
}

function cleanTool(given, proposed) {
  const fields = proposed ? ['name', 'description', 'inputs', 'outputs'] : ['name', 'description', 'on', 'address'];
  if (!object(given) || Object.keys(given).some(key => !fields.includes(key))) invalid(`tool holds only ${fields.join(', ')}; credentials stay in the member’s local settings`);
  const name = known(given.name);
  if (!line(given.description, 200)) invalid('description is one nonempty line, at most 200 characters');
  if (proposed) {
    for (const key of ['inputs', 'outputs']) if (typeof given[key] !== 'string' || !given[key].trim() || !given[key].isWellFormed() || given[key].includes('\0') || new TextEncoder().encode(given[key]).length > 8192) invalid(`${key} describes what the tool would take or give, at most 8 KB of text`);
    return { name, description: given.description, inputs: given.inputs, outputs: given.outputs, on: false };
  }
  if (typeof given.on !== 'boolean') invalid('on is true or false');
  if (given.address !== undefined) {
    let address;
    try { address = new URL(given.address); } catch { invalid('address is an HTTPS server address'); }
    if (typeof given.address !== 'string' || given.address.length > 2000 || /[\s\u0000-\u001f]/u.test(given.address) || address.protocol !== 'https:' || address.username || address.password || address.search || address.hash) invalid('address is HTTPS without credentials, query or fragment; keys stay in local settings');
  }
  return { name, description: given.description, on: given.on, ...(given.address === undefined ? {} : { address: given.address }) };
}

async function save(context, proposed) {
  const did = proposed ? context.did : await member(context);
  const { tool: given, replaces = null } = await context.body();
  const tool = cleanTool(given, proposed);
  const { name } = tool;
  const db = context.env.DB;
  const held = await current(db, did, name);
  const content = await cortexVersion({ tool, proposed });
  if (held?.version && Boolean(held.proposed) === proposed && await cortexVersion({ tool: JSON.parse(held.tool), proposed }) === content) return { name, ...(proposed ? { proposed: true } : { version: held.version }), unchanged: true };
  if (proposed && held?.version || held?.version && replaces === null) throw new Refused(409, 'NameTaken', 'A tool already has this name; a proposal cannot change an existing tool', { name, current: held.version });
  if ((held?.version ?? null) !== replaces) throw changed(name, held);
  if (!proposed && held?.version && held.proposed) invalid('This is a proposal for something still to be built; it cannot be switched on as a tool');
  const version = await cortexVersion({ content, after: held?.seq ?? 0 });
  const now = new Date().toISOString();
  const saved = await db.prepare(`INSERT INTO cortex_tools (did, name, version, description, tool, enabled, proposed, written_by, seq, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?1, ${next}, ?8, ?8 WHERE ?9 IS NULL OR EXISTS (SELECT 1 FROM cortex_tools WHERE did = ?1 AND name = ?2)
    ON CONFLICT (did, name) DO UPDATE SET version = excluded.version, description = excluded.description, tool = excluded.tool,
      enabled = excluded.enabled, proposed = excluded.proposed, written_by = excluded.written_by, seq = excluded.seq, updated_at = excluded.updated_at
    WHERE cortex_tools.version IS ?9 RETURNING version`)
    .bind(did, name, version, tool.description, JSON.stringify(tool), proposed ? 0 : Number(tool.on), Number(proposed), now, replaces).first();
  if (!saved) {
    const latest = await current(db, did, name);
    if (latest?.version === version) return { name, ...(proposed ? { proposed: true } : { version }), unchanged: true };
    throw changed(name, latest);
  }
  return { name, ...(proposed ? { proposed: true } : { version }) };
}

export default {
  name: 'Tools',
  about: 'The member’s private tool settings and inert proposals. Only an ohm session changes tool settings. Server addresses are metadata; this capability never connects to a server or keeps credentials.',
  requests: {
    'com.ohmmmm.cortex.listTools': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'List tool settings with versions, and proposals marked proposed and off. Context exposes only enabled tools that are not proposals.',
      takes: {}, gives: '`tools` (name, description, on, address when given, version, proposed, writtenBy; inputs and outputs on proposals)',
      run: async ({ env, did }) => ({ tools: (await env.DB.prepare('SELECT name, version, tool, enabled, proposed, written_by FROM cortex_tools WHERE did = ?1 AND version IS NOT NULL ORDER BY name').bind(did).all()).results.map(row => ({ ...JSON.parse(row.tool), name: row.name, version: row.version, on: Boolean(row.enabled) && !row.proposed, proposed: Boolean(row.proposed), writtenBy: row.written_by })) }),
    },
    'com.ohmmmm.cortex.putTool': {
      verb: 'POST', asks: 'ohm', changes: true,
      about: 'Save or switch a tool from the linked member’s ohm session, naming the version replaced. A proposal cannot be switched on. No credentials or executable configuration is accepted.',
      takes: { tool: '{name, description, on, address?}; optional address is credential-free HTTPS metadata only', replaces: 'optional: the version being replaced' }, gives: '`name`, `version`, optionally `unchanged`',
      run: context => save(context, false),
    },
    'com.ohmmmm.cortex.deleteTool': {
      verb: 'POST', asks: 'ohm', changes: true,
      about: 'Remove a tool setting or proposal from the linked member’s ohm session, naming its current version. Repeating a completed removal is safe.',
      takes: { name: 'the tool name', replaces: 'the current version' }, gives: '`name`, `removed`',
      run: async context => {
        const did = await member(context);
        const { name: given, replaces = null } = await context.body();
        const name = known(given);
        const db = context.env.DB;
        const held = await current(db, did, name);
        if (!held?.version) return { name, removed: true, unchanged: true };
        if (held.version !== replaces) throw changed(name, held);
        const removed = await db.prepare(`UPDATE cortex_tools SET version = NULL, tool = NULL, enabled = 0, seq = ${next}, updated_at = ?3 WHERE did = ?1 AND name = ?2 AND version = ?4 RETURNING name`).bind(did, name, new Date().toISOString(), replaces).first();
        if (!removed) {
          const latest = await current(db, did, name);
          if (latest?.version) throw changed(name, latest);
        }
        return { name, removed: true };
      },
    },
    'com.ohmmmm.cortex.proposeTool': {
      verb: 'POST', asks: 'member', changes: true,
      about: 'Record a tool to be built, with its inputs and outputs. It is always off and proposed, cannot overwrite a tool, and identical retries keep one proposal.',
      takes: { tool: '{name, description, inputs, outputs}; inputs and outputs are text' }, gives: '`name`, `proposed`, optionally `unchanged`',
      run: context => save(context, true),
    },
  },
};
