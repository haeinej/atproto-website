// The vault page. Onboarding is one panel in the middle of the page, in two steps:
//
// 1. Who you are: an ohm account, made with Google, Microsoft or Bluesky.
// 2. Where your posts live, asked once: a PDS of your own, one you set up now with Cirrus, or your
//    Bluesky account. Their own PDS says the account is theirs. Someone who signed in with Bluesky
//    has answered already.
//
// After that the ohm session alone opens their vault, in the app's screen: a rail, a side panel,
// the post.
// Everything shown is put on the page as text, never as markup.
import { askPds, begin, finish, leave, restore } from './signin.js';

const $ = id => document.getElementById(id);
const state = { mode: 'ohm', me: null, audience: '', did: '', tree: null, current: null, page: 'vault', signup: false, busy: false, step: 'own' };
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

// ---- One request to the vault. It rides on the ohm session the browser already holds, or, for
// a member signed in with their AT Protocol account, carries a token their PDS issues for exactly
// this request. ----
async function call(name, { query, body } = {}) {
  const method = name.includes('.') ? name : `com.ohmmmm.vault.${name}`;
  const url = new URL(`./xrpc/${method}`, document.baseURI);
  if (query) url.search = new URLSearchParams(query);
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (state.mode === 'pds') {
    const { token } = await askPds('com.atproto.server.getServiceAuth', { aud: state.audience, lxm: method, exp: String(Math.floor(Date.now() / 1000) + 60) });
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', headers,
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

// ---- Onboarding, in two steps. One: who you are, an ohm account made with Google, Microsoft
// or Bluesky. Two, once: where your posts live. ----
// For Google and Microsoft, ohm's own sign-in does the work (Better Auth, on this origin).
const OAUTH_ERRORS = {
  account_not_linked: 'This email already has an ohm account with another sign-in. Sign in with that one.',
  account_already_linked_to_different_user: 'That account belongs to another ohm account. It hasn’t been moved.',
  signup_disabled: 'There’s no ohm account for that sign-in yet. Sign up to create one.',
  access_denied: 'Sign-in was cancelled.',
};
const PROVIDERS = { google: 'Google', microsoft: 'Microsoft' };
let options = null;
// Which ways in are set up. Signing up, the first one offered is the filled action, as in the app.
function showSignIn() {
  const { signup } = state;
  $('onboarding-title').textContent = signup ? 'Sign up to ohm' : 'Sign in to ohm';
  $('switch-text').textContent = signup ? 'Already have an account?' : 'Don’t have an account?';
  $('switch-mode').textContent = signup ? 'Sign in' : 'Sign up';
  const offered = Object.keys(PROVIDERS).filter(name => options?.providers?.[name]);
  for (const name of Object.keys(PROVIDERS)) {
    $(name).hidden = !offered.includes(name);
    const first = signup && offered[0] === name;
    $(name).classList.toggle('primary', first);
    $(name).classList.toggle('secondary', !first);
  }
}
$('switch-mode').addEventListener('click', () => { state.signup = !state.signup; showSignIn(); });

async function loadOptions() {
  if (!options) {
    try {
      const answered = await fetch('/api/account/config', { credentials: 'same-origin' });
      if (!answered.ok) throw new Error();
      options = await answered.json();
    } catch {
      notice('Sign-in options couldn’t load. Please try again.', 'error');
    }
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

// The handle step. Bluesky asks for it to sign in, at step one; Bluesky and a PDS of your own
// ask for it at step two, to say where an ohm account's posts live. Either way the member is
// sent to the server that holds their account, approves there, and is brought straight back.
const STEPS = {
  bluesky: {
    title: 'Bluesky', label: 'Your Bluesky handle', placeholder: 'name.bsky.social',
    text: 'Bluesky will ask you to confirm, and bring you straight back. Your password is never typed here.',
  },
  own: {
    title: 'Your own PDS', label: 'Your handle', placeholder: 'example.com',
    text: 'Your handle is your own domain. Your PDS, Cirrus or any other, will ask you to confirm, with your passkey there if you have one, and bring you straight back.',
  },
};
function handleStep(step) {
  state.step = step;
  const { title, label, placeholder, text } = STEPS[step];
  $('handle-title').textContent = title;
  $('handle-text').textContent = text;
  $('handle-label').textContent = label;
  $('handle').placeholder = placeholder;
  $('handle').value = localStorage.getItem(`ohm.handle.${step}`) ?? '';
  screen('connect');
  $('handle').focus();
}
// Step one's Bluesky signs in. Step two's choices say where a signed-in member's posts live.
$('bluesky').addEventListener('click', () => handleStep('bluesky'));
$('have-bluesky').addEventListener('click', () => handleStep('bluesky'));
$('have-pds').addEventListener('click', () => handleStep('own'));
$('have-site').addEventListener('click', () => screen('cirrus'));
$('cirrus-done').addEventListener('click', () => handleStep('own'));
// The arrow in the panel's corner goes back to the step this one was reached from.
for (const back of document.querySelectorAll('[data-back]')) back.addEventListener('click', () => screen(state.me ? 'where' : 'sign-in'));

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

// Signing out ends whichever sign-in this is: the PDS is told its one is over, and ohm its own.
async function signOut() {
  await leave().catch(() => {});
  if (state.mode === 'ohm') await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  location.reload();
}
$('sign-out').addEventListener('click', signOut);
$('leave').addEventListener('click', signOut);

$('site-address').value = localStorage.getItem('ohm.site') ?? '';
$('older').value = localStorage.getItem('ohm.older') ?? '';
$('handle-form').addEventListener('submit', async event => {
  event.preventDefault();
  const connecting = Boolean(state.me);
  try {
    // A Bluesky name typed on its own is the handle Bluesky gives it.
    let handle = $('handle').value.trim().replace(/^@/, '');
    if (state.step === 'bluesky' && handle && !handle.includes('.') && !handle.includes(':')) handle = `${handle}.bsky.social`;
    $('handle').value = handle;
    localStorage.setItem(`ohm.handle.${state.step}`, handle);
    notice(state.step === 'bluesky' ? 'Taking you to Bluesky…' : 'Taking you to your PDS…');
    await begin(handle, connecting ? 'connect' : 'sign-in');
  } catch (problem) {
    notice(`${connecting ? 'Connecting' : 'Signing in'} did not work: ${problem.message}`, 'error');
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

// Which screen is up: the panel in the middle, at one of its steps, or the vault.
function screen(name) {
  $('site').hidden = name === 'vault';
  $('app').hidden = name !== 'vault';
  for (const step of ['sign-in', 'where', 'cirrus', 'connect']) $(step).hidden = name !== step;
}

// One token from the member's PDS, issued for one request and nothing else.
const pdsToken = async (aud, lxm) => (await askPds('com.atproto.server.getServiceAuth', { aud, lxm, exp: String(Math.floor(Date.now() / 1000) + 60) })).token;
// ohm's own sign-in, told who the PDS says this is: it signs them in, or adds the AT Protocol
// account to the ohm account that is signed in. It asks the vault service to read the token.
async function tellOhm(path, token) {
  const answered = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  const data = await answered.json().catch(() => ({}));
  if (!answered.ok) throw Object.assign(new Error(data.message || 'Sign-in didn’t finish. Please try again.'), { code: data.code === 'NOT_A_MEMBER' ? 'NotAMember' : data.code });
  return data;
}

// Opening the page, and every time the sign-in may have changed: find out who is here and show
// the step they are at.
async function open() {
  state.mode = 'ohm';
  state.me = null;
  let me = null;
  let pds = null;
  await loadOptions();
  const whoAmI = async () => {
    try {
      return await call('com.ohmmmm.account.get');
    } catch (problem) {
      if (problem.code !== 'SignInRequired') throw problem;
      return null;
    }
  };
  try {
    // Coming back from the PDS, this is the moment its answer is in the address.
    pds = await finish().catch(problem => { notice(`Signing in did not work: ${problem.message}`, 'error'); return null; }) ?? await restore();
    me = await whoAmI();
    // Signed in at Bluesky or a PDS, and not yet to ohm: the PDS says who this is, and ohm signs
    // them in, making their ohm account the first time. Their posts already live in that account.
    let fresh = false;
    if (!me && pds && options?.atproto) {
      await tellOhm('/api/auth/sign-in/atproto', await pdsToken(pds.service, 'com.ohmmmm.identity.whoAmI'));
      me = await whoAmI();
      fresh = Boolean(me);
    }
    // Saying where the posts live: the PDS has signed the member in to this browser. One token
    // from it, issued for exactly this, ties their AT Protocol account to their ohm account, here
    // and in ohm's sign-in, so that signing in with it later is the same account. Then the
    // browser's sign-in at the PDS is let go: the ohm session is what stays.
    if (me && !me.did && pds && (fresh || pds.purpose === 'connect')) {
      if (!fresh && options?.atproto) await tellOhm('/api/auth/atproto/link', await pdsToken(me.service, 'com.ohmmmm.identity.whoAmI'));
      const connected = await call('com.ohmmmm.account.connect', { body: { token: await pdsToken(me.service, 'com.ohmmmm.account.connect') } });
      await leave();
      me = { ...me, did: connected.did };
      if (!fresh) notice('Your account is connected');
    }
    if (me) {
      state.me = me;
      if (me.did) return await enter({ name: me.user.name || 'You', did: me.did });
      $('signed-in-as').textContent = me.user.name ? `Signed in as ${me.user.name}.` : 'Signed in.';
      return screen('where');
    }
    // ohm's sign-in does not take AT Protocol accounts yet: the account itself is the sign-in,
    // kept in this browser, and its PDS vouches for each request.
    if (pds) {
      state.mode = 'pds';
      state.audience = pds.service;
      return await enter({ name: pds.handle || 'You', did: pds.did });
    }
  } catch (problem) {
    notice(problem.code === 'NotAMember' ? 'ohm is not open to this account yet.' : `${problem.message}`, 'error');
    await leave().catch(() => {});
    state.mode = 'ohm';
    if (me && !me.did) {
      state.me = me;
      $('signed-in-as').textContent = me.user.name ? `Signed in as ${me.user.name}.` : 'Signed in.';
      return screen('where');
    }
  }
  returnedProblem();
  screen('sign-in');
}
// The vault opens. Reading it first means an account that is not let in never sees it empty.
async function enter({ name, did }) {
  state.tree = await call('getTree');
  state.did = did;
  $('who').textContent = name;
  $('who-did').textContent = did;
  $('disconnect').hidden = state.mode === 'pds';
  for (const avatar of document.querySelectorAll('[data-avatar]')) avatar.textContent = name.slice(0, 1).toUpperCase();
  screen('vault');
  go('vault');
  showTree();
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
function showTree() {
  const { posts, public: everyone, friends, private: mine, labels } = state.tree;
  $('counts').textContent = posts ? `${plural(posts, 'post')}: ${mine} only me, ${friends} friends, ${everyone} everyone` : 'Your vault is empty.';
  const tree = $('tree');
  tree.replaceChildren();
  for (const folder of labels) {
    tree.append(Object.assign(document.createElement('p'), { className: 'label', textContent: folder.label }), list(folder.posts));
    for (const group of folder.sublabels) tree.append(Object.assign(document.createElement('p'), { className: 'sublabel', textContent: group.sublabel }), list(group.posts));
  }
}
async function loadTree() {
  try {
    state.tree = await call('getTree');
    showTree();
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
