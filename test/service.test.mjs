import assert from 'node:assert/strict';
import test from 'node:test';
import { secp256k1 } from '../service/node_modules/@noble/curves/secp256k1.js';
import { createIdentity, documentAddress } from '../service/src/identity.mjs';
import { postStore } from '../service/src/store.mjs';
import { createService } from '../service/src/worker.mjs';
import { newPostId, postFile, filePost } from '../vault/file.mjs';
import { testDatabase } from './d1.mjs';

const me = 'did:web:pds.example.test';
const other = 'did:web:pds.other.test';
const refusal = code => problem => problem.code === code;
let made = 0;
const post = (slug, extra = {}) => ({
  id: newPostId(Date.parse('2026-11-12T00:00:00Z') + made++, 1), slug, label: 'Writings', sublabel: '', visibility: 'private',
  title: slug, body: 'Words.', properties: {}, ...extra,
});

test('posts are written, read back exactly, listed, and removed', async () => {
  const store = postStore(await testDatabase());
  const trap = post('trap-of-independency', {
    sublabel: 'Collisions', title: '서울: "첫" 번째 #글', date: '2026-03-01', connect: ['why-i-started-ohm'],
    body: 'The body, with [[A Wikilink]] and ![[an-embed.png]].\n\nTrailing spaces inside a line  \nstay.', properties: { mood: 'restless', pinned: true },
  });
  const saved = await store.write(me, trap);
  assert.deepEqual(Object.keys(saved), ['id', 'version']);
  assert.deepEqual(await store.read(me, trap.id), { post: trap, version: saved.version });

  const loose = post('loose-thought', { label: '', title: undefined, body: 'Rain.' });
  delete loose.title;
  await store.write(me, loose);
  const all = await store.list(me);
  assert.deepEqual(all.posts, [
    { id: trap.id, version: saved.version, slug: 'trap-of-independency', label: 'Writings', sublabel: 'Collisions', visibility: 'private', title: '서울: "첫" 번째 #글' },
    { id: loose.id, version: (await store.read(me, loose.id)).version, slug: 'loose-thought', label: '', sublabel: '', visibility: 'private' },
  ]);
  // Nothing has changed since that list.
  assert.deepEqual(await store.list(me, { since: all.cursor }), { posts: [], cursor: all.cursor });

  const edited = await store.write(me, { ...loose, body: 'Rain, again.' }, { replaces: all.posts[1].version });
  await store.remove(me, trap.id, { replaces: saved.version });
  const since = await store.list(me, { since: all.cursor });
  assert.deepEqual(since.posts.map(each => [each.id, each.version ?? 'removed']), [[loose.id, edited.version], [trap.id, 'removed']]);
  // A full list holds only what is there; a removed post cannot be read.
  assert.deepEqual((await store.list(me)).posts.map(each => each.id), [loose.id]);
  await assert.rejects(store.read(me, trap.id), refusal('NotFound'));
});

test('a post keeps its ID whatever else about it changes, its slug included', async () => {
  const store = postStore(await testDatabase());
  const first = post('a-first-name');
  const saved = await store.write(me, first);
  // Renamed, refiled, retitled, and shown to friends. It is the same post.
  const renamed = { ...first, slug: 'a-better-name', label: 'Essays', sublabel: '2026', title: 'A better name', visibility: 'friends' };
  const again = await store.write(me, renamed, { replaces: saved.version });
  assert.equal(again.id, first.id);
  assert.deepEqual((await store.read(me, first.id)).post, renamed);
  assert.deepEqual((await store.list(me)).posts.map(each => [each.id, each.slug]), [[first.id, 'a-better-name']]);

  // A slug is used once in a vault: a second post cannot take it, by being made or by being renamed.
  const second = post('another');
  await assert.rejects(store.write(me, { ...second, slug: 'a-better-name' }), refusal('SlugTaken'));
  const kept = await store.write(me, second);
  await assert.rejects(store.write(me, { ...second, slug: 'a-better-name' }, { replaces: kept.version }), refusal('SlugTaken'));
  assert.equal((await store.read(me, second.id)).post.slug, 'another');
  // The old slug is free again, and so is the slug of a post that was removed.
  await store.write(me, post('a-first-name'));
  await store.remove(me, second.id, { replaces: kept.version });
  await store.write(me, post('another'));
  // Another member's vault has its own slugs.
  await store.write(other, post('a-better-name'));
});

test('every write and removal names the version it replaces', async () => {
  const store = postStore(await testDatabase());
  const a = post('a');
  const one = await store.write(me, a);
  // A new post that is already there, a stale version, and a version for a post that is not there.
  await assert.rejects(store.write(me, { ...a, body: 'two' }), problem => problem.code === 'Changed' && problem.extra.current === one.version);
  const two = await store.write(me, { ...a, body: 'two' }, { replaces: one.version });
  await assert.rejects(store.write(me, { ...a, body: 'three' }, { replaces: one.version }), problem => problem.code === 'Changed' && problem.extra.current === two.version);
  await assert.rejects(store.write(me, post('b'), { replaces: one.version }), problem => problem.code === 'Changed' && problem.extra.current === null);
  await assert.rejects(store.remove(me, a.id, { replaces: one.version }), refusal('Changed'));
  await assert.rejects(store.remove(me, a.id), refusal('Changed'));
  assert.equal((await store.read(me, a.id)).post.body, 'two');

  // A request sent twice ends the same as sent once, whatever version the repeat names.
  const before = (await store.list(me)).cursor;
  assert.equal((await store.write(me, { ...a, body: 'two' }, { replaces: one.version })).unchanged, true);
  assert.equal((await store.list(me)).cursor, before);
  await store.remove(me, a.id, { replaces: two.version });
  assert.equal((await store.remove(me, a.id, { replaces: two.version })).unchanged, true);
});

test('two writers at once: one lands and the other is refused by the database itself', async () => {
  const db = await testDatabase();
  const store = postStore(db);
  const a = post('a');
  const one = await store.write(me, a);
  // Both read the same version, then both write. The statement that changes the row checks the
  // version again, so the second finds it gone however the two requests interleave.
  const prepare = db.prepare.bind(db);
  let interleaved = false;
  db.prepare = sql => {
    const statement = prepare(sql);
    if (!sql.startsWith('INSERT') || interleaved) return statement;
    return { bind: (...given) => ({ first: async () => {
      interleaved = true;
      await postStore({ prepare }).write(me, { ...a, body: 'theirs' }, { replaces: one.version });
      return statement.bind(...given).first();
    } }) };
  };
  await assert.rejects(store.write(me, { ...a, body: 'mine' }, { replaces: one.version }), refusal('Changed'));
  assert.equal((await store.read(me, a.id)).post.body, 'theirs');
});

test('a post that is not a post is refused, and only a post\'s own fields are kept', async () => {
  const store = postStore(await testDatabase());
  for (const [change, words] of [
    [{ id: undefined }, /A post has an ID/],
    [{ id: 'not-an-id' }, /A post has an ID/],
    [{ slug: 'Not A Slug' }, /slug is lowercase Latin letters/],
    [{ visibility: 'everyone' }, /visibility is one of/],
    [{ visibility: undefined }, /visibility is one of/],
    [{ sublabel: 'Alone', label: '' }, /A sublabel sits inside a label/],
    [{ label: 'a/b' }, /cannot hold "\/"/],
    [{ body: undefined }, /body is text/],
    [{ properties: { nested: { a: 1 } } }, /text, a number, yes or no, or a list of those/],
  ]) {
    await assert.rejects(store.write(me, { ...post('fits'), ...change }), problem => problem.code === 'InvalidPost' && words.test(problem.message));
  }
  await assert.rejects(store.write(me, post('big', { body: 'x'.repeat(700_000) })), refusal('TooLarge'));
  assert.deepEqual((await store.list(me)).posts, []);
  // Something a client adds that a post has no field for is not kept.
  const extra = post('plain');
  await store.write(me, { ...extra, did: other, version: 'made-up', owner: 'someone else' });
  assert.deepEqual((await store.read(me, extra.id)).post, extra);
  await assert.rejects(store.read(me, 'nothing'), refusal('InvalidPost'));
  await assert.rejects(store.list(me, { since: 'yesterday' }), refusal('InvalidCursor'));
});

test('one member\'s posts are never another\'s', async () => {
  const store = postStore(await testDatabase());
  const mine = post('private-thought', { body: 'Mine.' });
  const saved = await store.write(me, mine);
  assert.deepEqual((await store.list(other)).posts, []);
  await assert.rejects(store.read(other, mine.id), refusal('NotFound'));
  assert.equal((await store.tree(other)).posts, 0);
  // Knowing a post's ID gives another member nothing: the same ID is a post of their own.
  assert.equal((await store.remove(other, mine.id, { replaces: saved.version })).unchanged, true);
  await store.write(other, { ...mine, body: 'Theirs.' });
  assert.equal((await store.read(me, mine.id)).post.body, 'Mine.');
});

// ---- The service as a whole: requests in, answers out, with real tokens. ----
const audience = 'did:web:vault.ohmmmm.test';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(input) {
  let value = 0n;
  for (const byte of input) value = value * 256n + BigInt(byte);
  let text = '';
  for (; value > 0n; value /= 58n) text = ALPHABET[Number(value % 58n)] + text;
  return text;
}
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function account(did) {
  const secret = secp256k1.utils.randomPrivateKey();
  const document = { id: did, verificationMethod: [{ id: `${did}#atproto`, type: 'Multikey', controller: did,
    publicKeyMultibase: `z${base58(Uint8Array.from([0xe7, 0x01, ...secp256k1.getPublicKey(secret, true)]))}` }] };
  const token = async (lxm, claims = {}) => {
    const signed = `${encode({ typ: 'JWT', alg: 'ES256K' })}.${encode({ iss: did, aud: audience, lxm, exp: Math.floor(Date.now() / 1000) + 60, ...claims })}`;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signed)));
    return `${signed}.${Buffer.from(secp256k1.sign(digest, secret, { lowS: true }).toCompactRawBytes()).toString('base64url')}`;
  };
  return { did, document, token };
}

async function running() {
  const haein = account('did:web:pds.haein.test');
  const jun = account('did:web:pds.jun.test');
  const stranger = account('did:web:pds.stranger.test');
  const documents = Object.fromEntries([haein, jun, stranger].map(each => [documentAddress(each.did), each.document]));
  for (const each of [haein, jun, stranger]) each.document.service = [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: `https://${each.did.slice('did:web:'.length)}` }];
  const whoIs = createIdentity({ audience, members: `${haein.did},${jun.did}`, get: async url => Response.json(documents[String(url)]) });
  const env = { DB: await testDatabase() };
  // What each member has published, as their own PDS would list it.
  const repositories = new Map();
  const get = async (url, options) => {
    // The service runs on Cloudflare, whose fetch refuses any other way of handling a redirect.
    assert.ok(['follow', 'manual'].includes(options.redirect), `redirect: ${options.redirect}`);
    const records = repositories.get(`${url.origin}|${url.searchParams.get('collection')}`) ?? [];
    return Response.json({ records: records.map(([key, value]) => ({ uri: `at://${url.searchParams.get('repo')}/${url.searchParams.get('collection')}/${key}`, value })) });
  };
  const service = createService({ whoIs, get });
  // One request, signed by `as` for exactly that request unless told otherwise.
  const ask = async (as, name, { query = {}, body, token, verb } = {}) => {
    const url = new URL(`https://vault.ohmmmm.test/xrpc/com.ohmmmm.vault.${name}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const bearer = token === null ? null : token ?? await as.token(`com.ohmmmm.vault.${name}`);
    const posted = ['putPost', 'deletePost', 'importPublished'].includes(name);
    return service(new Request(url, {
      method: verb ?? (posted ? 'POST' : 'GET'),
      headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }), env);
  };
  return { haein, jun, stranger, ask, env, repositories };
}

test('a member\'s vault over the four requests, with the structure read from the posts', async () => {
  const { haein, ask } = await running();
  const trap = post('trap-of-independency', { sublabel: 'Collisions', title: 'Trap of independency', date: '2026-03-01', visibility: 'public', body: 'The body, with [[Another Post]].' });
  const loose = post('loose-thought', { label: '', body: 'Rain makes a city honest.' });
  delete loose.title;
  const lisboa = post('lisboa', { label: 'Photographs', visibility: 'friends', body: '![The hill](https://photos.example.com/lisboa-12.jpg)' });
  delete lisboa.title;
  const put = await (await ask(haein, 'putPost', { body: { post: trap } })).json();
  for (const each of [loose, lisboa]) assert.equal((await ask(haein, 'putPost', { body: { post: each } })).status, 200);

  const got = await ask(haein, 'getPost', { query: { id: trap.id } });
  assert.deepEqual([await got.json(), got.headers.get('Cache-Control')], [{ post: trap, version: put.version }, 'private, no-store']);
  const listed = await (await ask(haein, 'listPosts')).json();
  assert.deepEqual(listed.posts.map(each => each.slug), ['trap-of-independency', 'loose-thought', 'lisboa']);

  const tree = await (await ask(haein, 'getTree')).json();
  assert.deepEqual([tree.posts, tree.public, tree.friends, tree.private], [3, 1, 1, 1]);
  assert.deepEqual(tree.labels, [
    { label: 'other', posts: [{ id: loose.id, slug: 'loose-thought', visibility: 'private', form: 'note', date: tree.labels[0].posts[0].date }], sublabels: [] },
    { label: 'Photographs', posts: [{ id: lisboa.id, slug: 'lisboa', visibility: 'friends', form: 'image', date: tree.labels[1].posts[0].date }], sublabels: [] },
    { label: 'Writings', posts: [], sublabels: [{ sublabel: 'Collisions', posts: [
      { id: trap.id, slug: 'trap-of-independency', visibility: 'public', title: 'Trap of independency', form: 'writing', date: '2026-03-01T00:00:00.000Z' },
    ] }] },
  ]);

  // Changing who may see a post changes what the vault says about it, and only that. A stale
  // version is refused and told the current one.
  const stale = await ask(haein, 'putPost', { body: { post: { ...trap, visibility: 'private' }, replaces: 'vstale' } });
  assert.deepEqual([stale.status, (await stale.json()).current], [409, put.version]);
  assert.equal((await ask(haein, 'putPost', { body: { post: { ...trap, visibility: 'private' }, replaces: put.version } })).status, 200);
  const after = await (await ask(haein, 'getTree')).json();
  assert.deepEqual([after.public, after.private], [0, 2]);

  // What changed since the first list, then a removal.
  const since = await (await ask(haein, 'listPosts', { query: { since: listed.cursor } })).json();
  assert.deepEqual(since.posts.map(each => each.id), [trap.id]);
  const version = (await (await ask(haein, 'getPost', { query: { id: loose.id } })).json()).version;
  assert.deepEqual(await (await ask(haein, 'deletePost', { body: { id: loose.id, replaces: version } })).json(), { id: loose.id, removed: true });
  assert.equal((await (await ask(haein, 'getTree')).json()).posts, 2);
  assert.equal((await ask(haein, 'getPost', { query: { id: loose.id } })).status, 404);
  // A post that cannot be published yet is kept, and says why.
  const empty = post('date-problem', { date: 'not a date' });
  await ask(haein, 'putPost', { body: { post: empty } });
  const shown = (await (await ask(haein, 'getTree')).json()).labels.flatMap(folder => folder.posts).find(each => each.id === empty.id);
  assert.match(shown.problems.join(' '), /must be a valid date/);
});

test('a post goes out to a folder and comes back the same post, through the service', async () => {
  const { haein, ask } = await running();
  const original = post('seoul', { label: '글', title: '서울: "첫" 번째 #글', date: '2026-03-01', visibility: 'friends', body: '서울에 대하여, with [[A Link]].', properties: { tags: ['a, b', '42'], pinned: true } });
  const saved = await (await ask(haein, 'putPost', { body: { post: original } })).json();
  // A connector reads the post, writes it as a file, and later reads the file back as a post.
  const held = (await (await ask(haein, 'getPost', { query: { id: original.id } })).json()).post;
  const file = postFile(held);
  assert.equal(file.path, '글/seoul.md');
  const back = filePost(file.path, file.text);
  assert.deepEqual(back.post, original);
  // Sent back unchanged, it is the same version: nothing to sync.
  assert.deepEqual(await (await ask(haein, 'putPost', { body: { post: back.post, replaces: saved.version } })).json(), { id: original.id, version: saved.version, unchanged: true });
  // Renamed and moved in the folder, it is still that post, because the file carries its ID.
  const moved = filePost('Essays/Seoul, Again.md', file.text).post;
  assert.equal((await ask(haein, 'putPost', { body: { post: moved, replaces: saved.version } })).status, 200);
  const now = (await (await ask(haein, 'listPosts')).json()).posts;
  assert.deepEqual(now.map(each => [each.id, each.slug, each.label]), [[original.id, 'seoul-again', 'Essays']]);
});

test('nobody reads, lists, changes or removes another member\'s posts', async () => {
  const { haein, jun, stranger, ask } = await running();
  const secret = post('secret', { label: 'Journal', title: 'Not for anyone', body: 'A private thought.' });
  const put = await (await ask(haein, 'putPost', { body: { post: secret } })).json();

  // Another member, with their own valid token, and the post's ID in hand.
  assert.deepEqual((await (await ask(jun, 'listPosts')).json()).posts, []);
  assert.equal((await ask(jun, 'getPost', { query: { id: secret.id } })).status, 404);
  assert.equal((await (await ask(jun, 'getTree')).json()).posts, 0);
  // Removing "it" removes nothing of Haein's, and writing a post with that ID makes a post of Jun's own.
  await ask(jun, 'deletePost', { body: { id: secret.id, replaces: put.version } });
  await ask(jun, 'putPost', { body: { post: { ...secret, body: 'Jun\'s own.' } } });
  assert.deepEqual((await (await ask(haein, 'getPost', { query: { id: secret.id } })).json()).post, secret);

  // No token, a token for another request, one for another service, one from someone not let in,
  // and one that claims to be Haein but is signed by someone else.
  for (const [token, status, error] of [
    [null, 401, 'AuthRequired'],
    [await haein.token('com.ohmmmm.vault.listPosts'), 401, 'AuthRequired'],
    [await haein.token('com.ohmmmm.vault.getPost', { aud: 'did:web:another.test' }), 401, 'AuthRequired'],
    [await stranger.token('com.ohmmmm.vault.getPost'), 403, 'NotAMember'],
    [await jun.token('com.ohmmmm.vault.getPost', { iss: haein.did }), 401, 'AuthRequired'],
  ]) {
    const response = await ask(haein, 'getPost', { query: { id: secret.id }, token });
    const answer = await response.text();
    assert.deepEqual([response.status, JSON.parse(answer).error], [status, error]);
    assert.equal(answer.includes('private thought'), false);
  }
  // There is no request that names whose vault to look in: the token is the only say in that.
  const sneaky = await ask(jun, 'getPost', { query: { id: secret.id, did: haein.did, repo: haein.did } });
  assert.equal((await sneaky.json()).post.body, 'Jun\'s own.');
  const planted = await ask(jun, 'putPost', { body: { post: { ...post('planted'), did: haein.did }, did: haein.did } });
  assert.equal(planted.status, 200);
  assert.equal((await (await ask(haein, 'listPosts')).json()).posts.length, 1);
  assert.equal((await ask(haein, 'getTree', { verb: 'POST', body: {} })).status, 405);
  assert.equal((await ask(haein, 'exportEverything')).status, 404);
  assert.equal((await ask(haein, 'getPost')).status, 400);
  assert.equal((await ask(haein, 'putPost', { body: 'not json' })).status, 400);
});

test('a member brings in what they have published and writes their vault out, and only their own', async () => {
  const { haein, jun, ask, repositories } = await running();
  const record = (slug, extra = {}) => ({ $type: 'com.ohmmmm.post', body: 'Words.', publishedAt: '2026-01-01T00:00:00.000Z',
    canonicalUrl: `https://haein.test/posts/writings/${slug}`, title: slug, form: 'writing', label: 'Writings', ...extra });
  repositories.set('https://pds.haein.test|com.ohmmmm.post', [['trap', record('trap', { canonicalUrl: 'https://haein.test/writing/trap.html' })], ['hello', record('hello')]]);
  repositories.set('https://pds.haein.test|com.example.post', [['older', { $type: 'com.example.post', body: 'Older.', publishedAt: '2024-01-01T00:00:00.000Z', canonicalUrl: 'https://haein.test/posts/older', tags: ['Notes'] }]]);
  repositories.set('https://pds.jun.test|com.ohmmmm.post', [['juns', record('juns')]]);

  // Looking first changes nothing.
  const looked = await (await ask(haein, 'importPublished', { body: { site: 'https://haein.test', from: 'com.example.post' } })).json();
  assert.deepEqual([looked.records, looked.posts, looked.sameAsPublished, looked.applied, looked.differs, looked.skipped], [3, 3, 3, false, [], []]);
  assert.equal((await (await ask(haein, 'getTree')).json()).posts, 0);

  const done = await (await ask(haein, 'importPublished', { body: { site: 'https://haein.test', from: 'com.example.post', apply: true } })).json();
  assert.deepEqual([done.saved.sort(), done.unchanged, done.refused], [['hello', 'older', 'trap'], [], []]);
  const tree = await (await ask(haein, 'getTree')).json();
  assert.deepEqual([tree.posts, tree.public, tree.labels.map(folder => folder.label)], [3, 3, ['Notes', 'Writings']]);
  // A second time, every post is already there.
  const again = await (await ask(haein, 'importPublished', { body: { site: 'https://haein.test', from: 'com.example.post', apply: true } })).json();
  assert.deepEqual([again.saved, again.unchanged.sort()], [[], ['hello', 'older', 'trap']]);

  // The vault written out: each post as a file, where it sits, reading back as that post.
  const { files } = await (await ask(haein, 'exportFiles')).json();
  assert.deepEqual(files.map(file => file.path), ['Notes/older.md', 'Writings/hello.md', 'Writings/trap.md']);
  const trap = filePost('Writings/trap.md', files[2].text);
  assert.deepEqual([trap.problems, trap.post.address, trap.post.visibility], [[], 'https://haein.test/writing/trap.html', 'public']);
  // Jun's vault holds only what Jun published; nothing of Haein's is read or written for anyone else.
  await ask(jun, 'importPublished', { body: { site: 'https://jun.test', apply: true } });
  assert.deepEqual((await (await ask(jun, 'exportFiles')).json()).files.map(file => file.path), ['Writings/juns.md']);
  assert.equal((await (await ask(haein, 'exportFiles')).json()).files.length, 3);

  for (const [body, words] of [[{ site: 'not an address' }, /where your website is/], [{ site: 'http://haein.test' }, /where your website is/],
    [{ site: 'https://haein.test', from: 'not a type' }, /older post type is written like/]]) {
    const refused = await ask(haein, 'importPublished', { body });
    assert.deepEqual([refused.status, words.test((await refused.json()).message)], [400, true]);
  }
  assert.equal((await ask(haein, 'importPublished', { body: { site: 'https://haein.test' }, token: null })).status, 401);
  assert.equal((await ask(haein, 'exportFiles', { token: null })).status, 401);
});
