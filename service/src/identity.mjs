// Who is asking. A member proves their DID with a short-lived token from their own PDS, signed
// with the key their DID document names. There are no accounts or passwords of ours.
// https://atproto.com/specs/xrpc#inter-service-authentication-jwt
import { p256 } from '@noble/curves/p256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Refused } from './store.mjs';

const DID = /^(?:did:plc:[a-z2-7]{24}|did:web:[A-Za-z0-9.-]+(?:%3A\d{1,5})?(?::[A-Za-z0-9._-]+)*)$/;
const refuse = message => { throw new Refused(401, 'AuthRequired', message); };

const fromBase64Url = text => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function fromBase58(text) {
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error('Not base58');
    value = value * 58n + BigInt(digit);
  }
  const bytes = [];
  for (; value > 0n; value >>= 8n) bytes.unshift(Number(value & 0xffn));
  for (const char of text) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

// The two kinds of key an AT Protocol account signs with, by the two bytes a key starts with.
const CURVES = [
  { alg: 'ES256K', prefix: [0xe7, 0x01], curve: secp256k1 },
  { alg: 'ES256', prefix: [0x80, 0x24], curve: p256 },
];

// The signing key a DID document names: its `#atproto` verification method.
export function signingKey(document, did) {
  const method = (document?.verificationMethod ?? []).find(each => each?.id === `${did}#atproto` || each?.id === '#atproto');
  const text = method?.publicKeyMultibase;
  if (document?.id !== did || typeof text !== 'string' || !text.startsWith('z')) return null;
  let bytes;
  try {
    bytes = fromBase58(text.slice(1));
  } catch {
    return null;
  }
  const kind = CURVES.find(({ prefix }) => bytes[0] === prefix[0] && bytes[1] === prefix[1]);
  return kind && bytes.length === 35 ? { alg: kind.alg, curve: kind.curve, key: bytes.slice(2) } : null;
}

// The PDS a DID document names: where the account's repository is kept.
export function pdsOf(document) {
  const service = (document?.service ?? []).find(each => (each?.id === '#atproto_pds' || each?.id?.endsWith?.('#atproto_pds')) && each.type === 'AtprotoPersonalDataServer');
  const address = typeof service?.serviceEndpoint === 'string' && URL.canParse(service.serviceEndpoint) ? new URL(service.serviceEndpoint) : null;
  return address && address.protocol === 'https:' && address.href === `${address.origin}/` ? address.origin : null;
}

// Where a DID's document is kept.
export function documentAddress(did, directory = 'https://plc.directory') {
  if (did.startsWith('did:plc:')) return `${directory}/${did}`;
  const [host, ...path] = did.slice('did:web:'.length).split(':');
  return `https://${decodeURIComponent(host)}/${path.length ? `${path.join('/')}/did.json` : '.well-known/did.json'}`;
}

const HANDLE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

// Find an account from what a person types to sign in: their handle, which is a domain name, or
// their DID. Answers with the DID, the handle, and the PDS the account's own DID document names.
// A handle is looked up the two ways AT Protocol allows, a DNS record and a file on the domain,
// and is believed only if the DID's document names the handle back.
export async function findAccount(typed, { get = fetch, directory } = {}) {
  const input = String(typed ?? '').trim().replace(/^@/, '').toLowerCase();
  const refuse = message => { throw new Refused(404, 'AccountNotFound', message); };
  let did = DID.test(String(typed ?? '').trim()) ? String(typed).trim() : null;
  const handle = did ? null : HANDLE.test(input) ? input : refuse('A handle is a domain name, such as example.com');
  // A redirect is not followed: the answer has to come from the address that was asked. Cloudflare
  // accepts only 'follow' and 'manual' here, and a request made with anything else fails outright.
  const options = { redirect: 'manual', signal: AbortSignal.timeout(8_000) };
  if (handle) {
    try {
      const url = new URL('https://cloudflare-dns.com/dns-query');
      url.search = new URLSearchParams({ name: `_atproto.${handle}`, type: 'TXT' });
      const answer = await (await get(url, { ...options, headers: { Accept: 'application/dns-json' } })).json();
      const found = (answer.Answer ?? []).map(each => String(each.data).replaceAll('"', '')).filter(text => text.startsWith('did='));
      if (found.length === 1 && DID.test(found[0].slice(4))) did = found[0].slice(4);
    } catch {
      // The file on the domain is tried next.
    }
    if (!did) {
      try {
        const response = await get(`https://${handle}/.well-known/atproto-did`, options);
        const text = response.ok ? (await response.text()).trim() : '';
        if (DID.test(text)) did = text;
      } catch {
        // Said below.
      }
    }
    if (!did) refuse(`No AT Protocol account was found for ${handle}`);
  }
  let document;
  try {
    const response = await get(documentAddress(did, directory), { ...options, headers: { Accept: 'application/json' } });
    document = response.ok ? await response.json() : null;
  } catch {
    document = null;
  }
  const pds = document?.id === did ? pdsOf(document) : null;
  if (!pds) refuse(`The account ${did} does not say where its repository is kept`);
  const named = (document.alsoKnownAs ?? []).filter(each => typeof each === 'string' && each.startsWith('at://')).map(each => each.slice(5).toLowerCase());
  if (handle && !named.includes(handle)) refuse(`${handle} points to ${did}, but that account does not name ${handle} as its handle`);
  return { did, handle: handle ?? named[0] ?? null, pds };
}

// `members` is the DIDs allowed in, or '*' for anyone. It is checked before anything is fetched,
// so a token cannot make the service go and read an address of the sender's choosing.
export function createIdentity({ audience, members, get = fetch, directory, now = () => Date.now() }) {
  const allowed = members === '*' ? null : new Set(String(members ?? '').split(/[\s,]+/).filter(Boolean));
  const documents = new Map();

  async function keyFor(did) {
    const held = documents.get(did);
    if (held && held.until > now()) return held.key;
    let key = null;
    try {
      const response = await get(documentAddress(did, directory), { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        const document = await response.json();
        key = signingKey(document, did);
        if (key) key.pds = pdsOf(document);
      }
    } catch {
      key = null;
    }
    // A document is read again after five minutes, so a changed key is picked up and a missing one retried.
    if (key) documents.set(did, { key, until: now() + 300_000 });
    return key;
  }

  // The DID a request comes from. `method` is the request being made; the token must have been
  // issued for that request and no other.
  async function whoIs(request, method) {
    const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1] ?? refuse('This request needs a token from your PDS');
    const parts = token.split('.');
    let header, claims, signature;
    try {
      if (parts.length !== 3) throw new Error('Not a token');
      header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
      claims = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
      signature = fromBase64Url(parts[2]);
    } catch {
      refuse('The token could not be read');
    }
    const did = claims.iss;
    const seconds = now() / 1000;
    if (typeof did !== 'string' || !DID.test(did)) refuse('The token does not say who it is from');
    if (allowed && !allowed.has(did)) throw new Refused(403, 'NotAMember', 'This account has not been let in yet');
    if (claims.aud !== audience) refuse('The token was issued for another service');
    if (claims.lxm !== method) refuse('The token was issued for another request');
    if (typeof claims.exp !== 'number' || claims.exp <= seconds || claims.exp > seconds + 3600) refuse('The token has expired, or lasts longer than an hour');
    if (typeof claims.iat === 'number' && claims.iat > seconds + 60) refuse('The token is dated in the future');
    const key = await keyFor(did) ?? refuse('The signing key for this account could not be found');
    if (header.alg !== key.alg || signature.length !== 64) refuse('The token is signed in a way this account does not use');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${parts[0]}.${parts[1]}`)));
    let good = false;
    try {
      // AT Protocol accepts only the lower of the two forms a signature can take.
      good = key.curve.verify(signature, digest, key.key, { lowS: true });
    } catch {
      good = false;
    }
    if (!good) refuse('The token\'s signature does not match this account\'s key');
    return did;
  }
  // Where a member's repository is kept, as their own DID document says. Asked only about someone
  // who has just proved who they are.
  whoIs.pdsFor = async did => (await keyFor(did))?.pds ?? null;
  return whoIs;
}
