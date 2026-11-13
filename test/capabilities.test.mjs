import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { capabilitiesPage, PAGE, REFUSALS } from '../scripts/capabilities.mjs';

// The written reference for what the vault can do is made from the tables the service and the
// tools run on. These hold it to them.

test('the reference page says exactly what the service and the tools do', async () => {
  assert.equal(await readFile(PAGE, 'utf8'), capabilitiesPage(), 'service/CAPABILITIES.md is out of date: run `node scripts/capabilities.mjs --write`');
});

test('every way the service says no is in the reference, with the status it is sent with', async () => {
  const folders = [new URL('../service/src/', import.meta.url), new URL('../service/src/capabilities/', import.meta.url), new URL('../cortex/', import.meta.url)];
  const found = new Map();
  for (const folder of folders) {
    for (const name of (await readdir(folder)).filter(each => each.endsWith('.mjs'))) {
      for (const [, status, code] of (await readFile(new URL(name, folder), 'utf8')).matchAll(/new Refused\((\d+), '([A-Za-z]+)'/g)) found.set(code, Number(status));
    }
  }
  assert.ok(found.size > 15);
  for (const [code, status] of found) assert.deepEqual(REFUSALS[code]?.[0], status, code);
  // Nothing is listed that the service never says, except the one it says when it fails itself.
  assert.deepEqual(Object.keys(REFUSALS).filter(code => !found.has(code)), ['InternalError']);
});
