import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { POST } from '../feed/pds.mjs';
import { createServer } from '../mcp/protocol.mjs';
import { createTools, TOOLS } from '../mcp/tools.mjs';
import { kvStore, memoryKv, ownStores } from '../vault/stores.mjs';
import { createVault } from '../vault/vault.mjs';

const did = 'did:web:pds.example.test';
const picture = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

function toolsOf() {
  const open = memoryKv();
  const own = memoryKv();
  const vault = createVault({ stores: { public: kvStore(open, 'public:'), ...ownStores(own) } });
  const tools = createTools({
    vault, did, site: 'https://example.test', collection: POST,
    files: async path => path.endsWith('street.png') ? { bytes: picture } : Promise.reject(new Error(`No file at ${path}`)),
    imageSize: () => ({ width: 4, height: 3 }),
  });
  return { tools, vault, open, own };
}

test('an agent saves privately, finds the note again, and changes it from the version it read', async () => {
  const { tools, own, open } = toolsOf();
  const made = await tools.call('vault_save', {
    key: 'after-the-rain', title: 'After the rain', label: 'Field notes', date: '2026-01-01',
    body: 'The street went quiet after the rain.\n\n![The street](media:street)', media: [{ id: 'street', path: '/photos/street.png' }],
  });
  assert.deepEqual([made.done, made.created, made.visibility, made.form, made.address],
    [true, true, 'private', 'writing', 'https://example.test/posts/field-notes/after-the-rain']);
  assert.equal(open.held.size, 0);
  await tools.call('vault_save', { key: 'loose-thought', body: 'Rain makes a city honest.' });

  const found = await tools.call('vault_search', { query: 'RAIN street' });
  assert.deepEqual(found.notes.map(note => [note.key, note.visibility]), [['after-the-rain', 'private']]);
  assert.match(found.notes[0].passage, /went quiet after the rain/);
  assert.equal((await tools.call('vault_search', { query: 'rain' })).found, 2);
  assert.equal((await tools.call('vault_search', { query: 'rain', visibility: 'public' })).found, 0);

  const read = await tools.call('vault_read', { key: 'after-the-rain' });
  assert.deepEqual(read.media, [{ id: 'street', kind: 'image' }]);
  // Changing a note needs the version that was read, and a stale one is refused.
  await assert.rejects(tools.call('vault_save', { key: 'after-the-rain', title: 'Again' }), /Read it with vault_read and pass its version/);
  const changed = await tools.call('vault_save', { key: 'after-the-rain', version: read.version, title: 'After the rain, again' });
  assert.deepEqual([changed.done, changed.title, changed.visibility], [true, 'After the rain, again', 'private']);
  await assert.rejects(tools.call('vault_save', { key: 'after-the-rain', version: read.version, title: 'Stale' }), /has changed since it was read/);
  // What was left out stayed: the body, its picture, the label, the date.
  const again = await tools.call('vault_read', { key: 'after-the-rain' });
  assert.deepEqual([again.body, again.media, again.label, again.publishedAt], [read.body, read.media, 'Field notes', read.publishedAt]);
  assert.ok(again.updatedAt);

  // A picture the body no longer places is let go, and the note becomes what its content now is.
  const plain = await tools.call('vault_save', { key: 'after-the-rain', version: again.version, body: 'Only words now.', title: '' });
  assert.equal(plain.form, 'note');
  assert.equal((await tools.call('vault_read', { key: 'after-the-rain' })).media, undefined);
  assert.equal([...own.held.keys()].filter(name => name.startsWith('private:')).length, 2);
});

test('nothing other people can see changes without the second call', async () => {
  const { tools, vault, open } = toolsOf();
  await tools.call('vault_save', { key: 'hello', title: 'Hello', label: 'Writings', body: 'A first note.' });

  const asked = await tools.call('vault_set_visibility', { key: 'hello', to: 'public' });
  assert.equal(asked.done, false);
  assert.deepEqual([asked.willHappen.from, asked.willHappen.to, asked.willHappen.address],
    ['private', 'public', 'https://example.test/posts/writings/hello']);
  assert.match(asked.willHappen.audience, /Everyone can read it/);
  assert.equal((await vault.find('hello')).visibility, 'private');
  assert.equal(open.held.size, 0);
  await assert.rejects(tools.call('vault_set_visibility', { key: 'hello', to: 'public', confirm: 'c0000000000000000' }), /has changed since it was shown/);
  // The value given for one request does not unlock another.
  await assert.rejects(tools.call('vault_set_visibility', { key: 'hello', to: 'friends', confirm: asked.confirm }), /has changed since it was shown/);
  const moved = await tools.call('vault_set_visibility', { key: 'hello', to: 'public', confirm: asked.confirm });
  assert.deepEqual([moved.done, moved.visibility], [true, 'public']);
  assert.equal((await tools.call('vault_set_visibility', { key: 'hello', to: 'public' })).unchanged, true);

  // Editing a public note is shown first too, with what changes and where it will be.
  const read = await tools.call('vault_read', { key: 'hello' });
  const edit = { key: 'hello', version: read.version, body: 'A first note, corrected.', sublabel: 'Beginnings' };
  const shown = await tools.call('vault_save', edit);
  assert.equal(shown.done, false);
  assert.deepEqual(shown.willHappen.changes, ['body', 'sublabel', 'canonicalUrl']);
  assert.deepEqual([shown.willHappen.addressBefore, shown.willHappen.addressAfter],
    ['https://example.test/posts/writings/hello', 'https://example.test/posts/writings/beginnings/hello']);
  assert.equal((await vault.find('hello')).record.body, 'A first note.');
  // A different edit cannot ride on the value shown for this one.
  await assert.rejects(tools.call('vault_save', { ...edit, body: 'Something else entirely.', confirm: shown.confirm }), /has changed since it was shown/);
  const saved = await tools.call('vault_save', { ...edit, confirm: shown.confirm });
  assert.deepEqual([saved.done, saved.sublabel, saved.address], [true, 'Beginnings', 'https://example.test/posts/writings/beginnings/hello']);

  // Taking it down warns that copies stay out, and removing a note is two calls as well.
  const down = await tools.call('vault_set_visibility', { key: 'hello', to: 'private' });
  assert.match(down.willHappen.warning, /Copies other people or applications already made/);
  await tools.call('vault_set_visibility', { key: 'hello', to: 'private', confirm: down.confirm });
  const going = await tools.call('vault_delete', { key: 'hello' });
  assert.equal(going.done, false);
  assert.ok(await vault.find('hello'));
  assert.equal((await tools.call('vault_delete', { key: 'hello', confirm: going.confirm })).removed.key, 'hello');
  assert.equal(await vault.find('hello'), null);
});

test('a note from the person\'s own website keeps its page\'s address unless it is refiled', async () => {
  const { tools, vault } = toolsOf();
  const made = await tools.call('vault_save', { key: 'a-walk', title: 'A walk', label: 'Writing', body: 'Out and back.' });
  const mirrored = await vault.save({ key: 'a-walk', version: made.version, record: { ...(await vault.find('a-walk')).record, canonicalUrl: 'https://example.test/writing/a-walk.html' } });
  const edited = await tools.call('vault_save', { key: 'a-walk', version: mirrored.version, body: 'Out and back again.' });
  assert.equal(edited.address, 'https://example.test/writing/a-walk.html');
  const refiled = await tools.call('vault_save', { key: 'a-walk', version: edited.version, label: 'Walks' });
  assert.equal(refiled.address, 'https://example.test/posts/walks/a-walk');
});

test('the tree and the list show the vault\'s structure, and bad requests say what is wrong', async () => {
  const { tools } = toolsOf();
  await tools.call('vault_save', { key: 'trap', title: 'Trap', label: 'Writings', sublabel: 'Collisions', body: 'Words.', date: '2026-03-01' });
  await tools.call('vault_save', { key: 'draft', title: 'Draft', label: 'Writings', body: 'Words.', date: '2026-04-01' });
  const tree = await tools.call('vault_tree');
  assert.deepEqual([tree.notes, tree.private, tree.public, tree.friends], [2, 2, 0, 0]);
  assert.deepEqual(tree.labels.map(folder => [folder.label, folder.notes.map(note => note.key), folder.sublabels.map(group => [group.sublabel, group.notes.map(note => note.key)])]),
    [['Writings', ['draft'], [['Collisions', ['trap']]]]]);
  assert.deepEqual((await tools.call('vault_list', { label: 'writings' })).notes.map(note => note.key), ['draft', 'trap']);
  assert.deepEqual((await tools.call('vault_list', { sublabel: 'Collisions' })).notes.map(note => note.key), ['trap']);

  await assert.rejects(tools.call('vault_save', { key: 'Not A Slug', body: 'x' }), /lowercase letters and digits/);
  await assert.rejects(tools.call('vault_save', { key: 'no-body' }), /A new note needs a body/);
  await assert.rejects(tools.call('vault_save', { key: 'sub', body: 'x', sublabel: 'Alone' }), /A sublabel sits inside a label/);
  await assert.rejects(tools.call('vault_save', { key: 'pic', body: '![x](media:a)', media: [{ id: 'a', path: '/photos/missing.png' }] }), /No file at/);
  await assert.rejects(tools.call('vault_save', { key: 'odd', body: '![x](media:a)', media: [{ id: 'a', path: '/photos/a.exe' }] }), /not a kind of file a note can hold/);
  await assert.rejects(tools.call('vault_read', { key: 'missing' }), /No note uses "missing"/);
  await assert.rejects(tools.call('vault_set_visibility', { key: 'trap', to: 'everyone' }), /Visibility is one of/);
  await assert.rejects(tools.call('vault_publish_everything'), /There is no tool named/);
});

test('the server speaks the protocol: it lists the tools, answers calls, and reports a refusal as a result', async () => {
  const { tools } = toolsOf();
  const handle = createServer({ tools, list: TOOLS });
  const ask = (method, params, id = 1) => handle({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

  const hello = await ask('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.deepEqual([hello.result.protocolVersion, hello.result.capabilities, hello.result.serverInfo.name], ['2025-03-26', { tools: {} }, 'ohm-vault']);
  assert.equal((await ask('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18');
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
  assert.deepEqual((await ask('ping')).result, {});

  const listed = (await ask('tools/list')).result.tools;
  assert.deepEqual(listed.map(tool => tool.name),
    ['vault_tree', 'vault_list', 'vault_read', 'vault_search', 'vault_save', 'vault_set_visibility', 'vault_delete']);
  for (const tool of listed) assert.equal(tool.inputSchema.type, 'object');
  // Only the tools that read are marked as changing nothing.
  assert.deepEqual(listed.filter(tool => tool.annotations?.readOnlyHint).map(tool => tool.name), ['vault_tree', 'vault_list', 'vault_read', 'vault_search']);

  const saved = await ask('tools/call', { name: 'vault_save', arguments: { key: 'hello', body: 'A first note.' } });
  assert.equal(JSON.parse(saved.result.content[0].text).visibility, 'private');
  const refused = await ask('tools/call', { name: 'vault_read', arguments: { key: 'missing' } });
  assert.deepEqual([refused.result.isError, refused.result.content[0].text], [true, 'No note uses "missing".']);
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
