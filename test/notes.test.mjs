import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryStore } from '../cortex/store.mjs';
import notes from '../service/src/capabilities/notes.mjs';
import { Refused, postStore } from '../service/src/store.mjs';
import { getContext } from '../cortex/context.mjs';
import { createService } from '../service/src/worker.mjs';
import { testDatabase } from './d1.mjs';

const me = 'did:web:notes.member.test';
const other = 'did:web:notes.other.test';
const refusal = code => error => error.code === code;
const memory = (fields = {}) => ({ name: 'plain-titles', description: 'Use short titles', kind: 'preference', stated: true, body: 'Use a few plain words.', ...fields });

async function setup() {
  const db = await testDatabase();
  // The shared foundation fixture has no batch yet. Model D1's transactional batch here,
  // keeping that coordinator-owned helper untouched; execute the production SQL verbatim.
  db.batch = async statements => {
    await db.beforeBatch?.();
    db.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (let index = 0; index < statements.length; index++) {
        if (db.failAt === index) throw new Error('injected batch failure');
        results.push(await statements[index].all());
      }
      db.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      db.sqlite.exec('ROLLBACK');
      throw error;
    }
  };
  const call = (name, sent, did = me) => notes.requests[`com.ohmmmm.cortex.${name}`].run({
    did, env: { DB: db }, body: async () => sent,
    url: new URL(`https://vault.test/xrpc/com.ohmmmm.cortex.${name}${typeof sent === 'string' ? sent : ''}`),
  });
  const add = (id, fields = {}, did = me) => call('addNote', { id, note: `Observed ${id}`, session: `session-${id}`, ...fields }, did);
  const list = (query = '', did = me) => call('listNotes', query, did);
  const settle = (items, did = me) => call('settleNotes', { notes: items }, did);
  return { db, call, add, list, settle, store: memoryStore(db) };
}

test('Notes retries keep one observation and authenticated attribution, without rewriting memory', async () => {
  const { db, add, list, settle, store } = await setup();
  const first = await store.write(me, memory());
  assert.deepEqual(await add('one'), { id: 'one' });
  const before = (await list()).notes[0];
  await Promise.all([add('one'), add('one')]);
  assert.deepEqual((await list()).notes, [before]);
  assert.equal(before.writtenBy, me);
  assert.ok(Number.isFinite(Date.parse(before.when)));
  assert.equal((await store.read(me, 'plain-titles')).version, first.version);
  await assert.rejects(add('one', { note: 'Different' }), refusal('Changed'));
  await assert.rejects(add('one', { session: 'Different' }), refusal('Changed'));
  await assert.rejects(add('one', { project: 'different' }), refusal('Changed'));
  await settle([{ id: 'one', outcome: 'kept' }]);
  await add('one');
  assert.deepEqual((await list()).notes, []);
  assert.equal((await list('?settled=1')).notes[0].outcome, 'kept');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cortex_notes').get().n, 1);
});

test('Notes validates lines and Unicode limits and refuses client attribution or counters', async () => {
  const { call, add, list } = await setup();
  for (const fields of [
    { id: '' }, { id: 'x'.repeat(201) }, { id: '😀'.repeat(101) }, { note: '' }, { note: ' ' }, { note: 'a\nb' },
    { note: 'a\rb' }, { note: 'a\u2028b' }, { note: 'a\u2029b' }, { note: 'a\0b' },
    { note: '가'.repeat(501) }, { session: '' }, { session: 'x'.repeat(201) },
    { session: 'a\nb' }, { project: 10 }, { project: 'a\nb' }, { project: 'x'.repeat(2001) },
    { writtenBy: other }, { when: '2000-01-01' }, { seen: { count: 100 } }, { outcome: 'kept' }, { visibility: 'public' },
  ]) await assert.rejects(add('invalid', fields), refusal('InvalidRequest'));
  await assert.rejects(call('addNote', null), refusal('InvalidRequest'));
  await add('unicode', { note: '가'.repeat(500), project: '' });
  assert.equal((await list()).notes[0].project, null);
  await assert.rejects(list('?settled=yes'), refusal('InvalidRequest'));
  assert.equal((await list('?settled=false')).notes.length, 1);
});

test('all three outcomes persist atomically, update service evidence and keep restorable memory history', async () => {
  const { add, list, settle, store, db } = await setup();
  const first = await store.write(me, memory());
  await add('kept');
  await add('dropped');
  await add('agrees');
  const items = [{ id: 'kept', outcome: 'kept' }, { id: 'dropped', outcome: 'dropped' }, { id: 'agrees', outcome: 'plain-titles', version: first.version }];
  assert.deepEqual(await settle(items), { settled: ['kept', 'dropped', 'agrees'] });
  assert.deepEqual((await list()).notes, []);
  const receipts = (await list('?settled=1')).notes;
  assert.equal(receipts.length, 3);
  assert.equal(new Set(receipts.map(note => note.settledAt)).size, 1);
  assert.deepEqual(Object.fromEntries(receipts.map(note => [note.id, note.outcome])), { agrees: 'plain-titles', dropped: 'dropped', kept: 'kept' });
  const held = await store.read(me, 'plain-titles', { history: true });
  assert.equal(held.memory.body, memory().body);
  assert.equal(held.memory.stated, true);
  assert.equal(held.memory.writtenBy, me);
  assert.deepEqual(held.memory.seen, { count: 1, last: receipts.find(note => note.id === 'agrees').when });
  assert.deepEqual(held.memory.notes, ['agrees']);
  assert.notEqual(held.version, first.version);
  assert.equal(held.earlier[0].version, first.version);
  assert.equal((await store.read(me, 'plain-titles', { version: first.version })).memory.seen.count, 0);
  assert.deepEqual(await settle(items), { settled: ['kept', 'dropped', 'agrees'] });
  assert.equal((await store.read(me, 'plain-titles')).version, held.version);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cortex_memory_versions').get().n, 1);
  // Evidence is still service-owned when clients write back a full memory.
  await store.write(me, { ...held.memory, seen: { count: 999, last: null }, writtenBy: other }, { replaces: held.version });
  assert.deepEqual((await store.read(me, 'plain-titles')).memory.seen, held.memory.seen);
});

test('unknown notes or memories and conflicting receipts refuse the entire request', async () => {
  const { add, list, settle, store } = await setup();
  await add('one');
  await add('two');
  for (const items of [
    [{ id: 'one', outcome: 'kept' }, { id: 'missing', outcome: 'dropped' }],
    [{ id: 'one', outcome: 'kept' }, { id: 'two', outcome: 'missing-memory', version: 'missing' }],
  ]) await assert.rejects(settle(items), refusal('NotFound'));
  assert.equal((await list()).notes.length, 2);
  await settle([{ id: 'one', outcome: 'kept' }]);
  await assert.rejects(settle([{ id: 'two', outcome: 'dropped' }, { id: 'one', outcome: 'dropped' }]), refusal('Changed'));
  assert.deepEqual((await list()).notes.map(note => note.id), ['two']);
  assert.deepEqual((await store.list(me)).memories, []);
});

test('settlements require an explicit valid outcome for every submitted ID', async () => {
  const { add, call, settle } = await setup();
  await add('one');
  for (const items of [
    [], new Array(101).fill({ id: 'one', outcome: 'kept' }),
    [{ id: 'one' }], [{ id: 'one', outcome: null }], [{ id: 'one', outcome: true }],
    [{ id: 'one', outcome: '../escape' }], [{ id: 'one', outcome: 'plain-titles' }],
    [{ id: 'one', outcome: 'kept', version: 'v1' }], [{ id: 'one', outcome: 'kept', seen: 99 }],
    [{ id: 'one', outcome: 'kept' }, { id: 'one', outcome: 'kept' }],
  ]) await assert.rejects(settle(items), refusal('InvalidRequest'));
  await assert.rejects(call('settleNotes', {}), refusal('InvalidRequest'));
});

test('Notes and evidence cannot cross members, even with identical note and memory names', async () => {
  const { add, list, settle, store } = await setup();
  await add('shared');
  await add('shared', { note: 'Their note' }, other);
  await add('mine-only');
  const theirs = await store.write(other, memory());
  assert.equal((await list('', other)).notes[0].text, 'Their note');
  await assert.rejects(settle([{ id: 'mine-only', outcome: 'dropped' }], other), refusal('NotFound'));
  await assert.rejects(settle([{ id: 'shared', outcome: 'plain-titles', version: theirs.version }]), refusal('NotFound'));
  await settle([{ id: 'shared', outcome: 'plain-titles', version: theirs.version }], other);
  assert.equal((await list()).notes.length, 2);
  assert.equal((await store.read(other, 'plain-titles')).memory.seen.count, 1);
});

test('one session cannot become inferred memory evidence; historical kept notes can confirm a later session', async () => {
  const { add, settle, list, store } = await setup();
  await add('first', { session: 'one' });
  await add('same-session', { session: 'one' });
  const first = await store.write(me, memory({ stated: false }));
  await assert.rejects(settle([
    { id: 'first', outcome: 'plain-titles', version: first.version },
    { id: 'same-session', outcome: 'plain-titles', version: first.version },
  ]), refusal('InvalidMemory'));
  assert.equal((await list()).notes.length, 2);
  await settle([{ id: 'first', outcome: 'kept' }, { id: 'same-session', outcome: 'dropped' }]);
  await add('later', { session: 'two' });
  const rewrite = await store.write(me, memory({ stated: false, notes: ['first', 'later'] }), { replaces: first.version });
  await settle([{ id: 'later', outcome: 'plain-titles', version: rewrite.version }]);
  const held = await store.read(me, 'plain-titles');
  assert.equal(held.memory.seen.count, 2);
  assert.deepEqual(held.memory.notes, ['first', 'later']);
  assert.equal((await list('?settled=1')).notes.find(note => note.id === 'first').outcome, 'kept');
  assert.equal((await store.read(me, 'plain-titles', { version: first.version })).memory.notes, undefined);
});

test('recreated inferred memories cannot inherit receipts from a deleted claim', async () => {
  const { add, settle, list, store } = await setup();
  for (const id of ['old-a', 'old-b']) await add(id);
  const first = await store.write(me, memory({ stated: false, notes: ['old-a', 'old-b'] }));
  await settle(['old-a', 'old-b'].map(id => ({ id, outcome: 'plain-titles', version: first.version })));
  const oldReceipts = (await list('?settled=1')).notes;
  const old = await store.read(me, 'plain-titles');
  await store.remove(me, 'plain-titles', { replaces: old.version });
  await add('new-c');
  const replacement = await store.write(me, memory({ stated: false, body: 'A different claim.', notes: ['new-c'] }));
  await assert.rejects(settle([{ id: 'new-c', outcome: 'plain-titles', version: replacement.version }]), refusal('InvalidMemory'));
  assert.deepEqual((await list()).notes.map(note => note.id), ['new-c']);
  assert.equal((await store.read(me, 'plain-titles')).version, replacement.version);
  await add('new-d');
  await settle(['new-c', 'new-d'].map(id => ({ id, outcome: 'plain-titles', version: replacement.version })));
  const held = await store.read(me, 'plain-titles');
  assert.deepEqual(held.memory.notes, ['new-c', 'new-d']);
  assert.equal(held.memory.seen.count, 2);
  assert.deepEqual((await list('?settled=1')).notes.filter(note => note.id.startsWith('old-')), oldReceipts);
});

test('evidence counters exclude receipts explicitly removed from a rewritten memory', async () => {
  const { add, settle, list, store } = await setup();
  await add('old');
  const first = await store.write(me, memory());
  await settle([{ id: 'old', outcome: 'plain-titles', version: first.version }]);
  const old = await store.read(me, 'plain-titles');
  const rewrite = await store.write(me, memory({ body: 'Corrected claim.', notes: [] }), { replaces: old.version });
  await add('new');
  await settle([{ id: 'new', outcome: 'plain-titles', version: rewrite.version }]);
  const held = await store.read(me, 'plain-titles');
  const latest = (await list('?settled=1')).notes.find(note => note.id === 'new');
  assert.deepEqual(held.memory.notes, ['new']);
  assert.deepEqual(held.memory.seen, { count: 1, last: latest.when });
});

test('each unchanged seed accepts its first confirming observation without a new inferred claim', async () => {
  const { add, settle, store } = await setup();
  await store.seed(me);
  for (const name of ['identity', 'vault-map', 'working-style']) {
    const before = await store.read(me, name);
    await add(name);
    await settle([{ id: name, outcome: name, version: before.version }]);
    const held = await store.read(me, name, { history: true });
    assert.equal(held.memory.body, before.memory.body);
    assert.equal(held.memory.stated, false);
    assert.deepEqual(held.memory.notes, [name]);
    assert.equal(held.memory.seen.count, 1);
    assert.equal(held.earlier[0].version, before.version);
  }
});

test('rewriting a seed into an inferred claim still requires two supporting sessions', async () => {
  const { add, settle, list, store } = await setup();
  await store.seed(me);
  const seed = await store.read(me, 'working-style');
  const rewritten = await store.write(me, { ...seed.memory, body: 'Prefers automatic publishing.', notes: [] }, { replaces: seed.version });
  await add('one');
  await assert.rejects(settle([{ id: 'one', outcome: 'working-style', version: rewritten.version }]), refusal('InvalidMemory'));
  assert.equal((await list()).notes.length, 1);
  await add('two');
  await settle(['one', 'two'].map(id => ({ id, outcome: 'working-style', version: rewritten.version })));
  assert.equal((await store.read(me, 'working-style')).memory.seen.count, 2);
});

test('multiple notes from one session count once, across retries and later settlements', async () => {
  const { add, settle, store } = await setup();
  let { version } = await store.write(me, memory());
  for (const id of ['a', 'b', 'c']) await add(id, { session: 'one' });
  await settle(['a', 'b'].map(id => ({ id, outcome: 'plain-titles', version })));
  version = (await store.read(me, 'plain-titles')).version;
  await settle([{ id: 'c', outcome: 'plain-titles', version }]);
  let held = await store.read(me, 'plain-titles');
  assert.equal(held.memory.seen.count, 1);
  await add('d', { session: 'two' });
  await settle([{ id: 'd', outcome: 'plain-titles', version: held.version }]);
  held = await store.read(me, 'plain-titles');
  assert.equal(held.memory.seen.count, 2);
  assert.deepEqual(held.memory.notes, ['a', 'b', 'c', 'd']);
});

test('project evidence and dropped source-note references cannot contaminate memory', async () => {
  const { add, settle, store, list } = await setup();
  const first = await store.write(me, memory({ project: 'repo-one' }));
  await add('wrong-project', { project: 'repo-two' });
  await assert.rejects(settle([{ id: 'wrong-project', outcome: 'plain-titles', version: first.version }]), refusal('InvalidMemory'));
  await add('dropped', { project: 'repo-one' });
  await settle([{ id: 'dropped', outcome: 'dropped' }]);
  await add('right-project', { project: 'repo-one' });
  const rewrite = await store.write(me, memory({ project: 'repo-one', notes: ['dropped'] }), { replaces: first.version });
  await assert.rejects(settle([{ id: 'right-project', outcome: 'plain-titles', version: rewrite.version }]), refusal('InvalidMemory'));
  assert.equal((await list()).notes.length, 2);
});

test('stale versions and concurrent target rewrites or removal leave all notes untouched', async () => {
  for (const mode of ['stale', 'rewrite', 'remove']) {
    const { add, settle, store, list, db } = await setup();
    const first = await store.write(me, memory());
    await add('one');
    await add('two');
    const compete = async () => mode === 'remove'
      ? store.remove(me, 'plain-titles', { replaces: first.version })
      : store.write(me, memory({ body: 'Concurrent rewrite' }), { replaces: first.version });
    if (mode === 'stale') await compete();
    else db.beforeBatch = async () => { db.beforeBatch = null; await compete(); };
    await assert.rejects(settle([
      { id: 'one', outcome: 'plain-titles', version: first.version }, { id: 'two', outcome: 'kept' },
    ]), refusal('Changed'));
    assert.equal((await list()).notes.length, 2, mode);
    if (mode !== 'remove') assert.equal((await store.read(me, 'plain-titles')).memory.seen.count, 0);
  }
});

test('competing settlements cannot overwrite receipts or lose/double-count memory evidence', async () => {
  const { add, settle, store, list, db } = await setup();
  const first = await store.write(me, memory());
  await add('one');
  await add('two');
  db.beforeBatch = async () => {
    db.beforeBatch = null;
    await settle([{ id: 'one', outcome: 'plain-titles', version: first.version }]);
  };
  await assert.rejects(settle([{ id: 'two', outcome: 'plain-titles', version: first.version }]), refusal('Changed'));
  const second = await store.read(me, 'plain-titles');
  assert.equal(second.memory.seen.count, 1);
  assert.deepEqual((await list()).notes.map(note => note.id), ['two']);
  await settle([{ id: 'two', outcome: 'plain-titles', version: second.version }]);
  assert.equal((await store.read(me, 'plain-titles')).memory.seen.count, 2);
  await add('three');
  db.beforeBatch = async () => { db.beforeBatch = null; await settle([{ id: 'three', outcome: 'kept' }]); };
  await assert.rejects(settle([{ id: 'three', outcome: 'dropped' }]), refusal('Changed'));
  assert.equal((await list('?settled=true')).notes.find(note => note.id === 'three').outcome, 'kept');
});

test('a database failure rolls back evidence, history and note receipts together', async () => {
  const { add, settle, store, list, db } = await setup();
  const first = await store.write(me, memory());
  await add('one');
  db.failAt = 2; // after the guarded memory update and its history trigger
  await assert.rejects(settle([{ id: 'one', outcome: 'plain-titles', version: first.version }]), /injected batch failure/);
  assert.equal((await store.read(me, 'plain-titles')).version, first.version);
  assert.equal((await list()).notes.length, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cortex_memory_versions').get().n, 0);
});

test('two target memories and 100 explicit outcomes commit together without losing source limits', async () => {
  const { add, settle, store, list } = await setup();
  const one = await store.write(me, memory());
  const two = await store.write(me, memory({ name: 'show-working' }));
  for (let index = 0; index < 100; index++) await add(`note-${index}`);
  const items = Array.from({ length: 100 }, (_, index) => ({ id: `note-${index}`,
    outcome: index < 50 ? 'plain-titles' : 'show-working', version: index < 50 ? one.version : two.version }));
  assert.equal((await settle(items)).settled.length, 100);
  assert.equal((await list()).notes.length, 0);
  assert.equal((await store.read(me, 'plain-titles')).memory.seen.count, 50);
  assert.equal((await store.read(me, 'show-working')).memory.seen.count, 50);
  assert.equal((await store.read(me, 'plain-titles', { history: true })).earlier.length, 1);
  assert.equal((await store.read(me, 'show-working', { history: true })).earlier.length, 1);
});

test('source provenance cannot be borrowed from a different memory and the 100-source limit is explicit', async () => {
  const { add, settle, store, list } = await setup();
  let { version } = await store.write(me, memory());
  for (let index = 0; index < 100; index++) await add(`note-${index}`);
  await settle(Array.from({ length: 100 }, (_, index) => ({ id: `note-${index}`, outcome: 'plain-titles', version })));
  version = (await store.read(me, 'plain-titles')).version;
  await add('overflow');
  await assert.rejects(settle([{ id: 'overflow', outcome: 'plain-titles', version }]), refusal('InvalidMemory'));
  assert.deepEqual((await list()).notes.map(note => note.id), ['overflow']);
  const otherMemory = await store.write(me, memory({ name: 'show-working', notes: ['note-0'] }));
  await assert.rejects(settle([{ id: 'overflow', outcome: 'show-working', version: otherMemory.version }]), refusal('InvalidMemory'));
});

test('a completed settlement retry stays successful after its memory is removed', async () => {
  const { add, settle, store } = await setup();
  const first = await store.write(me, memory());
  await add('one');
  const items = [{ id: 'one', outcome: 'plain-titles', version: first.version }];
  await settle(items);
  await store.remove(me, 'plain-titles', { replaces: (await store.read(me, 'plain-titles')).version });
  assert.deepEqual(await settle(items), { settled: ['one'] });
});

test('Notes context versions change with additions and settlements and exclude other members', async () => {
  const { add, settle, db } = await setup();
  const context = () => getContext({ did: me, env: { DB: db }, posts: postStore(db) });
  const start = await context();
  await add('other-only', {}, other);
  assert.equal((await context()).version, start.version);
  await add('one');
  const waiting = await context();
  assert.equal(waiting.notes.length, 1);
  assert.notEqual(waiting.version, start.version);
  await settle([{ id: 'one', outcome: 'kept' }]);
  assert.equal((await context()).notes.length, 0);
  assert.notEqual((await context()).version, waiting.version);
});

test('registered Notes routes require authentication and never accept a body DID as authority', async () => {
  const { db } = await setup();
  const service = createService({ whoIs: async request => {
    const token = request.headers.get('Authorization');
    if (!['Bearer me', 'Bearer other'].includes(token)) throw new Refused(401, 'InvalidToken', 'Synthetic test token required');
    return token === 'Bearer me' ? me : other;
  } });
  const ask = (name, { body, token = 'me', query = '' } = {}) => service(new Request(`https://vault.test/xrpc/com.ohmmmm.cortex.${name}${query}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { DB: db });
  assert.equal((await ask('listNotes', { token: 'bad' })).status, 401);
  for (const name of ['addNote', 'settleNotes']) assert.equal((await ask(name, { token: 'bad', body: {} })).status, 401);
  assert.equal((await ask('addNote', { body: { id: 'one', note: 'Private', session: 'one', did: other } })).status, 400);
  assert.deepEqual(await (await ask('addNote', { body: { id: 'one', note: 'Private', session: 'one' } })).json(), { id: 'one' });
  assert.deepEqual(await (await ask('listNotes', { token: 'other' })).json(), { notes: [] });
  assert.equal((await ask('settleNotes', { token: 'other', body: { notes: [{ id: 'one', outcome: 'dropped' }] } })).status, 404);
  assert.deepEqual(await (await ask('settleNotes', { body: { notes: [{ id: 'one', outcome: 'kept' }] } })).json(), { settled: ['one'] });
  assert.equal((await (await ask('listNotes', { query: '?settled=1' })).json()).notes[0].outcome, 'kept');
});
