// Your own key-value store, reached from your machine with your own Wrangler login. It has the
// shape of a Workers KV namespace, so the vault uses it exactly as the site's Worker uses the real one.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Wrangler comes from this repository's Cirrus install when it is there, otherwise from the project
// the command is run in.
function wrangler() {
  const local = fileURLToPath(new URL('../cirrus/node_modules/.bin/wrangler', import.meta.url));
  return existsSync(local) ? [local, []] : ['npx', ['--no-install', 'wrangler']];
}

// `where` says which copy of the store to use: the real one by default.
export function wranglerKv(configFile, where = ['--remote']) {
  const [command, first] = wrangler();
  const run = (action, args, binary) => spawnSync(command, [
    ...first, 'kv', 'key', action, ...args, '--config', resolve(configFile), '--binding', 'NOTES', ...where,
  ], { encoding: binary ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const failed = (what, result) => {
    throw new Error(`${what} failed. Check that Wrangler is installed and signed in.\n${String(result.stderr || result.stdout).trim().slice(-400)}`);
  };
  const absent = result => /value not found|key not found|10009|404/i.test(`${result.stdout}\n${result.stderr}`);
  return {
    async get(key, type) {
      const result = run('get', [key], true);
      // The value can be any bytes, so it is told apart from "nothing there" before it is decoded.
      const said = result.stdout.length < 400 ? result.stdout.toString('utf8') : '';
      if (result.status !== 0) return absent({ stdout: said, stderr: result.stderr.toString('utf8') }) ? null : failed(`Reading ${key}`, result);
      if (said.trim() === 'Value not found') return null;
      if (type === 'arrayBuffer') return result.stdout.buffer.slice(result.stdout.byteOffset, result.stdout.byteOffset + result.stdout.length);
      const text = result.stdout.toString('utf8');
      return type === 'json' ? JSON.parse(text) : text;
    },
    async put(key, value) {
      const folder = await mkdtemp(join(tmpdir(), 'kv-'));
      try {
        const path = join(folder, 'value');
        await writeFile(path, value);
        const result = run('put', [key, '--path', path]);
        if (result.status !== 0) failed(`Saving ${key}`, result);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
    async delete(key) {
      const result = run('delete', [key]);
      if (result.status !== 0 && !absent(result)) failed(`Removing ${key}`, result);
    },
    async list({ prefix = '' } = {}) {
      const result = run('list', ['--prefix', prefix]);
      if (result.status !== 0) failed('Listing your own store', result);
      const found = /\[[\s\S]*\]/.exec(result.stdout)?.[0];
      return { keys: JSON.parse(found ?? '[]').map(({ name }) => ({ name })), list_complete: true };
    },
  };
}
