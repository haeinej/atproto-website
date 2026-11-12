// The vault page. It signs the member in at their own PDS, asks that PDS for a short-lived token
// before each request, and talks to the vault with it. Everything shown is put on the page as
// text, never as markup.
import { askPds, begin, finish, leave, restore } from './signin.js';

const $ = id => document.getElementById(id);
// `ask` is how this visit talks to the member's PDS: through their browser sign-in, or with the
// session an app password gave.
const state = { pds: '', did: '', session: '', audience: '', ask: null, kept: false, tree: null, current: null };

// ---- What happened: every request this page makes, and how it went. ----
function say(text, { detail, problem = false } = {}) {
  const item = document.createElement('li');
  item.dataset.kind = problem ? 'problem' : 'done';
  item.append(`${new Date().toLocaleTimeString()} · ${text}`);
  if (detail !== undefined) {
    const pre = document.createElement('pre');
    pre.textContent = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2);
    item.append(pre);
  }
  $('log').prepend(item);
}
const failed = (doing, problem) => say(`${doing} did not work: ${problem.message}`, { problem: true });

// ---- Talking to the PDS and to the vault. ----
async function pds(method, { query, body, auth = true } = {}) {
  const url = new URL(`/xrpc/${method}`, state.pds);
  if (query) url.search = new URLSearchParams(query);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { ...(auth ? { Authorization: `Bearer ${state.session}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `your PDS answered HTTP ${response.status}`);
  return data;
}
async function vault(name, { query, body } = {}) {
  const method = `com.ohmmmm.vault.${name}`;
  // A token is good for this one request to this one service, for a minute.
  const { token } = await state.ask('com.atproto.server.getServiceAuth', { aud: state.audience, lxm: method, exp: String(Math.floor(Date.now() / 1000) + 60) });
  const url = new URL(`/xrpc/${method}`, location.origin);
  if (query) url.search = new URLSearchParams(query);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || `the vault answered HTTP ${response.status}`), { code: data.error, data });
  return data;
}

// ---- A new post's ID and slug. The ID has the form the vault's own rules give one (vault/file.mjs). ----
function newPostId() {
  const letters = '234567abcdefghijklmnopqrstuvwxyz';
  let value = (BigInt(Date.now()) * 1000n << 10n) | BigInt(Math.floor(Math.random() * 1024));
  let text = '';
  for (let at = 0; at < 13; at++, value >>= 5n) text = letters[Number(value & 31n)] + text;
  return text;
}
const slugOf = text => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);

// ---- Signing in and out. ----
$('pds').value = localStorage.getItem('ohm.pds') ?? '';
$('identifier').value = localStorage.getItem('ohm.identifier') ?? '';
$('handle').value = localStorage.getItem('ohm.handle') ?? '';
$('site').value = localStorage.getItem('ohm.site') ?? '';
$('older').value = localStorage.getItem('ohm.older') ?? '';

async function enter({ did, handle }, how) {
  state.did = did;
  state.audience ||= (await (await fetch('/.well-known/did.json')).json()).id;
  $('who').textContent = handle ? `${handle} · ${did}` : did;
  $('sign-in').hidden = true;
  $('workspace').hidden = false;
  $('sign-out').hidden = false;
  say(how);
  await loadTree();
}

// The usual way in: the member's handle, then their own PDS.
$('handle-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('sign-in-problem').textContent = 'Taking you to your PDS…';
  try {
    localStorage.setItem('ohm.handle', $('handle').value.trim());
    await begin($('handle').value);
  } catch (problem) {
    $('sign-in-problem').textContent = `Signing in did not work: ${problem.message}`;
  }
});

// The other way: an app password, for a PDS that cannot sign someone in through the browser.
$('sign-in-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('sign-in-problem').textContent = '';
  try {
    const address = new URL($('pds').value.trim());
    // A PDS on this machine, for trying things out, is the one that may be reached without https.
    if (address.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(address.hostname)) throw new Error('your PDS has an https address');
    state.pds = address.origin;
    const signedIn = await pds('com.atproto.server.createSession', { auth: false, body: { identifier: $('identifier').value.trim(), password: $('password').value } });
    state.session = signedIn.accessJwt;
    state.ask = (method, query) => pds(method, { query });
    $('password').value = '';
    // Where to sign in is remembered for next time. The password and the session are not.
    localStorage.setItem('ohm.pds', state.pds);
    localStorage.setItem('ohm.identifier', $('identifier').value.trim());
    await enter(signedIn, `Signed in at ${state.pds} as ${signedIn.did}, with an app password`);
  } catch (problem) {
    $('sign-in-problem').textContent = `Signing in did not work: ${problem.message}`;
  }
});

$('sign-out').addEventListener('click', async () => {
  if (state.kept) await leave();
  location.reload();
});

// On opening the page: finish a sign-in that is coming back from the PDS, or pick up the one kept
// on this device, or ask.
try {
  const returning = await finish();
  const account = returning ?? await restore();
  if (account) {
    Object.assign(state, { ask: askPds, kept: true });
    await enter(account, returning ? `Signed in as ${account.did}, through ${account.pds}` : `Still signed in as ${account.did}, from an earlier visit`);
  } else {
    $('sign-in').hidden = false;
  }
} catch (problem) {
  $('sign-in').hidden = false;
  $('sign-in-problem').textContent = `Signing in did not work: ${problem.message}`;
}

// ---- The tree. ----
function postButton(post) {
  const button = document.createElement('button');
  button.type = 'button';
  if (state.current?.post.id === post.id) button.setAttribute('aria-current', 'true');
  const name = Object.assign(document.createElement('span'), { className: 'name', textContent: post.title || post.slug });
  const tag = Object.assign(document.createElement('span'), { className: 'tag', textContent: { public: 'everyone', friends: 'friends', private: 'only me' }[post.visibility] });
  tag.dataset.visibility = post.visibility;
  button.append(name, tag);
  button.addEventListener('click', () => openPost(post.id));
  const item = document.createElement('li');
  item.append(button);
  return item;
}
function list(posts) {
  const items = document.createElement('ul');
  for (const post of posts) items.append(postButton(post));
  return items;
}
async function loadTree() {
  try {
    state.tree = await vault('getTree');
    const { posts, public: open, friends, private: closed, labels } = state.tree;
    $('counts').textContent = posts ? `${posts} post${posts === 1 ? '' : 's'}: ${closed} only me, ${friends} friends, ${open} everyone` : 'Your vault is empty.';
    const tree = $('tree');
    tree.replaceChildren();
    for (const folder of labels) {
      tree.append(Object.assign(document.createElement('p'), { className: 'label', textContent: folder.label }), list(folder.posts));
      for (const group of folder.sublabels) {
        tree.append(Object.assign(document.createElement('p'), { className: 'sublabel', textContent: group.sublabel }), list(group.posts));
      }
    }
  } catch (problem) {
    failed('Reading your vault', problem);
  }
}
$('refresh').addEventListener('click', async () => { await loadTree(); say('Read your vault again'); });

// ---- One post. ----
const fields = ['title', 'label', 'sublabel', 'slug', 'visibility', 'date', 'body'];
function show(post, version) {
  state.current = { post, version };
  $('post-form').hidden = false;
  $('post-title').textContent = version ? (post.title || post.slug) : 'A new post';
  for (const name of fields) $(name).value = post[name] ?? '';
  $('delete').hidden = !version;
  const found = state.tree?.labels.flatMap(folder => [...folder.posts, ...folder.sublabels.flatMap(group => group.posts)]).find(each => each.id === post.id);
  $('post-facts').textContent = version
    ? `ID ${post.id} · version ${version.slice(0, 10)}…${found?.form ? ` · ${found.form}` : ''}${post.address ? ` · ${post.address}` : ''}`
    : `ID ${post.id} · not saved yet`;
  $('post-problems').replaceChildren(...(found?.problems ?? []).map(text => Object.assign(document.createElement('li'), { textContent: `Cannot be published yet: ${text}` })));
  for (const button of $('tree').querySelectorAll('button')) button.removeAttribute('aria-current');
}
async function openPost(id) {
  try {
    const { post, version } = await vault('getPost', { query: { id } });
    show(post, version);
    await loadTree();
  } catch (problem) {
    failed('Opening the post', problem);
  }
}
$('new-post').addEventListener('click', () => {
  show({ id: newPostId(), slug: '', label: '', sublabel: '', visibility: 'private', body: '', properties: {} }, null);
  $('title').focus();
});
// A new post's slug follows its title until the slug is typed by hand.
$('title').addEventListener('input', () => {
  if (state.current && !state.current.version && !$('slug').dataset.typed) $('slug').value = slugOf($('title').value);
});
$('slug').addEventListener('input', () => { $('slug').dataset.typed = 'yes'; });

$('post-form').addEventListener('submit', async event => {
  event.preventDefault();
  const { post: before, version } = state.current;
  const text = name => $(name).value.trim();
  // What the form does not show, such as where a post first appeared or its site's own layer, is kept as it was.
  const post = { ...before, slug: text('slug'), label: text('label'), sublabel: text('sublabel'), visibility: $('visibility').value, body: text('body') };
  for (const name of ['title', 'date']) {
    if (text(name)) post[name] = text(name);
    else delete post[name];
  }
  try {
    const saved = await vault('putPost', { body: { post, ...(version ? { replaces: version } : {}) } });
    say(saved.unchanged ? `Nothing to save in "${post.slug}"` : `Saved "${post.slug}" as ${$('visibility').selectedOptions[0].textContent.toLowerCase()}`, { detail: saved });
    delete $('slug').dataset.typed;
    await loadTree();
    await openPost(post.id);
  } catch (problem) {
    failed(`Saving "${post.slug}"`, problem);
    if (problem.code === 'Changed') say('It was changed somewhere else since you opened it. Open it again to see the newer version; what you typed is still in the form.', { problem: true });
  }
});
$('delete').addEventListener('click', async () => {
  const { post, version } = state.current;
  if (!confirm(`Remove "${post.title || post.slug}" from your vault? This cannot be undone here.`)) return;
  try {
    await vault('deletePost', { body: { id: post.id, replaces: version } });
    say(`Removed "${post.slug}"`);
    state.current = null;
    $('post-form').hidden = true;
    $('post-title').textContent = 'Choose a post, or make a new one';
    await loadTree();
  } catch (problem) {
    failed(`Removing "${post.slug}"`, problem);
  }
});

// ---- Bringing in what is already published. ----
async function bringIn(apply) {
  const site = $('site').value.trim();
  const from = $('older').value.trim();
  localStorage.setItem('ohm.site', site);
  localStorage.setItem('ohm.older', from);
  try {
    const report = await vault('importPublished', { body: { site, ...(from ? { from } : {}), apply } });
    const same = `${report.sameAsPublished} of ${report.posts} would be published exactly as they are now`;
    say(apply
      ? `Brought in ${report.saved.length} post${report.saved.length === 1 ? '' : 's'}; ${report.unchanged.length} were already there; ${report.changedThere.length} have changed in your vault and were left alone`
      : `Found ${report.records} published record${report.records === 1 ? '' : 's'}, which make ${report.posts} post${report.posts === 1 ? '' : 's'}; ${same}. Nothing was changed.`, { detail: report });
    if (apply) await loadTree();
  } catch (problem) {
    failed('Bringing in your published posts', problem);
  }
}
$('import-look').addEventListener('click', () => bringIn(false));
$('import-apply').addEventListener('click', () => bringIn(true));

// ---- Writing the vault out. ----
$('export-folder').disabled = !window.showDirectoryPicker;
if (!window.showDirectoryPicker) $('export-folder').title = 'This browser cannot write into a folder. Chrome and Edge can.';
$('export-folder').addEventListener('click', async () => {
  try {
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });
    const { files } = await vault('exportFiles');
    for (const { path, text } of files) {
      const parts = path.split('/');
      let folder = root;
      for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
      const writing = await (await folder.getFileHandle(parts.at(-1), { create: true })).createWritable();
      await writing.write(text);
      await writing.close();
    }
    say(`Wrote ${files.length} post${files.length === 1 ? '' : 's'} into the folder "${root.name}"`, { detail: files.map(file => file.path) });
  } catch (problem) {
    if (problem.name !== 'AbortError') failed('Writing your vault into a folder', problem);
  }
});
$('export-file').addEventListener('click', async () => {
  try {
    const { files } = await vault('exportFiles');
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([JSON.stringify({ files }, null, 2)], { type: 'application/json' })), download: 'ohm-vault.json',
    });
    link.click();
    URL.revokeObjectURL(link.href);
    say(`Downloaded ${files.length} post${files.length === 1 ? '' : 's'} as ohm-vault.json`);
  } catch (problem) {
    failed('Downloading your vault', problem);
  }
});
