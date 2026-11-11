import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ARCHIVE_POST, BSKY_POST } from '../feed/pds.mjs';
import worker, { refreshNotes, servePost } from '../feed/worker.mjs';

const example = JSON.parse(await readFile(new URL('../examples/image-text-image-video.json', import.meta.url), 'utf8'));
const did = 'did:web:pds.example.test';
const config = {
  ATPROTO_DID: did,
  ATPROTO_PDS_ORIGIN: 'https://pds.example.test',
  INCLUDE_BLUESKY_POSTS: 'false',
};
const uri = `at://${did}/${ARCHIVE_POST}/test-post`;

test('the scheduled feed displays an archive post without a Bluesky copy', async () => {
  let cached;
  const env = { ...config, NOTES: {
    put: async (_key, snapshot) => { cached = JSON.parse(snapshot); },
    get: async () => cached,
  } };
  await refreshNotes(env, async url => {
    assert.equal(url.searchParams.get('collection'), ARCHIVE_POST);
    return Response.json({ records: [{ uri, value: example }] });
  });
  const response = await worker.fetch(new Request('https://example.test/notes.json'), env);
  const { notes } = await response.json();
  assert.equal(response.status, 200);
  assert.equal(notes[0].permalink, '/posts/test-post');
  assert.match(notes[0].bodyHtml, /<img.*The light changed.*<img.*<video/s);
  assert.match(notes[0].bodyHtml, /https:\/\/pds\.example\.test\/xrpc\/com\.atproto\.sync\.getBlob/);
});

test('an individual post resolves its record and escapes untrusted content', async () => {
  const request = new Request('https://example.test/posts/test-post');
  const result = await servePost(request, config, 'test-post', async url => {
    assert.equal(url.searchParams.get('rkey'), 'test-post');
    return Response.json({ uri, value: {
      ...example, title: '<script>alert(1)</script>', body: example.body + '\n\n' +
        '<img src=x onerror=alert(1)> [link](javascript:alert(1)) ![External](https://other.example/pixel.png)',
    } });
  });
  const html = await result.text();
  assert.equal(result.status, 200);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img src=x|href="javascript:|src="https:\/\/other\.example/);
  const missing = await servePost(request, config, 'test-post', async () =>
    Response.json({ error: 'RecordNotFound' }, { status: 400 }));
  assert.equal(missing.status, 404);
});

test('a standalone site serves its root while an attached site uses the posts routes', async () => {
  const assets = { fetch: async request => new Response(new URL(request.url).pathname) };
  const request = new Request('https://example.test/');
  assert.equal((await worker.fetch(request, { ASSETS: assets })).status, 404);
  const response = await worker.fetch(request, { ASSETS: assets, STANDALONE_SITE: 'true' });
  assert.equal(await response.text(), '/index.html');
});

test('existing deployments can include native Bluesky posts', async () => {
  const snapshot = await refreshNotes({ ...config, INCLUDE_BLUESKY_POSTS: 'true', NOTES: { put: async () => {} } },
    async url => Response.json({
      records: url.searchParams.get('collection') === BSKY_POST
        ? [{ uri: `at://${did}/${BSKY_POST}/3lx2zi2fp2c2u`, value: {
            $type: BSKY_POST, text: 'A native post', createdAt: '2025-01-01T00:00:00Z',
          } }] : [],
    }));
  assert.equal(snapshot.notes[0].text, 'A native post');
});
