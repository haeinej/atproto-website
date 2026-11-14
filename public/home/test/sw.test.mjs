import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

test('every precached script is served offline while join POST is never cached', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const handlers = {};
  const stored = new Map();
  const origin = 'https://ohmmmm.com';
  const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const cached = new Response('cached script');
  Object.defineProperty(cached, 'type', { value: 'basic' });
  const cache = {
    addAll: async requests => { for (const request of requests) stored.set(key(request), cached); },
    match: async request => stored.get(key(request)),
    put: async () => { assert.fail('an offline request cannot replace cached content'); },
  };
  vm.runInNewContext(source, {
    self: { location: { origin }, addEventListener: (name, handle) => { handlers[name] = handle; }, skipWaiting: async () => {} },
    caches: { open: async () => cache },
    Request: class extends Request { constructor(path, options) { super(new URL(path, origin), options); } },
    URL, fetch: async () => { throw new Error('offline'); },
  });
  let installed;
  handlers.install({ waitUntil: promise => { installed = promise; } });
  await installed;
  assert.ok(stored.has(`${origin}/join.js`));
  for (const url of [...stored.keys()].filter(url => new URL(url).pathname.endsWith('.js'))) {
    let response;
    const pending = [];
    handlers.fetch({ request: { url, method: 'GET', mode: 'no-cors' },
      respondWith: promise => { response = promise; }, waitUntil: promise => pending.push(promise) });
    assert.ok(response, `precache must be reachable for ${url}`);
    assert.equal(await response, cached);
    await Promise.all(pending);
  }
  handlers.fetch({ request: { url: `${origin}/join`, method: 'POST', mode: 'navigate' },
    respondWith: () => assert.fail('POST /join must remain network-only') });
});
