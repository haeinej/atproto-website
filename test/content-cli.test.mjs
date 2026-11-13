import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ohm-content-'));
  const config = join(dir, 'site.jsonc'), preload = join(dir, 'fetch.mjs'), log = join(dir, 'calls.jsonl');
  await writeFile(config, JSON.stringify({ vars: { ATPROTO_DID: 'did:web:pds.example.test', ATPROTO_PDS_ORIGIN: 'https://pds.example.test', ATPROTO_SITE_NAMESPACE: 'com.example', SITE_ORIGIN: 'https://example.test' } }));
  await writeFile(preload, `
    import { appendFileSync } from 'node:fs';
    const did = 'did:web:pds.example.test'; let page = 0;
    const record = { $type: 'com.ohmmmm.post', slug: 'hello', body: 'Words.', label: 'Writing', form: 'note', publishedAt: '2026-01-01T00:00:00.000Z', canonicalUrl: 'https://example.test/posts/writing/hello' };
    globalThis.fetch = async (address, options = {}) => {
      const url = new URL(address), method = url.pathname.split('/').at(-1), mode = process.env.OHM_TEST_MODE;
      const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null;
      appendFileSync(process.env.OHM_TEST_LOG, JSON.stringify({ method, verb: options.method ?? 'GET', body }) + '\\n');
      if (method.endsWith('listRecords')) return Response.json({ records: [{ uri: 'at://' + did + '/' + url.searchParams.get('collection') + '/3aaaaaaaaaaaa', value: record }], ...(mode === 'cycle' ? { cursor: 'again' } : mode === 'cap' ? { cursor: String(++page) } : {}) });
      if (method.endsWith('getRecord')) {
        if (mode === 'render-key') return Response.json({ uri: 'at://' + did + '/com.ohmmmm.post/' + url.searchParams.get('rkey'), value: record });
        if (mode === 'http') return Response.json({ message: 'down' }, { status: 503 });
        if (mode === 'bad404') return Response.json({ message: 'bad route' }, { status: 404 });
        if (mode === 'missing' || !mode?.startsWith('profile')) return Response.json({ error: 'RecordNotFound' }, { status: 400 });
        const collection = url.searchParams.get('collection'), rkey = url.searchParams.get('rkey');
        return Response.json({ uri: 'at://' + did + '/' + collection + '/' + rkey, cid: 'read-cid', ...(mode === 'profile-invalid' ? {} : { value: { $type: collection, displayName: 'Before', description: 'Keep me', createdAt: '2026-01-01T00:00:00Z' } }) });
      }
      if (method.endsWith('createSession')) return Response.json({ accessJwt: 'test-session', did });
      if (method.endsWith('putRecord')) return Response.json({ uri: 'at://' + did + '/' + body.collection + '/self', cid: 'new-cid' });
      throw new Error('Unexpected request: ' + method);
    };
  `);
  const command = (name, args = [], mode = 'complete') => spawnSync(process.execPath, ['--import', preload, join(root, 'bin/ohm.mjs'), name, ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, ATPROTO_APP_PASSWORD: 'test-only', OHM_TEST_MODE: mode, OHM_TEST_LOG: log },
  });
  const calls = async () => (await readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  try { await run({ dir, config, command, calls, clear: () => writeFile(log, '') }); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('posts and snapshot accept --config and the legacy positional path; posts reports key separately', async () => fixture(async ({ config, command }) => {
  for (const name of ['posts', 'snapshot']) for (const args of [[config], ['--config', config]]) {
    const result = command(name, args); assert.equal(result.status, 0, result.stderr);
    if (name === 'posts') assert.deepEqual([JSON.parse(result.stdout)[0].key, JSON.parse(result.stdout)[0].slug], ['3aaaaaaaaaaaa', 'hello']);
  }
}));

test('broken and capped full inventories fail before authentication or mutation in every CLI consumer', async () => fixture(async ({ config, command, calls, clear }) => {
  for (const [name, flags] of [['posts', []], ['snapshot', []], ['import', ['--save', '--vault', 'https://vault.example.test', '--vault-did', 'did:web:vault.example.test']], ['migrate', ['--from', 'com.example.old', '--publish']]]) {
    for (const mode of ['cycle', 'cap']) {
      await clear();
      const result = command(name, ['--config', config, ...flags], mode);
      assert.equal(result.status, 1, `${name}: ${result.stdout}`); assert.match(result.stderr, /invalid cursor|incomplete/);
      assert.ok((await calls()).every(call => call.verb === 'GET'), name);
    }
  }
}));

test('profile HTTP/protocol failures cause zero writes; valid replacements and absence carry CID preconditions', async () => fixture(async ({ config, command, calls, clear }) => {
  for (const mode of ['http', 'bad404', 'profile-invalid']) {
    await clear();
    const result = command('profile', ['--config', config, '--name', 'After', '--link', 'elsewhere=https://elsewhere.example/', '--publish'], mode);
    assert.equal(result.status, 1, result.stdout); assert.ok((await calls()).every(call => call.verb === 'GET'));
  }
  for (const [mode, expected] of [['profile-valid', 'read-cid'], ['missing', null]]) {
    await clear();
    const result = command('profile', ['--config', config, '--name', 'After', '--publish'], mode);
    assert.equal(result.status, 0, result.stderr);
    const put = (await calls()).find(call => call.method.endsWith('putRecord')).body;
    assert.equal(put.swapRecord, expected); if (expected) assert.equal(put.record.description, 'Keep me');
  }
}));

test('root help describes each mutation boundary', async () => fixture(async ({ command }) => {
  const result = command('--help'); assert.equal(result.status, 0);
  for (const text of ['--save', '--apply', '--publish', 'render adopt/build']) assert.ok(result.stdout.includes(text));
}));

test('render resolves a public slug or explicit key and refuses old sidecars without writing output', async () => fixture(async ({ dir, config, command }) => {
  const source = join(dir, 'original.html'), rules = join(dir, 'rules.json'), template = join(dir, 'template.html'), out = join(dir, 'built.html');
  const page = '<main><p>Words.</p></main>';
  await writeFile(source, page);
  await writeFile(rules, JSON.stringify({ kinds: { entry: { slots: [{ name: 'body', pattern: '(<main>)(.*?)(</main>)' }] } } }));
  const common = ['--config', config, '--slug', 'hello', '--kind', 'entry', '--template', template, '--rules', rules];
  for (const [extra, mode] of [[[], 'complete'], [['--key', '3aaaaaaaaaaaa'], 'render-key']]) {
    const adopted = command('render', ['adopt', ...common, ...extra, '--page', source], mode); assert.equal(adopted.status, 0, adopted.stderr);
    const built = command('render', ['build', ...common, ...extra, '--out', out], mode); assert.equal(built.status, 0, built.stderr);
    assert.equal(await readFile(out, 'utf8'), page);
  }
  const about = JSON.parse(await readFile(template + '.json', 'utf8')); delete about.shapeVersion;
  await writeFile(template + '.json', JSON.stringify(about)); await writeFile(out, 'Keep existing output');
  const refused = command('render', ['build', ...common, '--out', out]); assert.equal(refused.status, 1); assert.match(refused.stderr, /older sidecar.*Adopt/);
  assert.equal(await readFile(out, 'utf8'), 'Keep existing output');
}));
