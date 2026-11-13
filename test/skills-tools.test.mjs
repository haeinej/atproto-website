import assert from 'node:assert/strict';
import test from 'node:test';
import { secp256k1 } from '../service/node_modules/@noble/curves/secp256k1.js';
import { createIdentity, documentAddress } from '../service/src/identity.mjs';
import { createService } from '../service/src/worker.mjs';
import { REQUESTS } from '../service/src/capabilities/index.mjs';
import { links } from '../service/src/ohm.mjs';
import { testDatabase } from './d1.mjs';

const me = 'did:web:pds.skills-member.test';
const other = 'did:web:pds.skills-other.test';
const audience = 'did:web:vault.test';
const skill = (body = 'Follow the checked steps.\n', files = []) => ({ text: `---\nname: repeat-work\ndescription: Repeat the checked work\n---\n${body}`, files });
const tool = (on = true) => ({ name: 'vault_search', description: 'Find a post in the vault', on });
const proposal = () => ({ name: 'torque-price', description: 'Calculate the torque and price', inputs: 'Four torque points and prices', outputs: 'Margin and price for each combination' });

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let text = '';
  for (; value; value /= 58n) text = alphabet[Number(value % 58n)] + text;
  return text;
}
function account(did) {
  const secret = secp256k1.utils.randomPrivateKey();
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { did, document: { id: did, verificationMethod: [{ id: `${did}#atproto`, publicKeyMultibase: `z${base58([0xe7, 0x01, ...secp256k1.getPublicKey(secret, true)])}` }], service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: `https://${did.slice(8)}` }] }, token: async lxm => {
    const signed = `${encode({ typ: 'JWT', alg: 'ES256K' })}.${encode({ iss: did, aud: audience, lxm, exp: Math.floor(Date.now() / 1000) + 60 })}`;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signed)));
    return `${signed}.${Buffer.from(secp256k1.sign(digest, secret, { lowS: true }).toCompactRawBytes()).toString('base64url')}`;
  } };
}

let run = 0;
async function running() {
  const db = await testDatabase();
  const mine = account(me), theirs = account(other);
  const accounts = [mine, theirs];
  // Unique session cookies avoid the service's process-wide authentication cache.
  const prefix = `skills-test-${++run}`;
  const sessions = new Map([[`${prefix}=member`, { id: 'member' }], [`${prefix}=other`, { id: 'other' }], [`${prefix}=unconnected`, { id: 'unconnected' }]]);
  const get = async (url, options) => {
    if (String(url).endsWith('/api/auth/get-session')) return Response.json({ user: sessions.get(options.headers.Cookie) ?? null });
    const document = accounts.find(each => documentAddress(each.did) === String(url))?.document;
    if (document) return Response.json(document);
    if (new URL(url).pathname === '/xrpc/com.atproto.repo.listRecords') return Response.json({ records: [] });
    throw new Error(`Unexpected external request: ${url}`);
  };
  const linked = links(db);
  await linked.connect('member', me);
  await linked.connect('other', other);
  const env = { DB: db, OHM_APP_ORIGIN: 'https://app.test', SERVICE_DID: audience };
  const service = createService({ whoIs: createIdentity({ audience, members: `${me},${other}`, get }), get });
  const ask = async (name, { as = 'agent', body, query = {}, token, origin = 'https://app.test', cookie, under = '' } = {}) => {
    const full = name.includes('.') ? name : `com.ohmmmm.cortex.${name}`;
    const method = REQUESTS[full].verb;
    const url = new URL(`https://vault.test${under}/xrpc/${full}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const bearer = token ?? (as === 'agent' || as === 'other-agent' ? await (as === 'agent' ? mine : theirs).token(full) : null);
    const session = cookie ?? (['member', 'other', 'unconnected'].includes(as) ? `${prefix}=${as}` : null);
    const response = await service(new Request(url, { method, headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(session ? { Cookie: session } : {}), Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }), env);
    return { status: response.status, data: await response.json() };
  };
  return { db, env, ask, mine, prefix };
}

test('agent skills wait for exact-version member approval, and supporting-file changes revoke it', async () => {
  const { ask, db } = await running();
  const initial = skill(undefined, [{ path: 'references/check.txt', text: 'Check twice.\n' }]);
  const first = await ask('putSkill', { body: { skill: initial } });
  assert.equal(first.status, 200);
  assert.equal(first.data.approved, false);
  assert.equal((await ask('getSkill', { query: { name: 'repeat-work' } })).data.error, 'SkillNotApproved');
  assert.deepEqual((await ask('getContext')).data.skills, []);
  const index = (await ask('listSkills')).data.skills;
  assert.deepEqual(index, [{ name: 'repeat-work', version: first.data.version, description: 'Repeat the checked work', writtenBy: me, approved: false }]);
  assert.deepEqual((await ask('getSkill', { as: 'member', query: { name: 'repeat-work' }, under: '/vault' })).data.skill, initial);
  assert.equal((await ask('approveSkill', { body: { name: 'repeat-work', version: first.data.version } })).status, 401);
  assert.equal((await ask('approveSkill', { as: 'member', body: { name: 'repeat-work', version: first.data.version } })).data.approved, true);
  assert.deepEqual((await ask('getSkill', { query: { name: 'repeat-work' } })).data.skill, initial);
  assert.deepEqual((await ask('getContext')).data.skills, [{ name: 'repeat-work', description: 'Repeat the checked work' }]);
  assert.equal((await ask('putSkill', { body: { skill: initial } })).data.approved, true, 'a retry must not revoke approval');
  const edited = skill(undefined, [{ path: 'references/check.txt', text: 'A changed step.\n' }]);
  const second = await ask('putSkill', { body: { skill: edited, replaces: first.data.version } });
  assert.notEqual(second.data.version, first.data.version);
  assert.equal(second.data.approved, false);
  assert.equal((await ask('approveSkill', { as: 'member', body: { name: 'repeat-work', version: first.data.version } })).data.current, second.data.version);
  assert.equal((await ask('getSkill', { query: { name: 'repeat-work' } })).status, 403);
  assert.deepEqual((await ask('getContext')).data.skills, []);
  const row = db.sqlite.prepare('SELECT * FROM cortex_skills').get();
  assert.equal(row.approved_version, null);
  assert.equal(row.written_by, me);
});

test('skill saves, restores and deletions refuse stale versions and retry without duplicate changes', async () => {
  const { ask, db } = await running();
  const first = (await ask('putSkill', { as: 'member', body: { skill: skill() } })).data;
  assert.equal(first.approved, true);
  assert.equal((await ask('putSkill', { body: { skill: skill('Changed.') } })).data.error, 'NameTaken');
  const second = (await ask('putSkill', { body: { skill: skill('Changed.'), replaces: first.version } })).data;
  assert.equal((await ask('putSkill', { body: { skill: skill('Changed.'), replaces: first.version } })).data.unchanged, true);
  assert.equal(db.sqlite.prepare('SELECT seq FROM cortex_skills').get().seq, 2);
  assert.equal((await ask('putSkill', { body: { skill: skill('A stale edit.'), replaces: first.version } })).data.current, second.version);
  assert.equal((await ask('deleteSkill', { body: { name: 'repeat-work', replaces: second.version } })).status, 401);
  assert.equal((await ask('deleteSkill', { as: 'member', body: { name: 'repeat-work', replaces: first.version } })).data.error, 'Changed');
  assert.equal((await ask('deleteSkill', { as: 'member', body: { name: 'repeat-work', replaces: second.version } })).data.removed, true);
  assert.equal((await ask('deleteSkill', { as: 'member', body: { name: 'repeat-work', replaces: second.version } })).data.unchanged, true);
  assert.deepEqual((await ask('listSkills')).data.skills, []);
  assert.equal((await ask('getSkill', { as: 'member', query: { name: 'repeat-work' } })).status, 404);
  assert.equal((await ask('putSkill', { body: { skill: skill(), replaces: first.version } })).data.error, 'Changed');
  const restored = (await ask('putSkill', { body: { skill: skill() } })).data;
  assert.notEqual(restored.version, first.version, 'a restore must not reuse an approval or concurrency token');
  assert.equal(restored.approved, false);
});

test('skill content validates frontmatter, paths, text files, limits, and client-owned approval spoofing', async () => {
  const { ask } = await running();
  const invalid = [null, [], {}, { ...skill(), approved: true }, { ...skill(), writtenBy: 'member' },
    { text: 'No properties', files: [] }, { text: '---\nname: repeat-work\nname: hidden-work\ndescription: A skill\n---\nInstructions' },
    { text: '---\nname: RepeatWork\ndescription: A skill\n---\nInstructions' },
    { text: '---\nname: repeat-work\ndescription: true\n---\nInstructions' },
    { text: `---\nname: repeat-work\ndescription: ${'字'.repeat(201)}\n---\nInstructions` },
    { ...skill(), text: `${skill().text}${'x'.repeat(65536)}` }, { ...skill(), files: 'not files' },
    skill(undefined, [{ path: 'file.txt', text: '\0' }]), skill(undefined, [{ path: 'file.txt', text: '字'.repeat(21846) }]),
    skill(undefined, [{ path: 'file.txt', text: 'x', mode: 'symlink' }]),
    skill(undefined, [{ path: 'step.txt', text: 'x' }, { path: 'STEP.txt', text: 'y' }]),
    skill(undefined, [{ path: 'reference', text: 'x' }, { path: 'reference/file.txt', text: 'y' }]),
    skill(undefined, Array.from({ length: 65 }, (_, i) => ({ path: `file-${i}.txt`, text: '' }))),
    skill(undefined, Array.from({ length: 9 }, (_, i) => ({ path: `file-${i}.txt`, text: 'x'.repeat(65536) })))];
  for (const path of ['', '../escape.txt', '/absolute.txt', 'C:/escape.txt', 'a/../escape.txt', 'a//file.txt', './file.txt', 'a\\file.txt', 'SKILL.md', 'skill.MD', 'skill.md/file.txt', '.env', 'references/.hidden', 'file\0.txt', 'nul.txt', 'file.']) invalid.push(skill(undefined, [{ path, text: 'Text' }]));
  for (const given of invalid) {
    const response = await ask('putSkill', { body: { skill: given } });
    assert.equal(response.status, 400, JSON.stringify(given).slice(0, 150));
    assert.equal(response.data.error, 'InvalidSkill');
  }
  const valid = skill('Exact Markdown\r\n[[another-skill]]\n\n', [{ path: 'references/z.txt', text: '한글\n' }, { path: 'references/a.md', text: '```\ntext\n```\n' }]);
  const saved = await ask('putSkill', { as: 'member', body: { skill: valid } });
  assert.equal(saved.status, 200);
  const read = (await ask('getSkill', { query: { name: 'repeat-work' } })).data.skill;
  assert.equal(read.text, valid.text);
  assert.deepEqual(read.files, [...valid.files].reverse());
  assert.equal((await ask('putSkill', { body: { skill: { ...valid, files: [...valid.files].reverse() } } })).data.unchanged, true);
});

test('tool list changes require a linked member session and proposals never grant capabilities', async () => {
  const { ask, db } = await running();
  assert.equal((await ask('putTool', { body: { tool: tool() } })).status, 401);
  const first = (await ask('putTool', { as: 'member', body: { tool: tool() } })).data;
  assert.ok(first.version);
  assert.deepEqual((await ask('getContext')).data.tools, [{ name: 'vault_search', description: tool().description }]);
  assert.equal((await ask('putTool', { as: 'member', body: { tool: tool() } })).data.unchanged, true);
  assert.equal((await ask('putTool', { body: { tool: tool(false), replaces: first.version } })).status, 401);
  assert.equal((await ask('deleteTool', { body: { name: 'vault_search', replaces: first.version } })).status, 401);
  const proposed = await ask('proposeTool', { body: { tool: proposal() } });
  assert.deepEqual(proposed.data, { name: 'torque-price', proposed: true });
  assert.equal((await ask('proposeTool', { body: { tool: proposal() } })).data.unchanged, true);
  assert.equal((await ask('proposeTool', { body: { tool: { ...proposal(), description: 'Changed proposal' } } })).data.error, 'NameTaken');
  assert.equal((await ask('proposeTool', { body: { tool: { ...proposal(), name: 'vault_search' } } })).data.error, 'NameTaken');
  const list = (await ask('listTools')).data.tools;
  const pending = list.find(each => each.name === 'torque-price');
  assert.equal(pending.on, false);
  assert.equal(pending.proposed, true);
  assert.equal(pending.inputs, proposal().inputs);
  assert.equal(list.find(each => each.name === 'vault_search').on, true);
  assert.deepEqual((await ask('getContext')).data.tools.map(each => each.name), ['vault_search']);
  assert.equal((await ask('putTool', { as: 'member', body: { tool: { name: pending.name, description: pending.description, on: true }, replaces: pending.version } })).data.error, 'InvalidTool');
  assert.equal(db.sqlite.prepare('SELECT enabled FROM cortex_tools WHERE name = ?').get(pending.name).enabled, 0);
});

test('member tool updates and removal are version checked, and external metadata holds no keys', async () => {
  const { ask } = await running();
  const first = (await ask('putTool', { as: 'member', body: { tool: tool() } })).data;
  assert.equal((await ask('putTool', { as: 'member', body: { tool: tool(false) } })).data.error, 'NameTaken');
  const second = (await ask('putTool', { as: 'member', body: { tool: tool(false), replaces: first.version } })).data;
  assert.equal((await ask('putTool', { as: 'member', body: { tool: tool(false), replaces: first.version } })).data.unchanged, true);
  assert.deepEqual((await ask('getContext')).data.tools, []);
  assert.equal((await ask('putTool', { as: 'member', body: { tool: tool(), replaces: first.version } })).data.current, second.version);
  assert.equal((await ask('deleteTool', { as: 'member', body: { name: tool().name, replaces: first.version } })).data.error, 'Changed');
  assert.equal((await ask('deleteTool', { as: 'member', body: { name: tool().name, replaces: second.version } })).data.removed, true);
  assert.equal((await ask('deleteTool', { as: 'member', body: { name: tool().name, replaces: second.version } })).data.unchanged, true);
  const restored = await ask('putTool', { as: 'member', body: { tool: tool() } });
  assert.notEqual(restored.data.version, first.version);
  const external = { name: 'calendar', description: 'The member’s calendar server', on: false, address: 'https://calendar.example.test/mcp' };
  assert.equal((await ask('putTool', { as: 'member', body: { tool: external } })).status, 200);
  assert.equal((await ask('listTools')).data.tools.find(each => each.name === 'calendar').address, external.address);
  for (const given of [null, [], { ...tool(), on: 'yes' }, { ...tool(), enabled: 1 }, { ...external, apiKey: 'synthetic-key' }, { ...external, headers: {} }, { ...external, command: 'node' }, { ...external, address: 'https://user:synthetic-password@example.test' }, { ...external, address: 'https://example.test?key=synthetic-key' }, { ...external, address: 'https://example.test#key' }, { ...external, address: 'http://example.test' }, { ...tool(), description: 'A\nB' }]) {
    assert.equal((await ask('putTool', { as: 'member', body: { tool: given } })).data.error, 'InvalidTool');
  }
  for (const given of [{ ...proposal(), on: true }, { ...proposal(), address: 'https://example.test' }, { ...proposal(), inputs: {} }, { ...proposal(), outputs: '' }, { ...proposal(), proposed: false }]) assert.equal((await ask('proposeTool', { body: { tool: given } })).data.error, 'InvalidTool');
});

test('another member receives no skill or tool data and cannot approve, overwrite, or remove it', async () => {
  const { ask } = await running();
  const saved = (await ask('putSkill', { body: { skill: skill() } })).data;
  const installed = (await ask('putTool', { as: 'member', body: { tool: tool() } })).data;
  await ask('proposeTool', { body: { tool: proposal() } });
  for (const as of ['other-agent', 'other']) {
    assert.deepEqual((await ask('listSkills', { as })).data.skills, []);
    assert.deepEqual((await ask('listTools', { as })).data.tools, []);
    assert.equal((await ask('getSkill', { as, query: { name: 'repeat-work' } })).status, 404);
    assert.deepEqual((await ask('getContext', { as })).data.tools, []);
    assert.equal((await ask('putSkill', { as, body: { skill: skill('Overwrite'), replaces: saved.version } })).data.current, null);
  }
  assert.equal((await ask('approveSkill', { as: 'other', body: { name: 'repeat-work', version: saved.version } })).status, 404);
  assert.equal((await ask('putTool', { as: 'other', body: { tool: tool(false), replaces: installed.version } })).data.current, null);
  await ask('deleteSkill', { as: 'other', body: { name: 'repeat-work', replaces: saved.version } });
  await ask('deleteTool', { as: 'other', body: { name: tool().name, replaces: installed.version } });
  assert.equal((await ask('getSkill', { as: 'member', query: { name: 'repeat-work' } })).data.version, saved.version);
  assert.equal((await ask('listTools')).data.tools.find(each => each.name === tool().name).version, installed.version);
});

test('missing auth, wrong origin, mixed token/cookie approval and unconnected sessions cannot mutate records', async () => {
  const { ask, mine, prefix, db } = await running();
  for (const name of ['listSkills', 'getSkill', 'putSkill', 'deleteSkill', 'approveSkill', 'listTools', 'putTool', 'deleteTool', 'proposeTool']) {
    assert.equal((await ask(name, { as: 'nobody', ...(REQUESTS[`com.ohmmmm.cortex.${name}`].verb === 'POST' ? { body: {} } : {}) })).status, 401, name);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM cortex_skills').get().count, 0);
  for (const name of ['approveSkill', 'deleteSkill', 'putTool', 'deleteTool']) {
    assert.equal((await ask(name, { as: 'unconnected', body: {} })).data.error, 'NotConnected');
    assert.equal((await ask(name, { as: 'member', origin: 'https://elsewhere.test', body: {} })).data.error, 'WrongOrigin');
    assert.equal((await ask(name, { as: 'member', cookie: `${prefix}=member`, token: await mine.token(`com.ohmmmm.cortex.${name}`), body: {} })).data.error, 'SignInRequired');
  }
  assert.equal((await ask('putSkill', { body: '{invalid-json' })).data.error, 'InvalidRequest');
});

test('compare-and-swap rejects raced approval, skill deletion, skill write, tool write and deletion', async () => {
  for (const operation of ['approveSkill', 'deleteSkill', 'putSkill', 'putTool', 'deleteTool']) {
    const { ask, db } = await running();
    const isTool = operation.endsWith('Tool');
    const first = (await ask(isTool ? 'putTool' : 'putSkill', { as: 'member', body: isTool ? { tool: tool() } : { skill: skill() } })).data;
    const prepare = db.prepare.bind(db);
    let interleaved = false;
    db.prepare = sql => {
      const statement = prepare(sql);
      if (interleaved || !(sql.startsWith('UPDATE') || sql.startsWith('INSERT INTO cortex_'))) return statement;
      return { bind: (...values) => ({ first: async () => {
        interleaved = true;
        await ask(isTool ? 'putTool' : 'putSkill', { as: 'member', body: isTool ? { tool: { ...tool(), description: 'Other writer won' }, replaces: first.version } : { skill: skill('Other writer won'), replaces: first.version } });
        return statement.bind(...values).first();
      } }) };
    };
    const body = operation === 'approveSkill' ? { name: 'repeat-work', version: first.version }
      : operation.startsWith('delete') ? { name: isTool ? tool().name : 'repeat-work', replaces: first.version }
        : isTool ? { tool: tool(false), replaces: first.version } : { skill: skill('My edit'), replaces: first.version };
    const response = await ask(operation, { as: 'member', body });
    assert.equal(response.data.error, 'Changed', operation);
    assert.notEqual(response.data.current, first.version);
    const row = db.sqlite.prepare(`SELECT * FROM ${isTool ? 'cortex_tools' : 'cortex_skills'}`).get();
    assert.equal(row.version, response.data.current);
    assert.match(isTool ? row.description : JSON.parse(row.skill).text, /Other writer won/);
  }
});

test('concurrent identical proposals are safe and never become enabled', async () => {
  const { ask, db } = await running();
  const prepare = db.prepare.bind(db);
  let interleaved = false;
  db.prepare = sql => {
    const statement = prepare(sql);
    if (interleaved || !sql.startsWith('INSERT INTO cortex_tools')) return statement;
    return { bind: (...values) => ({ first: async () => {
      interleaved = true;
      await ask('proposeTool', { body: { tool: proposal() } });
      return statement.bind(...values).first();
    } }) };
  };
  assert.equal((await ask('proposeTool', { body: { tool: proposal() } })).data.unchanged, true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM cortex_tools').get().count, 1);
  assert.equal(db.sqlite.prepare('SELECT enabled, proposed, seq FROM cortex_tools').get().enabled, 0);
  assert.equal(db.sqlite.prepare('SELECT proposed FROM cortex_tools').get().proposed, 1);
  assert.equal(db.sqlite.prepare('SELECT seq FROM cortex_tools').get().seq, 1);
});

test('Publish ignores a cortex full of approved skills, tool settings and proposals', async () => {
  const { ask } = await running();
  const before = await ask('com.ohmmmm.vault.getPublishPlan', { query: { prepare: '1' } });
  assert.equal(before.status, 200);
  assert.equal(before.data.changes, 0);
  await ask('putSkill', { as: 'member', body: { skill: skill() } });
  await ask('putTool', { as: 'member', body: { tool: tool() } });
  await ask('proposeTool', { body: { tool: proposal() } });
  assert.deepEqual(await ask('com.ohmmmm.vault.getPublishPlan', { query: { prepare: '1' } }), before);
});
