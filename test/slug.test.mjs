import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../feed/pds.mjs';
import { servePost } from '../feed/worker.mjs';
import { recordProblems } from '../vault/core.mjs';
import { postRecord } from '../vault/file.mjs';

const did = 'did:web:pds.example.test';
const config = { ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: 'https://pds.example.test' };

test('a post kept under its ID is found by its slug, and its address follows the slug when it changes', async () => {
  const id = '3lf2abcdefg22';
  const post = { id, slug: 'trap-of-independency', label: 'Writings', sublabel: 'Collisions', visibility: 'public', title: 'Trap', date: '2026-03-01', body: 'Words.', properties: {} };
  const { key, record } = postRecord(post, { did, site: 'https://example.test' });
  assert.deepEqual([key, record.slug, recordProblems(record, key)], [id, 'trap-of-independency', []]);

  // The PDS holds the record under its ID. The site's list knows the address it was last given.
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

  // Renamed: the record is the same record, and the old address sends readers to the new one once
  // the site's list has caught up.
  records.set(id, postRecord({ ...post, slug: 'the-trap' }, { did, site: 'https://example.test' }).record);
  const renamed = '/posts/writings/collisions/the-trap';
  assert.equal((await ask(renamed, listed(address))).status, 200);
  const old = await ask(`/posts/${id}`, listed(renamed));
  assert.equal(new URL(old.headers.get('Location')).pathname, renamed);
});

test('a post published before posts had IDs is kept under its slug and works as it did', async () => {
  const record = { $type: POST, body: 'Words.', publishedAt: '2026-01-01T00:00:00.000Z', canonicalUrl: 'https://example.test/posts/writings/hello', title: 'Hello', label: 'Writings' };
  const get = async url => url.searchParams.get('rkey') === 'hello'
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
  ]) {
    const response = await servePost(request, config, 'hello', async url => url.pathname.endsWith('getRecord')
      ? Response.json({ error: 'RecordNotFound' }, { status: 400 }) : Response.json(inventory));
    assert.equal(response.status, 502);
  }
});
