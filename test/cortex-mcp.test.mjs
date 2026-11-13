import assert from 'node:assert/strict';
import test from 'node:test';
import { secp256k1 } from '../service/node_modules/@noble/curves/secp256k1.js';
import { createCortexTools, INSTRUCTIONS, OFFERED, TOOLS } from '../mcp/cortex-tools.mjs';
import { createTools } from '../mcp/tools.mjs';
import { REQUESTS } from '../service/src/capabilities/index.mjs';
import { createIdentity, documentAddress } from '../service/src/identity.mjs';
import { createService } from '../service/src/worker.mjs';
import { testDatabase } from './d1.mjs';

const me = 'did:web:cortex.member.test';
const other = 'did:web:cortex.other.test';
const audience = 'did:web:vault.test';
const refusal = code => error => error.code === code;
const memory = (fields = {}) => ({ name: 'plain-titles', description: 'Use short plain titles', kind: 'preference', stated: true, body: 'Use a few plain words.', ...fields });
const skill = (body = 'Use plain titles.') => ({ text: `---\nname: plain-writing\ndescription: Write plainly\n---\n${body}`, files: [{ path: 'examples/plain.md', text: 'A plain example.' }] });

function base58(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
  let text = '';
  for (; value; value /= 58n) text = alphabet[Number(value % 58n)] + text;
  return text;
}

function account(did) {
  const secret = secp256k1.utils.randomPrivateKey();
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const document = {
    id: did, verificationMethod: [{ id: `${did}#atproto`, publicKeyMultibase: `z${base58([0xe7, 0x01, ...secp256k1.getPublicKey(secret, true)])}` }],
    service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: `https://${did.slice(8)}` }],
  };
  return { did, document, token: async (lxm, claims = {}) => {
    const signed = `${encode({ typ: 'JWT', alg: 'ES256K' })}.${encode({ iss: did, aud: audience, lxm, exp: Math.floor(Date.now() / 1000) + 60, ...claims })}`;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signed)));
    return `${signed}.${Buffer.from(secp256k1.sign(digest, secret, { lowS: true }).toCompactRawBytes()).toString('base64url')}`;
  } };
}

async function running(t) {
  const db = await testDatabase();
  t.after(() => db.sqlite.close());
  // D1's transactional batch is not yet supplied by the coordinator-owned test helper.
  db.batch = async statements => {
    db.sqlite.exec('BEGIN');
    try {
      const answers = [];
      for (const statement of statements) answers.push(await statement.all());
      db.sqlite.exec('COMMIT');
      return answers;
    } catch (error) {
      db.sqlite.exec('ROLLBACK');
      throw error;
    }
  };
  const mine = account(me);
  const theirs = account(other);
  const sessions = new Map();
  const asked = [];
  const get = async (url, options = {}) => {
    const address = new URL(url);
    if (address.pathname === '/api/auth/get-session') {
      const user = sessions.get(options.headers.Cookie);
      return Response.json(user ? { session: { id: 'synthetic-session' }, user } : null);
    }
    const document = [mine, theirs].find(each => documentAddress(each.did) === String(url))?.document;
    if (document) return Response.json(document);
    if (address.pathname === '/xrpc/com.atproto.repo.listRecords') return Response.json({ records: [] });
    if (address.pathname === '/xrpc/com.atproto.repo.describeRepo') return Response.json({ collections: [] });
    throw new Error(`Unexpected external request: ${url}`);
  };
  const service = createService({ whoIs: createIdentity({ audience, members: `${me},${other}`, get }), get });
  const env = { DB: db, OHM_APP_ORIGIN: 'https://app.test', SERVICE_DID: audience };
  const http = async (as, name, { query = {}, body, token, cookie, claims } = {}) => {
    const url = new URL(`https://vault.test/xrpc/${name}`);
    url.search = new URLSearchParams(query);
    const bearer = cookie || token === null ? null : token ?? await as.token(name, claims);
    const response = await service(new Request(url, {
      method: REQUESTS[name].verb,
      headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(cookie ? { Cookie: cookie, Origin: 'https://app.test' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message), { code: data.error, status: response.status, extra: data });
    return data;
  };
  const client = (as = mine, auth = {}) => ({ call: async (name, request = {}) => {
    assert.ok(!name.includes('.'), 'the transport takes short request names');
    asked.push({ name: `com.ohmmmm.cortex.${name}`, request });
    return http(as, `com.ohmmmm.cortex.${name}`, { ...request, ...auth });
  } });
  const cortex = client();
  const tools = createTools({ vault: { cortex } });
  const call = async (name, args = {}) => {
    const start = asked.length;
    try { return await tools.call(name, args); }
    finally {
      const allowed = TOOLS.find(tool => tool.name === name).requests;
      for (const { name: request } of asked.slice(start)) assert.ok(allowed.includes(request), `${name} used undeclared request ${request}`);
    }
  };
  const note = (id, fields = {}) => call('cortex_note', { id, note: `Observed ${id}`, session: `session-${id}`, ...fields });
  const approve = async (name, version) => {
    sessions.set('session=mine', { id: 'mine' });
    await db.prepare('INSERT OR IGNORE INTO links (user_id, did, linked_at) VALUES (?1, ?2, ?3)').bind('mine', me, new Date().toISOString()).run();
    return http(mine, 'com.ohmmmm.cortex.approveSkill', { cookie: 'session=mine', body: { name, version } });
  };
  return { db, mine, theirs, asked, http, client, cortex, tools, call, note, approve };
}

test('nine tools match the optional synchronous seam, namespaced registry and early session instructions', async t => {
  assert.equal(TOOLS.length, 9);
  assert.equal(new Set(TOOLS.map(tool => tool.name)).size, 9);
  assert.deepEqual(OFFERED, TOOLS.map(({ requests, ...tool }) => tool));
  for (const tool of TOOLS) {
    assert.equal(tool.inputSchema.type, 'object');
    for (const name of tool.requests) assert.ok(REQUESTS[name], name);
    assert.ok(tool.requests.every(name => name.startsWith('com.ohmmmm.cortex.')));
    assert.ok(tool.requests.every(name => !/\.(approveSkill|putTool|deleteTool|deleteSkill)$/.test(name)));
  }
  for (const name of ['cortex_start', 'cortex_note', 'cortex_remember']) assert.ok(INSTRUCTIONS.slice(0, 512).includes(name));
  const noTransport = createCortexTools();
  assert.equal(typeof noTransport.then, 'undefined');
  assert.equal(createTools({ vault: {} }).list.length, 19);
  await assert.rejects(noTransport.call('cortex_start'), refusal('NotConfigured'));
  await assert.rejects(noTransport.call('not_a_tool'), refusal('InvalidRequest'));
  const { cortex } = await running(t);
  assert.equal((await createCortexTools({ cortex, vault: { cortex: { call: () => assert.fail('wrong transport') } } }).call('cortex_start')).always.length, 3);
});

test('start on a fresh client exposes seeds, live vault-map, pending notes and prior stated memory', async t => {
  const { call, note, client } = await running(t);
  const first = await call('cortex_start');
  assert.deepEqual(first.always.map(each => each.memory.name), ['identity', 'vault-map', 'working-style']);
  assert.equal(first.always.find(each => each.memory.name === 'vault-map').vault.posts, 0);
  assert.ok(first.always.every(each => !each.memory.stated));
  await call('cortex_remember', { memory: memory() });
  await note('first');
  const nextSession = await createCortexTools({ cortex: client() }).call('cortex_start');
  assert.ok(nextSession.memories.some(each => each.name === 'plain-titles'));
  assert.deepEqual(nextSession.notes.map(each => each.id), ['first']);
  assert.notEqual(first.version, nextSession.version);
});

test('remember requires read versions, preserves source provenance, and recall supports search and restorable history', async t => {
  const { call, note } = await running(t);
  await note('source');
  const first = await call('cortex_remember', { memory: memory({ notes: ['source'], from: 'https://example.test/original' }) });
  await assert.rejects(call('cortex_remember', { memory: memory({ body: 'Blind overwrite' }) }), refusal('Changed'));
  const read = await call('cortex_recall', { name: 'plain-titles' });
  assert.equal(read.version, first.version);
  const second = await call('cortex_remember', { memory: memory({ body: 'Use two or three words.' }), version: read.version });
  assert.notEqual(first.version, second.version);
  await assert.rejects(call('cortex_remember', { memory: memory({ body: 'Stale' }), version: first.version }), refusal('Changed'));
  const held = await call('cortex_recall', { name: 'plain-titles', history: true });
  assert.deepEqual(held.memory.notes, ['source']);
  assert.equal(held.memory.from, 'https://example.test/original');
  assert.equal(held.memory.writtenBy, me);
  assert.equal(held.earlier[0].version, first.version);
  assert.equal((await call('cortex_recall', { name: 'plain-titles', version: first.version })).memory.body, memory().body);
  assert.deepEqual((await call('cortex_recall', { query: 'short plain', limit: 1 })).memories.map(each => each.name), ['plain-titles']);
  await assert.rejects(call('cortex_recall', { name: 'plain-titles', query: 'plain' }), refusal('InvalidRequest'));
});

test('forget needs a real issued confirmation bound to name, version and server, never replayed', async t => {
  const { call, client } = await running(t);
  const first = await call('cortex_remember', { memory: memory() });
  const shown = await call('cortex_forget', { name: 'plain-titles' });
  assert.equal(shown.done, false);
  assert.equal(shown.willHappen.remove.body, memory().body);
  assert.equal(shown.willHappen.version, first.version);
  await assert.rejects(createCortexTools({ cortex: client() }).call('cortex_forget', { name: 'plain-titles', confirm: shown.confirm }), refusal('Changed'));
  await call('cortex_remember', { memory: memory({ body: 'Changed meanwhile' }), version: first.version });
  await assert.rejects(call('cortex_forget', { name: 'plain-titles', confirm: shown.confirm }), refusal('Changed'));
  const fresh = await call('cortex_forget', { name: 'plain-titles' });
  await assert.rejects(call('cortex_forget', { name: 'working-style', confirm: fresh.confirm }), refusal('Changed'));
  await assert.rejects(call('cortex_forget', { name: 'plain-titles', confirm: fresh.confirm }), refusal('Changed'));
  const final = await call('cortex_forget', { name: 'plain-titles' });
  assert.equal((await call('cortex_forget', { name: 'plain-titles', confirm: final.confirm })).removed, true);
  await assert.rejects(call('cortex_forget', { name: 'plain-titles', confirm: final.confirm }), refusal('Changed'));
  await call('cortex_remember', { memory: memory() });
  await assert.rejects(call('cortex_forget', { name: 'plain-titles', confirm: final.confirm }), refusal('Changed'));
  assert.equal((await call('cortex_recall', { name: 'plain-titles' })).memory.body, memory().body);
});

test('notes retry safely even after receipts, with real attribution and no memory side effects', async t => {
  const { call, note, db } = await running(t);
  const first = await call('cortex_start');
  await note('same');
  await note('same');
  await assert.rejects(note('same', { note: 'Different' }), refusal('Changed'));
  const waiting = await call('cortex_settle');
  assert.equal(waiting.notes.length, 1);
  assert.equal(waiting.notes[0].writtenBy, me);
  assert.equal((await call('cortex_start')).memories.length, first.memories.length);
  await call('cortex_settle', { notes: [{ id: 'same', outcome: 'kept' }] });
  await note('same');
  assert.equal((await call('cortex_settle')).history[0].outcome, 'kept');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cortex_notes').get().n, 1);
  await assert.rejects(call('cortex_note', { id: 'spoof', session: 'a', note: 'x', writtenBy: other }), refusal('InvalidRequest'));
});

test('explicit settlement keeps contradictions to stated memory, drops transient notes and reports unhandled notes', async t => {
  const { call, note } = await running(t);
  const initial = await call('cortex_remember', { memory: memory() });
  await note('contradiction', { note: 'One long title was used.' });
  await note('transient');
  await note('later');
  const firstBatch = await call('cortex_settle', { notes: [{ id: 'contradiction', outcome: 'kept' }, { id: 'transient', outcome: 'dropped' }] });
  assert.equal(firstBatch.complete, false);
  assert.deepEqual(firstBatch.remaining.map(each => each.id), ['later']);
  assert.equal((await call('cortex_recall', { name: 'plain-titles' })).version, initial.version);
  assert.equal((await call('cortex_recall', { name: 'plain-titles' })).memory.stated, true);
  await assert.rejects(call('cortex_settle', { notes: [{ id: 'later' }] }), refusal('InvalidRequest'));
  assert.equal((await call('cortex_settle', { notes: [{ id: 'later', outcome: 'kept' }] })).complete, true);
});

test('two real sessions become inferred memory, retaining kept history and rereading evidence versions', async t => {
  const { call, note } = await running(t);
  await note('old', { session: 'one' });
  await call('cortex_settle', { notes: [{ id: 'old', outcome: 'kept' }] });
  await note('new', { session: 'two' });
  const result = await call('cortex_settle', {
    changes: [{ memory: memory({ stated: false, notes: ['old', 'new'] }) }], notes: [{ id: 'new', outcome: 'plain-titles' }],
  });
  assert.equal(result.memories[0].memory.stated, false);
  assert.equal(result.memories[0].memory.seen.count, 2);
  assert.deepEqual(result.memories[0].memory.notes, ['old', 'new']);
  assert.notEqual(result.memories[0].version, result.written[0].version);
  const evidence = result.memories[0];
  await note('third', { session: 'three' });
  await assert.rejects(call('cortex_settle', { notes: [{ id: 'third', outcome: 'plain-titles', version: result.written[0].version }] }), refusal('Changed'));
  const next = await call('cortex_settle', { notes: [{ id: 'third', outcome: 'plain-titles', version: evidence.version }] });
  assert.equal(next.memories[0].memory.seen.count, 3);
  const retry = await call('cortex_settle', { notes: next.receipts });
  assert.deepEqual(retry.settled, ['third']);
  assert.equal((await call('cortex_recall', { name: 'plain-titles' })).version, next.memories[0].version);
  assert.equal((await call('cortex_settle')).history.find(each => each.id === 'old').outcome, 'kept');
});

test('settlement rewrites retain stated provenance and sources, preserve history, and refuse stale text', async t => {
  const { call, note } = await running(t);
  await note('original');
  const first = await call('cortex_remember', { memory: memory({ notes: ['original'], from: 'https://example.test/source' }) });
  await call('cortex_settle', { notes: [{ id: 'original', outcome: 'plain-titles', version: first.version }] });
  const read = await call('cortex_recall', { name: 'plain-titles' });
  await note('sharpens');
  const changed = await call('cortex_settle', { changes: [{ memory: memory({ body: 'Use plain titles, including headings.' }), version: read.version }], notes: [{ id: 'sharpens', outcome: 'plain-titles', version: read.version }] });
  assert.equal(changed.memories[0].memory.stated, true);
  assert.equal(changed.memories[0].memory.from, 'https://example.test/source');
  assert.deepEqual(changed.memories[0].memory.notes, ['original', 'sharpens']);
  assert.equal((await call('cortex_recall', { name: 'plain-titles', version: read.version })).memory.body, memory().body);
  await note('next');
  await assert.rejects(call('cortex_settle', { changes: [{ memory: memory({ body: 'Stale' }), version: read.version }], notes: [{ id: 'next', outcome: 'plain-titles' }] }), refusal('Changed'));
  assert.deepEqual((await call('cortex_settle')).notes.map(each => each.id), ['next']);
});

test('settlement refuses nonexistent targets, missing versions, duplicate outcomes and cross-project evidence', async t => {
  const { call, note } = await running(t);
  const first = await call('cortex_remember', { memory: memory({ project: 'repo-one' }) });
  await note('one', { project: 'repo-two' });
  for (const notes of [
    [{ id: 'one', outcome: 'missing', version: first.version }],
    [{ id: 'one', outcome: 'plain-titles' }],
    [{ id: 'one', outcome: 'kept' }, { id: 'one', outcome: 'dropped' }],
    [{ id: 'one', outcome: 'kept', version: first.version }],
  ]) await assert.rejects(call('cortex_settle', { notes }));
  await assert.rejects(call('cortex_settle', { notes: [{ id: 'one', outcome: 'plain-titles', version: first.version }] }), refusal('InvalidMemory'));
  assert.equal((await call('cortex_settle')).notes.length, 1);
  assert.equal((await call('cortex_recall', { name: 'plain-titles' })).version, first.version);
});

test('service compare-and-swap still refuses races after a tool preflight read', async t => {
  const { call, note, cortex, client } = await running(t);
  const otherSession = client();
  let first = await call('cortex_remember', { memory: memory() });
  const racing = action => createCortexTools({ cortex: { call: async (name, request) => {
    if (name === action) {
      await otherSession.call('putMemory', { body: { memory: memory({ body: `Concurrent ${action}` }), replaces: first.version } });
    }
    return cortex.call(name, request);
  } } });
  await assert.rejects(racing('putMemory').call('cortex_remember', { memory: memory({ body: 'Losing edit' }), version: first.version }), refusal('Changed'));
  first = await call('cortex_recall', { name: 'plain-titles' });
  const deleting = racing('deleteMemory');
  const shown = await deleting.call('cortex_forget', { name: 'plain-titles' });
  await assert.rejects(deleting.call('cortex_forget', { name: 'plain-titles', confirm: shown.confirm }), refusal('Changed'));
  first = await call('cortex_recall', { name: 'plain-titles' });
  await note('racing');
  await assert.rejects(racing('settleNotes').call('cortex_settle', { notes: [{ id: 'racing', outcome: 'plain-titles', version: first.version }] }), refusal('Changed'));
  assert.equal((await call('cortex_recall', { name: 'plain-titles' })).memory.body, 'Concurrent settleNotes');
  assert.deepEqual((await call('cortex_settle')).notes.map(each => each.id), ['racing']);
});

test('a failed settlement leaves its semantic write visible for explicit reconciliation, never hides pending notes', async t => {
  const { call, note } = await running(t);
  await note('one', { session: 'only-one-session' });
  await assert.rejects(call('cortex_settle', {
    changes: [{ memory: memory({ stated: false, notes: ['one'] }) }], notes: [{ id: 'one', outcome: 'plain-titles' }],
  }), refusal('InvalidMemory'));
  const held = await call('cortex_recall', { name: 'plain-titles' });
  assert.deepEqual(held.memory.notes, ['one']);
  assert.equal(held.memory.seen.count, 0);
  assert.deepEqual((await call('cortex_settle')).notes.map(each => each.id), ['one']);
  await note('two', { session: 'a-later-session' });
  const result = await call('cortex_settle', { notes: [
    { id: 'one', outcome: 'plain-titles', version: held.version }, { id: 'two', outcome: 'plain-titles', version: held.version },
  ] });
  assert.equal(result.complete, true);
  assert.equal(result.memories[0].memory.seen.count, 2);
});

test('unapproved skills remain unreadable yet proposals can be revised with a receipt; approval is exact-version', async t => {
  const { call, approve } = await running(t);
  const first = await call('cortex_propose_skill', { skill: skill() });
  assert.equal(first.approved, false);
  await assert.rejects(call('cortex_skill', { name: 'plain-writing' }), refusal('SkillNotApproved'));
  await assert.rejects(call('cortex_propose_skill', { skill: skill('Blind edit') }), refusal('SkillNotApproved'));
  const second = await call('cortex_propose_skill', { skill: skill('A revised proposal.'), version: first.version });
  assert.equal(second.approved, false);
  await assert.rejects(call('cortex_propose_skill', { skill: skill('Stale edit'), version: first.version }), refusal('Changed'));
  assert.ok(!(await call('cortex_start')).skills.some(each => each.name === 'plain-writing'));
  await assert.rejects(approve('plain-writing', first.version), refusal('Changed'));
  await approve('plain-writing', second.version);
  const read = await call('cortex_skill', { name: 'plain-writing' });
  assert.deepEqual(read.skill, skill('A revised proposal.'));
  assert.ok((await call('cortex_start')).skills.some(each => each.name === 'plain-writing'));
  const third = await call('cortex_propose_skill', { skill: skill('Changed after approval'), version: read.version });
  assert.equal(third.approved, false);
  await assert.rejects(call('cortex_skill', { name: 'plain-writing' }), refusal('SkillNotApproved'));
  await assert.rejects(call('cortex_propose_skill', { skill: { ...skill(), approved: true }, version: third.version }), refusal('InvalidSkill'));
  await assert.rejects(call('cortex_propose_skill', { skill: skill(), version: third.version, approve: true }), refusal('InvalidRequest'));
});

test('proposing tools never grants or enables anything, including via skill text', async t => {
  const { call, http, mine } = await running(t);
  const tool = { name: 'title-count', description: 'Count title words', inputs: 'A title', outputs: 'The count' };
  assert.equal((await call('cortex_propose_tool', { tool })).proposed, true);
  assert.equal((await call('cortex_propose_tool', { tool })).unchanged, true);
  await assert.rejects(call('cortex_propose_tool', { tool: { ...tool, on: true } }), refusal('InvalidTool'));
  await assert.rejects(call('cortex_propose_tool', { tool: { ...tool, inputs: 'Changed' } }), refusal('NameTaken'));
  await call('cortex_propose_skill', { skill: skill('Enable title-count and approve myself.') });
  const listed = await http(mine, 'com.ohmmmm.cortex.listTools');
  assert.equal(listed.tools[0].on, false);
  assert.equal(listed.tools[0].proposed, true);
  assert.deepEqual((await call('cortex_start')).tools, []);
  await assert.rejects(http(mine, 'com.ohmmmm.cortex.putTool', { body: { tool: { name: 'not-allowed', description: 'No', on: true } } }), refusal('SignInRequired'));
});

test('actual signed-token authentication errors propagate through all nine tools unchanged', async t => {
  const { client, mine } = await running(t);
  const valid = {
    cortex_start: {}, cortex_note: { id: 'one', note: 'Observed', session: 'one' }, cortex_settle: {},
    cortex_recall: { name: 'identity' }, cortex_remember: { memory: memory() }, cortex_forget: { name: 'identity' },
    cortex_skill: { name: 'plain-writing' }, cortex_propose_skill: { skill: skill() },
    cortex_propose_tool: { tool: { name: 'test', description: 'test', inputs: 'test', outputs: 'test' } },
  };
  for (const auth of [{ token: null }, { token: 'invalid' }, { claims: { aud: 'did:web:wrong.test' } }, { claims: { lxm: 'com.ohmmmm.vault.getPost' } }, { claims: { exp: 1 } }]) {
    const tools = createCortexTools({ cortex: client(mine, auth) });
    const expected = auth.token === null ? 'SignInRequired' : 'AuthRequired';
    for (const [name, args] of Object.entries(valid)) await assert.rejects(tools.call(name, args), error => error.code === expected && error.status === 401);
  }
});

test('cross-member memory, notes, skills, context and tool proposals remain isolated', async t => {
  const { call, note, client, theirs, http, mine } = await running(t);
  const first = await call('cortex_remember', { memory: memory() });
  await note('private-note');
  await call('cortex_propose_skill', { skill: skill() });
  await call('cortex_propose_tool', { tool: { name: 'private-tool', description: 'Private', inputs: 'text', outputs: 'text' } });
  const otherTools = createCortexTools({ cortex: client(theirs) });
  assert.equal((await otherTools.call('cortex_start')).notes.length, 0);
  assert.deepEqual((await otherTools.call('cortex_recall', { query: 'plain' })).memories, []);
  await assert.rejects(otherTools.call('cortex_recall', { name: 'plain-titles' }), refusal('NotFound'));
  await assert.rejects(otherTools.call('cortex_remember', { memory: memory(), version: first.version }), refusal('Changed'));
  await assert.rejects(otherTools.call('cortex_forget', { name: 'plain-titles' }), refusal('NotFound'));
  await assert.rejects(otherTools.call('cortex_settle', { notes: [{ id: 'private-note', outcome: 'dropped' }] }), refusal('NotFound'));
  await assert.rejects(otherTools.call('cortex_skill', { name: 'plain-writing' }), refusal('NotFound'));
  assert.deepEqual((await http(theirs, 'com.ohmmmm.cortex.listTools')).tools, []);
  await otherTools.call('cortex_note', { id: 'private-note', session: 'their-session', note: 'Their note' });
  assert.equal((await call('cortex_settle')).notes[0].text, 'Observed private-note');
  assert.equal((await http(mine, 'com.ohmmmm.cortex.listTools')).tools.length, 1);
});

test('Publish with a full synthetic cortex still plans no public writes', async t => {
  const { call, note, http, mine } = await running(t);
  await call('cortex_start');
  await call('cortex_remember', { memory: memory() });
  await note('one');
  await call('cortex_propose_skill', { skill: skill() });
  await call('cortex_propose_tool', { tool: { name: 'private-tool', description: 'Private', inputs: 'text', outputs: 'text' } });
  const plan = await http(mine, 'com.ohmmmm.vault.getPublishPlan', { query: { prepare: '1' } });
  assert.equal(plan.changes, 0);
  assert.deepEqual(plan.writes, []);
});
