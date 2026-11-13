import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import test from 'node:test';
import worker from '../src/worker.js';

const run = promisify(execFile);
test('the SEO command checks all six sitemap routes, their aliases and static metadata', { timeout: 10000 }, async () => {
  const assets = new URL('../public/', import.meta.url);
  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = new Request(`http://${incoming.headers.host}${incoming.url}`);
      const response = await worker.fetch(request, { ASSETS: { fetch: async request => {
        const path = new URL(request.url).pathname;
        const file = path === '/' ? 'index.html' : path.slice(1) + (path.includes('.') ? '' : '.html');
        try {
          const body = await readFile(new URL(file, assets));
          return new Response(body, { headers: { 'Content-Type': file.endsWith('.html') ? 'text/html' : 'application/octet-stream' } });
        } catch {
          return new Response(await readFile(new URL('404.html', assets)), { status: 404 });
        }
      } } });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { outgoing.writeHead(500); outgoing.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { stdout } = await run(process.execPath, [new URL('../scripts/check-seo.mjs', import.meta.url).pathname,
      `http://127.0.0.1:${server.address().port}`]);
    assert.match(stdout, /PASS \/about:/);
    assert.equal((stdout.match(/crawlable, canonical/g) ?? []).length, 6);
    assert.match(stdout, /PASS sitemap, robots/);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
