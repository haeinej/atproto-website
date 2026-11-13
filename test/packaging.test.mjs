import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('contributor setup locks the separate service without installing from tests or package hooks', async () => {
  const manifest = JSON.parse(await readFile(new URL('../service/package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../service/package-lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
  assert.equal(lock.packages['node_modules/@noble/curves'].version, manifest.dependencies['@noble/curves']);
  assert.match(manifest.dependencies['@noble/curves'], /^\d+\.\d+\.\d+$/);
  for (const path of ['../package.json', '../service/package.json']) {
    const { scripts = {} } = JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'pretest', 'test', 'posttest']) {
      assert.doesNotMatch(scripts[hook] ?? '', /\b(?:npm|pnpm|yarn)\b[^;&|]*\b(?:install|ci)\b/, `${path}: ${hook} must not install dependencies`);
    }
  }
});

test('the packed CLI initializes MCP with only its declared runtime dependencies', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ohm-package-'));
  try {
    const { stdout } = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'pack', '--json', '--ignore-scripts', '--pack-destination', directory,
    ], { cwd: root });
    const [packed] = JSON.parse(stdout);
    assert.ok(packed.files.some(file => file.path === 'service/public/vault/publish.js'), 'ship the shared publisher, not a second implementation');
    assert.ok(!packed.files.some(file => file.path.startsWith('service/src/')), 'the backend is not a CLI dependency');
    await run('tar', ['-xzf', join(directory, packed.filename), '-C', directory]);
    const extracted = join(directory, 'package');
    const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
    // Copy the locked production closure, never the source checkout's dev/service dependencies.
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (!path.startsWith('node_modules/') || entry.dev) continue;
      await mkdir(join(extracted, path, '..'), { recursive: true });
      await cp(join(root, path), join(extracted, path), { recursive: true, dereference: true });
    }
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'packed-test', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ];
    const pending = run(process.execPath, [join(extracted, 'bin/ohm.mjs'), 'mcp'], {
      cwd: directory, timeout: 10000, env: { ...process.env, NODE_PATH: '', ATPROTO_APP_PASSWORD: '', OHM_CONTENT_LAYER_CONFIG: '' },
    });
    pending.child.stdin.end(messages.map(message => JSON.stringify(message)).join('\n') + '\n');
    const result = await pending;
    assert.equal(result.stderr, '');
    const replies = result.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(replies.map(reply => reply.id), [1, 2]);
    assert.equal(replies[0].result.serverInfo.name, 'ohm-vault');
    assert.match(replies[0].result.instructions, /Saving never publishes/);
    const names = replies[1].result.tools.map(tool => tool.name);
    assert.ok(names.includes('vault_publish'));
    assert.ok(names.includes('cortex_start'));
    assert.equal(names.length, new Set(names).size);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
