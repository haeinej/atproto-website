import assert from 'node:assert/strict';
import test from 'node:test';
import { secp256k1 } from '../service/node_modules/@noble/curves/secp256k1.js';
import { createIdentity, documentAddress } from '../service/src/identity.mjs';
import { postStore } from '../service/src/store.mjs';
import { createService } from '../service/src/worker.mjs';
import { CAPABILITIES, REQUESTS } from '../service/src/capabilities/index.mjs';
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
  const env = { DB: await testDatabase(), MEMBERS: '*', OHM_APP_ORIGIN: 'https://app.ohmmmm.test', SERVICE_DID: audience };
  // Who is signed in to ohm, by the session cookie their browser sends.
  const sessions = new Map();
  // What each member has published, as their own PDS would list it.
  const repositories = new Map();
  const get = async (url, options) => {
    // The service runs on Cloudflare, whose fetch refuses any other way of handling a redirect.
    assert.ok(['follow', 'manual'].includes(options.redirect), `redirect: ${options.redirect}`);
    // ohm's own sign-in service, asked whose session a cookie is.
    if (String(url) === 'https://app.ohmmmm.test/api/auth/get-session') {
      const user = sessions.get(options.headers.Cookie);
      return Response.json(user ? { session: { id: 's' }, user } : null);
    }
    if (documents[String(url)]) return Response.json(documents[String(url)]);
    // A file a member's PDS holds, asked about without being fetched; and a picture on another website.
    if (url.pathname === '/xrpc/com.atproto.sync.getBlob') return new Response(null, { headers: { 'Content-Type': 'image/png', 'Content-Length': '7' } });
    if (url.origin === 'https://photos.haein.test') return url.pathname.endsWith('.jpg') ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } }) : new Response('gone', { status: 404 });
    // A member's own PDS, saying which types of record their repository holds.
    if (url.pathname === '/xrpc/com.atproto.repo.describeRepo') {
      return Response.json({ did: url.searchParams.get('repo'), collections: [...repositories.keys()].filter(key => key.startsWith(`${url.origin}|`)).map(key => key.slice(url.origin.length + 1)) });
    }
    const records = (repositories.get(`${url.origin}|${url.searchParams.get('collection')}`) ?? []).slice(0, Number(url.searchParams.get('limit')) || 100);
    return Response.json({ records: records.map(([key, value]) => ({ uri: `at://${url.searchParams.get('repo')}/${url.searchParams.get('collection')}/${key}`, value })) });
  };
  const service = createService({ whoIs, get });
  // One request, signed by `as` for exactly that request unless told otherwise.
  const ask = async (as, name, { query = {}, body, token, verb, cookie, origin, expected, under = '' } = {}) => {
    const url = new URL(`https://vault.ohmmmm.test${under}/xrpc/${name.includes('.') ? name : `com.ohmmmm.vault.${name}`}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    // A request rides on a cookie, as the page's do, or carries a token from the member's PDS.
    const bearer = token === null || cookie ? null : token ?? await as.token(`com.ohmmmm.vault.${name}`);
    const posted = ['putPost', 'deletePost', 'importPublished', 'com.ohmmmm.account.connect', 'com.ohmmmm.account.disconnect'].includes(name);
    return service(new Request(url, {
      method: verb ?? (posted ? 'POST' : 'GET'),
      headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}), ...(expected === undefined ? {} : { 'X-Ohm-Did': expected }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }), env);
  };
  return { haein, jun, stranger, ask, env, repositories, sessions };
}

test('a stale linked-session tab cannot read or write another member or disconnect their account', async () => {
  const { haein, jun, ask, sessions } = await running();
  const origin = 'https://app.ohmmmm.test';
  let cookie;
  for (const [member, id] of [[haein, 'haein'], [jun, 'jun']]) {
    cookie = `ohm.session_token=account-scope-${id}`;
    sessions.set(cookie, { id, name: id });
    assert.equal((await ask(member, 'com.ohmmmm.account.connect', {
      cookie, origin, body: { token: await member.token('com.ohmmmm.account.connect') },
    })).status, 200);
  }
  // The shared browser cookie is now Jun's; the stale editor still displays Haein.
  const stale = { cookie, origin, expected: haein.did };
  const cases = [
    ['getTree', {}],
    ['putPost', { body: { post: post('stale-draft') } }],
    ['com.ohmmmm.cortex.listMemories', {}],
    ['com.ohmmmm.cortex.putMemory', { verb: 'POST', body: { name: 'stale-draft', body: 'Haein private draft' } }],
    ['com.ohmmmm.cortex.approveSkill', { verb: 'POST', body: { name: 'stale-skill', version: 'old-version' } }],
    ['com.ohmmmm.account.get', {}],
    ['com.ohmmmm.account.disconnect', {}],
  ];
  for (const [name, options] of cases) {
    const response = await ask(jun, name, { ...stale, ...options });
    assert.equal(response.status, 409, name);
    assert.equal((await response.json()).error, 'AccountChanged', name);
  }
  const current = { cookie, expected: jun.did };
  assert.equal((await (await ask(jun, 'com.ohmmmm.account.get', current)).json()).did, jun.did);
  assert.equal((await (await ask(jun, 'getTree', current)).json()).posts, 0);
  assert.equal((await ask(jun, 'com.ohmmmm.cortex.getMemory', { ...current, query: { name: 'stale-draft' } })).status, 404);
  const signedOut = await ask(jun, 'getTree', { expected: jun.did, token: null });
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error, 'SignInRequired');
});

test('the displayed-member precondition also binds PDS tokens and never replaces authentication', async () => {
  const { haein, jun, stranger, ask } = await running();
  assert.equal((await ask(haein, 'getTree', { expected: haein.did })).status, 200);
  assert.equal((await ask(jun, 'getTree')).status, 200); // Existing clients need no header.
  const response = await ask(jun, 'putPost', { expected: haein.did, body: { post: post('wrong-member') } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'AccountChanged');
  assert.equal((await (await ask(jun, 'getTree')).json()).posts, 0);
  assert.equal((await ask(haein, 'getTree', { expected: haein.did, token: null })).status, 401);
  assert.equal((await ask(stranger, 'getTree', { expected: haein.did })).status, 403);
});

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

test('a post that first appeared somewhere else says where, and the tree carries the platform\'s name', async () => {
  const { haein, ask } = await running();
  const skeet = post('a-skeet', { label: 'Notes', body: 'Short.', source: { platform: 'bluesky', uri: 'https://bsky.app/profile/haein.test/post/3k' } });
  const own = post('written-here', { label: 'Notes', body: 'Longer.' });
  for (const each of [skeet, own]) assert.equal((await ask(haein, 'putPost', { body: { post: each } })).status, 200);
  const rows = (await (await ask(haein, 'getTree')).json()).labels.find(folder => folder.label === 'Notes').posts;
  assert.deepEqual(rows.map(row => [row.slug, row.platform]).sort(), [['a-skeet', 'bluesky'], ['written-here', undefined]]);
});

test('posts are found by the words in them, a member\'s own and nobody else\'s', async () => {
  const { haein, jun, ask } = await running();
  const rain = post('after-the-rain', { title: 'After the rain', label: 'Field notes', body: 'The street went quiet.', date: '2026-01-01' });
  const loose = post('loose-thought', { label: 'Notes', body: 'Rain makes a city honest, and the street too.', visibility: 'friends', date: '2026-02-01' });
  delete loose.title;
  for (const each of [rain, loose]) assert.equal((await ask(haein, 'putPost', { body: { post: each } })).status, 200);
  assert.equal((await ask(jun, 'putPost', { body: { post: post('juns-rain', { body: 'Rain in another vault.' }) } })).status, 200);

  const search = async query => (await ask(haein, 'searchPosts', { query })).json();
  // Every word has to be there; a title counts for more than the body.
  const both = await search({ q: 'RAIN street' });
  assert.deepEqual([both.found, both.posts.map(each => [each.slug, each.visibility])], [2, [['after-the-rain', 'private'], ['loose-thought', 'friends']]]);
  assert.match(both.posts[1].passage, /Rain makes a city honest/);
  assert.deepEqual((await search({ q: 'honest' })).posts.map(each => each.slug), ['loose-thought']);
  assert.equal((await search({ q: 'rain', visibility: 'public' })).found, 0);
  assert.equal((await search({ q: 'rain', limit: '1' })).posts.length, 1);
  assert.equal((await search({ q: 'another' })).found, 0);
  for (const query of [{}, { q: '  ' }, { q: 'rain', visibility: 'everyone' }, { q: 'rain', limit: '0' }, { q: 'rain', limit: '51' }]) {
    assert.equal((await ask(haein, 'searchPosts', { query })).status, 400, JSON.stringify(query));
  }
  assert.equal((await ask(haein, 'searchPosts', { query: { q: 'rain' }, token: null })).status, 401);
});

test('what publishing would change is worked out for a member\'s own vault, with the files a record needs', async () => {
  const { haein, jun, ask, repositories } = await running();
  const at = 'https://pds.haein.test';
  const held = cid => `${at}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(haein.did)}&cid=${cid}`;
  const pictures = post('pictures', {
    label: 'Photographs', visibility: 'public', title: 'Pictures', date: '2026-01-01T00:00:00.000Z',
    body: `![Kept](${held('bafkept')}#kept.png)\n\n![New to the record](${held('bafnew')}#fresh.png)\n\n![From elsewhere](https://photos.haein.test/hill.jpg)`,
  });
  const quiet = post('quiet', { body: 'Only mine.' });
  for (const each of [pictures, quiet]) assert.equal((await ask(haein, 'putPost', { body: { post: each } })).status, 200);
  // What is published of it now: an older version, whose one picture the PDS says more about.
  repositories.set(`${at}|com.ohmmmm.post`, [[pictures.id, {
    $type: 'com.ohmmmm.post', slug: 'pictures', title: 'Pictures', label: 'Photographs', form: 'gallery', publishedAt: '2026-01-01T00:00:00.000Z',
    canonicalUrl: 'https://pds.haein.test/posts/photographs/pictures', body: '![Kept](media:kept)',
    media: [{ $type: 'com.ohmmmm.post#image', id: 'kept', file: { $type: 'blob', ref: { $link: 'bafkept' }, mimeType: 'image/png', size: 900 }, width: 1200, height: 800 }],
  }]]);

  const looked = await (await ask(haein, 'getPublishPlan')).json();
  assert.deepEqual([looked.repository, looked.pds, looked.collection, looked.changes, looked.replace.map(each => each.slug), looked.writes, looked.plan],
    [haein.did, at, 'com.ohmmmm.post', 1, ['pictures'], undefined, undefined]);

  const ready = await (await ask(haein, 'getPublishPlan', { query: { prepare: '1' } })).json();
  assert.equal(ready.writes.length, 1);
  const [write] = ready.writes;
  assert.deepEqual([write.action, write.rkey, write.before, write.attachments], ['update', pictures.id, undefined, undefined]);
  // A file published already keeps what the record said of it. One the PDS holds but the record
  // did not name is described by the PDS. One from another website is left for the member to send.
  assert.deepEqual(write.record.media, [
    { $type: 'com.ohmmmm.post#image', id: 'kept', file: { $type: 'blob', ref: { $link: 'bafkept' }, mimeType: 'image/png', size: 900 }, width: 1200, height: 800, alt: 'Kept' },
    { $type: 'com.ohmmmm.post#image', id: 'fresh', file: { $type: 'blob', ref: { $link: 'bafnew' }, mimeType: 'image/png', size: 7 }, alt: 'New to the record' },
  ]);
  assert.deepEqual(write.upload, [{ id: 'hill', address: 'https://photos.haein.test/hill.jpg', alt: 'From elsewhere' }]);
  // The name stands for exactly these changes: the same again, and another once the vault changes.
  assert.equal((await (await ask(haein, 'getPublishPlan', { query: { prepare: '1' } })).json()).plan, ready.plan);
  const version = (await (await ask(haein, 'getPost', { query: { id: quiet.id } })).json()).version;
  await ask(haein, 'putPost', { body: { post: { ...quiet, visibility: 'public' }, replaces: version } });
  assert.notEqual((await (await ask(haein, 'getPublishPlan', { query: { prepare: '1' } })).json()).plan, ready.plan);

  // The file from another website is fetched for the member who places it, and for nobody else.
  const file = await ask(haein, 'getAttachment', { query: { id: pictures.id, attachment: 'hill' } });
  assert.deepEqual([file.status, file.headers.get('Content-Type'), [...new Uint8Array(await file.arrayBuffer())]], [200, 'image/jpeg', [1, 2, 3]]);
  assert.equal((await ask(haein, 'getAttachment', { query: { id: pictures.id, attachment: 'no-such' } })).status, 404);
  assert.equal((await ask(jun, 'getAttachment', { query: { id: pictures.id, attachment: 'hill' } })).status, 404);
  assert.equal((await ask(haein, 'getAttachment', { query: { id: pictures.id, attachment: 'hill' }, token: null })).status, 401);
  // Jun's plan is Jun's: nothing of Haein's vault or repository is in it.
  const juns = await (await ask(jun, 'getPublishPlan', { query: { prepare: '1' } })).json();
  assert.deepEqual([juns.repository, juns.changes, juns.writes, juns.notInVault], [jun.did, 0, [], []]);
  assert.equal((await ask(haein, 'getPublishPlan', { token: null })).status, 401);
});

test('every request belongs to one capability, and says what it is, who may ask, and whether it changes anything', () => {
  assert.deepEqual(CAPABILITIES.map(capability => capability.name), ['Posts', 'Structure', 'Search', 'Mirror', 'Publish', 'Export', 'Account', 'Identity', 'Context', 'Memory', 'Notes', 'Turns', 'Skills', 'Tools', 'Cortex Export']);
  const names = CAPABILITIES.flatMap(capability => Object.keys(capability.requests));
  assert.equal(new Set(names).size, names.length, 'a request has one home');
  assert.deepEqual(Object.keys(REQUESTS).sort(), [...names].sort());
  for (const [name, request] of Object.entries(REQUESTS)) {
    assert.match(name, /^com\.ohmmmm\.(vault|account|identity|cortex)\.[a-z][A-Za-z]+$/);
    assert.ok(['GET', 'POST'].includes(request.verb) && ['nobody', 'token', 'member', 'ohm'].includes(request.asks), name);
    assert.ok(typeof request.about === 'string' && request.about.length > 20 && typeof request.gives === 'string' && typeof request.takes === 'object', name);
    // Whatever changes something is a POST, and whatever is a GET changes nothing.
    assert.equal(request.changes, request.verb === 'POST', name);
  }
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
    [null, 401, 'SignInRequired'],
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

test('a new account is mirrored without being told anything: its own post types are found, and the first time is remembered', async () => {
  const { haein, ask, repositories, sessions } = await running();
  const record = (slug, extra = {}) => ({ $type: 'com.ohmmmm.post', body: 'Words.', publishedAt: '2026-01-01T00:00:00.000Z', title: slug, form: 'writing', label: 'Writings', ...extra });
  const at = 'https://pds.haein.test';
  repositories.set(`${at}|com.ohmmmm.post`, [['hello', record('hello')]]);
  // A type of the member's own, from before the shared one: nobody names it, and it is found.
  repositories.set(`${at}|com.haein.post`, [
    ['older', { $type: 'com.haein.post', body: 'Older.', publishedAt: '2024-01-01T00:00:00.000Z', title: 'older', tags: ['Notes'], writtenIn: 'seoul' }],
    ['hello', { $type: 'com.haein.post', body: 'An earlier hello.', publishedAt: '2023-01-01T00:00:00.000Z', title: 'hello' }],
  ]);
  // Types that are not posts in this form are never read in: Bluesky's own, and one with no body.
  repositories.set(`${at}|app.bsky.feed.post`, [['3k', { $type: 'app.bsky.feed.post', text: 'A skeet.', createdAt: '2025-01-01T00:00:00.000Z' }]]);
  repositories.set(`${at}|com.haein.bookmark`, [['one', { $type: 'com.haein.bookmark', url: 'https://example.test', publishedAt: '2025-01-01T00:00:00.000Z' }]]);

  const mine = 'ohm.session_token=haein-session';
  const ours = 'https://app.ohmmmm.test';
  sessions.set(mine, { id: 'user-haein', name: 'Haein' });
  await ask(haein, 'com.ohmmmm.account.connect', { cookie: mine, origin: ours, body: { token: await haein.token('com.ohmmmm.account.connect') } });
  const account = async () => (await ask(haein, 'com.ohmmmm.account.get', { cookie: mine })).json();
  assert.equal((await account()).mirrored, false);

  // Looking first changes nothing and marks nothing.
  const looked = await (await ask(haein, 'importPublished', { cookie: mine, origin: ours, body: {} })).json();
  assert.deepEqual([looked.types, looked.records, looked.posts, looked.applied], [['com.haein.post', 'com.ohmmmm.post'], 2, 2, false]);
  assert.equal((await account()).mirrored, false);

  const done = await (await ask(haein, 'importPublished', { cookie: mine, origin: ours, body: { apply: true } })).json();
  assert.deepEqual([done.saved.sort(), done.skipped, done.refused], [['hello', 'older'], [], []]);
  assert.equal((await account()).mirrored, true);
  // Where both types hold a post, the one in the shared type is the one kept; the older type's
  // extra field went into the member's own layer, named for that type.
  const files = Object.fromEntries((await (await ask(haein, 'exportFiles', { cookie: mine })).json()).files.map(file => [file.path, filePost(file.path, file.text).post]));
  assert.deepEqual(Object.keys(files).sort(), ['Notes/older.md', 'Writings/hello.md']);
  assert.equal(files['Writings/hello.md'].body, 'Words.');
  assert.deepEqual(files['Notes/older.md'].site, { $type: 'com.haein.postSite', writtenIn: 'seoul' });
});

test('finding an account needs no sign-in, and says who its PDS should issue tokens for', async () => {
  const { haein, ask } = await running();
  for (const under of ['', '/vault']) {
    const found = await ask(haein, 'com.ohmmmm.identity.findAccount', { query: { account: haein.did }, token: null, under });
    assert.deepEqual([found.status, await found.json()], [200, { did: haein.did, handle: null, pds: 'https://pds.haein.test', service: audience }]);
  }
});

test('a token from a PDS says who it names, for that request only and for members only', async () => {
  const { haein, jun, stranger, ask } = await running();
  const who = 'com.ohmmmm.identity.whoAmI';
  const named = await ask(haein, who, { token: await haein.token(who) });
  // The stand-in documents name no handle, so none is given.
  assert.deepEqual([named.status, await named.json()], [200, { did: haein.did, handle: null }]);
  assert.equal((await (await ask(jun, who, { token: await jun.token(who) })).json()).did, jun.did);
  // A token issued for reading the vault does not say who someone is to ohm's sign-in, nor the other way round.
  assert.equal((await ask(haein, who, { token: await haein.token('com.ohmmmm.vault.getTree') })).status, 401);
  assert.equal((await ask(haein, 'getTree', { token: await haein.token(who) })).status, 401);
  assert.equal((await ask(stranger, who, { token: await stranger.token(who) })).status, 403);
  assert.equal((await ask(haein, who, { token: null })).status, 401);
  assert.equal((await ask(haein, who, { token: await haein.token(who), verb: 'POST' })).status, 405);
});

test('an ohm account signs a member in, once their PDS has said which AT Protocol account is theirs', async () => {
  const { haein, jun, stranger, ask, sessions } = await running();
  const ours = 'https://app.ohmmmm.test';
  const mine = 'ohm.session_token=haein-1';
  sessions.set(mine, { id: 'user-haein', name: 'Haein' });
  const account = (name, more = {}) => ask(haein, `com.ohmmmm.account.${name}`, { cookie: mine, origin: ours, ...more });
  const said = async response => [response.status, (await response.json()).error];

  // Nobody is signed in without a session the sign-in service knows.
  assert.deepEqual(await said(await ask(haein, 'com.ohmmmm.account.get', { token: null })), [401, 'SignInRequired']);
  assert.deepEqual(await said(await ask(haein, 'com.ohmmmm.account.get', { cookie: 'ohm.session_token=made-up' })), [401, 'SignInRequired']);
  // Signed in to ohm, but no AT Protocol account yet: the account says so, and no vault opens.
  assert.deepEqual(await (await account('get')).json(), { user: { name: 'Haein' }, did: null, mirrored: false, service: audience });
  assert.deepEqual(await said(await ask(haein, 'getTree', { cookie: mine })), [409, 'NotConnected']);

  // Connecting takes a token the PDS issued for exactly that, and nothing less.
  const connect = token => account('connect', { body: { token } });
  assert.deepEqual(await said(await connect(await haein.token('com.ohmmmm.vault.getTree'))), [401, 'AuthRequired']);
  assert.deepEqual(await said(await connect(await stranger.token('com.ohmmmm.account.connect'))), [403, 'NotAMember']);
  assert.deepEqual(await said(await connect(await jun.token('com.ohmmmm.account.connect', { iss: haein.did }))), [401, 'AuthRequired']);
  assert.deepEqual(await said(await connect('not a token')), [401, 'AuthRequired']);
  assert.equal((await (await account('get')).json()).did, null);
  assert.deepEqual(await (await connect(await haein.token('com.ohmmmm.account.connect'))).json(), { did: haein.did });
  assert.deepEqual(await (await connect(await haein.token('com.ohmmmm.account.connect'))).json(), { did: haein.did, already: true });
  assert.deepEqual(await (await account('get')).json(), { user: { name: 'Haein' }, did: haein.did, mirrored: false, service: audience });

  // From then on the session alone opens that vault, and it is the same vault a token opens.
  const written = post('from-the-page');
  assert.equal((await ask(haein, 'putPost', { cookie: mine, origin: ours, body: { post: written } })).status, 200);
  assert.deepEqual((await (await ask(haein, 'getPost', { query: { id: written.id } })).json()).post, written);
  assert.equal((await (await ask(haein, 'getTree', { cookie: mine, under: '/vault' })).json()).posts, 1);
  // Jun, signed in to ohm and connected to Jun's own account, sees nothing of it.
  const theirs = 'ohm.session_token=jun-1';
  sessions.set(theirs, { id: 'user-jun', name: 'Jun' });
  await ask(jun, 'com.ohmmmm.account.connect', { cookie: theirs, origin: ours, body: { token: await jun.token('com.ohmmmm.account.connect') } });
  assert.equal((await (await ask(jun, 'getTree', { cookie: theirs })).json()).posts, 0);
  assert.equal((await ask(jun, 'getPost', { cookie: theirs, query: { id: written.id } })).status, 404);

  // One ohm account works in one AT Protocol account, each way.
  assert.deepEqual(await said(await ask(jun, 'com.ohmmmm.account.connect', { cookie: theirs, origin: ours, body: { token: await haein.token('com.ohmmmm.account.connect') } })), [409, 'AlreadyConnected']);
  const third = 'ohm.session_token=someone-1';
  sessions.set(third, { id: 'user-someone', name: 'Someone' });
  assert.deepEqual(await said(await ask(haein, 'com.ohmmmm.account.connect', { cookie: third, origin: ours, body: { token: await haein.token('com.ohmmmm.account.connect') } })), [409, 'ConnectedElsewhere']);

  // A cookie is sent with a request any page makes, so a change is refused unless it comes from ohm's own pages.
  for (const origin of [undefined, 'https://evil.example', 'https://vault.ohmmmm.test']) {
    assert.deepEqual(await said(await ask(haein, 'putPost', { cookie: mine, origin, body: { post: post('forged') } })), [403, 'WrongOrigin']);
    assert.deepEqual(await said(await ask(haein, 'com.ohmmmm.account.disconnect', { cookie: mine, origin })), [403, 'WrongOrigin']);
  }
  assert.equal((await (await ask(haein, 'getTree', { cookie: mine })).json()).posts, 1);

  // Disconnected, the session opens nothing again. The vault itself is untouched.
  assert.deepEqual(await (await account('disconnect')).json(), { did: null });
  assert.deepEqual(await said(await ask(haein, 'getTree', { cookie: mine })), [409, 'NotConnected']);
  assert.equal((await (await ask(haein, 'getTree')).json()).posts, 1);
});
