// The vault page. Onboarding is one panel in the middle of the page, in two steps:
//
// 1. Who you are: an ohm account, made with Google, Microsoft or Bluesky.
// 2. Where your posts live, asked once, on one screen: the handle of their AT Protocol account (a
//    PDS of their own, or Bluesky) and an app password. Their own PDS says the account is theirs.
//    Someone with no PDS yet is shown how to set one up; someone who signed in with Bluesky has
//    answered already.
//
// After that the ohm session alone opens their vault, in the app's screen: a rail, a side panel,
// the post.
// Everything shown is put on the page as text, never as markup.
import { askPds, begin, beginWithPassword, finish, leave, restore } from './signin.js';

const $ = id => document.getElementById(id);
const state = { mode: 'ohm', me: null, audience: '', did: '', tree: null, current: null, page: 'vault', signup: false, busy: false, step: 'where' };
const PAGES = { vault: 'Vault' };
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
function failed(doing, problem) {
  notice(`${doing} did not work: ${problem.message}`, 'error');
}

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
    text: 'Sign in here with your handle and an app password from Bluesky.', there: 'Approve at Bluesky instead',
  },
  // Step two, on one screen: the account is named by its handle, whichever kind it is.
  where: {
    title: 'Where do your posts live?', label: 'Your handle', placeholder: 'example.com or name.bsky.social',
    text: 'In an AT Protocol account that stays yours. Type its handle: your own domain, on a PDS of your own, or your Bluesky handle.',
    there: 'Use a passkey at your PDS instead',
  },
};
function handleStep(step) {
  state.step = step;
  const { title, label, placeholder, text, there } = STEPS[step];
  $('approve-there').textContent = there;
  // Step two has no step to go back to: its ways out are setting up a PDS, and signing out.
  for (const id of ['no-pds', 'signed-in']) $(id).hidden = step !== 'where';
  $('handle-back').hidden = step === 'where';
  $('password').value = '';
  $('handle-title').textContent = title;
  $('handle-text').textContent = text;
  $('handle-label').textContent = label;
  $('handle').placeholder = placeholder;
  $('handle').value = localStorage.getItem(`ohm.handle.${step}`) ?? '';
  screen('connect');
  $('handle').focus();
}
// Step one's Bluesky signs in. Someone with a website and no PDS is shown how to set one up, and
// comes back to step two.
$('bluesky').addEventListener('click', () => handleStep('bluesky'));
$('no-pds').addEventListener('click', () => screen('cirrus'));
$('cirrus-done').addEventListener('click', () => handleStep('where'));
// The arrow in the panel's corner goes back to the step this one was reached from.
for (const back of document.querySelectorAll('[data-back]')) back.addEventListener('click', () => (state.me ? handleStep('where') : screen('sign-in')));

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

// The handle as it was typed, tidied. A Bluesky name typed on its own is the handle Bluesky gives it.
function typedHandle() {
  let handle = $('handle').value.trim().replace(/^@/, '');
  if (state.step === 'bluesky' && handle && !handle.includes('.') && !handle.includes(':')) handle = `${handle}.bsky.social`;
  $('handle').value = handle;
  localStorage.setItem(`ohm.handle.${state.step}`, handle);
  return handle;
}
// Continue: the handle and an app password, here on ohm's own panel. The password goes to the
// member's own PDS and is cleared from the page at once; nothing is kept.
$('handle-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) return;
  const connecting = Boolean(state.me);
  const password = $('password').value;
  if (!password) {
    notice('Type an app password, or use the other way below.', 'error');
    $('password').focus();
    return;
  }
  state.busy = true;
  try {
    await beginWithPassword(typedHandle(), password, connecting ? 'connect' : 'sign-in');
    $('password').value = '';
    state.busy = false;
    await open();
  } catch (problem) {
    notice(`${connecting ? 'Connecting' : 'Signing in'} did not work: ${problem.message}`, 'error');
  } finally {
    state.busy = false;
  }
});
// The other way: approve at the PDS itself, which is where a passkey works.
$('approve-there').addEventListener('click', async () => {
  const connecting = Boolean(state.me);
  if (!$('handle').reportValidity()) return;
  try {
    const handle = typedHandle();
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
  for (const step of ['sign-in', 'cirrus', 'connect']) $(step).hidden = name !== step;
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
    }
    if (me) {
      state.me = me;
      if (me.did) return await enter({ name: me.user.name || 'You', did: me.did, mirrored: me.mirrored });
      $('signed-in-as').textContent = me.user.name ? `Signed in as ${me.user.name}.` : 'Signed in.';
      return handleStep('where');
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
      return handleStep('where');
    }
  }
  returnedProblem();
  screen('sign-in');
}
// The vault opens. Reading it first means an account that is not let in never sees it empty.
async function enter({ name, did, mirrored = true }) {
  state.tree = await call('getTree');
  state.did = did;
  $('who').textContent = name;
  $('who-did').textContent = did;
  $('disconnect').hidden = state.mode === 'pds';
  for (const avatar of document.querySelectorAll('[data-avatar]')) avatar.textContent = name.slice(0, 1).toUpperCase();
  screen('vault');
  go('vault');
  showTree();
  // A new account's vault is filled from its PDS without being asked.
  if (!mirrored) await mirror({ first: true });
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
// The repository as a tree of folders. What the folders are is the member's choice of view:
// their labels (a label is a folder, a sublabel a folder inside it), the platforms the posts
// first appeared on, or who can see them. A folder opens and closes, and stays as it was left.
const closed = new Set(JSON.parse(localStorage.getItem('ohm.tree.closed') ?? '[]'));
function folder(key, name, children) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'folder-row';
  const inside = document.createElement('div');
  inside.className = 'children';
  inside.append(...children);
  const set = open => {
    row.setAttribute('aria-expanded', String(open));
    inside.hidden = !open;
  };
  row.append(icon('chevron'), Object.assign(document.createElement('span'), { className: 'name', textContent: name }));
  row.addEventListener('click', () => {
    const open = row.getAttribute('aria-expanded') !== 'true';
    if (open) closed.delete(key); else closed.add(key);
    localStorage.setItem('ohm.tree.closed', JSON.stringify([...closed]));
    set(open);
  });
  set(!closed.has(key));
  const box = document.createElement('div');
  box.className = 'folder';
  box.append(row, inside);
  return box;
}

// The three things a post can be told apart by. Each is a view, and each can be filtered on.
const VISIBILITY = { public: 'Everyone', friends: 'Friends', private: 'Only me' };
// A post that first appeared somewhere else names the platform; one that did not is the member's own.
const OWN = 'Your website';
// A platform is written as its name is: the ones known by another spelling, then a capital for the rest.
const platformName = name => (name ? ({ x: 'X', twitter: 'X', youtube: 'YouTube', linkedin: 'LinkedIn', github: 'GitHub', tiktok: 'TikTok' }[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1)) : OWN);
// Names go in the order they are read in: the member's own website before other platforms, and
// the widest audience first.
const inOrder = first => (a, b) => (first.includes(a) ? first.indexOf(a) : first.length) - (first.includes(b) ? first.indexOf(b) : first.length) || a.localeCompare(b);
const KINDS = {
  label: { name: 'Labels', of: post => post.label, order: inOrder([]) },
  platform: { name: 'Platforms', of: post => platformName(post.platform), order: inOrder([OWN]) },
  visibility: { name: 'Visibility', of: post => VISIBILITY[post.visibility], order: inOrder(Object.values(VISIBILITY)) },
};
const view = { kind: KINDS[localStorage.getItem('ohm.tree.view')] ? localStorage.getItem('ohm.tree.view') : 'label', filtering: false };
// What is filtered out: for each kind, the names not to show.
const hidden = Object.fromEntries(Object.keys(KINDS).map(kind => [kind, new Set()]));
try {
  for (const [kind, names] of Object.entries(JSON.parse(localStorage.getItem('ohm.tree.hidden') ?? '{}'))) if (hidden[kind]) hidden[kind] = new Set(names);
} catch {
  // Nothing is filtered out.
}
const remember = () => {
  localStorage.setItem('ohm.tree.view', view.kind);
  localStorage.setItem('ohm.tree.hidden', JSON.stringify(Object.fromEntries(Object.entries(hidden).map(([kind, names]) => [kind, [...names]]))));
};
// Every post in the vault, each knowing its label and sublabel.
const everyPost = () => (state.tree?.labels ?? []).flatMap(each => [
  ...each.posts.map(post => ({ ...post, label: each.label, sublabel: '' })),
  ...each.sublabels.flatMap(group => group.posts.map(post => ({ ...post, label: each.label, sublabel: group.sublabel }))),
]);
function pill(text, pressed, press) {
  const button = Object.assign(document.createElement('button'), { type: 'button', className: 'pill', textContent: text });
  button.setAttribute('aria-pressed', String(pressed));
  button.addEventListener('click', press);
  return button;
}
function showTree() {
  const all = everyPost();
  const shown = all.filter(post => Object.entries(KINDS).every(([kind, { of }]) => !hidden[kind].has(of(post))));
  const out = all.length - shown.length;
  // Only an empty vault says so; the tree speaks for itself otherwise.
  $('counts').textContent = all.length ? '' : 'Your vault is empty.';

  // The pills that choose the view.
  $('views').replaceChildren(...Object.entries(KINDS).map(([kind, { name }]) => pill(name, view.kind === kind, () => { view.kind = kind; remember(); showTree(); })));
  // The filter: for each kind, a pill for every name there is. A pill that is off is filtered out.
  $('filter').setAttribute('aria-pressed', String(view.filtering || out > 0));
  $('filter').title = out ? `${plural(out, 'post')} filtered out` : 'Filter';
  $('filters').hidden = !view.filtering;
  $('filters').replaceChildren(...Object.entries(KINDS).flatMap(([kind, { name, of, order }]) => {
    const names = [...new Set([...all.map(of), ...hidden[kind]])].sort(order);
    if (names.length < 2 && !hidden[kind].size) return [];
    const row = document.createElement('div');
    row.className = 'pills';
    row.append(...names.map(each => pill(each, !hidden[kind].has(each), () => {
      if (hidden[kind].has(each)) hidden[kind].delete(each); else hidden[kind].add(each);
      remember();
      showTree();
    })));
    return [Object.assign(document.createElement('p'), { className: 'filter-name small', textContent: name }), row];
  }));

  // The tree itself. Folders come before the posts beside them, as in a file tree.
  const groups = new Map();
  for (const post of shown) {
    const name = KINDS[view.kind].of(post);
    (groups.get(name) ?? groups.set(name, []).get(name)).push(post);
  }
  $('tree').replaceChildren(...[...groups].sort(([a], [b]) => KINDS[view.kind].order(a, b)).map(([name, posts]) => {
    if (view.kind !== 'label') return folder(`${view.kind}:${name}`, name, [list(posts)]);
    const inside = new Map();
    for (const post of posts.filter(each => each.sublabel)) (inside.get(post.sublabel) ?? inside.set(post.sublabel, []).get(post.sublabel)).push(post);
    const loose = posts.filter(each => !each.sublabel);
    return folder(name, name, [
      ...[...inside].map(([sublabel, under]) => folder(`${name}/${sublabel}`, sublabel, [list(under)])),
      ...(loose.length ? [list(loose)] : []),
    ]);
  }));
  if (all.length && !shown.length) $('tree').append(Object.assign(document.createElement('p'), { className: 'small filter-name', textContent: 'Everything is filtered out.' }));
}
$('filter').addEventListener('click', () => { view.filtering = !view.filtering; showTree(); });
async function loadTree() {
  try {
    state.tree = await call('getTree');
    showTree();
  } catch (problem) {
    failed('Reading your vault', problem);
  }
}
// The arrows in the side panel's heading: bring in whatever is new on the PDS, and read the vault again.
$('mirror').addEventListener('click', () => mirror());

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
    notice(saved.unchanged ? 'Nothing to save' : 'Saved');
    await openPost(post.id);
  } catch (problem) {
    failed(`Saving "${post.slug}"`, problem);
    if (problem.code === 'Changed') notice('It was changed somewhere else since you opened it. Open it again to see the newer version; what you typed is still in the form.', 'error');
  }
});
$('delete').addEventListener('click', async () => {
  const { post, version } = state.current;
  if (!confirm(`Remove "${post.title || post.slug}" from your vault? This cannot be undone here.`)) return;
  try {
    await call('deletePost', { body: { id: post.id, replaces: version } });
    closePost();
    await loadTree();
  } catch (problem) {
    failed(`Removing "${post.slug}"`, problem);
  }
});

// ---- The mirror: what the member has published on their PDS, brought into the vault. ----
// Nothing has to be told: the service finds their website and their types of post itself. It runs
// on its own the first time an account's vault opens, and again whenever the member asks. It only
// reads the PDS, and never changes a post the member has since changed here.
async function mirror({ first = false } = {}) {
  if (state.busy) return;
  state.busy = true;
  $('mirror').disabled = true;
  if (first) notice('Bringing in what you have published…');
  try {
    const report = await call('importPublished', { body: { apply: true } });
    state.tree = await call('getTree');
    showTree();
    const left = report.skipped.length + report.refused.length;
    notice(report.saved.length
      ? `Brought in ${plural(report.saved.length, 'post')} from your PDS${left ? `; ${left} could not be read` : ''}`
      : first ? 'Nothing is published on your PDS yet' : 'Nothing new on your PDS');
  } catch (problem) {
    failed('Bringing in your published posts', problem);
  } finally {
    state.busy = false;
    $('mirror').disabled = false;
  }
}

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
    notice(`Downloaded ${plural(files.length, 'post')}`);
  } catch (problem) {
    failed('Downloading your vault', problem);
  }
});

await open();
