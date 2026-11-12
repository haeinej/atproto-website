import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../feed/pds.mjs';
import { assembleRecord, blobCid, recordProblems, recordVersion } from '../vault/core.mjs';
import { FRIENDS_POST, memoryKv, OWN_BLOB, ownStores, pdsStore, PRIVATE_POST } from '../vault/stores.mjs';
import { createVault, vaultTree } from '../vault/vault.mjs';

const did = 'did:web:pds.example.test';
const site = 'https://example.test';
const picture = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

// A PDS small enough to hold in a test: records by key, files by address, and the two checks a real
// one makes, that a created key is free and that a replaced record is still the one that was read.
function fakePds() {
  const records = new Map();
  const blobs = new Map();
  const calls = [];
  let serial = 0;
  const error = (status, name) => Response.json({ error: name, message: name }, { status });
  const get = async (url, options = {}) => {
    const method = url.pathname.split('/').at(-1);
    calls.push(method);
    const signedIn = options.headers?.Authorization === 'Bearer token-1';
    const query = Object.fromEntries(url.searchParams);
    if (method === 'com.atproto.repo.getRecord') {
      const held = records.get(query.rkey);
      return held ? Response.json({ uri: `at://${did}/${POST}/${query.rkey}`, cid: held.cid, value: held.value }) : error(400, 'RecordNotFound');
    }
    if (method === 'com.atproto.repo.listRecords') {
      return Response.json({ records: [...records].map(([key, held]) => ({ uri: `at://${did}/${POST}/${key}`, cid: held.cid, value: held.value })) });
    }
    if (method === 'com.atproto.sync.getBlob') {
      return blobs.has(query.cid) ? new Response(blobs.get(query.cid)) : error(404, 'BlobNotFound');
    }
    if (!signedIn) return error(401, 'AuthRequired');
    if (method === 'com.atproto.repo.uploadBlob') {
      const bytes = new Uint8Array(options.body);
      const cid = await blobCid(bytes);
      blobs.set(cid, bytes);
      return Response.json({ blob: { $type: 'blob', ref: { $link: cid }, mimeType: options.headers['Content-Type'], size: bytes.length } });
    }
    const body = JSON.parse(options.body);
    const held = records.get(body.rkey);
    if (method === 'com.atproto.repo.createRecord') {
      if (held) return error(400, 'RecordAlreadyExists');
    } else if (body.swapRecord && body.swapRecord !== held?.cid) {
      return error(400, 'InvalidSwap');
    }
    if (method === 'com.atproto.repo.deleteRecord') {
      records.delete(body.rkey);
      return Response.json({});
    }
    const cid = `cid-${++serial}`;
    records.set(body.rkey, { cid, value: body.record });
    return Response.json({ uri: `at://${did}/${POST}/${body.rkey}`, cid });
  };
  return { records, blobs, calls, get };
}

function vaultOf() {
  const pds = fakePds();
  const kv = memoryKv();
  const vault = createVault({
    stores: { public: pdsStore({ did, origin: 'https://pds.example.test', collection: POST, token: 'token-1', get: pds.get }), ...ownStores(kv) },
    now: () => new Date('2026-11-12T10:00:00.000Z'),
  });
  return { vault, pds, kv };
}

const note = (slug, extra = {}) => assembleRecord({
  slug, body: 'A walk after the rain.\n\n![The street](media:street)', title: 'After the rain', label: 'Field notes',
  publishedAt: '2026-01-01', kinds: ['image'], ...extra,
}, { did, site }).record;
const files = () => new Map([['street', { bytes: picture, mime: 'image/png', width: 4, height: 3 }]]);

test('a note moves between private, friends and public without changing', async () => {
  const { vault, pds, kv } = vaultOf();
  const saved = await vault.save({ key: 'after-the-rain', record: note('after-the-rain'), files: files() });
  assert.equal(saved.visibility, 'private');
  assert.equal(saved.record.canonicalUrl, 'https://example.test/posts/field-notes/after-the-rain');
  const cid = await blobCid(picture);
  assert.deepEqual(saved.record.media, [{
    $type: `${POST}#image`, id: 'street', file: { $type: 'blob', mimeType: 'image/png', size: 7, ref: { $link: cid } }, width: 4, height: 3,
  }]);
  assert.deepEqual([...kv.held.keys()].sort(), [OWN_BLOB + cid, PRIVATE_POST + 'after-the-rain']);
  assert.equal(pds.records.size, 0);

  const path = ['friends', 'public', 'private'];
  let held = saved;
  for (const to of path) {
    held = await vault.setVisibility('after-the-rain', to, { version: held.version });
    assert.equal(held.visibility, to);
    // The note is the same note: every field, its address, and the address of its file.
    assert.deepEqual(held.record, saved.record);
    const found = await vault.find('after-the-rain');
    assert.deepEqual([found.visibility, found.record, found.version], [to, saved.record, held.version]);
  }
  // It is in exactly one place at each step, and at the end nothing is left on the PDS.
  assert.equal(pds.records.size, 0);
  assert.equal(kv.held.has(FRIENDS_POST + 'after-the-rain'), false);
  assert.equal(kv.held.has(PRIVATE_POST + 'after-the-rain'), true);
  // While it was public, its file was on the PDS under the same address.
  assert.deepEqual([...pds.blobs.keys()], [cid]);
});

test('a key is used once across every visibility, and a save says which version it replaces', async () => {
  const { vault } = vaultOf();
  const first = await vault.save({ key: 'hello', record: note('hello'), files: files(), visibility: 'friends' });
  await assert.rejects(vault.save({ key: 'hello', record: note('hello'), files: files(), visibility: 'private' }),
    /A friends note already uses "hello"\. Change its visibility/);
  await assert.rejects(vault.save({ key: 'hello', record: first.record, visibility: 'friends' }), /Read it first/);

  // Two edits start from the same version. The first lands; the second is refused, not merged over it.
  const mine = await vault.save({ key: 'hello', record: { ...first.record, title: 'Mine' }, visibility: 'friends', version: first.version });
  await assert.rejects(vault.save({ key: 'hello', record: { ...first.record, title: 'Theirs' }, visibility: 'friends', version: first.version }),
    /has changed since it was read/);
  assert.equal((await vault.find('hello')).record.title, 'Mine');
  // An edit is dated, and the date it was first published stays.
  assert.deepEqual([mine.record.updatedAt, mine.record.publishedAt], ['2026-11-12T10:00:00.000Z', first.record.publishedAt]);
  assert.equal(first.record.updatedAt, undefined);

  await assert.rejects(vault.setVisibility('hello', 'public', { version: first.version }), /has changed since it was read/);
  await assert.rejects(vault.setVisibility('missing', 'public'), /No note uses "missing"/);
  await assert.rejects(vault.setVisibility('hello', 'everyone'), /Visibility is one of: public, friends, private/);
  await assert.rejects(vault.save({ key: 'gone', record: note('gone'), files: files(), version: 'v1' }), /no longer there/);
});

test('the PDS itself refuses a stale save of a public note', async () => {
  const { vault, pds } = vaultOf();
  const open = await vault.save({ key: 'open', record: note('open'), files: files(), visibility: 'public' });
  assert.equal(pds.records.get('open').value.title, 'After the rain');
  // Someone else changes the record between the vault's own check and its write.
  const store = pdsStore({ did, origin: 'https://pds.example.test', collection: POST, token: 'token-1', get: pds.get });
  await store.put('open', { ...open.record, title: 'Changed elsewhere' }, { version: open.version });
  await assert.rejects(store.put('open', { ...open.record, title: 'Stale' }, { version: open.version }), /Saving "open" failed \(HTTP 400: InvalidSwap\)/);
  await assert.rejects(store.put('open', open.record, {}), /RecordAlreadyExists/);
  // Reading needs no sign-in; writing does.
  const reader = pdsStore({ did, origin: 'https://pds.example.test', collection: POST, get: pds.get });
  assert.equal((await reader.get('open')).record.title, 'Changed elsewhere');
  await assert.rejects(reader.remove('open'), /needs the account signed in/);
});

test('a note that does not fit the schema is refused before anything is written', async () => {
  const { vault, pds, kv } = vaultOf();
  const good = note('fits');
  for (const [change, problem] of [
    [{ $type: 'com.example.post' }, /A note's type is com\.ohmmmm\.post/],
    [{ visibility: 'private' }, /Visibility is where a note is stored/],
    [{ body: '   ' }, /nonempty Markdown body/],
    [{ title: 'x'.repeat(301) }, /title can be at most 300 characters/],
    [{ sublabel: 'Walks', label: undefined }, /A sublabel sits inside a label/],
    [{ canonicalUrl: 'ftp://example.test/a' }, /canonicalUrl must be an HTTP\(S\) URL/],
    [{ connect: ['not a link'] }, /connect holds at most 32/],
    [{ form: 'quote' }, /A quote has no title/],
  ]) {
    await assert.rejects(vault.save({ key: 'fits', record: { ...good, ...change }, files: files(), visibility: 'public' }), problem);
  }
  // An attachment the body never places, and a place in the body with no attachment.
  await assert.rejects(vault.save({ key: 'fits', record: { ...good, body: 'No picture here.' }, files: files() }), /"street" is not placed anywhere/);
  await assert.rejects(vault.save({ key: 'fits', record: good }), /places an attachment "street" the note does not hold/);
  assert.equal(pds.records.size, 0);
  assert.deepEqual([[...kv.held.keys()], [...pds.blobs.keys()]], [[], []]);
  // A form this software does not know is kept as it is.
  assert.deepEqual(recordProblems({ ...note('later', { body: 'Words.', kinds: [] }), form: 'hologram' }, 'later'), []);
});

test('the same content has the same version, whatever order its fields are in', async () => {
  const record = note('same', { body: 'Words.', kinds: [] });
  const shuffled = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(await recordVersion(record), await recordVersion(shuffled));
  assert.notEqual(await recordVersion(record), await recordVersion({ ...record, title: 'Another' }));
});

test('the tree shows labels, the sublabels inside them, and each note with its visibility', async () => {
  const { vault } = vaultOf();
  const words = (slug, extra) => note(slug, { body: 'Words.', kinds: [], ...extra });
  await vault.save({ key: 'trap', record: words('trap', { label: 'Writings', sublabel: 'Collisions', title: 'Trap', publishedAt: '2026-03-01' }), visibility: 'public' });
  await vault.save({ key: 'draft', record: words('draft', { label: 'Writings', title: 'Draft', publishedAt: '2026-04-01' }) });
  await vault.save({ key: 'loose', record: words('loose', { label: undefined, title: undefined }), visibility: 'friends' });
  assert.deepEqual(vaultTree(await vault.list()), [
    { label: 'other', notes: [{ key: 'loose', visibility: 'friends', path: '/posts/other/loose', form: 'note', publishedAt: '2026-01-01T00:00:00.000Z' }], sublabels: [] },
    { label: 'Writings',
      notes: [{ key: 'draft', visibility: 'private', path: '/posts/writings/draft', title: 'Draft', form: 'writing', publishedAt: '2026-04-01T00:00:00.000Z' }],
      sublabels: [{ sublabel: 'Collisions', notes: [
        { key: 'trap', visibility: 'public', path: '/posts/writings/collisions/trap', title: 'Trap', form: 'writing', publishedAt: '2026-03-01T00:00:00.000Z' },
      ] }] },
  ]);
  const removed = await vault.remove('draft');
  assert.equal(removed.visibility, 'private');
  assert.equal(await vault.find('draft'), null);
});

test('the publish command writes through the vault, and a friends-only post previews like a private one', async () => {
  const { execFile } = await import('node:child_process');
  const { createServer } = await import('node:http');
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { promisify } = await import('node:util');
  // A PDS on this machine, answering only what publishing asks of it.
  const asked = [];
  const records = new Map();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const method = url.pathname.split('/').at(-1);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const sent = Buffer.concat(chunks);
    asked.push(`${method}${request.headers.authorization ? ' (signed in)' : ''}`);
    const answer = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
    if (method === 'com.atproto.server.createSession') return answer(200, { did: JSON.parse(sent).identifier, accessJwt: 'token-1' });
    if (method === 'com.atproto.repo.getRecord') {
      const held = records.get(url.searchParams.get('rkey'));
      return held ? answer(200, { cid: 'cid-1', value: held }) : answer(400, { error: 'RecordNotFound' });
    }
    if (method === 'com.atproto.repo.uploadBlob') {
      return answer(200, { blob: { $type: 'blob', ref: { $link: await blobCid(new Uint8Array(sent)) }, mimeType: request.headers['content-type'], size: sent.length } });
    }
    if (method === 'com.atproto.repo.createRecord') {
      const body = JSON.parse(sent);
      records.set(body.rkey, body.record);
      return answer(200, { uri: `at://${body.repo}/${body.collection}/${body.rkey}`, cid: 'cid-1' });
    }
    answer(404, { error: 'MethodNotImplemented' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const folder = await mkdtemp(join(tmpdir(), 'vault-publish-'));
  try {
    await writeFile(join(folder, 'site.jsonc'), JSON.stringify({ vars: {
      ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: `http://127.0.0.1:${server.address().port}`, SITE_ORIGIN: site,
    } }));
    await writeFile(join(folder, 'post.md'), 'A walk after the rain.\n\n![The street](media:street)');
    // The smallest PNG there is: one transparent pixel.
    await writeFile(join(folder, 'street.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    const publish = (...options) => promisify(execFile)(process.execPath, [
      new URL('../scripts/publish.mjs', import.meta.url).pathname, '--config', join(folder, 'site.jsonc'),
      '--file', join(folder, 'post.md'), '--slug', 'after-the-rain', '--label', 'Field notes', '--date', '2026-01-01',
      '--media', `street=${join(folder, 'street.png')}`, ...options,
    ], { env: { ...process.env, ATPROTO_APP_PASSWORD: 'app-password' } }).then(({ stdout }) => stdout.trim(), error => error.stderr.trim());

    const friends = JSON.parse(await publish('--friends'));
    const open = JSON.parse(await publish());
    assert.deepEqual([friends.visibility, friends.privateUrl], ['friends', 'https://example.test/notes/private/posts/after-the-rain']);
    assert.deepEqual(friends.record, open.record);
    assert.match(await publish('--friends', '--private'), /--private or for --friends, not both/);
    assert.deepEqual(asked, []);

    assert.equal(await publish('--publish'), 'https://example.test/posts/field-notes/after-the-rain');
    const written = records.get('after-the-rain');
    assert.deepEqual({ ...written, media: undefined }, { ...open.record, media: undefined });
    assert.deepEqual(written.media.map(({ $type, id, file, width, height }) => [$type, id, file.mimeType, file.ref.$link.length > 20, width, height]),
      [[`${POST}#image`, 'street', 'image/png', true, 1, 1]]);
    // It looked for the slug first, signed in once, sent the file, then the record.
    assert.deepEqual(asked, ['com.atproto.repo.getRecord', 'com.atproto.server.createSession',
      'com.atproto.repo.uploadBlob (signed in)', 'com.atproto.repo.createRecord (signed in)']);
    assert.match(await publish('--publish'), /A public note already uses "after-the-rain"/);
  } finally {
    await rm(folder, { recursive: true, force: true });
    await new Promise(resolve => server.close(resolve));
  }
});

test('a friends-only note is listed and served to its owner beside the private ones', async () => {
  const { servePrivate } = await import('../feed/private.mjs');
  const kv = memoryKv();
  const vault = createVault({ stores: { public: ownStores(memoryKv()).private, ...ownStores(kv) } });
  const words = slug => note(slug, { body: 'Words.', kinds: [], title: slug });
  await vault.save({ key: 'for-friends', record: words('for-friends'), visibility: 'friends' });
  await vault.save({ key: 'for-me', record: words('for-me') });
  // A request Cloudflare Access has signed, checked against a key made for this test.
  const team = 'example.cloudflareaccess.com';
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signed = `${encode({ alg: 'RS256', kid: 'key-1' })}.${encode({ iss: `https://${team}`, aud: ['audience-1'], exp: Date.now() / 1000 + 60 })}`;
  const jwt = `${signed}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(signed))).toString('base64url')}`;
  const certs = async () => Response.json({ keys: [{ ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'key-1' }] });
  const env = { ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: 'https://pds.example.test', ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: 'audience-1', NOTES: kv };
  const ask = (path, token) => servePrivate(new Request(`https://example.test${path}`, {
    headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
  }), env, path, certs);

  const graph = await (await ask('/notes/private/graph.json', jwt)).json();
  assert.deepEqual(Object.values(graph).map(post => [post.name, post.visibility]).sort(), [['for-friends', 'friends'], ['for-me', 'private']]);
  const page = await ask('/notes/private/posts/for-friends', jwt);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<meta name="robots" content="noindex">[\s\S]*<span>friends<\/span>/);
  // Nobody else gets either, friends included, until there is a network for them to read through.
  assert.equal((await ask('/notes/private/posts/for-friends')).status, 404);
  assert.equal((await ask('/notes/private/graph.json')).status, 404);
});
