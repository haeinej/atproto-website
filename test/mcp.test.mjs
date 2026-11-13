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
  // What the person has published, as their own PDS lists it: a type of their own from before the
  // shared one. A test changes `published` to change what is there.
  const published = [['hello-world', { $type: 'com.example.post', body: 'Published long ago.', publishedAt: '2024-05-01T00:00:00.000Z', title: 'Hello, world', author: 'E. Example' }]];
  const get = async url => {
    const address = new URL(url);
    if (address.pathname === '/xrpc/com.atproto.repo.describeRepo') return Response.json({ collections: ['com.example.post', 'app.bsky.feed.post'] });
    if (address.pathname === '/xrpc/com.atproto.repo.listRecords' && address.searchParams.get('collection') === 'com.example.post') {
      return Response.json({ records: published.map(([key, value]) => ({ uri: `at://${did}/com.example.post/${key}`, value })) });
    }
    // The person's repository, as far as the shared post type goes: what publishing writes to.
    if (address.pathname === '/xrpc/com.atproto.repo.listRecords' && address.searchParams.get('collection') === 'com.ohmmmm.post') {
      return Response.json({ records: [...repository].map(([key, value]) => ({ uri: `at://${did}/com.ohmmmm.post/${key}`, value })) });
    }
    // A picture on some other website, which a post places by its address.
    if (address.origin === 'https://photos.example.test') return new Response(new Uint8Array([137, 80, 78, 71, 1, 2, 3]), { headers: { 'Content-Type': 'image/png' } });
    return Response.json({ records: [] });
  };
  const repository = new Map();
  const uploads = [];
  const service = createService({ whoIs: Object.assign(async () => did, { pdsFor: async () => 'https://pds.example.test' }), get });
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
  // The same six calls the tools make through scripts/vault-client.mjs.
  const vault = {
    tree: () => ask('getTree'), search: query => ask('searchPosts', { query }), get: id => ask('getPost', { query: { id } }),
    put: (post, replaces) => ask('putPost', { body: { post, ...(replaces ? { replaces } : {}) } }), remove: (id, replaces) => ask('deletePost', { body: { id, replaces } }),
    mirror: ({ apply = false } = {}) => ask('importPublished', { body: { apply } }),
    publishPlan: ({ prepare = false } = {}) => ask('getPublishPlan', prepare ? { query: { prepare: '1' } } : {}),
    async attachment(id, attachment) {
      asked.push('getAttachment');
      const url = new URL('https://vault.example.test/xrpc/com.ohmmmm.vault.getAttachment');
      url.search = new URLSearchParams({ id, attachment });
      const response = await service(new Request(url, { headers: { Authorization: 'Bearer stand-in' } }), env);
      if (!response.ok) throw Object.assign(new Error((await response.json()).message), { code: 'FileUnreachable' });
      return { bytes: new Uint8Array(await response.arrayBuffer()), mime: response.headers.get('Content-Type') };
    },
    // The person's own PDS, written to as the person: a file sent, and a batch of changes made.
    repository: did,
    async upload(bytes, mime) {
      uploads.push({ size: bytes.length, mime });
      return { $type: 'blob', ref: { $link: `bafkreitest${uploads.length}` }, mimeType: mime, size: bytes.length };
    },
    async apply(writes) {
      for (const write of writes) {
        assert.equal(write.collection, 'com.ohmmmm.post', 'publishing writes only the shared post type');
        if (write.$type.endsWith('#delete')) repository.delete(write.rkey); else repository.set(write.rkey, write.value);
      }
    },
  };
  return { tools: createTools({ vault }), vault, asked, published, repository, uploads };
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

test('an agent brings in what the person has published: it looks first, and brings in only on the second call', async () => {
  const { tools, published } = await toolsOf();
  const looked = await tools.call('vault_mirror');
  assert.equal(looked.done, false);
  assert.deepEqual([looked.willHappen.types, looked.willHappen.records, looked.willHappen.posts], [['com.example.post', 'com.ohmmmm.post'], 1, 1]);
  assert.match(looked.willHappen.note, /Nothing is published/);
  // Looking brought nothing in.
  assert.equal((await tools.call('vault_tree')).posts, 0);
  await assert.rejects(tools.call('vault_mirror', { confirm: 'c0000000000000000' }), /has changed since it was shown/);

  const done = await tools.call('vault_mirror', { confirm: looked.confirm });
  assert.deepEqual([done.done, done.broughtIn, done.alreadyThere], [true, ['hello-world'], 0]);
  assert.match(done.next, /under "other"/);
  // It came in as it was published: for everyone, with no label, so it wants filing.
  const tree = await tools.call('vault_tree');
  assert.deepEqual(tree.labels.map(folder => [folder.label, folder.posts.map(post => [post.slug, post.visibility])]), [['other', [['hello-world', 'public']]]]);
  const read = await tools.call('vault_read', { key: 'hello-world' });
  assert.deepEqual([read.title, read.body, read.site], ['Hello, world', 'Published long ago.', { $type: 'com.example.postSite', author: 'E. Example' }]);

  // A second mirror finds it already there. A post the person has changed here since is left alone.
  const again = await tools.call('vault_mirror');
  assert.deepEqual((await tools.call('vault_mirror', { confirm: again.confirm })).alreadyThere, 1);
  const filed = await tools.call('vault_save', { key: 'hello-world', version: read.version, label: 'Writings' });
  await tools.call('vault_save', { key: 'hello-world', version: read.version, label: 'Writings', confirm: filed.confirm });
  const third = await tools.call('vault_mirror');
  const kept = await tools.call('vault_mirror', { confirm: third.confirm });
  assert.deepEqual([kept.broughtIn, kept.leftAloneBecauseChangedInTheVault], [[], ['hello-world']]);
  assert.equal((await tools.call('vault_read', { key: 'hello-world' })).label, 'Writings');

  // What was shown stands for what was there: if the PDS has more by the second call, it is shown again.
  const before = await tools.call('vault_mirror');
  published.push(['second', { $type: 'com.example.post', body: 'Newer.', publishedAt: '2025-01-01T00:00:00.000Z' }]);
  await assert.rejects(tools.call('vault_mirror', { confirm: before.confirm }), /has changed since it was shown/);
});

test('an agent publishes: it shows what would change first, and the repository changes only on the second call', async () => {
  const { tools, repository, uploads } = await toolsOf();
  const confirmed = async (name, args) => tools.call(name, { ...args, confirm: (await tools.call(name, args)).confirm });
  const made = await tools.call('vault_save', { key: 'the-hill', title: 'The hill', label: 'Photographs', date: '2026-02-01', body: 'Up early.\n\n![The hill at dawn](https://photos.example.test/hill.png)' });
  await tools.call('vault_save', { key: 'mine', body: 'Only for me.' });
  // A record something else published, which the vault knows nothing about.
  repository.set('from-elsewhere', { $type: 'com.ohmmmm.post', title: 'From elsewhere', body: 'x', publishedAt: '2025-01-01T00:00:00.000Z' });

  // Nothing is for everyone yet, so there is nothing to publish.
  assert.deepEqual([(await tools.call('vault_status')).changes, (await tools.call('vault_publish')).nothingToPublish], [0, true]);
  await confirmed('vault_set_visibility', { key: 'the-hill', to: 'public' });
  // Marking it for everyone published nothing.
  assert.equal(repository.size, 1);
  const status = await tools.call('vault_status');
  assert.deepEqual([status.changes, status.create.map(each => each.slug), status.notInVault], [1, ['the-hill'], [{ key: 'from-elsewhere', title: 'From elsewhere' }]]);
  assert.equal(status.writes, undefined);

  const shown = await tools.call('vault_publish');
  assert.deepEqual([shown.done, shown.willHappen.create.map(each => each.address)], [false, ['https://pds.example.test/posts/photographs/the-hill']]);
  assert.match(shown.willHappen.note, /public at once/);
  assert.equal(repository.size, 1);
  await assert.rejects(tools.call('vault_publish', { confirm: 'c0000000000000000' }), /has changed since it was shown/);
  const done = await tools.call('vault_publish', { confirm: shown.confirm });
  assert.deepEqual([done.done, done.published], [true, { created: 1, replaced: 0, removed: 0, files: 1 }]);
  // The record is under the post's ID, and carries a copy of the picture with where it came from.
  const record = repository.get(made.id);
  assert.deepEqual([record.$type, record.slug, record.title, record.form], ['com.ohmmmm.post', 'the-hill', 'The hill', 'writing']);
  assert.match(record.body, /!\[The hill at dawn\]\(media:hill\)/);
  assert.deepEqual(record.media, [{ $type: 'com.ohmmmm.post#image', id: 'hill', file: { $type: 'blob', ref: { $link: 'bafkreitest1' }, mimeType: 'image/png', size: 7 }, sourceUrl: 'https://photos.example.test/hill.png', alt: 'The hill at dawn' }]);
  assert.deepEqual(uploads, [{ size: 7, mime: 'image/png' }]);
  // What something else published is still there, and the private post never left the vault.
  assert.deepEqual([...repository.keys()].sort(), [made.id, 'from-elsewhere'].sort());
  assert.deepEqual([(await tools.call('vault_status')).changes, (await tools.call('vault_status')).unchanged], [0, 1]);

  // An edit is in the vault only, until it is published.
  const read = await tools.call('vault_read', { key: 'the-hill' });
  await confirmed('vault_save', { key: 'the-hill', version: read.version, title: 'The hill, again' });
  assert.equal(repository.get(made.id).title, 'The hill');
  assert.deepEqual((await tools.call('vault_status')).replace, [{ id: made.id, slug: 'the-hill', title: 'The hill, again', changes: ['title'] }]);
  // A yes to one list is not a yes to another: the vault changed after this was shown.
  const stale = await tools.call('vault_publish');
  const again = await tools.call('vault_read', { key: 'the-hill' });
  await confirmed('vault_save', { key: 'the-hill', version: again.version, subtitle: 'At dawn' });
  await assert.rejects(tools.call('vault_publish', { confirm: stale.confirm }), /has changed since it was shown/);
  assert.deepEqual((await confirmed('vault_publish', {})).published, { created: 0, replaced: 1, removed: 0, files: 1 });
  assert.deepEqual([repository.get(made.id).title, repository.get(made.id).subtitle], ['The hill, again', 'At dawn']);

  // Making it private again takes it down, on publish and not before.
  await confirmed('vault_set_visibility', { key: 'the-hill', to: 'private' });
  assert.ok(repository.has(made.id));
  const down = await tools.call('vault_publish');
  assert.deepEqual(down.willHappen.remove.map(each => [each.slug, each.why]), [['the-hill', 'It is now only for you.']]);
  assert.deepEqual((await tools.call('vault_publish', { confirm: down.confirm })).published, { created: 0, replaced: 0, removed: 1, files: 0 });
  assert.deepEqual([...repository.keys()], ['from-elsewhere']);
});

test('each tool names real API requests, and vault tools ask only for what they declare', async () => {
  const { tools, asked } = await toolsOf();
  const made = await tools.call('vault_save', { key: 'hello', body: 'A first post.' });
  const calls = {
    vault_tree: [{}], vault_list: [{}], vault_read: [{ key: 'hello' }], vault_search: [{ query: 'first' }],
    vault_save: [{ key: 'hello', version: made.version, body: 'A first post, again.' }, { key: 'another', body: 'x' }],
    vault_set_visibility: [{ key: 'hello', to: 'friends' }],
    vault_status: [{}],
    vault_publish: [{}],
    vault_mirror: [{}],
    vault_delete: [{ key: 'another' }],
  };
  for (const tool of TOOLS) {
    // Every request a tool names is one the service has, and reading tools name none that change anything.
    const request = name => REQUESTS[name.includes('.') ? name : `com.ohmmmm.vault.${name}`];
    for (const name of tool.requests) assert.ok(request(name), `${tool.name} names ${name}`);
    if (tool.annotations?.readOnlyHint) assert.deepEqual(tool.requests.filter(name => request(name).changes), [], tool.name);
    // Cortex behavior is exercised against the service in cortex-mcp.test.mjs.
    if (!tool.name.startsWith('vault_')) continue;
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
  assert.deepEqual(listed.filter(tool => tool.name.startsWith('vault_')).map(tool => tool.name),
    ['vault_tree', 'vault_list', 'vault_read', 'vault_search', 'vault_save', 'vault_set_visibility', 'vault_status', 'vault_publish', 'vault_mirror', 'vault_delete']);
  assert.deepEqual(listed.filter(tool => tool.name.startsWith('cortex_')).map(tool => tool.name).sort(),
    ['cortex_start', 'cortex_note', 'cortex_settle', 'cortex_recall', 'cortex_remember', 'cortex_forget', 'cortex_skill', 'cortex_propose_skill', 'cortex_propose_tool'].sort());
  assert.equal(listed.length, 19);
  // An agent is told a tool's name, what it does and what it takes, and nothing else.
  for (const tool of listed) assert.deepEqual([tool.inputSchema.type, Object.keys(tool).filter(key => !['name', 'description', 'inputSchema', 'annotations'].includes(key))], ['object', []]);
  // Only the tools that read are marked as changing nothing.
  assert.deepEqual(listed.filter(tool => tool.name.startsWith('vault_') && tool.annotations?.readOnlyHint).map(tool => tool.name), ['vault_tree', 'vault_list', 'vault_read', 'vault_search', 'vault_status']);

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
  assert.equal(lines[1].result.tools.length, 19);
  assert.match(lines[0].result.instructions, /cortex_start/);
  assert.match(lines[0].result.instructions, /Saving never publishes/);
  assert.equal(lines[2].result.isError, true);
  assert.match(lines[2].result.content[0].text, /No site configuration here/);
});
