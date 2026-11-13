import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
