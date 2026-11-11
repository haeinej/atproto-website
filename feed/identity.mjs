// Identity, the AT Protocol way. Everything starts from a DID. The DID's document names the handle,
// the signing key, and the PDS that hosts the account's repository, and the repository is the
// container for every record. Nothing here is specific to this project.
//
//   handle  --resolves to-->  DID  --document-->  PDS  --hosts-->  repository at://<did>
//
// https://atproto.com/specs/did · https://atproto.com/specs/handle

const DID = /^(?:did:plc:[a-z2-7]{24}|did:web:[a-zA-Z0-9.-]+)$/;
const HANDLE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export const isDid = value => typeof value === 'string' && DID.test(value);
export const isHandle = value => typeof value === 'string' && value.length <= 253 && HANDLE.test(value);

const options = () => ({ redirect: 'error', signal: AbortSignal.timeout(10_000) });

// Where a DID's document lives: on the DID's own host for did:web, in the PLC directory for did:plc.
export function didDocumentUrl(did) {
  if (!isDid(did)) throw new Error('Not a DID this project supports; use did:web or did:plc');
  return did.startsWith('did:web:') ? `https://${did.slice('did:web:'.length)}/.well-known/did.json` : `https://plc.directory/${did}`;
}

// What a DID document says, reduced to the three things AT Protocol defines.
export function readDidDocument(document, did) {
  if (document?.id !== did) throw new Error(`The document at ${didDocumentUrl(did)} is not for ${did}`);
  const ends = (id, suffix) => typeof id === 'string' && (id === suffix || id === did + suffix);
  const service = (Array.isArray(document.service) ? document.service : [])
    .find(item => ends(item?.id, '#atproto_pds') && item.type === 'AtprotoPersonalDataServer');
  const pds = URL.canParse(service?.serviceEndpoint) ? new URL(service.serviceEndpoint) : null;
  const key = (Array.isArray(document.verificationMethod) ? document.verificationMethod : [])
    .find(item => ends(item?.id, '#atproto') && typeof item.publicKeyMultibase === 'string');
  const handle = (Array.isArray(document.alsoKnownAs) ? document.alsoKnownAs : [])
    .map(name => typeof name === 'string' && name.startsWith('at://') ? name.slice('at://'.length) : '').find(isHandle);
  return {
    did,
    ...(handle ? { handle: handle.toLowerCase() } : {}),
    ...(pds && pds.protocol === 'https:' ? { pds: pds.origin } : {}),
    ...(key ? { signingKey: key.publicKeyMultibase } : {}),
  };
}

// The DID a handle points to: a file on the handle's own site, or failing that a DNS record.
export async function resolveHandle(handle, get = fetch) {
  if (!isHandle(handle)) throw new Error('Not a handle; use a domain name such as example.com');
  const fromSite = await get(`https://${handle}/.well-known/atproto-did`, options())
    .then(response => response.ok ? response.text() : '', () => '');
  if (isDid(fromSite.trim())) return fromSite.trim();
  const dns = new URL('https://cloudflare-dns.com/dns-query');
  dns.search = new URLSearchParams({ name: `_atproto.${handle}`, type: 'TXT' });
  const answers = await get(dns, { ...options(), headers: { Accept: 'application/dns-json' } })
    .then(response => response.ok ? response.json() : {}, () => ({}));
  const record = (Array.isArray(answers.Answer) ? answers.Answer : [])
    .map(answer => String(answer?.data ?? '').replaceAll('"', '')).find(text => isDid(text.replace(/^did=/, '')));
  return record ? record.replace(/^did=/, '') : null;
}

// Resolve an identity from its DID, or from a handle. `handleVerified` is true only when the handle
// the DID claims points back to the same DID, which is what makes a handle trustworthy.
export async function resolveIdentity(input, get = fetch) {
  const did = isDid(input) ? input : await resolveHandle(input, get);
  if (!did) throw new Error(`${input} does not resolve to a DID`);
  const response = await get(didDocumentUrl(did), options());
  if (!response.ok) throw new Error(`Could not read the DID document for ${did} (HTTP ${response.status})`);
  const identity = readDidDocument(await response.json(), did);
  const handleVerified = Boolean(identity.handle) && await resolveHandle(identity.handle, get).catch(() => null) === did;
  if (!isDid(input) && !(handleVerified && identity.handle === input.toLowerCase())) {
    throw new Error(`${input} points to ${did}, but that DID does not claim the handle back`);
  }
  return { ...identity, handleVerified };
}
