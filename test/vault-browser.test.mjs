import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createAccountScope } from '../service/public/vault/account-scope.js';
import { carryOut } from '../service/public/vault/publish.js';

// Run the real page handlers with a minimal DOM/network. Startup is skipped so each shell test
// can choose its account and interleaving. This does not verify browser layout or focus APIs.
const source = (await readFile(new URL('../service/public/vault/vault.js', import.meta.url), 'utf8'))
  .replace(/^import .+;\n/gm, '').replace(/await open\(\);\s*$/, '');
const did = 'did:web:member.test';
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const post = id => ({ id, slug: id, label: 'journal', sublabel: '', visibility: 'private', body: `Body ${id}`, properties: {} });
const found = id => ({ post: post(id), version: `v-${id}` });
class Element {
  constructor() { this.dataset = {}; this.children = []; this.listeners = {}; this.value = ''; this.classList = { toggle() {} }; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, run) { (this.listeners[name] ??= []).push(run); }
  async fire(name, event = {}) { for (const run of this.listeners[name] ?? []) await run({ preventDefault() {}, ...event }); }
  querySelectorAll() { return []; }
  setAttribute() {}
  focus() {}
  remove() {}
}
function page({ fetch = async () => Response.json({ labels: [], changes: 0 }), confirm = () => true, askPds = async () => ({ token: 'method-token' }), sendPds = async () => ({ blob: {} }) } = {}) {
  const elements = new Map(), window = new Element();
  const $ = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const document = { baseURI: 'https://app.test/vault/', createElement: () => new Element(), createElementNS: () => new Element(), getElementById: $, querySelectorAll: () => [], addEventListener() {} };
  const context = vm.createContext({ document, window, URL, URLSearchParams, Uint8Array, Blob, Date, Math, BigInt, setTimeout() {}, queueMicrotask, confirm,
    location: { reload() {} }, localStorage: { getItem() { return null; }, setItem() {} },
    createAccountScope, carryOut, fetch, askPds, sendPds,
    restore: async () => ({ did }), leave: async () => {}, begin() {}, beginWithPassword() {}, finish() {},
    createCortexPanel: () => ({ directory: new Element(), screen: new Element(), reset() {}, canLeave: () => true, open: async () => {}, hasDetail: () => false }),
  });
  const handlers = vm.runInContext(`${source}\n;({ state, call, openPost, closePost, newPost, go, openPublish, accountScope, postDirty })`, context);
  handlers.state.did = did; handlers.state.tree = { labels: [] };
  return { ...handlers, $, window };
}
const edit = (shell, text) => { shell.$('body').value = text; };

test('older post reads cannot replace a later selection, new draft, closed post or newly typed text', async () => {
  for (const action of ['selection', 'new', 'close', 'typing']) {
    const held = deferred();
    const shell = page({ fetch: input => {
      const url = new URL(input);
      if (url.pathname.endsWith('getPost')) return url.searchParams.get('id') === 'slow' ? held.promise : Response.json(found('newer'));
      return Response.json({ labels: [] });
    } });
    await shell.openPost('newer');
    const reading = shell.openPost('slow');
    if (action === 'selection') await shell.openPost('newer');
    if (action === 'new') shell.newPost();
    if (action === 'close') shell.closePost();
    if (action === 'typing') edit(shell, 'Just typed');
    held.resolve(Response.json(found('slow'))); await reading;
    assert.notEqual(shell.state.current?.post.id, 'slow');
    if (action === 'typing') assert.equal(shell.$('body').value, 'Just typed');
    if (action === 'new') assert.equal(shell.state.current.version, null);
    if (action === 'close') assert.equal(shell.state.current, null);
  }
});

test('declining dirty navigation keeps the exact draft/base and sends no replacement reads', async () => {
  let reads = 0, allow = true;
  const shell = page({ confirm: () => allow, fetch: input => {
    if (new URL(input).pathname.endsWith('getPost')) { reads++; return Response.json(found('held')); }
    return Response.json({ labels: [] });
  } });
  await shell.openPost('held'); edit(shell, 'Unsaved'); allow = false;
  const before = shell.state.current;
  await shell.openPost('other'); shell.newPost(); shell.closePost(); shell.go('cortex'); await shell.openPublish();
  assert.equal(shell.state.current, before); assert.equal(before.version, 'v-held');
  assert.equal(shell.$('body').value, 'Unsaved'); assert.equal(reads, 1);
  assert.equal(shell.state.publishing, false); assert.equal(shell.state.page, 'vault');
  let prevented = false;
  await shell.window.fire('beforeunload', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test('save advances the version while preserving typing since submission and prevents a duplicate submit', async () => {
  const held = deferred(), writes = [];
  const shell = page({ fetch: (input, init) => {
    const url = new URL(input);
    if (url.pathname.endsWith('getPost')) return Response.json(found('held'));
    if (url.pathname.endsWith('putPost')) { writes.push(JSON.parse(init.body)); return writes.length === 1 ? held.promise : Response.json({ version: 'v3' }); }
    return Response.json({ labels: [], changes: 0 });
  } });
  await shell.openPost('held'); edit(shell, 'Submitted');
  const saving = shell.$('post-form').fire('submit');
  await shell.$('post-form').fire('submit'); assert.equal(writes.length, 1);
  edit(shell, 'Typed while saving');
  held.resolve(Response.json({ version: 'v2' })); await saving;
  assert.equal(shell.$('body').value, 'Typed while saving'); assert.equal(shell.state.current.version, 'v2');
  assert.equal(shell.postDirty(), true);
  await shell.$('post-form').fire('submit');
  assert.equal(writes[1].replaces, 'v2'); assert.equal(writes[1].post.body, 'Typed while saving');
  assert.equal(shell.postDirty(), false);
});

test('accepted navigation clears the discarded editor and a failed save preserves its retry base', async () => {
  let fail = true;
  const shell = page({ fetch: (input, init) => {
    const url = new URL(input);
    if (url.pathname.endsWith('getPost')) return Response.json(found('held'));
    if (url.pathname.endsWith('putPost')) {
      assert.equal(JSON.parse(init.body).replaces, 'v-held');
      return fail ? Response.json({ error: 'Changed', message: 'Changed' }, { status: 409 }) : Response.json({ version: 'v2' });
    }
    return Response.json({ labels: [], changes: 0 });
  } });
  await shell.openPost('held'); edit(shell, 'Retry me'); await shell.$('post-form').fire('submit');
  assert.equal(shell.$('body').value, 'Retry me'); assert.equal(shell.state.current.version, 'v-held');
  assert.equal(shell.$('save').disabled, false); assert.equal(shell.postDirty(), true);
  fail = false; await shell.$('post-form').fire('submit'); assert.equal(shell.state.current.version, 'v2');
  edit(shell, 'Discarded'); shell.go('cortex'); shell.go('vault');
  assert.equal(shell.state.current, null); assert.equal(shell.$('post-form').hidden, true);
});

test('a save completion cannot reopen its old post after another selection', async () => {
  const held = deferred();
  const shell = page({ fetch: (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('getPost')) return Response.json(found(url.searchParams.get('id')));
    if (url.pathname.endsWith('putPost')) return held.promise;
    return Response.json({ labels: [], changes: 0 });
  } });
  await shell.openPost('old'); edit(shell, 'Submitted'); const saving = shell.$('post-form').fire('submit');
  await shell.openPost('new'); held.resolve(Response.json({ version: 'v2' })); await saving;
  assert.equal(shell.state.current.post.id, 'new'); assert.equal(shell.$('body').value, 'Body new');
});

test('attachments carry normal cookie or method-bound PDS authentication and the expected DID', async () => {
  for (const mode of ['ohm', 'pds']) {
    const requests = [], tokens = [];
    const shell = page({ askPds: async (method, args) => { tokens.push([method, args]); return { token: 'for-attachment' }; },
      fetch: async (input, init) => { requests.push([new URL(input), init]); return new Response(new Uint8Array([1,2,3]), { headers: { 'Content-Type': 'image/png; charset=binary' } }); } });
    shell.state.mode = mode; shell.state.audience = 'did:web:service.test';
    const result = await shell.call('getAttachment', { query: { id: 'post', attachment: 'image' }, binary: true });
    assert.deepEqual(Array.from(result.bytes), [1,2,3]); assert.equal(result.mime, 'image/png');
    assert.equal(requests[0][1].credentials, 'same-origin'); assert.equal(requests[0][1].headers['X-Ohm-Did'], did);
    assert.equal(requests[0][1].headers.Authorization, mode === 'pds' ? 'Bearer for-attachment' : undefined);
    if (mode === 'pds') assert.equal(tokens[0][1].lxm, 'com.ohmmmm.vault.getAttachment');
  }
});

test('account changes while issuing an attachment token or reading bytes cannot reach upload/apply', async () => {
  for (const stage of ['token', 'bytes']) {
    const held = deferred(), started = deferred(); let uploads = 0, requests = 0;
    const plan = { plan: 'approved', repository: did, collection: 'com.ohmmmm.post', writes: [{ action: 'create', rkey: 'post', record: {}, upload: [{ id: 'image' }] }] };
    const shell = page({
      askPds: async (_, args) => { if (stage === 'token' && args.lxm.endsWith('getAttachment')) { started.resolve(); await held.promise; } return { token: 'for-file' }; },
      fetch: async input => {
        if (new URL(input).pathname.endsWith('getPublishPlan')) return Response.json(plan);
        requests++; started.resolve();
        return { ok: true, headers: new Headers({ 'Content-Type': 'image/png' }), arrayBuffer: async () => { await held.promise; return new Uint8Array([1]).buffer; } };
      },
      sendPds: async () => { uploads++; return { blob: {} }; },
    });
    shell.state.mode = 'pds'; shell.state.plan = plan;
    const publishing = shell.$('publish-form').fire('submit'); await started.promise;
    shell.accountScope.reset(); shell.state.did = 'did:web:other.test'; held.resolve(); await publishing;
    assert.equal(uploads, 0); assert.equal(requests, stage === 'token' ? 0 : 1);
  }
});
