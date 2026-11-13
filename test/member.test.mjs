import assert from 'node:assert/strict';
import test from 'node:test';
import { published } from '../service/src/member.mjs';

const did = 'did:web:member.test', collection = 'com.ohmmmm.post';
const record = key => ({ uri: `at://${did}/${collection}/${key}`, value: { body: key } });
const refused = error => error.status === 502 && error.code === 'RepositoryUnreachable';
test('repository listing follows an empty page with an advancing cursor', async () => {
  const cursors = [];
  const records = await published(async input => {
    const cursor = new URL(input).searchParams.get('cursor');
    cursors.push(cursor);
    return Response.json(cursor === null ? { records: [], cursor: 'next' } : { records: [record('found')] });
  }, 'https://pds.test', did, collection);
  assert.deepEqual(cursors, [null, 'next']);
  assert.deepEqual([...records], [['found', { body: 'found' }]]);
});

test('repository listing requires a complete advancing valid set of pages', async () => {
  for (const finalCursor of [undefined, 'more']) {
    let page = 0;
    const read = () => published(async () => Response.json({ records: [record(`p${++page}`)], ...(page < 50 ? { cursor: String(page) } : finalCursor ? { cursor: finalCursor } : {}) }), 'https://pds.test', did, collection);
    if (finalCursor) await assert.rejects(read(), refused);
    else assert.equal((await read()).size, 50);
    assert.equal(page, 50);
  }
  for (const broken of [null, {}, { records: {} }, { records: [null] }, { records: [record('..')] }, { records: [{ ...record('x'), uri: `at://did:web:other.test/${collection}/x` }] }, { records: [{ ...record('x'), value: null }] }, { records: [record('x')], cursor: 12 }]) {
    await assert.rejects(published(async () => Response.json(broken), 'https://pds.test', did, collection), refused);
  }
  let page = 0;
  await assert.rejects(published(async () => Response.json({ records: [record(`r${++page}`)], cursor: ['a', 'b', 'a'][page - 1] }), 'https://pds.test', did, collection), refused);
  assert.equal(page, 3);
  await assert.rejects(published(async () => Response.json({ records: [record('duplicate')], cursor: 'more' }), 'https://pds.test', did, collection), refused);
  await assert.rejects(published(async () => new Response('invalid JSON'), 'https://pds.test', did, collection), refused);
});
