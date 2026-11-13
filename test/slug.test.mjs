import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../feed/pds.mjs';
import worker, { servePost } from '../feed/worker.mjs';
import { recordProblems } from '../vault/core.mjs';
import { postRecord } from '../vault/file.mjs';

const did = 'did:web:pds.example.test';
const config = { ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: 'https://pds.example.test' };

test('a post kept under its ID is found by its slug, and its address follows the slug when it changes', async () => {
  const id = '3lf2abcdefg22';
  const post = { id, slug: 'trap-of-independency', label: 'Writings', sublabel: 'Collisions', visibility: 'public', title: 'Trap', date: '2026-03-01', body: 'Words.', properties: {} };
  const { key, record } = postRecord(post, { did, site: 'https://example.test' });
  assert.deepEqual([key, record.slug, recordProblems(record, key)], [id, 'trap-of-independency', []]);

  // The PDS holds the record under its ID; a stale site snapshot is not needed to resolve it.
  const records = new Map([[id, record]]);
  const get = async url => {
    if (url.pathname.endsWith('listRecords')) return Response.json({ records: [...records].map(([key, value]) => ({ uri: `at://${did}/${POST}/${key}`, value })) });
    const held = records.get(url.searchParams.get('rkey'));
    return held ? Response.json({ uri: `at://${did}/${POST}/${url.searchParams.get('rkey')}`, value: held }) : Response.json({ error: 'RecordNotFound' }, { status: 400 });
  };
  const listed = href => ({ get: async () => ({ graph: { [`at://${did}/${POST}/${id}`]: { href }, 'at://did:web:other.test/x/y': { href: '/posts/trap-of-independency' } } }) });
  const ask = (path, notes) => servePost(new Request(`https://example.test${path}`), { ...config, NOTES: notes }, decodeURIComponent(path.split('/').at(-1)), get);
  const address = '/posts/writings/collisions/trap-of-independency';

  const page = await ask(address, listed(address));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<link rel="canonical" href="https:\/\/example\.test\/posts\/writings\/collisions\/trap-of-independency">/);
  // The short address, and the record's own key, both send a reader on to the full address.
  for (const short of ['/posts/trap-of-independency', `/posts/${id}`, `/posts/old-label/${id}`]) {
    const sent = await ask(short, listed(address));
    assert.deepEqual([sent.status, new URL(sent.headers.get('Location')).pathname], [308, address]);
  }
  // A slug nobody has, and a site whose list has not been built yet.
  assert.equal((await ask('/posts/writings/collisions/no-such-post', listed(address))).status, 404);
  assert.equal((await ask(address, { get: async () => null })).status, 200);

  // Renamed: the permanent key still redirects to the current address without a snapshot refresh.
  records.set(id, postRecord({ ...post, slug: 'the-trap' }, { did, site: 'https://example.test' }).record);
  const renamed = '/posts/writings/collisions/the-trap';
  assert.equal((await ask(renamed, listed(address))).status, 200);
  const old = await ask(`/posts/${id}`, listed(renamed));
  assert.equal(new URL(old.headers.get('Location')).pathname, renamed);
});

test('a post published before posts had IDs is kept under its slug and works as it did', async () => {
  const record = { $type: POST, body: 'Words.', publishedAt: '2026-01-01T00:00:00.000Z', canonicalUrl: 'https://example.test/posts/writings/hello', title: 'Hello', label: 'Writings' };
  const get = async url => url.pathname.endsWith('listRecords')
    ? Response.json({ records: [{ uri: `at://${did}/${POST}/hello`, value: record }] })
    : url.searchParams.get('rkey') === 'hello'
      ? Response.json({ uri: `at://${did}/${POST}/hello`, value: record }) : Response.json({ error: 'RecordNotFound' }, { status: 400 });
  const ask = path => servePost(new Request(`https://example.test${path}`), { ...config, NOTES: { get: async () => null } }, path.split('/').at(-1), get);
  assert.equal((await ask('/posts/writings/hello')).status, 200);
  assert.equal(new URL((await ask('/posts/hello')).headers.get('Location')).pathname, '/posts/writings/hello');
  // A slug that is not a slug is not trusted to build an address.
  assert.match(recordProblems({ ...record, slug: '../admin' }, 'hello').join(' '), /slug is lowercase Latin letters/);
});

test('slug routes fail closed on duplicate matches or an incomplete inventory even without a snapshot', async () => {
  const record = { $type: POST, slug: 'hello', body: 'Words.', publishedAt: '2026-01-01T00:00:00.000Z', canonicalUrl: 'https://example.test/posts/writings/hello', label: 'Writings' };
  const request = new Request('https://example.test/posts/writings/hello');
  for (const inventory of [
    { records: ['3aaaaaaaaaaaa', '3bbbbbbbbbbbb'].map(key => ({ uri: `at://${did}/${POST}/${key}`, value: record })) },
    { records: [], cursor: 'same' },
    null,
  ]) {
    let page = 0;
    const response = await servePost(request, config, 'hello', async url => url.pathname.endsWith('getRecord')
      ? Response.json({ uri: `at://${did}/${POST}/hello`, value: { ...record, slug: 'different' } })
      : Response.json(inventory ?? { records: [], cursor: String(++page) }));
    assert.equal(response.status, 502);
  }
});

test('qualified canonical slugs win key collisions while bare keys and unambiguous qualified-key aliases remain usable', async t => {
  const base = { $type: POST, label: 'Writing', publishedAt: '2026-01-01T00:00:00.000Z' };
  const records = new Map([
    ['3aaaaaaaaaaaa', { ...base, slug: 'hello', body: 'Canonical target body.', canonicalUrl: 'https://example.test/posts/writing/hello' }],
    ['hello', { ...base, slug: 'different', body: 'Colliding key body.', canonicalUrl: 'https://example.test/posts/writing/different' }],
  ]);
  t.mock.method(globalThis, 'fetch', async address => {
    const url = new URL(address);
    if (url.pathname.endsWith('listRecords')) return Response.json({ records: [...records].map(([key, value]) => ({ uri: `at://${did}/${POST}/${key}`, value })) });
    const key = url.searchParams.get('rkey'), value = records.get(key);
    return value ? Response.json({ uri: `at://${did}/${POST}/${key}`, value }) : Response.json({ error: 'RecordNotFound' }, { status: 400 });
  });
  const ask = (path, method = 'GET') => worker.fetch(new Request(`https://example.test${path}`, { method }), config);
  const canonical = await ask('/posts/writing/hello');
  assert.equal(canonical.status, 200);
  const body = await canonical.text();
  assert.match(body, /Canonical target body\./); assert.doesNotMatch(body, /Colliding key body\./);
  assert.match(body, /rel="canonical" href="https:\/\/example\.test\/posts\/writing\/hello"/);
  const head = await ask('/posts/writing/hello', 'HEAD');
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  for (const [path, target] of [
    ['/posts/hello', '/posts/writing/different'],
    ['/posts/3aaaaaaaaaaaa', '/posts/writing/hello'],
    ['/posts/old-label/3aaaaaaaaaaaa', '/posts/writing/hello'],
  ]) {
    const alias = await ask(path); assert.equal(alias.status, 308);
    assert.equal(new URL(alias.headers.get('Location')).pathname, target);
  }
});

test('qualified legacy slug paths also refuse duplicate effective slugs while their bare keys remain aliases', async () => {
  const legacy = { $type: POST, body: 'Legacy target body.', label: 'Writing', publishedAt: '2026-01-01T00:00:00.000Z', canonicalUrl: 'https://example.test/posts/writing/hello' };
  const get = async url => url.pathname.endsWith('getRecord')
    ? Response.json({ uri: `at://${did}/${POST}/hello`, value: legacy })
    : Response.json({ records: [
      { uri: `at://${did}/${POST}/hello`, value: legacy },
      { uri: `at://${did}/${POST}/3aaaaaaaaaaaa`, value: { ...legacy, slug: 'hello' } },
    ] });
  const ask = path => servePost(new Request(`https://example.test${path}`), config, 'hello', get);
  assert.equal((await ask('/posts/writing/hello')).status, 502);
  const alias = await ask('/posts/hello'); assert.equal(alias.status, 308);
  assert.equal(new URL(alias.headers.get('Location')).pathname, '/posts/writing/hello');
});
