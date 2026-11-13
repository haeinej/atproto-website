import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { vaultClient } from '../scripts/vault-client.mjs';

async function fixture(t, { expired = false } = {}) {
  const grants = [], requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://pds.test');
    grants.push({ method: url.searchParams.get('lxm'), audience: url.searchParams.get('aud'), authorization: request.headers.authorization });
    response.writeHead(expired && request.headers.authorization === 'Bearer expired' ? 401 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ token: 'synthetic-method-token' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  let renewals = 0;
  const client = vaultClient({
    pds: { origin: `http://127.0.0.1:${server.address().port}`, did: 'did:web:member.test' },
    session: expired ? 'expired' : 'current',
    audience: 'did:web:vault.test', vault: 'https://vault.test',
    renew: async () => { renewals++; return 'renewed'; },
    get: async (url, options) => {
      requests.push({ url: new URL(url), ...options });
      if (url.pathname.endsWith('getMemory')) return Response.json({ error: 'Changed', message: 'Read the current memory', version: 'newer' }, { status: 409 });
      return Response.json({ ok: true });
    },
  });
  return { client, grants, requests, renewals: () => renewals };
}

test('cortex transport requests the cortex method-bound token and leaves vault calls in their namespace', async t => {
  const { client, grants, requests } = await fixture(t);
  await client.cortex.call('listNotes', { query: { settled: '1' } });
  await client.cortex.call('addNote', { body: { id: 'note-1', note: 'A synthetic observation', session: 'session-1' } });
  await client.tree();
  assert.deepEqual(grants.map(item => item.method), ['com.ohmmmm.cortex.listNotes', 'com.ohmmmm.cortex.addNote', 'com.ohmmmm.vault.getTree']);
  assert.ok(grants.every(item => item.audience === 'did:web:vault.test' && item.authorization === 'Bearer current'));
  assert.equal(requests[0].url.pathname, '/xrpc/com.ohmmmm.cortex.listNotes');
  assert.equal(requests[0].url.searchParams.get('settled'), '1');
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[1].method, 'POST');
  assert.equal(JSON.parse(requests[1].body).id, 'note-1');
  assert.ok(requests.every(item => item.headers.Authorization === 'Bearer synthetic-method-token'));
  assert.equal(requests[2].url.pathname, '/xrpc/com.ohmmmm.vault.getTree');
});

test('cortex transport renews an expired PDS sign-in and preserves service refusal details', async t => {
  const { client, grants, renewals } = await fixture(t, { expired: true });
  await assert.rejects(client.cortex.call('getMemory', { query: { name: 'working-style' } }), problem =>
    problem.status === 409 && problem.code === 'Changed' && problem.extra.version === 'newer');
  assert.equal(renewals(), 1);
  assert.deepEqual(grants.map(item => item.authorization), ['Bearer expired', 'Bearer renewed']);
  assert.ok(grants.every(item => item.method === 'com.ohmmmm.cortex.getMemory'));
  assert.throws(() => client.cortex.call('../vault.publish'), /Name one cortex request/);
});

test('mirror transport preserves the optional approved summary and existing direct apply calls', async t => {
  const { client, grants, requests } = await fixture(t);
  const summary = 'a'.repeat(64);
  await client.mirror();
  await client.mirror({ apply: true, expectedSummary: summary });
  await client.mirror({ apply: true });
  assert.deepEqual(requests.map(request => JSON.parse(request.body)), [{ apply: false }, { apply: true, expectedSummary: summary }, { apply: true }]);
  assert.ok(grants.every(grant => grant.method === 'com.ohmmmm.vault.importPublished'));
  assert.ok(requests.every(request => request.headers.Authorization === 'Bearer synthetic-method-token'));
});
