import assert from 'node:assert/strict';
import test from 'node:test';
import { postFile, postRecord, postVersion } from '../vault/file.mjs';
import { syncFolder } from '../vault/sync.mjs';
import { publishPlan } from '../vault/publish.mjs';
import { adopt, build } from '../scripts/render-engine.mjs';
import { listRecords, recordBySlug } from '../feed/repository.mjs';
import { pdsStore } from '../vault/stores.mjs';
import { createVault } from '../vault/vault.mjs';
import publishCapability from '../service/src/capabilities/publish.mjs';

const did = 'did:web:pds.example.test', origin = 'https://pds.example.test', site = 'https://example.test', collection = 'com.ohmmmm.post';
const id = '3aaaaaaaaaaaa';
const post = { id, slug: 'hello', label: 'Writing', sublabel: '', visibility: 'public', body: 'Words.', date: '2026-01-01', properties: {} };
function folder(files, baseline = {}) {
  const held = new Map(Object.entries(files)); let remembered = structuredClone(baseline);
  return { held, list: async () => [...held].map(([path, text]) => ({ path, text })), state: async () => remembered,
    write: async (path, text) => held.set(path, text), remove: async path => held.delete(path), keep: async state => { remembered = state; } };
}
const vault = (posts, version = 'remote') => ({ list: async () => posts.map(p => ({ id: p.id, version })), get: async key => ({ post: posts.find(p => p.id === key), version }), put: async () => { throw Error('Unexpected vault write'); } });

test('sync preserves invalid originals and the old baseline when a pull collides with them', async () => {
  const broken = '---\ntitle: |\n  My unpublished writing\n---\n\nOriginal.\n';
  for (const baseline of [{}, { [id]: { path: 'Writing/hello.md', version: 'before' } }]) {
    const copy = folder({ 'Writing/hello.md': broken }, baseline);
    const report = await syncFolder({ folder: copy, vault: vault([post]), apply: true });
    assert.ok(report.problems.length); assert.equal(copy.held.get('Writing/hello.md'), broken);
    assert.deepEqual(await copy.state(), baseline); assert.deepEqual(report.toFolder, []);
  }
});

test('both duplicate-ID files are blocked even when the vault changed or deletion was selected', async () => {
  const made = postFile(post), baseline = { [id]: { path: made.path, version: 'before' } };
  const copy = folder({ [made.path]: made.text, 'copy.md': made.text }, baseline);
  const before = [...copy.held];
  const report = await syncFolder({ folder: copy, vault: vault([post]), apply: true, take: { [id]: 'remove' } });
  assert.ok(report.problems.length); assert.deepEqual([...copy.held], before); assert.deepEqual(await copy.state(), baseline);
});

test('a renamed pull never replaces an occupied destination or removes its accepted source', async () => {
  const made = postFile(post), version = await postVersion(post), target = 'Writing/renamed.md';
  const baseline = { [id]: { path: made.path, version } };
  const copy = folder({ [made.path]: made.text, [target]: '---\nunknown: |\n  keep\n---\nOriginal.' }, baseline);
  const before = [...copy.held];
  const report = await syncFolder({ folder: copy, vault: vault([{ ...post, slug: 'renamed' }]), apply: true });
  assert.match(report.problems.at(-1).problems.join(' '), /occupied/);
  assert.deepEqual([...copy.held], before); assert.deepEqual(await copy.state(), baseline);
});

test('two vault posts cannot claim the same new folder path during one sync', async () => {
  const copy = folder({});
  const report = await syncFolder({ folder: copy, vault: vault([post, { ...post, id: '3bbbbbbbbbbbb' }]), apply: true });
  assert.equal(report.toFolder.length, 1); assert.match(report.problems[0].problems.join(' '), /occupied/);
  assert.equal(copy.held.size, 1);
});

test('approved publication detects image-source changes but ignores attachment-ID-only renaming', () => {
  const image = { ...post, body: '![Hill](https://images.test/old/hill.jpg)' };
  const before = postRecord(image, { did, site }).record;
  before.body = '![Hill](media:old-id)';
  before.media = [{ $type: `${collection}#image`, id: 'old-id', sourceUrl: 'https://images.test/old/hill.jpg', alt: 'Hill', file: { ref: { $link: 'cid-image' }, mimeType: 'image/jpeg', size: 3 } }];
  const plan = p => publishPlan({ did, origin, site, posts: [p], published: new Map([[id, before]]) });
  assert.equal(plan(image).unchanged, 1);
  assert.deepEqual(plan({ ...image, body: '![Hill](https://images.test/new/hill.jpg)' }).replace[0].changes, ['attachments']);
  const blob = `${origin}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=cid-image#renamed.jpg`;
  assert.equal(plan({ ...image, body: `![Hill](${blob})` }).unchanged, 1);
  assert.ok(plan({ ...image, body: '![New description](https://images.test/old/hill.jpg)' }).writes.length);
});

test('literal media examples in code remain clean, and edits to their code remain visible', () => {
  const sample = { ...post, body: 'Example: `![Alt](media:old)`\n\n```md\n![Alt](media:old)\n```' };
  const before = postRecord(sample, { did, site }).record;
  const plan = p => publishPlan({ did, origin, site, posts: [p], published: new Map([[id, before]]) });
  assert.equal(plan(sample).unchanged, 1);
  assert.deepEqual(plan({ ...sample, body: sample.body.replaceAll('media:old', 'media:new') }).replace[0].changes, ['body']);
});

test('renderer refuses list cardinality changes, link row changes and older sidecars before dropping content', () => {
  const rules = { slots: [{ name: 'body', pattern: '(<main>)(.*?)(</main>)' }] };
  for (const [page, body, changed] of [
    ['<main><ul><li>One</li></ul></main>', '- One', '- One\n- Two'],
    ['<main><ul><li>One</li><li>Two</li></ul></main>', '- One\n- Two', '- One'],
    ['<main><div><a href="https://a.test/">A</a></div></main>', '- [A](https://a.test/)', '- [A](https://a.test/)\n- [B](https://b.test/)'],
  ]) {
    const adopted = adopt(page, { body }, rules, { images: 'page' }, {});
    assert.deepEqual(adopted.findings, []);
    assert.throws(() => build(adopted.template, { body: changed }, rules, { images: 'page' }, {}, adopted.blocks), /no longer has the shape/);
    assert.throws(() => build(adopted.template, { body }, rules, { images: 'page' }, {}, ['ul']), /older.*sidecar/);
  }
});

test('full inventories follow empty pages, deduplicate records and reject broken or capped cursors', async () => {
  const record = { uri: `at://${did}/${collection}/${id}`, value: postRecord(post, { did, site }).record };
  let requests = 0;
  const get = async () => Response.json(++requests === 1 ? { records: [], cursor: 'next' } : { records: [record, record] });
  assert.equal((await listRecords({ did, origin, collection, get })).records.length, 1); assert.equal(requests, 2);
  for (const cursor of ['same', 4, '']) {
    await assert.rejects(listRecords({ did, origin, collection, get: async () => Response.json({ records: [], cursor }) }), /invalid cursor/);
  }
  requests = 0;
  await assert.rejects(listRecords({ did, origin, collection, maxPages: 2, get: async () => Response.json({ records: [record], cursor: `next-${++requests}` }) }), /incomplete/);
  assert.equal(requests, 2);
  await assert.rejects(pdsStore({ did, origin, collection, get: async () => Response.json({ records: [], cursor: 'same' }) }).list(), /invalid cursor/);
});

test('slug resolution refuses owner-local ambiguity and foreign record injection', async () => {
  const value = postRecord(post, { did, site }).record;
  const pds = { did, origin, collection };
  const row = key => ({ uri: `at://${did}/${collection}/${key}`, value });
  await assert.rejects(recordBySlug(pds, 'hello', async () => Response.json({ records: [row(id), row('3bbbbbbbbbbbb')] })), /More than one/);
  assert.equal(await recordBySlug(pds, 'hello', async () => Response.json({ records: [{ ...row(id), uri: `at://did:web:other.test/${collection}/${id}` }] })), null);
});

test('partial visibility moves preserve both copies and require direct-store versioned reconciliation', async () => {
  const record = postRecord(post, { did, site }).record;
  let copied;
  const source = { get: async () => ({ record, version: 'old' }), remove: async () => { throw Error('offline'); } };
  const target = { get: async () => copied ?? null, put: async (_key, value) => { copied = { record: value, version: 'copy' }; return copied; } };
  const empty = { get: async () => null };
  const instance = createVault({ stores: { private: source, friends: empty, public: target } });
  await assert.rejects(instance.setVisibility(id, 'public', { version: 'old' }), /Both copies were preserved.*operator access.*current version/);
  assert.deepEqual((await source.get()).record, copied.record);
  await assert.rejects(instance.find(id), /stored as public and private/);
});

test('prepared publication keeps retained blob metadata but clears an intentionally removed alt', async () => {
  const blob = `${origin}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=image-cid#renamed.jpg`;
  const current = { ...post, body: `![](${blob})` };
  const before = postRecord({ ...post, body: '![Old](https://images.test/old.jpg)' }, { did, site }).record;
  before.media = [{ $type: `${collection}#image`, id: 'old', file: { ref: { $link: 'image-cid' }, mimeType: 'image/jpeg', size: 3 }, alt: 'Old', sourceUrl: 'https://images.test/old.jpg', caption: 'Kept' }];
  const answer = await publishCapability.requests['com.ohmmmm.vault.getPublishPlan'].run({
    url: new URL('https://vault.example.test/xrpc/com.ohmmmm.vault.getPublishPlan?prepare=1'), did,
    identify: { pdsFor: async () => origin }, posts: { all: async () => [current], removed: async () => [] },
    get: async url => new URL(url).pathname.endsWith('listRecords') ? Response.json({ records: [{ uri: `at://${did}/${collection}/${id}`, value: before }] }) : new Response('', { status: 404 }),
  });
  const media = answer.writes[0].record.media[0];
  assert.equal(media.alt, ''); assert.equal(media.caption, 'Kept'); assert.equal(media.id, 'renamed');
  assert.equal(answer.writes[0].upload, undefined);
});
