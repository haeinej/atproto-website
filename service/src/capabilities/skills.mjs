import { cortexVersion, NAME } from '../../../cortex/core.mjs';
import { readProperties, splitFile } from '../../../vault/file.mjs';
import { Refused } from '../store.mjs';

const invalid = message => { throw new Refused(400, 'InvalidSkill', message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bytes = text => new TextEncoder().encode(text).length;
const known = name => typeof name === 'string' && name.length <= 100 && NAME.test(name) ? name : invalid('name is lowercase words joined with hyphens, at most 100 characters');
const changed = (name, held) => new Refused(409, 'Changed', 'The skill has changed since this version', { name, current: held?.version ?? null });
const current = (db, did, name) => db.prepare('SELECT * FROM cortex_skills WHERE did = ?1 AND name = ?2').bind(did, name).first();
const next = '(SELECT COALESCE(MAX(seq), 0) + 1 FROM cortex_skills WHERE did = ?1)';

// Tokens are also how agents ask. A cookie alongside one cannot approve a skill.
const atKeyboard = context => Boolean(context.user && !context.request.headers.has('Authorization'));
async function member(context) {
  if (!atKeyboard(context)) throw new Refused(401, 'SignInRequired', 'Sign in to ohm to manage skill approval or remove a skill');
  const did = context.did;
  if (!did) throw new Refused(409, 'NotConnected', 'Connect your AT Protocol account first');
  return did;
}

function cleanSkill(skill) {
  if (!object(skill) || Object.keys(skill).some(key => !['text', 'files'].includes(key))) invalid('skill holds text (SKILL.md) and files (path and text) only');
  if (typeof skill.text !== 'string' || !skill.text.isWellFormed() || skill.text.includes('\0') || bytes(skill.text) > 65536) invalid('SKILL.md is UTF-8 text, at most 64 KB');
  const { head } = splitFile(skill.text);
  if (head === null) invalid('SKILL.md starts with name and description between --- lines');
  const { properties, problems } = readProperties(head);
  const keys = head.split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#')).map(line => /^([A-Za-z][A-Za-z0-9_-]*)\s*:/.exec(line)?.[1]);
  if (problems.length || keys.some(key => !['name', 'description'].includes(key)) || new Set(keys).size !== keys.length) invalid('SKILL.md has name and description once each, as plain YAML text');
  const name = known(properties.name);
  const description = properties.description;
  if (typeof description !== 'string' || !description.trim() || [...description].length > 200 || /[\r\n\u0000\u2028\u2029]/u.test(description)) invalid('description is one nonempty line, at most 200 characters');
  const files = skill.files ?? [];
  if (!Array.isArray(files) || files.length > 64) invalid('files is an array of at most 64 text files');
  const paths = new Set(['skill.md']);
  let total = bytes(skill.text);
  const clean = files.map(file => {
    if (!object(file) || Object.keys(file).some(key => !['path', 'text'].includes(key))) invalid('Each supporting file holds only path and text');
    const { path, text } = file;
    if (typeof path !== 'string' || path.length > 240 || path.split('/').some(part => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) || part.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) invalid('A supporting path is a relative file path inside the skill, without hidden or parent segments');
    const key = path.toLowerCase();
    if ([...paths].some(held => key === held || key.startsWith(`${held}/`) || held.startsWith(`${key}/`))) invalid('Supporting paths are distinct and cannot replace SKILL.md or a directory');
    paths.add(key);
    if (typeof text !== 'string' || !text.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text) || bytes(text) > 65536) invalid('Supporting files are text, at most 64 KB each');
    total += bytes(text);
    return { path, text };
  });
  if (total > 524288) invalid('A skill including supporting files is at most 512 KB');
  clean.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { name, description, skill: { text: skill.text, files: clean } };
}

async function put(context) {
  const { skill: given, replaces = null } = await context.body();
  const { name, description, skill } = cleanSkill(given);
  const { env: { DB: db }, did } = context;
  const held = await current(db, did, name);
  const content = await cortexVersion(skill);
  if (held?.version && await cortexVersion(JSON.parse(held.skill)) === content) return { name, version: held.version, approved: held.approved_version === held.version, unchanged: true };
  if (held?.version && replaces === null) throw new Refused(409, 'NameTaken', 'A skill already has this name; read it and name its version to replace it', { name, current: held.version });
  if ((held?.version ?? null) !== replaces) throw changed(name, held);
  const version = await cortexVersion({ content, after: held?.seq ?? 0 });
  const approved = atKeyboard(context) ? version : null;
  const now = new Date().toISOString();
  const saved = await db.prepare(`INSERT INTO cortex_skills (did, name, version, description, skill, written_by, approved_version, seq, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?1, ?6, ${next}, ?7, ?7 WHERE ?8 IS NULL OR EXISTS (SELECT 1 FROM cortex_skills WHERE did = ?1 AND name = ?2)
    ON CONFLICT (did, name) DO UPDATE SET version = excluded.version, description = excluded.description, skill = excluded.skill,
      written_by = excluded.written_by, approved_version = excluded.approved_version, seq = excluded.seq, updated_at = excluded.updated_at
    WHERE cortex_skills.version IS ?8 RETURNING version`)
    .bind(did, name, version, description, JSON.stringify(skill), approved, now, replaces).first();
  if (!saved) {
    const latest = await current(db, did, name);
    if (latest?.version === version) return { name, version, approved: latest.approved_version === version, unchanged: true };
    throw changed(name, latest);
  }
  return { name, version, approved: approved === version };
}

export default {
  name: 'Skills',
  about: 'Private skills with member approval tied to the exact saved version. Supporting files stay inside the skill.',
  requests: {
    'com.ohmmmm.cortex.listSkills': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'List descriptions and approval state; this index never exposes supporting files or skill instructions.',
      takes: {}, gives: '`skills` (name, version, description, writtenBy, approved)',
      run: async ({ env, did }) => ({ skills: (await env.DB.prepare('SELECT name, version, description, written_by AS writtenBy, approved_version FROM cortex_skills WHERE did = ?1 AND version IS NOT NULL ORDER BY name').bind(did).all()).results.map(({ approved_version, ...skill }) => ({ ...skill, approved: approved_version === skill.version })) }),
    },
    'com.ohmmmm.cortex.getSkill': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'Read SKILL.md and supporting text files. A token cannot read an unapproved skill; the linked member can review it in ohm.',
      takes: { name: 'the skill name' }, gives: '`skill` ({text, files: [{path, text}]}), `version`',
      run: async context => {
        const held = await current(context.env.DB, context.did, known(context.url.searchParams.get('name')));
        if (!held?.version) throw new Refused(404, 'NotFound', 'There is no such skill');
        if (!atKeyboard(context) && held.approved_version !== held.version) throw new Refused(403, 'SkillNotApproved', 'The member has not approved this skill version');
        return { skill: JSON.parse(held.skill), version: held.version };
      },
    },
    'com.ohmmmm.cortex.putSkill': {
      verb: 'POST', asks: 'member', changes: true,
      about: 'Save SKILL.md with name and description in YAML and optional supporting files. Token-authored changes lose approval; identical retries preserve the current approval.',
      takes: { skill: '{text, files: [{path, text}]}; name and description are read from SKILL.md', replaces: 'optional: the version being replaced' }, gives: '`name`, `version`, `approved`, optionally `unchanged`', run: put,
    },
    'com.ohmmmm.cortex.approveSkill': {
      verb: 'POST', asks: 'ohm', changes: true,
      about: 'Approve exactly the named current version from the linked member’s ohm session. A later edit needs new approval.',
      takes: { name: 'the skill name', version: 'exactly the current version to approve' }, gives: '`name`, `approved`',
      run: async context => {
        const did = await member(context);
        const { name: given, version } = await context.body();
        const name = known(given);
        if (typeof version !== 'string' || !version) invalid('Say exactly which version to approve');
        const held = await current(context.env.DB, did, name);
        if (!held?.version) throw new Refused(404, 'NotFound', 'There is no such skill');
        if (held.version !== version) throw changed(name, held);
        const saved = await context.env.DB.prepare(`UPDATE cortex_skills SET approved_version = ?3, seq = ${next}, updated_at = ?4 WHERE did = ?1 AND name = ?2 AND version = ?3 RETURNING version`).bind(did, name, version, new Date().toISOString()).first();
        if (!saved) throw changed(name, await current(context.env.DB, did, name));
        return { name, approved: true };
      },
    },
    'com.ohmmmm.cortex.deleteSkill': {
      verb: 'POST', asks: 'ohm', changes: true,
      about: 'Remove a skill from the linked member’s ohm session, naming its current version. Repeating a completed removal is safe.',
      takes: { name: 'the skill name', replaces: 'the current version' }, gives: '`name`, `removed`',
      run: async context => {
        const did = await member(context);
        const { name: given, replaces = null } = await context.body();
        const name = known(given);
        const db = context.env.DB;
        const held = await current(db, did, name);
        if (!held?.version) return { name, removed: true, unchanged: true };
        if (held.version !== replaces) throw changed(name, held);
        const removed = await db.prepare(`UPDATE cortex_skills SET version = NULL, skill = NULL, approved_version = NULL, seq = ${next}, updated_at = ?3 WHERE did = ?1 AND name = ?2 AND version = ?4 RETURNING name`).bind(did, name, new Date().toISOString(), replaces).first();
        if (!removed) {
          const latest = await current(db, did, name);
          if (latest?.version) throw changed(name, latest);
        }
        return { name, removed: true };
      },
    },
  },
};
