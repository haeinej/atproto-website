// Ohm's working copy of a vault, reached over the network as the member. Each request carries a
// token the member's own PDS issues for that one request.
import { rpc } from './rpc.mjs';

// `session` is the member's sign-in at their PDS. `renew`, when given, signs in again: something
// that runs for hours, as an agent's tools do, outlives one sign-in.
export function vaultClient({ pds, session, renew, vault, audience, get = fetch }) {
  const token = method => rpc(pds.origin, 'com.atproto.server.getServiceAuth', {
    query: { aud: audience, lxm: method, exp: String(Math.floor(Date.now() / 1000) + 60) }, token: session,
  });
  async function ask(name, { query, body } = {}, namespace = 'vault') {
    const method = `com.ohmmmm.${namespace}.${name}`;
    let issued = await token(method);
    if (!issued.response.ok && renew && [400, 401].includes(issued.response.status)) {
      session = await renew();
      issued = await token(method);
    }
    if (!issued.response.ok || typeof issued.data.token !== 'string') throw new Error(`Your PDS would not issue a token for the vault (HTTP ${issued.response.status})`);
    const url = new URL(`/xrpc/${method}`, vault);
    if (query) url.search = new URLSearchParams(query);
    const response = await get(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${issued.data.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.message ?? `The vault answered HTTP ${response.status}`), { status: response.status, code: data.error, extra: data });
    return data;
  }
  // A request that answers with a file, not JSON.
  async function file(name, query) {
    const method = `com.ohmmmm.vault.${name}`;
    let issued = await token(method);
    if (!issued.response.ok && renew && [400, 401].includes(issued.response.status)) {
      session = await renew();
      issued = await token(method);
    }
    if (!issued.response.ok || typeof issued.data.token !== 'string') throw new Error(`Your PDS would not issue a token for the vault (HTTP ${issued.response.status})`);
    const url = new URL(`/xrpc/${method}`, vault);
    url.search = new URLSearchParams(query);
    const response = await get(url, { headers: { Authorization: `Bearer ${issued.data.token}` }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw Object.assign(new Error(data.message ?? `The vault answered HTTP ${response.status}`), { status: response.status, code: data.error });
    }
    return { bytes: new Uint8Array(await response.arrayBuffer()), mime: (response.headers.get('Content-Type') ?? 'application/octet-stream').split(';')[0].trim() };
  }
  // Writing to the member's own repository, as the member: sending a file, and making a batch of
  // changes that all happen or none do. Publishing is the only thing that uses these.
  async function toPds(endpoint, options) {
    let answered = await rpc(pds.origin, endpoint, { ...options, token: session });
    if (!answered.response.ok && renew && answered.response.status === 401) {
      session = await renew();
      answered = await rpc(pds.origin, endpoint, { ...options, token: session });
    }
    if (!answered.response.ok) throw new Error(`Your PDS refused (${answered.data.message ?? answered.data.error ?? `HTTP ${answered.response.status}`})`);
    return answered.data;
  }
  return {
    repository: pds.did,
    // Cortex requests need their own method-bound service token. Reuse the sign-in and renewal,
    // while keeping the member's private cortex separate from every vault/PDS publishing call.
    cortex: {
      call(name, options) {
        if (typeof name !== 'string' || !/^[a-z][a-zA-Z]*$/.test(name)) throw new Error('Name one cortex request');
        return ask(name, options, 'cortex');
      },
    },
    upload: async (bytes, mime) => (await toPds('com.atproto.repo.uploadBlob', { body: bytes, mime })).blob,
    apply: writes => toPds('com.atproto.repo.applyWrites', { body: { repo: pds.did, writes } }),
    // Every post and every removal, a page at a time.
    async list() {
      const all = [];
      for (let since = '0', pages = 0; pages < 1000; pages++) {
        const page = await ask('listPosts', { query: { since } });
        all.push(...page.posts);
        if (!page.more) return all;
        since = page.cursor;
      }
      throw new Error('The vault has more posts than this command reads');
    },
    // The vault's structure, and the posts that mention some words.
    tree: () => ask('getTree'),
    search: query => ask('searchPosts', { query }),
    // What publishing would change, and with `prepare` the changes themselves. And one file a post places.
    publishPlan: ({ prepare = false } = {}) => ask('getPublishPlan', prepare ? { query: { prepare: '1' } } : {}),
    attachment: (id, attachment) => file('getAttachment', { id, attachment }),
    // What the member has published on their PDS, looked at or, with `apply`, brought in.
    mirror: ({ apply = false } = {}) => ask('importPublished', { body: { apply } }),
    get: id => ask('getPost', { query: { id } }),
    put: (post, replaces) => ask('putPost', { body: { post, ...(replaces ? { replaces } : {}) } }),
    remove: (id, replaces) => ask('deletePost', { body: { id, replaces } }),
  };
}
