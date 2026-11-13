import assert from 'node:assert/strict';
import test from 'node:test';
// Importing needs no document and must perform no fetch.
import { createCortexPanel } from '../service/public/vault/cortex.js';
import memoryCapability from '../service/src/capabilities/memory.mjs';
import notesCapability from '../service/src/capabilities/notes.mjs';
import skillsCapability from '../service/src/capabilities/skills.mjs';
import { memoryStore } from '../cortex/store.mjs';
import { getContext } from '../cortex/context.mjs';
import { postStore } from '../service/src/store.mjs';
import { testDatabase } from './d1.mjs';

// A deliberately small DOM double for shell-verifiable state/transport tests.
// It does not test layout, browser focus, or accessibility APIs.
class Element {
  constructor(tag) {
    this.tagName = tag; this.className = ''; this.dataset = {}; this.hidden = false;
    this.disabled = false; this.children = []; this.attributes = {}; this.listeners = {};
    this.value = ''; this.checked = false; this.text = '';
  }
  set textContent(text) { this.text = String(text); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('Member content must never be HTML'); }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.text = ''; this.children = [...elements]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); }
  async fire(name) { await Promise.all((this.listeners[name] ?? []).map(handler => handler({ preventDefault() {} }))); }
  querySelectorAll(selector) {
    const matches = selector.startsWith('[role=') ? element => element.getAttribute('role') === 'alert'
      : element => selector.split(',').map(tag => tag.trim()).includes(element.tagName);
    return descendants(this).filter(matches);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
const descendants = element => element.children.flatMap(child => [child, ...descendants(child)]);
const named = (root, name) => descendants(root).find(element => element.name === name);
const click = (root, text) => {
  const found = descendants(root).find(element => element.tagName === 'button' && element.textContent === text);
  assert.ok(found, `Missing button: ${text}`);
  return found.fire('click');
};
const item = (panel, name) => {
  const found = descendants(panel.directory).find(element => element.className === 'cortex-item' && element.children[0]?.textContent === name);
  assert.ok(found, `Missing item: ${name}`);
  return found.fire('click');
};
const edit = async (panel, name, value) => {
  const input = named(panel.screen, name);
  assert.ok(input, `Missing field: ${name}`);
  input.value = value;
  await input.fire('input');
  return input;
};
const submit = panel => panel.screen.querySelector('form').fire('submit');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function dom(t) {
  const before = { document: globalThis.document, confirm: globalThis.confirm };
  globalThis.document = { createElement: tag => new Element(tag) };
  globalThis.confirm = () => true;
  t.after(() => { globalThis.document = before.document; globalThis.confirm = before.confirm; });
}
function panelFor(call, options = {}) {
  const notices = [], calls = [];
  let changes = 0;
  const panel = createCortexPanel({
    call: async (name, options) => { calls.push({ name, ...structuredClone(options) }); return call(name, options ?? {}); },
    notice: (...message) => notices.push(message), changed: () => { changes++; }, canApprove: () => true, ...options,
  });
  return { panel, calls, notices, changes: () => changes };
}
const me = 'did:web:editor-member.test';
const memory = (extra = {}) => ({ name: 'plain-titles', description: 'Plain titles', kind: 'preference', stated: true, body: 'Original\r\n[[working-style]]\n', ...extra });
const skill = text => ({ text: `---\nname: repeat-work\ndescription: Repeat work\n---\n${text}`, files: [{ path: 'reference/check.txt', text: '<script>support</script>\n' }] });
async function service() {
  const db = await testDatabase(), store = memoryStore(db);
  const requests = Object.assign({}, memoryCapability.requests, notesCapability.requests, skillsCapability.requests);
  let keyboard = true;
  const ask = async (name, { query = {}, body } = {}) => {
    const full = name.includes('.') ? name : `com.ohmmmm.cortex.${name}`;
    assert.ok(requests[full], full);
    const url = new URL(`https://vault.test/xrpc/${full}`);
    url.search = new URLSearchParams(query);
    return requests[full].run({ env: { DB: db }, did: me, url, body: async () => body,
      user: keyboard ? { id: 'editor' } : null, linked: { didOf: async () => me },
      request: new Request(url, { headers: keyboard ? {} : { Authorization: 'Bearer synthetic' } }),
    });
  };
  return { db, store, ask, keyboard: value => { keyboard = value; } };
}

test('panel creation and reset are synchronous, hidden and fetch nothing', t => {
  dom(t);
  const { panel, calls } = panelFor(() => { throw new Error('Unexpected fetch'); });
  assert.deepEqual(Object.keys(panel).sort(), ['canLeave', 'directory', 'hasDetail', 'open', 'reset', 'screen']);
  for (const element of [panel.directory, panel.screen]) {
    assert.equal(element.hidden, true);
    assert.equal(element.dataset.page, 'cortex');
  }
  assert.match(panel.directory.className, /directory-scroll/);
  assert.match(panel.screen.className, /screen/);
  assert.equal(panel.hasDetail(), false);
  assert.equal(panel.canLeave(), true);
  assert.equal(panel.reset(), undefined);
  assert.equal(calls.length, 0);
});

test('the complete incremental memory list applies removals and sorts newest first', async t => {
  dom(t);
  const first = Array.from({ length: 1000 }, (_, index) => ({ name: `memory-${index}`, version: `v${index}`, when: '2026-11-01T00:00:00Z' }));
  const { panel, calls } = panelFor((name, { query }) => {
    if (name.endsWith('listMemories')) return query?.since === '1000'
      ? { memories: [{ name: 'memory-0', removed: true }, { name: 'newest', version: 'vnew', when: '2026-11-13T00:00:00Z' }, { name: 'extra', version: 'vextra', when: '2026-11-12T00:00:00Z' }], cursor: '1003' }
      : { memories: first, cursor: '1000', more: true };
    return { notes: [], skills: [] };
  });
  await panel.open();
  const rows = descendants(panel.directory).filter(element => element.className === 'cortex-item');
  assert.equal(rows.length, 1001);
  assert.equal(rows[0].children[0].textContent, 'newest');
  assert.equal(rows[1].children[0].textContent, 'extra');
  assert.ok(!rows.some(row => row.children[0].textContent === 'memory-0'));
  assert.deepEqual(calls.filter(call => call.name.endsWith('listMemories')).map(call => call.query), [undefined, { since: '1000' }]);
  assert.deepEqual(calls.find(call => call.name.endsWith('listNotes')).query, { settled: '1' });
});

test('failed or nonadvancing pagination reports an incomplete refresh without replacing the prior index', async t => {
  dom(t);
  let broken = false;
  const { panel, notices } = panelFor(name => {
    if (!name.endsWith('listMemories')) return { notes: [], skills: [] };
    return broken ? { memories: [], more: true, cursor: 'same' } : { memories: [{ name: 'held', when: '2026-11-01' }], cursor: '1' };
  });
  await panel.open();
  broken = true;
  await panel.open();
  assert.match(panel.directory.textContent, /Previously loaded items/);
  assert.match(panel.directory.textContent, /held/);
  assert.match(notices.at(-1)[0], /cursor did not advance/);
});

test('memory read, edit, history restore and delete use exact service versions; deletion changes Context', async t => {
  dom(t);
  const { ask, store, db } = await service();
  const initial = await store.write(me, memory({ always: true, project: 'repo-one', from: 'post-one' }), { writtenBy: 'synthetic-agent' });
  const { panel, calls, notices } = panelFor(ask);
  await panel.open(); await item(panel, 'plain-titles');
  assert.equal(panel.hasDetail(), true);
  assert.match(panel.screen.textContent, /synthetic-agent/);
  await click(panel.screen, 'Edit memory');
  await edit(panel, 'body', '<img src=x onerror=bad>\nChanged\n');
  await submit(panel);
  const save = calls.find(call => call.name.endsWith('putMemory'));
  assert.equal(save.body.replaces, initial.version);
  assert.equal(save.body.memory.from, 'post-one');
  assert.equal(save.body.memory.project, 'repo-one');
  const latest = await store.read(me, 'plain-titles');
  assert.equal(latest.memory.body, '<img src=x onerror=bad>\nChanged\n');
  assert.match(panel.screen.textContent, /<img src=x onerror=bad>/);
  await click(panel.screen, `Read version ${initial.version}`);
  assert.deepEqual(calls.filter(call => call.name.endsWith('getMemory')).at(-1).query, { name: 'plain-titles', version: initial.version });
  assert.match(panel.screen.textContent, /Original/);
  await click(panel.screen, 'Restore this version');
  const restore = calls.filter(call => call.name.endsWith('putMemory')).at(-1);
  assert.equal(restore.body.replaces, latest.version);
  assert.equal(restore.body.memory.body, memory().body);
  const restored = await store.read(me, 'plain-titles');
  assert.notEqual(restored.version, initial.version);
  assert.notEqual(restored.version, latest.version);
  await click(panel.screen, 'Remove memory');
  assert.deepEqual(calls.find(call => call.name.endsWith('deleteMemory')).body, { name: 'plain-titles', replaces: restored.version });
  const context = await getContext({ env: { DB: db }, did: me, posts: postStore(db) });
  assert.ok(!context.always.some(item => item.memory.name === 'plain-titles'));
  assert.ok(!context.memories.some(item => item.name === 'plain-titles'));
  assert.equal(panel.hasDetail(), false);
  assert.ok(!panel.directory.textContent.includes('plain-titles'));
  assert.equal(notices.some(([text, tone]) => tone === 'error'), false);
});

test('drafts and exact base versions survive conflicts, failed saves, refresh and declined navigation', async t => {
  dom(t);
  const { ask, store } = await service();
  const first = await store.write(me, memory());
  const { panel, calls } = panelFor(ask);
  await panel.open(); await item(panel, 'plain-titles'); await click(panel.screen, 'Edit memory');
  const textarea = await edit(panel, 'body', 'Unsaved draft\n');
  globalThis.confirm = () => false;
  assert.equal(panel.canLeave(), false);
  await click(panel.directory, 'Notes');
  assert.equal(named(panel.screen, 'body'), textarea);
  await store.write(me, memory({ body: 'A concurrent edit' }), { replaces: first.version });
  await submit(panel);
  assert.equal(named(panel.screen, 'body'), textarea);
  assert.equal(textarea.value, 'Unsaved draft\n');
  assert.match(panel.screen.textContent, /changed elsewhere/);
  await panel.open();
  assert.equal(named(panel.screen, 'body'), textarea);
  await submit(panel);
  assert.deepEqual(calls.filter(call => call.name.endsWith('putMemory')).map(call => call.body.replaces), [first.version, first.version]);
  globalThis.confirm = () => true;
  assert.equal(panel.canLeave(), true);
  await panel.open();
  assert.match(panel.screen.textContent, /A concurrent edit/);
  await click(panel.screen, 'Edit memory');
  const again = await edit(panel, 'body', 'Retain on network error');
  // Simulate a transport failure separately from the service's concurrency refusal.
  const offline = panelFor((name, options) => name.endsWith('putMemory') ? Promise.reject(new Error('Offline')) : ask(name, options));
  await offline.panel.open(); await item(offline.panel, 'plain-titles'); await click(offline.panel.screen, 'Edit memory');
  const offlineDraft = await edit(offline.panel, 'body', 'Offline draft');
  await submit(offline.panel);
  assert.equal(named(offline.panel.screen, 'body'), offlineDraft);
  assert.equal(offlineDraft.value, 'Offline draft');
  assert.match(offline.panel.screen.textContent, /Offline/);
  assert.equal(again.value, 'Retain on network error');
});

test('reset ignores an old paginated read and old failures; a second open supersedes the first', async t => {
  dom(t);
  const old = deferred();
  let lists = 0;
  const { panel, calls, notices } = panelFor(name => {
    if (!name.endsWith('listMemories')) return { notes: [], skills: [] };
    lists++;
    return lists === 1 ? old.promise : { memories: [{ name: 'new-account', when: '2026-11-13' }], cursor: 'new' };
  });
  const first = panel.open();
  panel.reset();
  assert.ok(!panel.directory.textContent.includes('new-account'));
  await panel.open();
  old.resolve({ memories: [{ name: 'old-account' }], more: true, cursor: 'old' });
  await first;
  assert.match(panel.directory.textContent, /new-account/);
  assert.ok(!panel.directory.textContent.includes('old-account'));
  assert.equal(calls.filter(call => call.name.endsWith('listMemories')).length, 2);
  assert.equal(notices.length, 0);

  const stale = deferred();
  let opens = 0;
  const second = panelFor(name => {
    if (!name.endsWith('listMemories')) return { notes: [], skills: [] };
    return ++opens === 1 ? stale.promise : { memories: [{ name: 'fresh' }], cursor: '2' };
  });
  const pending = second.panel.open();
  await second.panel.open();
  stale.reject(new Error('Old account failure'));
  await pending;
  assert.match(second.panel.directory.textContent, /fresh/);
  assert.equal(second.notices.length, 0);
});

test('reset invalidates pending memory details and a pending write cannot repopulate an account', async t => {
  dom(t);
  const { ask, store } = await service();
  await store.write(me, memory());
  const read = deferred();
  const stale = panelFor((name, options) => name.endsWith('getMemory') ? read.promise : ask(name, options));
  await stale.panel.open();
  const selecting = item(stale.panel, 'plain-titles');
  stale.panel.reset();
  read.resolve({ memory: memory({ body: 'Private old text' }), version: 'old' });
  await selecting;
  assert.equal(stale.panel.hasDetail(), false);
  assert.ok(!stale.panel.screen.textContent.includes('Private old text'));

  const write = deferred(), started = deferred();
  const saving = panelFor((name, options) => {
    if (name.endsWith('putMemory')) { started.resolve(); return write.promise; }
    return ask(name, options);
  });
  await saving.panel.open(); await item(saving.panel, 'plain-titles'); await click(saving.panel.screen, 'Edit memory');
  await edit(saving.panel, 'body', 'Pending private text');
  const sending = submit(saving.panel);
  await started.promise;
  assert.equal(saving.panel.canLeave(), false);
  assert.equal(named(saving.panel.screen, 'body').disabled, true);
  saving.panel.reset();
  write.reject(new Error('Late write failure'));
  await sending;
  assert.equal(saving.panel.hasDetail(), false);
  assert.ok(!saving.panel.screen.textContent.includes('Pending private text'));
  assert.equal(saving.notices.some(([text]) => text.includes('Late write failure')), false);
});

test('Notes include settled outcomes, author, session and project, and member text stays literal', async t => {
  dom(t);
  const { ask, db } = await service();
  for (const [id, text] of [['one', '<svg onload=bad>'], ['two', 'Waiting observation']]) {
    await ask('addNote', { body: { id, note: text, session: 'synthetic-session', project: 'repo-one' } });
  }
  db.sqlite.prepare('UPDATE cortex_notes SET settled_at = ?, outcome = ? WHERE id = ?').run('2026-11-13T00:00:00Z', 'dropped', 'one');
  const { panel } = panelFor(ask);
  await panel.open(); await click(panel.directory, 'Notes');
  assert.match(panel.directory.textContent, /Dropped/);
  assert.match(panel.directory.textContent, /Waiting to be settled/);
  await item(panel, '<svg onload=bad>');
  for (const text of ['<svg onload=bad>', me, 'synthetic-session', 'repo-one', 'Dropped']) assert.ok(panel.screen.textContent.includes(text));
});

test('skill review shows every exact file and only approves the reviewed current version', async t => {
  dom(t);
  const fixture = await service();
  fixture.keyboard(false);
  const first = await fixture.ask('putSkill', { body: { skill: skill('<img src=x>First version') } });
  fixture.keyboard(true);
  const { panel, calls } = panelFor(fixture.ask);
  await panel.open(); await click(panel.directory, 'Skills'); await item(panel, 'repeat-work');
  assert.match(panel.screen.textContent, /Awaiting your approval/);
  assert.match(panel.screen.textContent, /<img src=x>First version/);
  assert.match(panel.screen.textContent, /reference\/check.txt/);
  assert.match(panel.screen.textContent, /<script>support<\/script>/);
  fixture.keyboard(false);
  const second = await fixture.ask('putSkill', { body: { skill: skill('Second version'), replaces: first.version } });
  fixture.keyboard(true);
  await click(panel.screen, 'Approve this version');
  assert.deepEqual(calls.find(call => call.name.endsWith('approveSkill')).body, { name: 'repeat-work', version: first.version });
  assert.equal((await fixture.ask('listSkills')).skills[0].approved, false);
  assert.match(panel.screen.textContent, /First version/);
  await panel.open();
  assert.match(panel.screen.textContent, /Second version/);
  await click(panel.screen, 'Approve this version');
  assert.deepEqual(calls.filter(call => call.name.endsWith('approveSkill')).at(-1).body, { name: 'repeat-work', version: second.version });
  assert.equal((await fixture.ask('listSkills')).skills[0].approved, true);
  assert.match(panel.screen.textContent, /Approved for this version/);
});

test('a mismatched skill index or PDS fallback cannot enable approval', async t => {
  dom(t);
  let fallback = false, indexVersion = 'index-v2';
  const index = () => ({ skills: [{ name: 'repeat-work', version: indexVersion, approved: false }] });
  const { panel, calls } = panelFor(name => {
    if (name.endsWith('listSkills')) return index();
    if (name.endsWith('getSkill')) return { skill: skill('Exact text'), version: 'read-v1' };
    if (name.endsWith('approveSkill')) throw new Error('Approval should not run');
    return { memories: [], notes: [], cursor: '0' };
  }, { canApprove: () => !fallback });
  await panel.open(); await click(panel.directory, 'Skills'); await item(panel, 'repeat-work');
  assert.match(panel.screen.textContent, /Changed while loading/);
  const approve = descendants(panel.screen).find(element => element.textContent === 'Approve this version');
  assert.equal(approve.disabled, true);
  await approve.fire('click');
  indexVersion = 'read-v1'; fallback = true;
  await panel.open();
  assert.match(panel.screen.textContent, /PDS token cannot approve/);
  await click(panel.screen, 'Approve this version');
  assert.equal(calls.some(call => call.name.endsWith('approveSkill')), false);
});

test('a token refresh clears a previously approved skill snapshot when its replacement is refused', async t => {
  dom(t);
  const fixture = await service();
  fixture.keyboard(false);
  const first = await fixture.ask('putSkill', { body: { skill: skill('Approved first snapshot') } });
  fixture.keyboard(true);
  await fixture.ask('approveSkill', { body: { name: 'repeat-work', version: first.version } });
  fixture.keyboard(false);
  const { panel, calls } = panelFor(fixture.ask, { canApprove: () => false });
  await panel.open(); await click(panel.directory, 'Skills'); await item(panel, 'repeat-work');
  assert.match(panel.screen.textContent, /Approved first snapshot/);
  assert.match(panel.screen.textContent, /Approved for this version/);
  assert.match(panel.screen.textContent, /PDS token cannot approve/);

  const second = await fixture.ask('putSkill', { body: { skill: skill('Unapproved replacement'), replaces: first.version } });
  await panel.open();
  assert.match(panel.directory.textContent, /Awaiting approval/);
  assert.match(panel.screen.textContent, /Sign in to ohm with a linked account/);
  for (const text of ['Approved first snapshot', 'Unapproved replacement', 'Approved for this version', 'reference/check.txt', 'Approve this version', first.version]) {
    assert.ok(!panel.screen.textContent.includes(text), `Stale or forbidden detail: ${text}`);
  }
  assert.equal(calls.some(call => call.name.endsWith('approveSkill')), false);

  // Once the linked member approves the new version, token reads recover normally.
  fixture.keyboard(true);
  await fixture.ask('approveSkill', { body: { name: 'repeat-work', version: second.version } });
  fixture.keyboard(false);
  await panel.open();
  assert.match(panel.screen.textContent, /Unapproved replacement/);
  assert.ok(panel.screen.textContent.includes(second.version));
  assert.match(panel.screen.textContent, /Approved for this version/);
});

test('an unapproved skill refused to a PDS token offers linked ohm sign-in', async t => {
  dom(t);
  const fixture = await service(); fixture.keyboard(false);
  await fixture.ask('putSkill', { body: { skill: skill('Pending') } });
  const { panel, calls } = panelFor(fixture.ask, { canApprove: () => false });
  await panel.open(); await click(panel.directory, 'Skills'); await item(panel, 'repeat-work');
  assert.match(panel.screen.textContent, /Sign in to ohm with a linked account/);
  assert.ok(!panel.screen.textContent.includes('Approve this version'));
  assert.equal(calls.some(call => call.name.endsWith('approveSkill')), false);
});
