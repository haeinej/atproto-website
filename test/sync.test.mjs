import assert from 'node:assert/strict';
import test from 'node:test';
import { postStore } from '../service/src/store.mjs';
import { filePost, postFile, setProperty } from '../vault/file.mjs';
import { syncFolder } from '../vault/sync.mjs';
import { testDatabase } from './d1.mjs';

const me = 'did:web:pds.example.test';

// A member's folder, held in memory: files by path, and what sync remembers between runs.
function memoryFolder(files = {}) {
  const held = new Map(Object.entries(files));
  let remembered = null;
  return {
    held,
    list: async () => [...held].filter(([path]) => !path.startsWith('.ohm/')).map(([path, text]) => ({ path, text })),
    write: async (path, text) => { held.set(path, text); },
    remove: async path => { held.delete(path); },
    state: async () => remembered,
    keep: async state => { remembered = structuredClone(state); },
  };
}
// Ohm's working copy, reached the way a connector reaches it.
async function workingCopy(db) {
  const store = postStore(db ?? await testDatabase());
  return {
    store,
    list: async () => (await store.list(me, { since: '0' })).posts,
    get: id => store.read(me, id),
    put: (post, replaces) => store.write(me, post, { replaces }),
    remove: (id, replaces) => store.remove(me, id, { replaces }),
  };
}
const note = (title, extra = '') => `---\ntitle: ${title}\n${extra}---\n\nWords about ${title}.\n`;
let clock = Date.parse('2026-11-12T00:00:00Z');
const run = (folder, vault, more = {}) => syncFolder({ folder, vault, apply: true, now: () => (clock += 1000), ...more });

test('a folder and the working copy are brought into line in both directions, and syncing never publishes', async () => {
  const folder = memoryFolder({
    'Writings/Collisions/Trap of Independency.md': note('Trap', 'visibility: public\n'),
    'loose thought.md': 'Rain makes a city honest.\n',
    '.obsidian/app.json': '{}',
    'Writings/cover.jpg': 'not a post',
  });
  const vault = await workingCopy();
  // Looking first changes nothing anywhere.
  const before = structuredClone([...folder.held]);
  const looked = await syncFolder({ folder, vault });
  assert.deepEqual([looked.toOhm.length, looked.applied, [...folder.held], (await vault.list()).length], [2, false, before, 0]);

  const first = await run(folder, vault);
  assert.deepEqual([first.toOhm.map(each => each.slug).sort(), first.toFolder, first.conflicts, first.ask, first.problems],
    [['loose-thought', 'trap-of-independency'], [], [], [], []]);
  // Each new file was given its ID, written into the file, and every other line was left as it was.
  const trapFile = folder.held.get('Writings/Collisions/Trap of Independency.md');
  const id = filePost('Writings/Collisions/Trap of Independency.md', trapFile).post.id;
  assert.equal(trapFile, note('Trap', `visibility: public\nid: ${id}\n`));
  // Marked public in its file, it is public in the working copy and nowhere else: nothing here publishes.
  assert.deepEqual((await vault.get(id)).post, { id, slug: 'trap-of-independency', label: 'Writings', sublabel: 'Collisions', visibility: 'public', title: 'Trap', body: 'Words about Trap.', properties: {} });
  // What is not a post stays where it is and is never sent.
  assert.deepEqual([folder.held.get('.obsidian/app.json'), folder.held.get('Writings/cover.jpg'), (await vault.list()).length], ['{}', 'not a post', 2]);

  // Nothing changed: a second sync does nothing.
  const again = await run(folder, vault);
  assert.deepEqual([again.same, again.toOhm, again.toFolder], [2, [], []]);

  // Edited in ohm, it reaches the folder. Edited in the folder, it reaches ohm.
  const held = await vault.get(id);
  await vault.put({ ...held.post, title: 'Trap of independency', body: 'Edited in the editor, with [[A Link]].' }, held.version);
  const pulled = await run(folder, vault);
  assert.deepEqual(pulled.toFolder.map(each => each.slug), ['trap-of-independency']);
  assert.match(folder.held.get('Writings/Collisions/trap-of-independency.md'), /title: Trap of independency[\s\S]*Edited in the editor, with \[\[A Link\]\]\./);
  assert.equal(folder.held.has('Writings/Collisions/Trap of Independency.md'), false);
  folder.held.set('Writings/Collisions/trap-of-independency.md', folder.held.get('Writings/Collisions/trap-of-independency.md').replace('Edited in the editor', 'Edited in Obsidian'));
  const pushed = await run(folder, vault);
  assert.deepEqual(pushed.toOhm.map(each => each.slug), ['trap-of-independency']);
  assert.equal((await vault.get(id)).post.body, 'Edited in Obsidian, with [[A Link]].');
});

test('a file laid out differently is the same post, and a file moved or renamed is still that post', async () => {
  const folder = memoryFolder({ 'Writings/first.md': note('First', 'tags: [a, b]\n') });
  const vault = await workingCopy();
  await run(folder, vault);
  const id = filePost('Writings/first.md', folder.held.get('Writings/first.md')).post.id;
  const version = (await vault.get(id)).version;

  // Reordered, commented and spaced out by hand. It says the same thing, so nothing is sent.
  folder.held.set('Writings/first.md', `---\n# my own note to self\nid: ${id}\ntags:\n  - a\n  - b\ntitle:   First\n---\n\n\nWords about First.\n\n\n`);
  const same = await run(folder, vault);
  assert.deepEqual([same.same, same.toOhm, same.toFolder], [1, [], []]);
  assert.match(folder.held.get('Writings/first.md'), /# my own note to self/);

  // Moved to another folder and renamed, as someone does in Obsidian. Same post, new label and slug.
  folder.held.set('Essays/2026/A Better Name.md', folder.held.get('Writings/first.md'));
  folder.held.delete('Writings/first.md');
  const moved = await run(folder, vault);
  assert.deepEqual(moved.toOhm.map(each => [each.id, each.slug]), [[id, 'a-better-name']]);
  const after = await vault.get(id);
  assert.deepEqual([after.post.label, after.post.sublabel, after.post.slug, after.version !== version, (await vault.list()).length], ['Essays', '2026', 'a-better-name', true, 1]);
});

test('a post changed in both places is not overwritten on either side until the member says which stands', async () => {
  const folder = memoryFolder({ 'a.md': note('A') });
  const vault = await workingCopy();
  await run(folder, vault);
  const id = filePost('a.md', folder.held.get('a.md')).post.id;
  const held = await vault.get(id);
  await vault.put({ ...held.post, body: 'Changed in ohm.' }, held.version);
  const mine = folder.held.get('a.md').replace('Words about A.', 'Changed in my folder.');
  folder.held.set('a.md', mine);

  const stuck = await run(folder, vault);
  assert.deepEqual([stuck.conflicts.map(each => [each.id, each.path, each.beside]), stuck.toOhm, stuck.toFolder], [[[id, 'a.md', 'a.md.from-ohm']], [], []]);
  // Both are exactly as they were, and ohm's version sits beside the file to be compared.
  assert.equal(folder.held.get('a.md'), mine);
  assert.equal((await vault.get(id)).post.body, 'Changed in ohm.');
  assert.match(folder.held.get('a.md.from-ohm'), /Changed in ohm\./);
  // It stays stuck, and stays safe, however many times sync is run.
  assert.equal((await run(folder, vault)).conflicts.length, 1);

  // The member chooses the folder's.
  const settled = await run(folder, vault, { take: { [id]: 'folder' } });
  assert.deepEqual([settled.conflicts, settled.toOhm.map(each => each.id)], [[], [id]]);
  assert.equal((await vault.get(id)).post.body, 'Changed in my folder.');
  assert.equal(folder.held.has('a.md.from-ohm'), false);
  // Or, another time, ohm's.
  const now = await vault.get(id);
  await vault.put({ ...now.post, body: 'Changed in ohm again.' }, now.version);
  folder.held.set('a.md', folder.held.get('a.md').replace('Changed in my folder.', 'And in my folder again.'));
  await run(folder, vault, { take: { [id]: 'ohm' } });
  assert.match(folder.held.get('a.md'), /Changed in ohm again\./);
});

test('a refused ohm resolution preserves its comparison copy and baseline until a rename collision is cleared', async () => {
  const folder = memoryFolder({ 'a.md': note('A') });
  const vault = await workingCopy();
  await run(folder, vault);
  const id = filePost('a.md', folder.held.get('a.md')).post.id;
  const held = await vault.get(id);
  const changed = await vault.put({ ...held.post, slug: 'renamed', body: 'Changed in ohm.' }, held.version);
  folder.held.set('a.md', folder.held.get('a.md').replace('Words about A.', 'Changed in my folder.'));
  folder.held.set('renamed.md', '---\ntitle: |\n  Unrelated draft\n---\n\nKeep this file.');
  await run(folder, vault);
  assert.match(folder.held.get('a.md.from-ohm'), /Changed in ohm/);
  const before = [...folder.held], baseline = structuredClone(await folder.state());
  const refused = await run(folder, vault, { take: { [id]: 'ohm' } });
  assert.ok(refused.problems.some(each => each.problems.some(text => text.includes('occupied'))));
  assert.deepEqual(refused.toFolder, []);
  assert.deepEqual([...folder.held], before);
  assert.deepEqual(await folder.state(), baseline);
  assert.equal((await vault.get(id)).version, changed.version);

  folder.held.delete('renamed.md');
  const settled = await run(folder, vault, { take: { [id]: 'ohm' } });
  assert.deepEqual([settled.conflicts, settled.problems], [[], []]);
  assert.match(folder.held.get('renamed.md'), /Changed in ohm/);
  assert.equal(folder.held.has('a.md'), false);
  assert.equal(folder.held.has('a.md.from-ohm'), false);
  assert.deepEqual((await folder.state())[id], { version: changed.version, path: 'renamed.md' });
  assert.equal((await run(folder, vault)).same, 1);
});

test('a failed folder resolution keeps the comparison copy for a successful retry', async () => {
  const folder = memoryFolder({ 'a.md': note('A') });
  const vault = await workingCopy();
  await run(folder, vault);
  const id = filePost('a.md', folder.held.get('a.md')).post.id;
  const held = await vault.get(id);
  await vault.put({ ...held.post, body: 'Changed in ohm.' }, held.version);
  folder.held.set('a.md', folder.held.get('a.md').replace('Words about A.', 'Changed in my folder.'));
  await run(folder, vault);
  const before = [...folder.held], baseline = structuredClone(await folder.state());
  const refused = await run(folder, { ...vault, put: async () => { throw Error('Version changed before save'); } }, { take: { [id]: 'folder' } });
  assert.match(refused.problems[0].problems.join(' '), /Version changed/);
  assert.deepEqual(refused.toOhm, []);
  assert.deepEqual([...folder.held], before);
  assert.deepEqual(await folder.state(), baseline);

  const settled = await run(folder, vault, { take: { [id]: 'folder' } });
  assert.deepEqual([settled.conflicts, settled.problems], [[], []]);
  assert.equal((await vault.get(id)).post.body, 'Changed in my folder.');
  assert.equal(folder.held.has('a.md.from-ohm'), false);
});

test('settling one post does not authorize cleanup of another post or an unowned comparison file', async () => {
  const folder = memoryFolder({ 'a.md': note('A') });
  const vault = await workingCopy();
  await run(folder, vault);
  for (const text of [setProperty(note('An older post'), 'id', '3bbbbbbbbbbbb'), 'Unrecognized comparison text.']) {
    folder.held.set('a.md.from-ohm', text);
    assert.equal((await run(folder, vault)).same, 1);
    assert.equal(folder.held.get('a.md.from-ohm'), text);
  }
});

test('a missing file is never taken as an instruction to remove a post, nor a removed post to remove a file', async () => {
  const folder = memoryFolder({ 'keep.md': note('Keep'), 'gone-here.md': note('Gone here'), 'gone-there.md': note('Gone there') });
  const vault = await workingCopy();
  await run(folder, vault);
  const idOf = path => filePost(path, folder.held.get(path)).post.id;
  const [here, there] = [idOf('gone-here.md'), idOf('gone-there.md')];
  folder.held.delete('gone-here.md');
  await vault.remove(there, (await vault.get(there)).version);

  const asked = await run(folder, vault);
  assert.deepEqual(asked.ask.map(each => [each.id, each.question]).sort(), [
    [here, 'This post\'s file is gone from your folder. Remove the post from ohm too?'],
    [there, 'This post was removed in ohm. Remove its file too?'],
  ].sort());
  // Nothing was removed on either side.
  assert.equal((await vault.get(here)).post.title, 'Gone here');
  assert.ok(folder.held.has('gone-there.md'));
  assert.deepEqual([asked.toOhm, asked.toFolder], [[], []]);

  // Only when the member says so.
  const done = await run(folder, vault, { take: { [here]: 'remove', [there]: 'remove' } });
  assert.deepEqual([done.toOhm, done.toFolder.map(each => [each.id, each.removed])], [[{ id: here, path: 'gone-here.md', removed: true }], [[there, true]]]);
  await assert.rejects(vault.get(here), problem => problem.code === 'NotFound');
  assert.equal(folder.held.has('gone-there.md'), false);
  assert.deepEqual((await run(folder, vault)).ask, []);

  // A file edited after its post was removed in ohm is the member's writing: it goes back in.
  const keep = idOf('keep.md');
  await vault.remove(keep, (await vault.get(keep)).version);
  folder.held.set('keep.md', folder.held.get('keep.md').replace('Words about Keep.', 'Still writing this.'));
  assert.deepEqual((await run(folder, vault)).toOhm.map(each => each.id), [keep]);
  assert.equal((await vault.get(keep)).post.body, 'Still writing this.');
});

test('deleting ohm\'s copy loses nothing: the folder brings every post back, and an empty folder is filled from ohm', async () => {
  const folder = memoryFolder({
    'Journal/a private thought.md': note('A private thought'),
    'Journal/for friends.md': note('For friends', 'visibility: friends\n'),
    'Writings/published.md': note('Published', 'visibility: public\n'),
  });
  const vault = await workingCopy();
  await run(folder, vault);
  const before = (await vault.store.list(me)).posts.map(each => [each.id, each.version, each.slug, each.visibility]).sort();
  assert.equal(before.length, 3);

  // Ohm's copy is gone entirely: a new, empty working copy. The folder still remembers the last sync.
  const empty = await workingCopy();
  const back = await run(folder, empty);
  assert.deepEqual([back.toOhm.length, back.ask, back.conflicts, back.problems], [3, [], [], []]);
  assert.deepEqual((await empty.store.list(me)).posts.map(each => [each.id, each.version, each.slug, each.visibility]).sort(), before);

  // The other way round, which is also what Export is: a new, empty folder is filled from ohm.
  const fresh = memoryFolder();
  const out = await run(fresh, empty);
  assert.deepEqual([out.toFolder.length, out.toOhm], [3, []]);
  assert.deepEqual([...fresh.held.keys()].sort(), ['Journal/a-private-thought.md', 'Journal/for-friends.md', 'Writings/published.md']);
  // Every file written out reads back as the post it came from.
  for (const [path, text] of fresh.held) {
    const { post, problems } = filePost(path, text);
    assert.deepEqual([problems, (await empty.get(post.id)).post, postFile(post).text], [[], post, text]);
  }
  assert.deepEqual((await run(fresh, empty)).same, 3);
});

test('a file that cannot be a post is said so and left alone, and a stopped sync can be run again', async () => {
  const folder = memoryFolder({
    '글/서울.md': '서울에 대하여.',
    'a/b/c/too-deep.md': note('Too deep'),
    'Writings/one.md': note('One'),
    'Writings/copy of one.md': note('One, copied'),
    'Other/one.md': note('Another one'),
  });
  const vault = await workingCopy();
  const first = await run(folder, vault);
  const said = Object.fromEntries(first.problems.map(each => [each.path, each.problems.join(' ')]));
  assert.match(said['글/서울.md'], /does not make a slug/);
  assert.match(said['a/b/c/too-deep.md'], /at most two folders deep/);
  // Two files that would be the same slug: the first is taken and the second is refused by ohm, by name.
  assert.equal(Object.values(said).filter(text => /Another post already has the slug "one"/.test(text)).length, 1);
  assert.equal((await vault.list()).length, 2);
  assert.equal(folder.held.get('글/서울.md'), '서울에 대하여.');

  // A copied file carries the same id as the one it was copied from.
  const withId = folder.held.get('Writings/copy of one.md');
  folder.held.set('Writings/another copy.md', withId);
  assert.match((await run(folder, vault)).problems.map(each => each.problems.join(' ')).join(' | '), /carries the same id as/);

  // A sync that stopped after writing a file's ID, before the post reached ohm, makes one post when run again.
  const half = memoryFolder({ 'new.md': setProperty(note('New'), 'id', '3lf2abcdefg22') });
  const other = await workingCopy();
  await run(half, other);
  await run(half, other);
  assert.deepEqual((await other.list()).map(each => each.id), ['3lf2abcdefg22']);
});

test('the sync command, a real folder, and the service over the network with real tokens', async () => {
  const { execFile } = await import('node:child_process');
  const { createServer } = await import('node:http');
  const { mkdir, mkdtemp, readFile, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { promisify } = await import('node:util');
  const { secp256k1 } = await import('../service/node_modules/@noble/curves/secp256k1.js');
  const { createIdentity } = await import('../service/src/identity.mjs');
  const { createService } = await import('../service/src/worker.mjs');

  const did = 'did:web:pds.example.test';
  const audience = 'did:web:vault.ohmmmm.test';
  const secret = secp256k1.utils.randomPrivateKey();
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const byte of [0xe7, 0x01, ...secp256k1.getPublicKey(secret, true)]) value = value * 256n + BigInt(byte);
  let key = '';
  for (; value > 0n; value /= 58n) key = ALPHABET[Number(value % 58n)] + key;
  const document = { id: did, verificationMethod: [{ id: `${did}#atproto`, type: 'Multikey', controller: did, publicKeyMultibase: `z${key}` }] };
  const encode = each => Buffer.from(JSON.stringify(each)).toString('base64url');
  const listen = handler => new Promise(resolve => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
  const body = async request => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return Buffer.concat(chunks);
  };

  // The member's PDS: it signs them in, and issues a token for one request to one service.
  const issued = [];
  const pds = await listen(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const answer = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
    if (url.pathname.endsWith('createSession')) return answer(200, { did: JSON.parse(await body(request)).identifier, accessJwt: 'session-1' });
    if (url.pathname.endsWith('getServiceAuth') && request.headers.authorization === 'Bearer session-1') {
      issued.push(url.searchParams.get('lxm'));
      const signed = `${encode({ typ: 'JWT', alg: 'ES256K' })}.${encode({ iss: did, aud: url.searchParams.get('aud'), lxm: url.searchParams.get('lxm'), exp: Number(url.searchParams.get('exp')) })}`;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signed)));
      return answer(200, { token: `${signed}.${Buffer.from(secp256k1.sign(digest, secret, { lowS: true }).toCompactRawBytes()).toString('base64url')}` });
    }
    answer(401, { error: 'AuthRequired' });
  });
  // The vault service, with its real check on who is asking.
  const env = { DB: await testDatabase() };
  const service = createService({ whoIs: createIdentity({ audience, members: did, get: async () => Response.json(document) }) });
  const vault = await listen(async (request, response) => {
    const sent = await body(request);
    const answered = await service(new Request(new URL(request.url, 'http://127.0.0.1'), {
      method: request.method, headers: request.headers, ...(sent.length ? { body: sent } : {}),
    }), env);
    response.writeHead(answered.status, Object.fromEntries(answered.headers));
    response.end(Buffer.from(await answered.arrayBuffer()));
  });

  const root = await mkdtemp(join(tmpdir(), 'vault-sync-'));
  try {
    const folder = join(root, 'My Vault');
    await mkdir(join(folder, 'Writings', 'Collisions'), { recursive: true });
    await mkdir(join(folder, '.obsidian'));
    await writeFile(join(folder, 'Writings', 'Collisions', 'Trap of Independency.md'), note('Trap', 'visibility: public\n'));
    await writeFile(join(folder, 'loose thought.md'), '서울에 대하여, with [[A Link]].\n');
    await writeFile(join(folder, '.obsidian', 'app.json'), '{}');
    await writeFile(join(root, 'site.jsonc'), JSON.stringify({ vars: { ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: `http://127.0.0.1:${pds.address().port}`, SITE_ORIGIN: 'https://example.test' } }));
    const sync = (...options) => promisify(execFile)(process.execPath, [
      new URL('../scripts/sync.mjs', import.meta.url).pathname, '--config', join(root, 'site.jsonc'), '--folder', folder,
      '--vault', `http://127.0.0.1:${vault.address().port}`, '--vault-did', audience, ...options,
    ], { env: { ...process.env, ATPROTO_APP_PASSWORD: 'app-password' } }).then(({ stdout }) => JSON.parse(stdout), error => error.stderr.trim());

    // Looking changes nothing, in the folder or in ohm.
    const looked = await sync();
    assert.deepEqual([looked.toOhm.length, looked.applied, typeof looked.note], [2, false, 'string']);
    assert.equal(await readFile(join(folder, 'loose thought.md'), 'utf8'), '서울에 대하여, with [[A Link]].\n');
    const store = postStore(env.DB);
    assert.equal((await store.list(did)).posts.length, 0);

    const first = await sync('--apply');
    assert.deepEqual([first.toOhm.map(each => each.slug).sort(), first.problems], [['loose-thought', 'trap-of-independency'], []]);
    const posts = (await store.list(did)).posts;
    assert.deepEqual(posts.map(each => [each.slug, each.label, each.visibility]).sort(), [['loose-thought', '', 'private'], ['trap-of-independency', 'Writings', 'public']]);
    // The file gained its ID and kept everything else, in any script.
    const loose = posts.find(each => each.slug === 'loose-thought');
    assert.equal(await readFile(join(folder, 'loose thought.md'), 'utf8'), `---\nid: ${loose.id}\n---\n\n서울에 대하여, with [[A Link]].\n`);
    assert.deepEqual((await sync('--apply')).same, 2);

    // Edited in ohm, it comes back to the folder; what sync remembers lives in the folder too.
    const held = await store.read(did, loose.id);
    await store.write(did, { ...held.post, title: 'Seoul', label: 'Journal' }, { replaces: held.version });
    const pulled = await sync('--apply');
    assert.deepEqual(pulled.toFolder.map(each => [each.path, each.from]), [['Journal/loose-thought.md', 'loose thought.md']]);
    assert.match(await readFile(join(folder, 'Journal', 'loose-thought.md'), 'utf8'), /^---\ntitle: Seoul\nvisibility: private\nid: /);
    assert.deepEqual(Object.keys(JSON.parse(await readFile(join(folder, '.ohm', 'sync.json'), 'utf8'))).sort(), posts.map(each => each.id).sort());
    assert.equal(await readFile(join(folder, '.obsidian', 'app.json'), 'utf8'), '{}');
    // Every request carried a token issued for that request and no other.
    assert.deepEqual([...new Set(issued)].sort(), ['com.ohmmmm.vault.getPost', 'com.ohmmmm.vault.listPosts', 'com.ohmmmm.vault.putPost']);
    assert.match(await sync('--take', 'nonsense'), /Use --take ID=folder/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await new Promise(resolve => pds.close(resolve));
    await new Promise(resolve => vault.close(resolve));
  }
});
