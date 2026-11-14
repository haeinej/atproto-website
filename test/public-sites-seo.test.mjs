import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../public/seo-worker.mjs';

test('public static sites preserve path and query when requiring HTTPS', async () => {
  const response = await worker.fetch(new Request('http://docs.ohmmmm.com/quick-start?ref=shared'), {ASSETS: {fetch() {throw new Error('must redirect before assets');}}});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://docs.ohmmmm.com/quick-start?ref=shared');
});
test('missing pages and explicit error templates stay unindexable HTTP 404s', async () => {
  for (const [path, status] of [['/missing', 404], ['/404', 200], ['/404.html', 200], ['/404/', 200]]) {
    const response = await worker.fetch(new Request('https://design.ohmmmm.com' + path), {ASSETS: {fetch: async () => new Response('Not found', {status})}});
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  }
});
test('successful pages, canonical redirects and local preview pass through unchanged', async () => {
  for (const [url, status] of [['https://docs.ohmmmm.com/quick-start', 200], ['https://docs.ohmmmm.com/quick-start.html', 307], ['http://localhost:8791/', 200]]) {
    const response = await worker.fetch(new Request(url), {ASSETS: {fetch: async () => new Response('page', {status, headers: {'Content-Type': 'text/html', 'Location': '/quick-start'}})}});
    assert.equal(response.status, status === 307 ? 308 : status);
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.equal(await response.text(), 'page');
  }
});
