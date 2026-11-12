// Signing in through the member's own PDS, the way any AT Protocol application does: the member
// types their handle, is sent to their PDS to approve, with a passkey if they have one, and comes
// back signed in. No password is typed here or seen by this page.
// https://atproto.com/specs/oauth
//
// What makes the sign-in stay: a key made in this browser that cannot be copied out of it. The PDS
// ties the sign-in to that key, so what is kept on this device is of no use anywhere else.
const SCOPE = 'atproto transition:generic';
const clientId = () => `${location.origin}/client-metadata.json`;
const redirectUri = () => `${location.origin}/`;

const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const text = value => encode(new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)));
const random = length => encode(crypto.getRandomValues(new Uint8Array(length)));
const sha256 = async value => encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

// ---- What is kept on this device, in the browser's own database. ----
function database() {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('ohm-vault', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('kept');
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
}
async function kept(name, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const store = db.transaction('kept', value === undefined ? 'readonly' : 'readwrite').objectStore('kept');
    const asked = value === undefined ? store.get(name) : value === null ? store.delete(name) : store.put(value, name);
    asked.onsuccess = () => resolve(asked.result ?? null);
    asked.onerror = () => reject(asked.error);
  });
}

// ---- The proof sent with each request, signed by this browser's key. ----
async function proof(keys, method, address, accessToken) {
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const url = new URL(address);
  const signed = `${text({ typ: 'dpop+jwt', alg: 'ES256', jwk: { kty, crv, x, y } })}.${text({
    jti: random(16), htm: method, htu: `${url.origin}${url.pathname}`, iat: Math.floor(Date.now() / 1000),
    ...(accessToken ? { ath: await sha256(accessToken) } : {}),
  })}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(signed));
  return `${signed}.${encode(signature)}`;
}

async function readJson(response, doing) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${doing}: ${data.error_description || data.message || data.error || `HTTP ${response.status}`}`);
  return data;
}
async function form(keys, address, fields) {
  const response = await fetch(address, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', DPoP: await proof(keys, 'POST', address) },
    body: new URLSearchParams(fields),
  });
  return response;
}

// Step one: find the account, ask its PDS to start a sign-in, and send the member there.
export async function begin(typed) {
  const account = await readJson(await fetch(`/xrpc/com.ohmmmm.identity.findAccount?${new URLSearchParams({ account: typed })}`), 'Finding your account');
  const resource = await readJson(await fetch(`${account.pds}/.well-known/oauth-protected-resource`), 'Asking your PDS how to sign in');
  const issuer = resource.authorization_servers?.[0];
  // A PDS on this machine, for trying things out, is the one that may be reached without https.
  const local = typeof issuer === 'string' && URL.canParse(issuer) && ['localhost', '127.0.0.1'].includes(new URL(issuer).hostname);
  if (typeof issuer !== 'string' || !(issuer.startsWith('https://') || local)) throw new Error('Your PDS did not say where to sign in');
  const server = await readJson(await fetch(`${issuer}/.well-known/oauth-authorization-server`), 'Asking your PDS how to sign in');
  if (server.issuer !== issuer) throw new Error('Your PDS answered for a different server');
  // The key never leaves this browser: it is made so that it cannot be copied out.
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const verifier = random(48);
  const state = random(24);
  const pushed = await readJson(await form(keys, server.pushed_authorization_request_endpoint, {
    client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code', scope: SCOPE, state,
    code_challenge: await sha256(verifier), code_challenge_method: 'S256', login_hint: account.handle ?? account.did,
  }), 'Starting the sign-in at your PDS');
  await kept('pending', { state, verifier, keys, issuer, tokenEndpoint: server.token_endpoint, revocationEndpoint: server.revocation_endpoint ?? null, account });
  const next = new URL(server.authorization_endpoint);
  next.search = new URLSearchParams({ client_id: clientId(), request_uri: pushed.request_uri });
  location.assign(next);
}

function save(pending, tokens) {
  return kept('session', {
    account: pending.account, keys: pending.keys, issuer: pending.issuer, tokenEndpoint: pending.tokenEndpoint, revocationEndpoint: pending.revocationEndpoint,
    accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null, expiresAt: Date.now() + (tokens.expires_in ?? 300) * 1000,
  });
}

// Step two, on coming back from the PDS: swap what it sent for a sign-in, and keep it.
// Answers with the account when this visit is a return from the PDS, and nothing otherwise.
export async function finish() {
  const came = new URLSearchParams(location.search.length > 1 ? location.search : location.hash.slice(1));
  if (!came.has('state') || (!came.has('code') && !came.has('error'))) return null;
  // What the PDS sent is taken out of the address at once, so it is not left in the history.
  history.replaceState(null, '', location.pathname);
  const pending = await kept('pending');
  await kept('pending', null);
  if (!pending || came.get('state') !== pending.state) throw new Error('This sign-in was not started here, or was started too long ago. Try again.');
  if (came.has('error')) throw new Error(came.get('error') === 'access_denied' ? 'The sign-in was not approved' : (came.get('error_description') || came.get('error')));
  if (came.get('iss') !== pending.issuer) throw new Error('The answer came from a different server than the one asked');
  const tokens = await readJson(await form(pending.keys, pending.tokenEndpoint, {
    grant_type: 'authorization_code', code: came.get('code'), redirect_uri: redirectUri(), client_id: clientId(), code_verifier: pending.verifier,
  }), 'Finishing the sign-in at your PDS');
  // The PDS says whose sign-in this is. It has to be the account that was asked for, whose own
  // DID document named this PDS; anything else is refused.
  if (tokens.sub !== pending.account.did) throw new Error('Your PDS signed in a different account than the one you typed');
  await save(pending, tokens);
  return pending.account;
}

// A sign-in kept from an earlier visit, if there is one.
export async function restore() {
  return (await kept('session'))?.account ?? null;
}

// A sign-in is renewed a little before it runs out. Each renewal replaces the one before, so two
// requests that find it stale at the same moment share one renewal and do not spoil each other's.
let renewing = null;
async function fresh(session) {
  if (session.expiresAt - Date.now() > 30_000) return session;
  if (!session.refreshToken) throw new Error('Your sign-in has run out. Sign in again.');
  renewing ??= (async () => {
    const tokens = await readJson(await form(session.keys, session.tokenEndpoint, {
      grant_type: 'refresh_token', refresh_token: session.refreshToken, client_id: clientId(),
    }), 'Renewing your sign-in');
    await save(session, tokens);
    return kept('session');
  })().finally(() => { renewing = null; });
  return renewing;
}

// One request to the member's own PDS, as the member.
export async function askPds(method, query) {
  let session = await kept('session');
  if (!session) throw new Error('You are not signed in');
  for (let attempt = 0; ; attempt++) {
    session = await fresh(session);
    const url = new URL(`/xrpc/${method}`, session.account.pds);
    if (query) url.search = new URLSearchParams(query);
    const response = await fetch(url, {
      headers: { Authorization: `DPoP ${session.accessToken}`, DPoP: await proof(session.keys, 'GET', url, session.accessToken) },
    });
    // A sign-in the PDS no longer accepts is renewed once, then given up on.
    if (response.status === 401 && attempt === 0 && session.refreshToken) {
      session = { ...session, expiresAt: 0 };
      continue;
    }
    return readJson(response, 'Your PDS');
  }
}

// Sign out: tell the PDS the sign-in is over, and forget it here.
export async function leave() {
  const session = await kept('session');
  await kept('session', null);
  await kept('pending', null);
  if (!session?.revocationEndpoint) return;
  await form(session.keys, session.revocationEndpoint, { token: session.refreshToken ?? session.accessToken, client_id: clientId() }).catch(() => {});
}
