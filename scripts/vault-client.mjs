// Ohm's working copy of a vault, reached over the network as the member. Each request carries a
// token the member's own PDS issues for that one request.
import { rpc } from './rpc.mjs';

export function vaultClient({ pds, session, vault, audience, get = fetch }) {
  async function ask(name, { query, body } = {}) {
    const method = `com.ohmmmm.vault.${name}`;
    const issued = await rpc(pds.origin, 'com.atproto.server.getServiceAuth', {
      query: { aud: audience, lxm: method, exp: String(Math.floor(Date.now() / 1000) + 60) }, token: session,
    });
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
  return {
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
    get: id => ask('getPost', { query: { id } }),
    put: (post, replaces) => ask('putPost', { body: { post, ...(replaces ? { replaces } : {}) } }),
    remove: (id, replaces) => ask('deletePost', { body: { id, replaces } }),
  };
}
