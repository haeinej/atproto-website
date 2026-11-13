import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { secp256k1 } from '../service/node_modules/@noble/curves/secp256k1.js';
import { cleanMemory, memoryFile, memoryProblems, memoryVersion, readMemoryFile } from '../cortex/core.mjs';
import { getContext } from '../cortex/context.mjs';
import { memoryStore } from '../cortex/store.mjs';
import { REQUESTS } from '../service/src/capabilities/index.mjs';
import { createIdentity, documentAddress } from '../service/src/identity.mjs';
import { postStore } from '../service/src/store.mjs';
import { createService } from '../service/src/worker.mjs';
import { testDatabase } from './d1.mjs';
import { newPostId } from '../vault/file.mjs';

const me = 'did:web:pds.member.test';
const other = 'did:web:pds.other.test';
const audience = 'did:web:vault.test';
const memory = (name = 'plain-titles', fields = {}) => ({ name, description: 'Titles are short and plain', kind: 'preference', stated: true, body: 'Use a few plain words.\nSee [[working-style]].\n', ...fields });
const refusal = code => problem => problem.code === code;

test('memory domain limits, names and optional project are enforced without silently losing fields', async () => {
  for (const fields of [
    { name: '' }, { name: 'MEMORY' }, { name: '../escape' }, { name: 'has--gap' }, { name: 'a'.repeat(101) },
    { description: '' }, { description: 'a\nb' }, { description: 'a\rb' }, { description: 'a'.repeat(201) },
    { kind: 'instruction' }, { body: '가'.repeat(2731) }, { body: null }, { always: 'yes' }, { stated: undefined },
    { visibility: 'public' }, { project: 12 }, { from: {} }, { notes: ['a', 'a'] }, { seen: { count: -1 } },
  ]) assert.ok(memoryProblems(memory('valid-name', fields)).length, JSON.stringify(fields));
  assert.deepEqual(memoryProblems(memory('valid-name', { body: 'a'.repeat(8192), description: '가'.repeat(200), project: '', always: true })), []);
  assert.deepEqual(cleanMemory(memory()), memory());
  assert.equal(await memoryVersion(memory()), await memoryVersion(Object.fromEntries(Object.entries(memory()).reverse())));
  assert.notEqual(await memoryVersion(memory()), await memoryVersion(memory('plain-titles', { body: 'Different.' })));
});

test('the minimal memory file mapping roundtrips every field and exact Markdown, including YAML traps', async () => {
  for (const body of ['', '\n', '---\nbody: true\n', '한글\r\n[[working-style]]\r\n', 'No trailing newline', 'Two trailing newlines\n\n']) {
    const original = cleanMemory(memory('yaml-traps', { body, description: 'null: # true "quoted" \\ path', project: '', from: 'https://example.test/a#b', notes: ['note-one'], always: false, seen: { count: 2, last: '2026-11-12T00:00:00.000Z' }, writtenBy: me }));
    assert.deepEqual(readMemoryFile(memoryFile(original)), original);
  }
  assert.throws(() => readMemoryFile('no properties'));
  assert.throws(() => readMemoryFile('---\nname: "one"\nname: "two"\n---\n'));
});

test('memory writes and deletes are versioned, idempotent, isolated, and preserve restorable earlier text', async () => {
  const db = await testDatabase();
  const store = memoryStore(db);
  const first = await store.write(me, memory());
  const start = await store.list(me);
  assert.deepEqual((await store.list(other)).memories, []);
  await assert.rejects(store.read(other, memory().name), refusal('NotFound'));
  await assert.rejects(store.write(me, memory('plain-titles', { body: 'Changed.' })), problem => problem.code === 'NameTaken' && problem.extra.current === first.version);
  const second = await store.write(me, memory('plain-titles', { body: 'Changed.' }), { replaces: first.version });
  assert.equal((await store.write(me, memory('plain-titles', { body: 'Changed.' }), { replaces: first.version })).unchanged, true);
  assert.equal((await store.list(me)).cursor, '2');
  await assert.rejects(store.write(me, memory('plain-titles', { body: 'Stale.' }), { replaces: first.version }), refusal('Changed'));
  await assert.rejects(store.write(me, memory('not-created'), { replaces: first.version }), problem => problem.code === 'Changed' && problem.extra.current === null);
  await assert.rejects(store.remove(me, 'plain-titles', { replaces: first.version }), refusal('Changed'));
  const old = await store.read(me, 'plain-titles', { version: first.version });
  assert.equal(old.memory.body, memory().body);
  assert.equal((await store.read(me, 'plain-titles', { version: second.version })).version, second.version);
  assert.equal((await store.read(me, 'plain-titles', { history: true })).earlier[0].version, first.version);
  await assert.rejects(store.read(other, 'plain-titles', { version: first.version }), refusal('NotFound'));
  await store.write(other, memory('plain-titles', { body: 'Theirs.' }));
  const restored = await store.write(me, old.memory, { replaces: second.version });
  assert.notEqual(restored.version, first.version);
  await assert.rejects(store.write(me, memory('plain-titles', { body: 'An edit based on the original revision.' }), { replaces: first.version }), refusal('Changed'));
  assert.equal((await store.read(me, 'plain-titles')).memory.body, memory().body);
  await store.remove(me, 'plain-titles', { replaces: restored.version });
  assert.equal((await store.remove(me, 'plain-titles', { replaces: restored.version })).unchanged, true);
  assert.deepEqual((await store.list(me, { since: start.cursor })).memories, [{ name: 'plain-titles', removed: true }]);
  assert.deepEqual((await store.list(me)).memories, []);
  await assert.rejects(store.read(me, 'plain-titles'), refusal('NotFound'));
  assert.equal((await store.read(me, 'plain-titles', { version: second.version })).memory.body, 'Changed.');
  assert.equal((await store.read(other, 'plain-titles')).memory.body, 'Theirs.');
  const history = db.sqlite.prepare('SELECT * FROM cortex_memory_versions WHERE did = ? ORDER BY seq').all(me);
  assert.equal(history.length, 3);
  assert.equal(history[0].written_by, me);
  assert.equal(JSON.parse(history[0].memory).stated, true);
});

test('concurrent memory edits and deletes use database compare-and-swap and preserve only successful versions', async () => {
  for (const deleting of [false, true]) {
    const db = await testDatabase();
    const store = memoryStore(db);
    const first = await store.write(me, memory());
    const prepare = db.prepare.bind(db);
    let interleaved = false;
    db.prepare = sql => {
      const statement = prepare(sql);
      if (!(deleting ? sql.startsWith('UPDATE') : sql.startsWith('INSERT')) || interleaved) return statement;
      return { bind: (...values) => ({ first: async () => {
        interleaved = true;
        await memoryStore({ prepare }).write(me, memory('plain-titles', { body: 'The other writer won.' }), { replaces: first.version });
        return statement.bind(...values).first();
      } }) };
    };
    await assert.rejects(deleting ? store.remove(me, 'plain-titles', { replaces: first.version }) : store.write(me, memory('plain-titles', { body: 'Mine.' }), { replaces: first.version }), refusal('Changed'));
    assert.equal((await store.read(me, 'plain-titles')).memory.body, 'The other writer won.');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM cortex_memory_versions').get().count, 1);
  }
});

test('cursors paginate stably, survive removals and empty results, and validate filters', async () => {
  const db = await testDatabase();
  const store = memoryStore(db);
  for (let i = 0; i < 1002; i++) await store.write(me, memory(`item-${String(i).split('').map(digit => 'abcdefghij'[Number(digit)]).join('')}`, { kind: i % 2 ? 'person' : 'preference' }));
  const first = await store.list(me);
  assert.equal(first.memories.length, 1000);
  assert.equal(first.more, true);
  const second = await store.list(me, { since: first.cursor });
  assert.equal(second.memories.length, 2);
  assert.equal(second.more, undefined);
  assert.deepEqual(await store.list(me, { since: second.cursor }), { memories: [], cursor: second.cursor });
  assert.equal((await store.list(me, { kind: 'person' })).memories.length, 500);
  for (const since of ['', '-1', '1.2', 'NaN', '9007199254740992']) await assert.rejects(store.list(me, { since }), refusal('InvalidCursor'));
  await assert.rejects(store.list(me, { kind: 'anything' }), refusal('InvalidRequest'));
});

test('search ranks descriptions first, requires every word, excludes removals and other members', async () => {
  const store = memoryStore(await testDatabase());
  await store.write(me, memory('in-description', { description: 'Rain street', body: 'No matching body.' }));
  const body = await store.write(me, memory('in-body', { description: 'Other words', body: 'The rain in the street.' }));
  await store.write(other, memory('secret', { description: 'Rain street secret' }));
  assert.deepEqual((await store.search(me, { q: 'RAIN street' })).memories.map(each => each.name), ['in-description', 'in-body']);
  assert.match((await store.search(me, { q: 'rain street', limit: 2 })).memories[1].passage, /rain in the street/);
  assert.equal((await store.search(me, { q: 'rain missing' })).memories.length, 0);
  await store.remove(me, 'in-body', { replaces: body.version });
  assert.equal((await store.search(me, { q: 'rain', limit: 1 })).memories.length, 1);
  assert.equal((await store.search(me, { q: 'secret' })).memories.length, 0);
  for (const query of [{}, { q: ' ' }, { q: 'rain', limit: 0 }, { q: 'rain', limit: 51 }, { q: 'rain', limit: 1.5 }]) await assert.rejects(store.search(me, query), refusal('InvalidRequest'));
});

test('filtered incremental lists remove memories moved to another kind and deleted memories', async () => {
  const store = memoryStore(await testDatabase());
  const first = await store.write(me, memory());
  const before = await store.list(me, { kind: 'preference' });
  const second = await store.write(me, memory('plain-titles', { kind: 'project', project: '' }), { replaces: first.version });
  const after = await store.list(me, { kind: 'preference', since: before.cursor });
  assert.deepEqual(after.memories, [{ name: 'plain-titles', removed: true }]);
  assert.equal((await store.list(me, { kind: 'project' })).memories[0].name, 'plain-titles');
  await store.remove(me, 'plain-titles', { replaces: second.version });
  assert.deepEqual((await store.list(me, { kind: 'project', since: after.cursor })).memories, [{ name: 'plain-titles', removed: true }]);
});

test('a concurrent identical retry succeeds once without duplicating history or cursor changes', async () => {
  const db = await testDatabase();
  const store = memoryStore(db);
  const first = await store.write(me, memory());
  const prepare = db.prepare.bind(db);
  let interleaved = false;
  const replacement = memory('plain-titles', { body: 'One replacement.' });
  db.prepare = sql => {
    const statement = prepare(sql);
    if (!sql.startsWith('INSERT') || interleaved) return statement;
    return { bind: (...values) => ({ first: async () => {
      interleaved = true;
      await memoryStore({ prepare }).write(me, replacement, { replaces: first.version });
      return statement.bind(...values).first();
    } }) };
  };
  assert.equal((await store.write(me, replacement, { replaces: first.version })).unchanged, true);
  assert.equal((await store.list(me)).cursor, '2');
  assert.equal((await store.read(me, 'plain-titles', { history: true })).earlier.length, 1);
});

test('memory source-note references cannot cross member boundaries and seen is service-owned', async () => {
  const db = await testDatabase();
  const store = memoryStore(db);
  const note = did => db.prepare('INSERT INTO cortex_notes (did, id, text, session, written_by, created_at) VALUES (?1, ?2, ?3, ?4, ?1, ?5)').bind(did, 'source-note', 'Observed', 'session', new Date().toISOString()).run();
  await note(other);
  await assert.rejects(store.write(me, memory('note-memory', { notes: ['source-note'] })), refusal('InvalidMemory'));
  await note(me);
  const saved = await store.write(me, memory('note-memory', { notes: ['source-note'], seen: { count: 100, last: null } }));
  assert.deepEqual((await store.read(me, 'note-memory')).memory.seen, { count: 0, last: null });
  assert.deepEqual((await store.read(me, 'note-memory')).memory.notes, ['source-note']);
  const edited = await store.write(me, memory('note-memory', { body: 'Edited', notes: ['source-note'] }), { replaces: saved.version });
  assert.ok(edited.version);
  assert.deepEqual((await store.read(me, 'note-memory', { version: saved.version })).memory.notes, ['source-note']);
});

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

async function running() {
  const mine = account(me);
  const theirs = account(other);
  const stranger = account('did:web:stranger.test');
  const members = [mine, theirs, stranger];
  const db = await testDatabase();
  const sessions = new Map();
  const get = async (url, options) => {
    if (String(url).endsWith('/api/auth/get-session')) {
      const user = sessions.get(options.headers.Cookie);
      return Response.json(user ? { session: { id: 'session' }, user } : null);
    }
    const document = members.find(each => documentAddress(each.did) === String(url))?.document;
    if (document) return Response.json(document);
    if (url.pathname === '/xrpc/com.atproto.repo.listRecords') return Response.json({ records: [] });
    if (url.pathname === '/xrpc/com.atproto.repo.describeRepo') return Response.json({ collections: [] });
    throw new Error(`Unexpected request: ${url}`);
  };
  const whoIs = createIdentity({ audience, members: `${me},${other}`, get });
  const env = { DB: db, OHM_APP_ORIGIN: 'https://app.test', SERVICE_DID: audience };
  const service = createService({ whoIs, get });
  const ask = async (as, short, { query = {}, body, token, cookie, origin, verb, under = '' } = {}) => {
    const name = short.includes('.') ? short : `com.ohmmmm.cortex.${short}`;
    const url = new URL(`https://vault.test${under}/xrpc/${name}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const bearer = cookie || token === null ? null : token ?? await as.token(name);
    return service(new Request(url, {
      method: verb ?? REQUESTS[name].verb,
      headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }), env);
  };
  return { db, env, ask, mine, theirs, stranger, sessions };
}

test('real member tokens isolate every memory operation and invalid/absent auth is refused before storage', async () => {
  const { db, ask, mine, theirs, stranger } = await running();
  assert.equal((await ask(mine, 'getContext', { token: null })).status, 401);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM cortex_memories').get().count, 0);
  const saved = await (await ask(mine, 'putMemory', { body: { memory: memory('private-thing', { writtenBy: 'spoofed-agent', seen: { count: 999, last: null }, project: '' }) } })).json();
  const read = await (await ask(mine, 'getMemory', { query: { name: 'private-thing' }, under: '/vault' })).json();
  assert.equal(read.memory.writtenBy, me);
  assert.deepEqual(read.memory.seen, { count: 0, last: null });
  assert.equal((await ask(theirs, 'getMemory', { query: { name: 'private-thing' } })).status, 404);
  assert.equal((await (await ask(theirs, 'searchMemories', { query: { q: 'short' } })).json()).memories.length, 0);
  assert.ok(!(await (await ask(theirs, 'listMemories')).json()).memories.some(each => each.name === 'private-thing'));
  assert.equal((await ask(theirs, 'putMemory', { body: { memory: memory('private-thing', { body: 'Overwrite' }), replaces: saved.version } })).status, 409);
  await ask(theirs, 'deleteMemory', { body: { name: 'private-thing', replaces: saved.version } });
  assert.equal((await ask(mine, 'getMemory', { query: { name: 'private-thing' } })).status, 200);
  for (const token of [null, 'not-a-token', await mine.token('com.ohmmmm.vault.getPost'), await mine.token('com.ohmmmm.cortex.getMemory', { aud: 'did:web:wrong.test' }), await mine.token('com.ohmmmm.cortex.getMemory', { exp: 1 })]) {
    assert.equal((await ask(mine, 'getMemory', { token, query: { name: 'private-thing' } })).status, 401);
  }
  assert.equal((await ask(stranger, 'getContext')).status, 403);
  assert.equal((await ask(mine, 'getMemory', { verb: 'POST' })).status, 405);
  assert.equal((await ask(mine, 'putMemory', { body: 'not json' })).status, 400);
  assert.equal((await ask(mine, 'putMemory', { body: { memory: memory('bad', { visibility: 'public' }) } })).status, 400);
});

test('linked ohm sessions access the same cortex and enforce origin checks on changes', async () => {
  const { db, ask, mine, sessions } = await running();
  sessions.set('session=mine', { id: 'mine' });
  sessions.set('session=unlinked', { id: 'unlinked' });
  await db.prepare('INSERT INTO links (user_id, did, linked_at) VALUES (?1, ?2, ?3)').bind('mine', me, new Date().toISOString()).run();
  assert.equal((await ask(mine, 'getContext', { cookie: 'session=unlinked' })).status, 409);
  assert.equal((await ask(mine, 'putMemory', { cookie: 'session=mine', origin: 'https://evil.test', body: { memory: memory() } })).status, 403);
  assert.equal((await ask(mine, 'putMemory', { cookie: 'session=mine', origin: 'https://app.test', body: { memory: memory() } })).status, 200);
  assert.equal((await (await ask(mine, 'getMemory', { query: { name: 'plain-titles' } })).json()).memory.writtenBy, me);
});

test('Memory HTTP requests expose current conflicts, retry safely, preserve history and emit removal deltas', async () => {
  const { ask, mine } = await running();
  const first = await (await ask(mine, 'putMemory', { body: { memory: memory() } })).json();
  const before = await (await ask(mine, 'listMemories')).json();
  const body = { memory: memory('plain-titles', { body: 'A corrected instruction.' }), replaces: first.version };
  const second = await (await ask(mine, 'putMemory', { body })).json();
  assert.equal((await (await ask(mine, 'putMemory', { body })).json()).unchanged, true);
  const stale = await ask(mine, 'putMemory', { body: { ...body, memory: memory('plain-titles', { body: 'Stale edit.' }) } });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).current, second.version);
  const history = await (await ask(mine, 'getMemory', { query: { name: 'plain-titles', history: '1' } })).json();
  assert.equal(history.earlier.length, 1);
  const earlier = await (await ask(mine, 'getMemory', { query: { name: 'plain-titles', version: history.earlier[0].version } })).json();
  assert.equal(earlier.memory.body, memory().body);
  assert.equal((await ask(mine, 'deleteMemory', { body: { name: 'plain-titles', replaces: first.version } })).status, 409);
  assert.equal((await ask(mine, 'deleteMemory', { body: { name: 'plain-titles', replaces: second.version } })).status, 200);
  const after = await (await ask(mine, 'listMemories', { query: { since: before.cursor } })).json();
  assert.deepEqual(after.memories, [{ name: 'plain-titles', removed: true }]);
  assert.equal((await ask(mine, 'getMemory', { query: { name: 'plain-titles' } })).status, 404);
});

test('Context starts with three honest always memories, current vault-map, and stable versions without resetting edits or deletions', async () => {
  const { db, env, ask, mine } = await running();
  const first = await (await ask(mine, 'getContext')).json();
  assert.deepEqual(first.always.map(each => each.memory.name), ['identity', 'vault-map', 'working-style']);
  assert.deepEqual(first.always.map(each => each.memory.stated), [false, false, false]);
  assert.match(first.always[0].memory.body, /has not yet been composed/);
  assert.equal(first.always.find(each => each.memory.name === 'vault-map').vault.posts, 0);
  assert.equal((await (await ask(mine, 'getContext')).json()).version, first.version);
  const posts = postStore(db);
  const post = { id: newPostId(), slug: 'a-post', label: 'Essays', sublabel: 'Series', visibility: 'private', body: 'Text.' };
  const saved = await posts.write(me, post);
  await posts.write(other, { ...post, label: 'Secret-other-label' });
  const second = await getContext({ env, did: me, posts });
  const map = second.always.find(each => each.memory.name === 'vault-map');
  assert.deepEqual(map.vault.labels, [{ label: 'Essays', posts: 1, sublabels: [{ sublabel: 'Series', posts: 1 }] }]);
  assert.equal(map.vault.recent[0].slug, 'a-post');
  assert.notEqual(second.version, first.version);
  const identity = first.always.find(each => each.memory.name === 'identity');
  await ask(mine, 'putMemory', { body: { memory: { ...identity.memory, body: 'A company, stated by the member.', stated: true }, replaces: identity.version } });
  await ask(mine, 'putMemory', { body: { memory: memory() } });
  const third = await (await ask(mine, 'getContext')).json();
  assert.equal(third.always.find(each => each.memory.name === 'identity').memory.body, 'A company, stated by the member.');
  assert.deepEqual(third.memories, [{ name: 'plain-titles', description: memory().description, kind: 'preference' }]);
  const style = third.always.find(each => each.memory.name === 'working-style');
  await ask(mine, 'deleteMemory', { body: { name: 'working-style', replaces: style.version } });
  await posts.remove(me, post.id, { replaces: saved.version });
  const fourth = await (await ask(mine, 'getContext')).json();
  assert.ok(!fourth.always.some(each => each.memory.name === 'working-style'));
  assert.equal(fourth.always.find(each => each.memory.name === 'vault-map').vault.posts, 0);
});

test('all cortex tables feed Context privately, approval gates hold and a full cortex cannot change Publish or Mirror', async () => {
  const { db, ask, mine, theirs } = await running();
  const before = await (await ask(mine, 'com.ohmmmm.vault.getPublishPlan')).json();
  const contextBefore = await (await ask(mine, 'getContext')).json();
  const now = new Date().toISOString();
  for (const did of [me, other]) {
    await memoryStore(db).write(did, memory('private-secret'));
    await db.prepare('INSERT INTO cortex_notes (did, id, text, session, written_by, created_at) VALUES (?1, ?2, ?3, ?4, ?1, ?5)').bind(did, 'note', `Observation for ${did}`, 'one', now).run();
    await db.prepare('INSERT INTO cortex_turns (did, id, session, agent, prompt, answer, written_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?1, ?7)').bind(did, 'turn', 'one', 'agent', 'prompt', 'answer', now).run();
    for (const [name, approved] of [['approved', 'v1'], ['unapproved', null]]) await db.prepare('INSERT INTO cortex_skills (did, name, version, description, skill, written_by, approved_version, seq, created_at, updated_at) VALUES (?1, ?2, ?3, ?2, ?4, ?1, ?5, ?6, ?7, ?7)').bind(did, name, 'v1', '{}', approved, approved ? 1 : 2, now).run();
    for (const [name, enabled, proposed] of [['enabled', 1, 0], ['off', 0, 0], ['proposed', 1, 1]]) await db.prepare('INSERT INTO cortex_tools (did, name, version, description, tool, enabled, proposed, written_by, seq, created_at, updated_at) VALUES (?1, ?2, ?3, ?2, ?4, ?5, ?6, ?1, ?7, ?8, ?8)').bind(did, name, 'v1', '{}', enabled, proposed, enabled + proposed + 1, now).run();
  }
  const context = await (await ask(mine, 'getContext')).json();
  assert.notEqual(context.version, contextBefore.version);
  assert.equal(context.notes.length, 1);
  assert.equal(context.notes[0].writtenBy, me);
  assert.equal(context.turns, 1);
  assert.deepEqual(context.skills, [{ name: 'approved', description: 'approved' }]);
  assert.deepEqual(context.tools, [{ name: 'enabled', description: 'enabled' }]);
  assert.equal((await (await ask(theirs, 'getContext')).json()).notes[0].writtenBy, other);
  assert.deepEqual(await (await ask(mine, 'com.ohmmmm.vault.getPublishPlan')).json(), before);
  assert.equal(before.changes, 0);
  assert.equal((await (await ask(mine, 'com.ohmmmm.vault.getTree')).json()).posts, 0);
  assert.equal((await (await ask(mine, 'com.ohmmmm.vault.exportFiles')).json()).files.length, 0);
  assert.equal((await ask(mine, 'com.ohmmmm.vault.importPublished', { body: { apply: true } })).status, 200);
  assert.equal((await (await ask(mine, 'getContext')).json()).version, context.version);
  assert.equal((await ask(mine, 'com.ohmmmm.cortex.exportFiles')).status, 501);
});

test('all 23 cortex requests are registered and later agents get authenticated explicit not-built handlers', async () => {
  const { ask, mine, sessions } = await running();
  sessions.set('session=member', { id: 'member' });
  const requests = Object.values(REQUESTS).filter(request => request.name.startsWith('com.ohmmmm.cortex.'));
  assert.equal(requests.length, 23);
  const built = ['getContext', 'listMemories', 'getMemory', 'putMemory', 'deleteMemory', 'searchMemories'];
  for (const request of requests.filter(request => !built.includes(request.name.split('.').at(-1)))) {
    assert.equal((await ask(mine, request.name, { token: null, ...(request.verb === 'POST' ? { body: {} } : {}) })).status, 401);
    if (request.asks === 'ohm') {
      assert.equal((await ask(mine, request.name, { body: {} })).status, 401);
      assert.equal((await ask(mine, request.name, { cookie: 'session=member', origin: 'https://app.test', body: {} })).status, 501);
    } else {
      const response = await ask(mine, request.name, request.verb === 'POST' ? { body: {} } : {});
      assert.equal(response.status, 501, request.name);
      assert.equal((await response.json()).error, 'NotBuiltYet');
    }
  }
  // Applying the additive schema again is safe for an existing vault.
  const db = await testDatabase();
  db.sqlite.exec(await readFile(new URL('../service/schema.sql', import.meta.url), 'utf8'));
});
