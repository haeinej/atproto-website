import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { createServer } from '../mcp/protocol.mjs';
import { createTools, OFFERED, TOOLS } from '../mcp/tools.mjs';
import { REQUESTS } from '../service/src/capabilities/index.mjs';
import { createService } from '../service/src/worker.mjs';
import { testDatabase } from './d1.mjs';

// The tools, against the vault service itself: the real service, on a database in memory, asked
// the way the tools ask it. Only who is asking is stood in for.
const did = 'did:web:pds.example.test';
async function toolsOf() {
  const env = { DB: await testDatabase(), SERVICE_DID: 'did:web:vault.example.test' };
  const service = createService({ whoIs: Object.assign(async () => did, { pdsFor: async () => 'https://pds.example.test' }), get: async () => Response.json({}) });
  const asked = [];
  const ask = async (name, { query, body } = {}) => {
    asked.push(name);
    const url = new URL(`https://vault.example.test/xrpc/com.ohmmmm.vault.${name}`);
    if (query) url.search = new URLSearchParams(query);
    const response = await service(new Request(url, {
      method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer stand-in', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    }), env);
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message), { status: response.status, code: data.error, extra: data });
    return data;
  };
  // The same five calls the tools make through scripts/vault-client.mjs.
  const vault = {
    tree: () => ask('getTree'), search: query => ask('searchPosts', { query }), get: id => ask('getPost', { query: { id } }),
    put: (post, replaces) => ask('putPost', { body: { post, ...(replaces ? { replaces } : {}) } }), remove: (id, replaces) => ask('deletePost', { body: { id, replaces } }),
  };
  return { tools: createTools({ vault }), vault, asked };
}

test('an agent saves privately, finds the post again, and changes it from the version it read', async () => {
  const { tools } = await toolsOf();
  const made = await tools.call('vault_save', { key: 'after-the-rain', title: 'After the rain', label: 'Field notes', date: '2026-01-01', body: 'The street went quiet after the rain.\n' });
  assert.deepEqual([made.done, made.created, made.visibility, made.form, made.label, made.slug], [true, true, 'private', 'writing', 'Field notes', 'after-the-rain']);
  await tools.call('vault_save', { key: 'loose-thought', body: 'Rain makes a city honest.' });

  const found = await tools.call('vault_search', { query: 'RAIN street' });
  assert.deepEqual(found.posts.map(post => [post.slug, post.visibility]), [['after-the-rain', 'private']]);
  assert.match(found.posts[0].passage, /went quiet after the rain/);
  assert.equal((await tools.call('vault_search', { query: 'rain' })).found, 2);
  assert.equal((await tools.call('vault_search', { query: 'rain', visibility: 'public' })).found, 0);

  // A post is read by its slug or by its ID, and changing it needs the version that was read.
  const read = await tools.call('vault_read', { key: 'after-the-rain' });
  assert.deepEqual([read.id, read.body], [made.id, 'The street went quiet after the rain.']);
  assert.equal((await tools.call('vault_read', { key: made.id })).version, read.version);
  await assert.rejects(tools.call('vault_save', { key: 'after-the-rain', title: 'Again' }), /Read it with vault_read and pass its version/);
  const changed = await tools.call('vault_save', { key: 'after-the-rain', version: read.version, title: 'After the rain, again' });
  assert.deepEqual([changed.done, changed.title, changed.visibility, changed.id], [true, 'After the rain, again', 'private', made.id]);
  await assert.rejects(tools.call('vault_save', { key: 'after-the-rain', version: read.version, title: 'Stale' }), /has changed since it was read/);
  // What was left out stayed: the body, the label, the date.
  const again = await tools.call('vault_read', { key: 'after-the-rain' });
  assert.deepEqual([again.body, again.label, again.date], [read.body, 'Field notes', read.date]);
  assert.equal((await tools.call('vault_save', { key: 'after-the-rain', version: again.version, title: 'After the rain, again' })).unchanged, true);

  // The slug is an ordinary field: changed, it is the same post at a new address. An empty title removes it.
  const moved = await tools.call('vault_save', { key: 'after-the-rain', version: again.version, slug: 'after-rain', title: '' });
  assert.deepEqual([moved.id, moved.slug, moved.title, moved.form], [made.id, 'after-rain', undefined, 'note']);
  await assert.rejects(tools.call('vault_read', { key: 'after-the-rain' }), /No post uses "after-the-rain"/);
});

test('nothing other people are meant to see changes without the second call', async () => {
  const { tools, vault } = await toolsOf();
  const made = await tools.call('vault_save', { key: 'hello', title: 'Hello', label: 'Writings', body: 'A first post.' });
  const held = async () => (await vault.get(made.id)).post;

  const asked = await tools.call('vault_set_visibility', { key: 'hello', to: 'public' });
  assert.equal(asked.done, false);
  assert.deepEqual([asked.willHappen.from, asked.willHappen.to], ['private', 'public']);
  // Saying a post is for everyone does not publish it, and the answer says so.
  assert.match(asked.willHappen.audience, /Saving does not publish it/);
  assert.equal((await held()).visibility, 'private');
  await assert.rejects(tools.call('vault_set_visibility', { key: 'hello', to: 'public', confirm: 'c0000000000000000' }), /has changed since it was shown/);
  // The value given for one request does not unlock another.
  await assert.rejects(tools.call('vault_set_visibility', { key: 'hello', to: 'friends', confirm: asked.confirm }), /has changed since it was shown/);
  const moved = await tools.call('vault_set_visibility', { key: 'hello', to: 'public', confirm: asked.confirm });
  assert.deepEqual([moved.done, moved.visibility], [true, 'public']);
  assert.equal((await tools.call('vault_set_visibility', { key: 'hello', to: 'public' })).unchanged, true);

  // Editing a post that is not private is shown first too, with what changes.
  const read = await tools.call('vault_read', { key: 'hello' });
  const edit = { key: 'hello', version: read.version, body: 'A first post, corrected.', sublabel: 'Beginnings' };
  const shown = await tools.call('vault_save', edit);
  assert.equal(shown.done, false);
  assert.deepEqual(shown.willHappen.changes, ['body', 'sublabel']);
  assert.equal((await held()).body, 'A first post.');
  // A different edit cannot ride on the value shown for this one.
  await assert.rejects(tools.call('vault_save', { ...edit, body: 'Something else entirely.', confirm: shown.confirm }), /has changed since it was shown/);
  const saved = await tools.call('vault_save', { ...edit, confirm: shown.confirm });
  assert.deepEqual([saved.done, saved.sublabel], [true, 'Beginnings']);
  assert.equal((await held()).body, 'A first post, corrected.');

  // Removing a post is two calls as well.
  const going = await tools.call('vault_delete', { key: 'hello' });
  assert.equal(going.done, false);
  assert.match(going.willHappen.warning, /for good/);
  assert.equal((await held()).slug, 'hello');
  assert.equal((await tools.call('vault_delete', { key: 'hello', confirm: going.confirm })).removed.slug, 'hello');
  await assert.rejects(tools.call('vault_read', { key: 'hello' }), /No post uses "hello"/);
});

test('the tree and the list show the vault\'s structure, and bad requests say what is wrong', async () => {
  const { tools, vault } = await toolsOf();
  await tools.call('vault_save', { key: 'trap', title: 'Trap', label: 'Writings', sublabel: 'Collisions', body: 'Words.', date: '2026-03-01' });
  const draft = await tools.call('vault_save', { key: 'draft', title: 'Draft', label: 'Writings', body: 'Words.', date: '2026-04-01' });
  // A post that first appeared somewhere else, as a mirror brings one in.
  const { post, version } = await vault.get(draft.id);
  await vault.put({ ...post, source: { platform: 'bluesky', uri: 'https://bsky.app/profile/example.test/post/3k' } }, version);

  const tree = await tools.call('vault_tree');
  assert.deepEqual([tree.posts, tree.private, tree.public, tree.friends], [2, 2, 0, 0]);
  assert.deepEqual(tree.labels.map(folder => [folder.label, folder.posts.map(each => each.slug), folder.sublabels.map(group => [group.sublabel, group.posts.map(each => each.slug)])]),
    [['Writings', ['draft'], [['Collisions', ['trap']]]]]);
  assert.deepEqual((await tools.call('vault_list', { label: 'writings' })).posts.map(each => each.slug), ['draft', 'trap']);
  assert.deepEqual((await tools.call('vault_list', { sublabel: 'Collisions' })).posts.map(each => each.slug), ['trap']);
  assert.deepEqual((await tools.call('vault_list', { platform: 'Bluesky' })).posts.map(each => [each.slug, each.platform]), [['draft', 'bluesky']]);
  assert.deepEqual((await tools.call('vault_list', { platform: 'own' })).posts.map(each => each.slug), ['trap']);

  // What the vault service will not take, it says in its own words, and the tool passes them on.
  await assert.rejects(tools.call('vault_save', { key: 'Not A Slug', body: 'x' }), /lowercase Latin letters and digits/);
  await assert.rejects(tools.call('vault_save', { key: 'no-body' }), /A new post needs a body/);
  await assert.rejects(tools.call('vault_save', { key: 'sub', body: 'x', sublabel: 'Alone' }), /A sublabel sits inside a label/);
  await assert.rejects(tools.call('vault_save', { key: 'draft2', body: 'x', label: 'Writings', slug: 'ignored' }).then(() => tools.call('vault_save', { key: 'draft2', version: 'x', slug: 'trap' })), /has changed since it was read/);
  await assert.rejects(tools.call('vault_read', { key: 'missing' }), /No post uses "missing"/);
  await assert.rejects(tools.call('vault_search', { query: '  ' }), /at least one word/);
  await assert.rejects(tools.call('vault_set_visibility', { key: 'trap', to: 'everyone' }), /Visibility is one of/);
  await assert.rejects(tools.call('vault_publish_everything'), /There is no tool named/);
  // Two posts cannot share a slug.
  const second = await tools.call('vault_read', { key: 'draft2' });
  await assert.rejects(tools.call('vault_save', { key: 'draft2', version: second.version, slug: 'trap' }), /already has the slug "trap"/);
});

test('each tool asks the vault service only for what it says it is made of', async () => {
  const { tools, asked } = await toolsOf();
  const made = await tools.call('vault_save', { key: 'hello', body: 'A first post.' });
  const calls = {
    vault_tree: [{}], vault_list: [{}], vault_read: [{ key: 'hello' }], vault_search: [{ query: 'first' }],
    vault_save: [{ key: 'hello', version: made.version, body: 'A first post, again.' }, { key: 'another', body: 'x' }],
    vault_set_visibility: [{ key: 'hello', to: 'friends' }],
    vault_delete: [{ key: 'another' }],
  };
  for (const tool of TOOLS) {
    // Every request a tool names is one the service has, and reading tools name none that change anything.
    for (const name of tool.requests) assert.ok(REQUESTS[`com.ohmmmm.vault.${name}`], `${tool.name} names ${name}`);
    if (tool.annotations?.readOnlyHint) assert.deepEqual(tool.requests.filter(name => REQUESTS[`com.ohmmmm.vault.${name}`].changes), [], tool.name);
    for (const args of calls[tool.name]) {
      asked.length = 0;
      const first = await tools.call(tool.name, args);
      if (first.confirm) await tools.call(tool.name, { ...args, confirm: first.confirm });
      assert.deepEqual([...new Set(asked)].filter(name => !tool.requests.includes(name)), [], `${tool.name} asked for more than it names`);
    }
  }
});

test('the server speaks the protocol: it lists the tools, answers calls, and reports a refusal as a result', async () => {
  const { tools } = await toolsOf();
  const handle = createServer({ tools, list: OFFERED });
  const ask = (method, params, id = 1) => handle({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

  const hello = await ask('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.deepEqual([hello.result.protocolVersion, hello.result.capabilities, hello.result.serverInfo.name], ['2025-03-26', { tools: {} }, 'ohm-vault']);
  assert.equal((await ask('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18');
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
  assert.deepEqual((await ask('ping')).result, {});

  const listed = (await ask('tools/list')).result.tools;
  assert.deepEqual(listed.map(tool => tool.name),
    ['vault_tree', 'vault_list', 'vault_read', 'vault_search', 'vault_save', 'vault_set_visibility', 'vault_delete']);
  // An agent is told a tool's name, what it does and what it takes, and nothing else.
  for (const tool of listed) assert.deepEqual([tool.inputSchema.type, Object.keys(tool).filter(key => !['name', 'description', 'inputSchema', 'annotations'].includes(key))], ['object', []]);
  // Only the tools that read are marked as changing nothing.
  assert.deepEqual(listed.filter(tool => tool.annotations?.readOnlyHint).map(tool => tool.name), ['vault_tree', 'vault_list', 'vault_read', 'vault_search']);

  const saved = await ask('tools/call', { name: 'vault_save', arguments: { key: 'hello', body: 'A first post.' } });
  assert.equal(JSON.parse(saved.result.content[0].text).visibility, 'private');
  const refused = await ask('tools/call', { name: 'vault_read', arguments: { key: 'missing' } });
  assert.deepEqual([refused.result.isError, refused.result.content[0].text], [true, 'No post uses "missing".']);
  assert.equal((await ask('resources/list')).error.code, -32601);
  assert.equal((await handle({ id: 4, method: 'ping' })).error.code, -32600);
});

test('the server starts on its own and answers over standard input and output', async () => {
  const child = spawn(process.execPath, [new URL('../mcp/server.mjs', import.meta.url).pathname], {
    cwd: new URL('../test/', import.meta.url).pathname, stdio: ['pipe', 'pipe', 'inherit'],
  });
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  for (const message of [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    // There is no site configuration in this folder, and the tool says so instead of failing.
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'vault_tree', arguments: {} } },
  ]) child.stdin.write(`${JSON.stringify(message)}\n`);
  child.stdin.end();
  const code = await new Promise(resolve => child.on('close', resolve));
  const lines = out.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(code, 0);
  assert.deepEqual(lines.map(line => line.id), [1, 2, 3]);
  assert.equal(lines[1].result.tools.length, 7);
  assert.equal(lines[2].result.isError, true);
  assert.match(lines[2].result.content[0].text, /No site configuration here/);
});
