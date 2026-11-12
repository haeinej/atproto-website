// The vault page. A member signs in or signs up with their ohm account, in one panel in the middle
// of the page; the first time, their own PDS says which AT Protocol account is theirs. After that
// the ohm session alone opens their vault, in the app's screen: a rail, a side panel, the post.
// Everything shown is put on the page as text, never as markup.
import { askPds, begin, finish, leave, restore } from './signin.js';

const $ = id => document.getElementById(id);
const state = { did: '', tree: null, current: null, page: 'vault', signup: false, busy: false };
const PAGES = { vault: 'Vault', move: 'Import and export' };
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// ---- Messages. Every one is a notice: a pill at the top that leaves on its own. ----
function notice(text, tone = 'info') {
  const pill = Object.assign(document.createElement('p'), { className: 'notice', textContent: text });
  pill.dataset.tone = tone;
  $('notices').append(pill);
  setTimeout(() => pill.remove(), tone === 'error' ? 7000 : 4000);
}
// What happened: every request this page makes, and how it went, kept for trying the path.
function say(text, { detail, problem = false } = {}) {
  const item = document.createElement('li');
  item.dataset.kind = problem ? 'problem' : 'done';
  item.append(`${new Date().toLocaleTimeString()} · ${text}`);
  if (detail !== undefined) item.append(Object.assign(document.createElement('pre'), { textContent: typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2) }));
  $('log').prepend(item);
}
function failed(doing, problem) {
  say(`${doing} did not work: ${problem.message}`, { problem: true });
  notice(`${doing} did not work: ${problem.message}`, 'error');
}
// An address typed without "https://" in front is given it.
const address = typed => (/^https?:\/\//i.test(typed.trim()) || !typed.trim() ? typed.trim() : `https://${typed.trim()}`);

// ---- One request to the vault, riding on the ohm session the browser already holds. ----
async function call(name, { query, body } = {}) {
  const url = new URL(`./xrpc/${name.includes('.') ? name : `com.ohmmmm.vault.${name}`}`, document.baseURI);
  if (query) url.search = new URLSearchParams(query);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || `the vault answered HTTP ${response.status}`), { code: data.error, status: response.status, data });
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

// ---- Onboarding, step one: the ohm account. The same panel signs in and signs up. ----
// ohm's own sign-in does the work (Better Auth, on this origin); this panel is its buttons.
const OAUTH_ERRORS = {
  account_not_linked: 'This email already has an ohm account with another sign-in. Sign in with that one.',
  account_already_linked_to_different_user: 'That account belongs to another ohm account. It hasn’t been moved.',
  signup_disabled: 'There’s no ohm account for that sign-in yet. Sign up to create one.',
  access_denied: 'Sign-in was cancelled.',
};
const PROVIDERS = { google: 'Google', microsoft: 'Microsoft' };
let options = null;
// Which ways in are set up. An account is made only by signing up with Google or Microsoft;
// a passkey added to it later signs in, and cannot sign up.
function showSignIn() {
  const { signup } = state;
  $('onboarding-title').textContent = signup ? 'Sign up to ohm' : 'Sign in to ohm';
  $('switch-text').textContent = signup ? 'Already have an account?' : 'Don’t have an account?';
  $('switch-mode').textContent = signup ? 'Sign in' : 'Sign up';
  const offered = Object.keys(PROVIDERS).filter(name => options?.providers?.[name]);
  for (const name of Object.keys(PROVIDERS)) {
    const button = $(name);
    button.hidden = !offered.includes(name);
    // Signing up, the first way offered is the one filled action.
    const first = signup && offered[0] === name;
    button.classList.toggle('primary', first);
    button.classList.toggle('secondary', !first);
  }
  $('passkey').hidden = signup || !options?.passkey;
}
$('switch-mode').addEventListener('click', () => { state.signup = !state.signup; showSignIn(); });

async function loadOptions() {
  if (options) return;
  try {
    const answered = await fetch('/api/account/config', { credentials: 'same-origin' });
    if (!answered.ok) throw new Error();
    options = await answered.json();
  } catch {
    notice('Sign-in options couldn’t load. Please try again.', 'error');
  }
  showSignIn();
}
// Google and Microsoft: a full-page trip to them and back to this page.
async function social(provider) {
  if (state.busy) return;
  state.busy = true;
  const label = $(provider).querySelector('span');
  label.textContent = 'Connecting…';
  try {
    const here = new URL('./', document.baseURI).href;
    const asked = await fetch('/api/auth/sign-in/social', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider, callbackURL: here, errorCallbackURL: here,
        ...(state.signup ? { requestSignUp: true } : {}),
        // Google is asked to confirm on signing up, as the app asks it.
        ...(state.signup && provider === 'google' ? { additionalParams: { access_type: 'offline', prompt: 'consent' } } : {}),
      }),
    });
    const { url } = await asked.json().catch(() => ({}));
    if (!asked.ok || !url) throw new Error('Sign-in didn’t finish. Please try again.');
    location.assign(url);
  } catch (problem) {
    notice(problem instanceof TypeError ? 'Sign-in couldn’t start. Check your connection and try again.' : problem.message, 'error');
    label.textContent = `Continue with ${PROVIDERS[provider]}`;
    state.busy = false;
  }
}
for (const name of Object.keys(PROVIDERS)) $(name).addEventListener('click', () => social(name));

// A passkey, asked for here and checked by ohm's own sign-in, the way the app does it.
$('passkey').addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true;
  const label = $('passkey').querySelector('span');
  label.textContent = 'Waiting for your passkey…';
  try {
    if (!window.PublicKeyCredential?.parseRequestOptionsFromJSON) throw new Error('This browser cannot use a passkey here. Continue with your mailbox.');
    const asked = await fetch('/api/auth/passkey/generate-authenticate-options', { credentials: 'same-origin' });
    if (!asked.ok) throw new Error('That passkey didn’t work. Try again or continue with your mailbox.');
    const credential = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(await asked.json()) });
    const { clientExtensionResults, ...response } = credential.toJSON();
    const checked = await fetch('/api/auth/passkey/verify-authentication', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response }),
    });
    if (!checked.ok) throw new Error((await checked.json().catch(() => ({}))).message || 'That passkey didn’t work. Try again or continue with your mailbox.');
    state.busy = false;
    await open();
  } catch (problem) {
    if (problem.name !== 'NotAllowedError') notice(problem.message, 'error');
  } finally {
    label.textContent = 'Sign in with a passkey';
    state.busy = false;
  }
});
// Coming back from Google or Microsoft with a problem, the address says which.
function returnedProblem() {
  const query = new URLSearchParams(location.search);
  const problem = query.get('error');
  // The PDS answers with a state; a sign-in that went wrong at Google or Microsoft does not.
  if (!problem || query.has('state') || query.has('iss')) return;
  history.replaceState(null, '', location.pathname);
  if (problem === 'signup_disabled') state.signup = true;
  notice(OAUTH_ERRORS[problem] ?? 'Sign-in didn’t finish. Please try again.', 'error');
}

async function signOut() {
  await leave().catch(() => {});
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  location.reload();
}
$('sign-out').addEventListener('click', signOut);
$('leave').addEventListener('click', signOut);

// ---- Onboarding, step two, once: which AT Protocol account this ohm account works in. ----
$('handle').value = localStorage.getItem('ohm.handle') ?? '';
$('site-address').value = localStorage.getItem('ohm.site') ?? '';
$('older').value = localStorage.getItem('ohm.older') ?? '';
$('handle-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    localStorage.setItem('ohm.handle', $('handle').value.trim());
    notice('Taking you to your PDS…');
    await begin($('handle').value);
  } catch (problem) {
    notice(`Connecting did not work: ${problem.message}`, 'error');
  }
});
$('disconnect').addEventListener('click', async () => {
  if (!confirm('Disconnect this AT Protocol account from your ohm account? Your vault is kept, and opens again when you connect it.')) return;
  try {
    await call('com.ohmmmm.account.disconnect', { body: {} });
    location.reload();
  } catch (problem) {
    failed('Disconnecting', problem);
  }
});

// Which of the two screens is up: the panel in the middle, at one of its steps, or the vault.
function screen(name) {
  $('site').hidden = name === 'vault';
  $('app').hidden = name !== 'vault';
  $('sign-in').hidden = name !== 'sign-in';
  $('connect').hidden = name !== 'connect';
}
// Opening the page, and every time the sign-in may have changed: find out who is here and show
// the step they are at.
async function open() {
  let me;
  try {
    // Coming back from the PDS, this is the moment its answer is in the address.
    const returning = await finish().catch(problem => { notice(`Connecting did not work: ${problem.message}`, 'error'); return null; });
    try {
      me = await call('com.ohmmmm.account.get');
    } catch (problem) {
      if (problem.code !== 'SignInRequired') throw problem;
      returnedProblem();
      screen('sign-in');
      await loadOptions();
      return;
    }
    // The PDS has signed the member in to this browser. One token from it, issued for exactly
    // this, ties their AT Protocol account to their ohm account; then that sign-in is let go.
    if (!me.did && (returning ?? await restore())) {
      const { token } = await askPds('com.atproto.server.getServiceAuth', { aud: me.service, lxm: 'com.ohmmmm.account.connect', exp: String(Math.floor(Date.now() / 1000) + 60) });
      const connected = await call('com.ohmmmm.account.connect', { body: { token } });
      await leave();
      me = { ...me, did: connected.did };
      notice('Your account is connected');
    }
  } catch (problem) {
    notice(`${problem.message}`, 'error');
    await leave().catch(() => {});
    if (!me) { screen('sign-in'); await loadOptions(); return; }
  }
  if (!me.did) {
    $('signed-in-as').textContent = me.user.name ? `Signed in as ${me.user.name}.` : 'Signed in.';
    screen('connect');
    $('handle').focus();
    return;
  }
  state.did = me.did;
  $('who').textContent = me.user.name || 'You';
  $('who-did').textContent = me.did;
  for (const avatar of document.querySelectorAll('[data-avatar]')) avatar.textContent = (me.user.name || me.did.split(':').at(-1)).slice(0, 1).toUpperCase();
  screen('vault');
  go('vault');
  await loadTree();
}

// ---- The app's screen: the rail picks a page; the side panel and the main screen follow it. ----
function go(page) {
  state.page = page;
  $('app').dataset.page = page;
  $('panel-title').textContent = PAGES[page];
  document.title = `${PAGES[page]} · ohm`;
  for (const part of $('app').querySelectorAll('.directory-scroll, .directory-actions, .screen')) part.hidden = part.dataset.page !== page;
  for (const button of $('app').querySelectorAll('[data-go]')) button.setAttribute('aria-pressed', String(button.dataset.go === page));
  narrow();
}
// On a phone the side panel is the screen until a post is open.
function narrow() {
  $('app').classList.toggle('mobile-directory', !(state.page === 'vault' && state.current));
}
for (const button of document.querySelectorAll('[data-go]')) button.addEventListener('click', () => go(button.dataset.go));

// ---- The tree. ----
function postButton(post) {
  const button = document.createElement('button');
  button.type = 'button';
  if (state.current?.post.id === post.id) button.setAttribute('aria-current', 'true');
  const who = { public: 'Everyone', friends: 'Friends', private: 'Only me' }[post.visibility];
  const mark = icon(post.visibility);
  mark.dataset.visibility = post.visibility;
  button.title = `${post.title || post.slug} · ${who}`;
  button.append(Object.assign(document.createElement('span'), { className: 'name', textContent: post.title || post.slug }),
    Object.assign(document.createElement('span'), { className: 'visually-hidden', textContent: who }), mark);
  button.addEventListener('click', () => openPost(post.id));
  const item = document.createElement('li');
  item.append(button);
  return item;
}
function list(posts) {
  const items = document.createElement('ul');
  items.append(...posts.map(postButton));
  return items;
}
async function loadTree() {
  try {
    state.tree = await call('getTree');
    const { posts, public: everyone, friends, private: mine, labels } = state.tree;
    $('counts').textContent = posts ? `${plural(posts, 'post')}: ${mine} only me, ${friends} friends, ${everyone} everyone` : 'Your vault is empty.';
    const tree = $('tree');
    tree.replaceChildren();
    for (const folder of labels) {
      tree.append(Object.assign(document.createElement('p'), { className: 'label', textContent: folder.label }), list(folder.posts));
      for (const group of folder.sublabels) tree.append(Object.assign(document.createElement('p'), { className: 'sublabel', textContent: group.sublabel }), list(group.posts));
    }
  } catch (problem) {
    failed('Reading your vault', problem);
  }
}
$('refresh').addEventListener('click', async () => { await loadTree(); say('Read your vault again'); });

// ---- One post. ----
const fields = { title: 'post-name', label: 'label', sublabel: 'sublabel', slug: 'slug', visibility: 'visibility', date: 'date', body: 'body' };
function show(post, version) {
  state.current = { post, version };
  $('post-form').hidden = false;
  $('post-empty').hidden = true;
  narrow();
  $('post-title').textContent = version ? (post.title || post.slug) : 'A new post';
  for (const [name, id] of Object.entries(fields)) $(id).value = post[name] ?? '';
  $('delete').hidden = !version;
  const found = state.tree?.labels.flatMap(folder => [...folder.posts, ...folder.sublabels.flatMap(group => group.posts)]).find(each => each.id === post.id);
  $('post-facts').textContent = version
    ? `ID ${post.id} · version ${version.slice(0, 10)}…${found?.form ? ` · ${found.form}` : ''}${post.address ? ` · ${post.address}` : ''}`
    : `ID ${post.id} · not saved yet`;
  $('post-problems').replaceChildren(...(found?.problems ?? []).map(text => Object.assign(document.createElement('li'), { textContent: `Cannot be published yet: ${text}` })));
}
async function openPost(id) {
  try {
    const { post, version } = await call('getPost', { query: { id } });
    state.current = { post, version };
    await loadTree();
    show(post, version);
  } catch (problem) {
    failed('Opening the post', problem);
  }
}
function newPost() {
  delete $('slug').dataset.typed;
  go('vault');
  show({ id: newPostId(), slug: '', label: '', sublabel: '', visibility: 'private', body: '', properties: {} }, null);
  $('post-name').focus();
}
$('new-post').addEventListener('click', newPost);
$('new-post-here').addEventListener('click', newPost);
// Leaving a post: the main screen is empty again, and on a phone the side panel is back.
function closePost() {
  state.current = null;
  $('post-form').hidden = true;
  $('post-empty').hidden = false;
  narrow();
}
$('back').addEventListener('click', async () => { closePost(); await loadTree(); });
// A new post's slug follows its title until the slug is typed by hand.
$('post-name').addEventListener('input', () => {
  if (state.current && !state.current.version && !$('slug').dataset.typed) $('slug').value = slugOf($('post-name').value);
});
$('slug').addEventListener('input', () => { $('slug').dataset.typed = 'yes'; });

$('post-form').addEventListener('submit', async event => {
  event.preventDefault();
  const { post: before, version } = state.current;
  const text = name => $(fields[name]).value.trim();
  // What the form does not show, such as where a post first appeared or its site's own layer, is kept as it was.
  const post = { ...before, slug: text('slug'), label: text('label'), sublabel: text('sublabel'), visibility: $('visibility').value, body: text('body') };
  for (const name of ['title', 'date']) {
    if (text(name)) post[name] = text(name);
    else delete post[name];
  }
  try {
    const saved = await call('putPost', { body: { post, ...(version ? { replaces: version } : {}) } });
    const how = $('visibility').selectedOptions[0].textContent.toLowerCase();
    say(saved.unchanged ? `Nothing to save in "${post.slug}"` : `Saved "${post.slug}" as ${how}`, { detail: saved });
    notice(saved.unchanged ? 'Nothing to save' : 'Saved');
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
    await call('deletePost', { body: { id: post.id, replaces: version } });
    say(`Removed "${post.slug}"`);
    closePost();
    await loadTree();
  } catch (problem) {
    failed(`Removing "${post.slug}"`, problem);
  }
});

// ---- Bringing in what is already published. ----
async function bringIn(apply) {
  const site = address($('site-address').value);
  const from = $('older').value.trim();
  $('site-address').value = site;
  localStorage.setItem('ohm.site', site);
  localStorage.setItem('ohm.older', from);
  try {
    const report = await call('importPublished', { body: { site, ...(from ? { from } : {}), apply } });
    const text = apply
      ? `Brought in ${plural(report.saved.length, 'post')}; ${report.unchanged.length} were already there; ${report.changedThere.length} have changed in your vault and were left alone`
      : `Found ${plural(report.records, 'published record')}, which make ${plural(report.posts, 'post')}; ${report.sameAsPublished} of ${report.posts} would be published exactly as they are now. Nothing was changed.`;
    say(text, { detail: report });
    notice(apply ? `Brought in ${plural(report.saved.length, 'post')}` : `Found ${plural(report.posts, 'post')}. Nothing was changed.`);
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
    const { files } = await call('exportFiles');
    for (const { path, text } of files) {
      const parts = path.split('/');
      let folder = root;
      for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
      const writing = await (await folder.getFileHandle(parts.at(-1), { create: true })).createWritable();
      await writing.write(text);
      await writing.close();
    }
    say(`Wrote ${plural(files.length, 'post')} into the folder "${root.name}"`, { detail: files.map(file => file.path) });
    notice(`Wrote ${plural(files.length, 'post')} into "${root.name}"`);
  } catch (problem) {
    if (problem.name !== 'AbortError') failed('Writing your vault into a folder', problem);
  }
});
$('export-file').addEventListener('click', async () => {
  try {
    const { files } = await call('exportFiles');
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([JSON.stringify({ files }, null, 2)], { type: 'application/json' })), download: 'ohm-vault.json',
    });
    link.click();
    URL.revokeObjectURL(link.href);
    say(`Downloaded ${plural(files.length, 'post')} as ohm-vault.json`);
  } catch (problem) {
    failed('Downloading your vault', problem);
  }
});

await open();
