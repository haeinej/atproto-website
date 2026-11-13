import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { CAPABILITIES } from '../service/src/capabilities/index.mjs';
import { TOOLS } from '../mcp/tools.mjs';

test('public docs include every registered request and both vault and cortex tools', async () => {
  const api = await readFile(new URL('../public/docs/api.md', import.meta.url), 'utf8');
  const mcp = await readFile(new URL('../public/docs/mcp.md', import.meta.url), 'utf8');
  const requests = CAPABILITIES.flatMap(capability => Object.keys(capability.requests)).sort();
  const names = [...api.matchAll(/^### `(com\.ohmmmm\.[\w.]+)`$/gm)].map(match => match[1]).sort();
  assert.deepEqual(names, requests, 'include reserved requests as well as implemented ones');
  const tools = TOOLS.map(tool => tool.name).sort();
  for (const [page, text] of [['API', api], ['MCP', mcp]]) {
    const listed = [...text.matchAll(/^\| `((?:vault|cortex)_\w+)` \|/gm)].map(match => match[1]).sort();
    assert.deepEqual(listed, tools, `${page} must not silently filter out cortex tools or include non-tool requests`);
  }
});

test('public docs use unique IDs and every in-page link has one target', async () => {
  const directory = new URL('../public/docs/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.html'))) {
    const html = await readFile(new URL(file, directory), 'utf8');
    assert.doesNotMatch(html, /<header class="site-header"/, `${file} must not restore the removed top header`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file} has duplicate IDs that can misdirect navigation`);
    for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(ids.includes(anchor), `${file} links to missing #${anchor}`);
    }
  }
});

test('public docs preserve the published Architecture index bookmark', async () => {
  const index = await readFile(new URL('../public/docs/index.html', import.meta.url), 'utf8');
  assert.match(index, /\sid="architecture"/, 'existing links to /#architecture must keep a target');
});
