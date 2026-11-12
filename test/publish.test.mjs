import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../feed/pds.mjs';
import { postRecord } from '../vault/file.mjs';
import { publishPlan } from '../vault/publish.mjs';

// What publishing would do, worked out from a vault and what is published. Nothing is written.

const did = 'did:web:pds.haein.test';
const site = 'https://haein.test';
const ids = ['3aaaaaaaaaaaa', '3bbbbbbbbbbbb', '3cccccccccccc', '3dddddddddddd', '3eeeeeeeeeeee'];
const post = (n, slug, extra = {}) => ({ id: ids[n], slug, label: 'Writings', sublabel: '', visibility: 'public', title: slug, date: '2026-01-01T00:00:00.000Z', body: 'Words.', properties: {}, ...extra });
const recordOf = each => postRecord(each, { did, site, collection: POST, seenAt: '2026-01-01T00:00:00.000Z' }).record;
const plan = (posts, published = [], removed = []) => publishPlan({ did, site, posts, removed, published: new Map(published), now: new Date('2026-06-01T00:00:00.000Z') });
const actions = made => made.writes.map(write => [write.action, write.rkey]);

test('a post for everyone is published under its ID, and nothing else is', () => {
  const made = plan([post(0, 'hello'), post(1, 'for-friends', { visibility: 'friends' }), post(2, 'mine', { visibility: 'private' })]);
  assert.deepEqual([made.create, made.replace, made.remove, made.unchanged], [[{ id: ids[0], slug: 'hello', title: 'hello', address: 'https://haein.test/posts/writings/hello' }], [], [], 0]);
  assert.deepEqual(actions(made), [['create', ids[0]]]);
  assert.deepEqual([made.writes[0].record.$type, made.writes[0].record.slug, made.writes[0].record.body], [POST, 'hello', 'Words.']);
});

test('what is already published as it stands is left alone, and what changed is replaced', () => {
  const hello = post(0, 'hello');
  const edited = post(1, 'edited');
  const made = plan([hello, { ...edited, body: 'New words.', sublabel: 'Series' }], [[ids[0], recordOf(hello)], [ids[1], recordOf(edited)]]);
  assert.deepEqual([made.unchanged, made.create, made.remove], [1, [], []]);
  assert.deepEqual(made.replace, [{ id: ids[1], slug: 'edited', title: 'edited', changes: ['body', 'sublabel', 'address'] }]);
  assert.deepEqual(actions(made), [['update', ids[1]]]);
  // A post with no date is published as of now the first time, and keeps that date afterwards.
  const undated = post(2, 'undated');
  delete undated.date;
  const first = plan([undated]);
  assert.equal(first.writes[0].record.publishedAt, '2026-06-01T00:00:00.000Z');
  assert.equal(plan([undated], [[ids[2], first.writes[0].record]]).unchanged, 1);
});

test('a post that is no longer for everyone, or was removed, is taken down; a record the vault does not know is never touched', () => {
  const quiet = post(0, 'quiet', { visibility: 'private' });
  const shared = post(1, 'shared', { visibility: 'friends' });
  const published = [
    [ids[0], recordOf({ ...quiet, visibility: 'public' })], [ids[1], recordOf({ ...shared, visibility: 'public' })],
    [ids[2], recordOf(post(2, 'gone'))],
    ['from-elsewhere', { $type: POST, title: 'From elsewhere', body: 'Published by something else.', publishedAt: '2025-01-01T00:00:00.000Z' }],
  ];
  const made = plan([quiet, shared], published, [ids[2]]);
  assert.deepEqual(made.remove.map(each => [each.key, each.why]),
    [[ids[0], 'It is now only for you.'], [ids[1], 'It is now for friends.'], [ids[2], 'It was removed from the vault.']]);
  assert.deepEqual(made.notInVault, [{ key: 'from-elsewhere', title: 'From elsewhere' }]);
  assert.deepEqual(actions(made), [['delete', ids[0]], ['delete', ids[1]], ['delete', ids[2]]]);
  assert.deepEqual([made.create, made.replace], [[], []]);
});

test('a record published under its slug, from before posts had IDs, moves to its ID', () => {
  const hello = post(0, 'hello');
  const made = plan([hello, post(1, 'hidden', { visibility: 'private' })], [['hello', recordOf(hello)], ['hidden', recordOf(post(1, 'hidden'))]]);
  assert.deepEqual(made.replace, [{ id: ids[0], slug: 'hello', title: 'hello', changes: ['its record moves to its permanent key'] }]);
  assert.deepEqual(made.remove.map(each => [each.key, each.why]), [['hidden', 'It is now only for you.']]);
  assert.deepEqual(actions(made), [['create', ids[0]], ['delete', 'hello'], ['delete', 'hidden']]);
});

test('a post that cannot be published is named with why, and what is published of it stays', () => {
  const bad = post(0, 'bad', { sublabel: 'Series', label: '' });
  const linking = post(1, 'linking', { body: 'See [[A Private Thought]] and [[hello]].' });
  const made = plan([bad, linking, post(2, 'hello'), post(3, 'a-private-thought', { visibility: 'private' })], [[ids[0], recordOf(post(0, 'bad'))]]);
  assert.deepEqual(made.cannot.map(each => [each.slug, each.problems, each.stays ?? null]), [
    ['bad', ['A sublabel sits inside a label; set both'], 'What is published now stays as it is.'],
    // A post for everyone can link to another that is, and not to one that is not.
    ['linking', ['It links to "A Private Thought", which is not a post in this vault'], null],
  ]);
  assert.deepEqual(actions(made), [['create', ids[2]]]);
  assert.deepEqual(made.remove, []);
});

test('a link to another post becomes its address, a connection its record, and a picture an attachment to send', () => {
  const made = plan([
    post(0, 'hello', { address: 'https://haein.test/writing/hello.html' }),
    post(1, 'linking', { body: 'See [[hello]].\n\n![A hill](https://photos.example.com/hill.jpg)', connect: ['hello'] }),
  ]);
  const write = made.writes.find(each => each.rkey === ids[1]);
  assert.match(write.record.body, /See \[hello\]\(https:\/\/haein\.test\/writing\/hello\.html\)\./);
  assert.match(write.record.body, /!\[A hill\]\(media:hill\)/);
  assert.deepEqual(write.record.connect, [`at://${did}/${POST}/${ids[0]}`]);
  assert.deepEqual(write.attachments, [{ id: 'hill', address: 'https://photos.example.com/hill.jpg', kind: 'image', alt: 'A hill' }]);
});
