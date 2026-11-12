// The vault service. A member's posts, reached with four requests, and the vault's structure. Every
// request proves who is asking with a token from the member's own PDS, and a member's posts are
// served to that member and nobody else.
//
// Nothing here publishes anything. Saving a post, whatever it says about who may see it, changes
// only this copy.
import { POST, webUrl } from '../../feed/pds.mjs';
import { postFile } from '../../vault/file.mjs';
import { importVault, saveImported } from '../../vault/import.mjs';
import { createIdentity, findAccount } from './identity.mjs';
import { fromOurPages, links, ohmUser } from './ohm.mjs';
import { postStore, Refused } from './store.mjs';

const METHODS = {
  'com.ohmmmm.vault.listPosts': 'GET',
  'com.ohmmmm.vault.getPost': 'GET',
  'com.ohmmmm.vault.putPost': 'POST',
  'com.ohmmmm.vault.deletePost': 'POST',
  'com.ohmmmm.vault.getTree': 'GET',
  'com.ohmmmm.vault.importPublished': 'POST',
  'com.ohmmmm.vault.exportFiles': 'GET',
};
const ACCOUNT = {
  'com.ohmmmm.account.get': 'GET',
  'com.ohmmmm.account.connect': 'POST',
  'com.ohmmmm.account.disconnect': 'POST',
};
const NSID = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\.[a-zA-Z][a-zA-Z0-9]{0,62}$/;

// Every record of one type in a member's repository, which anyone can read.
async function published(get, pds, did, collection) {
  const records = new Map();
  const prefix = `at://${did}/${collection}/`;
  let cursor;
  for (let page = 0; page < 50; page++) {
    const url = new URL('/xrpc/com.atproto.repo.listRecords', pds);
    url.search = new URLSearchParams({ repo: did, collection, limit: '100', ...(cursor ? { cursor } : {}) });
    const response = await get(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Refused(502, 'RepositoryUnreachable', `Your PDS would not list ${collection} (HTTP ${response.status})`);
    const data = await response.json();
    for (const record of data.records ?? []) {
      if (String(record.uri).startsWith(prefix)) records.set(record.uri.slice(prefix.length), record.value);
    }
    if (!data.cursor || data.cursor === cursor || !(data.records ?? []).length) break;
    cursor = data.cursor;
  }
  return records;
}
// The types of post in a member's repository other than the shared one: any type of their own
// whose records read as posts, which is to say have a body and a date. Nobody has to name them.
// Bluesky's and the protocol's own types are not posts in this form and are not looked at.
const NOT_POSTS = /^(?:app\.bsky|chat\.bsky|com\.atproto|tools\.ozone)\./;
async function olderPostTypes(get, pds, did) {
  const url = new URL('/xrpc/com.atproto.repo.describeRepo', pds);
  url.search = new URLSearchParams({ repo: did });
  const response = await get(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Refused(502, 'RepositoryUnreachable', `Your PDS would not describe your repository (HTTP ${response.status})`);
  const named = ((await response.json()).collections ?? []).filter(name => typeof name === 'string' && NSID.test(name) && name !== POST && !NOT_POSTS.test(name));
  const found = [];
  for (const collection of named.slice(0, 20)) {
    const look = new URL('/xrpc/com.atproto.repo.listRecords', pds);
    look.search = new URLSearchParams({ repo: did, collection, limit: '1' });
    const listed = await get(look, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const first = listed.ok ? (await listed.json()).records?.[0]?.value : null;
    if (first && typeof first.body === 'string' && Number.isFinite(Date.parse(first.publishedAt))) found.push(collection);
  }
  return found;
}
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });

async function sent(request) {
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {
    // Said below.
  }
  throw new Refused(400, 'InvalidRequest', 'Send the request as JSON');
}

// `whoIs` is given in tests; in the service it is made from the environment once and kept, so the
// DID documents it has read are remembered between requests.
let made;
export function createService({ whoIs, get = fetch } = {}) {
  return async function fetch(request, env) {
    try {
      const url = new URL(request.url);
      // The same requests are served at the service's own address and under /vault beside ohm's
      // sign-in, where a member's browser carries their ohm session.
      const method = /^(?:\/vault)?\/xrpc\/([A-Za-z0-9.]+)$/.exec(url.pathname)?.[1];
      // Finding an account from a handle needs no sign-in: it is the first step of signing in, and
      // everything it answers with is already public. It also names this service, which is who a
      // member's PDS has to issue their tokens for.
      if (method === 'com.ohmmmm.identity.findAccount' && request.method === 'GET') {
        return json({ ...await findAccount(url.searchParams.get('account'), { get }), service: env.SERVICE_DID ?? null });
      }
      const identify = whoIs ?? (made ??= createIdentity({ audience: env.SERVICE_DID, members: env.MEMBERS }));
      const linked = links(env.DB);

      // Who a token from a PDS names. ohm's own sign-in asks this to sign a member in with their
      // AT Protocol account: the token is issued for this request and nothing else. The handle is
      // given only when the handle itself points back to the account.
      if (method === 'com.ohmmmm.identity.whoAmI') {
        if (request.method !== 'GET') throw new Refused(405, 'WrongMethod', `${method} is a GET request`);
        const did = await identify(request, method);
        const account = await findAccount(did, { get }).catch(() => null);
        const handle = account?.handle && (await findAccount(account.handle, { get }).catch(() => null))?.did === did ? account.handle : null;
        return json({ did, handle });
      }

      // ---- The ohm account: who is signed in, and which AT Protocol account they work in. ----
      if (Object.hasOwn(ACCOUNT, method ?? '')) {
        if (request.method !== ACCOUNT[method]) throw new Refused(405, 'WrongMethod', `${method} is a ${ACCOUNT[method]} request`);
        const user = await ohmUser(request, env, get) ?? (() => { throw new Refused(401, 'SignInRequired', 'Sign in to ohm first'); })();
        fromOurPages(request, env);
        // `service` is who a PDS has to address its token to when the member connects.
        if (method === 'com.ohmmmm.account.get') {
          const link = await linked.of(user.id);
          return json({ user: { name: user.name }, did: link?.did ?? null, mirrored: link?.mirrored ?? false, service: env.SERVICE_DID ?? null });
        }
        if (method === 'com.ohmmmm.account.disconnect') {
          await linked.disconnect(user.id);
          return json({ did: null });
        }
        // Connecting: the person's own PDS says, in a token it signs for this one request, that the
        // AT Protocol account is theirs. That is checked exactly as any member's token is, and only
        // then is the account tied to the ohm account that is signed in.
        const { token } = await sent(request);
        if (typeof token !== 'string') throw new Refused(400, 'InvalidRequest', 'Send the token your PDS issued');
        const did = await identify(new Request(request.url, { headers: { Authorization: `Bearer ${token}` } }), method);
        return json(await linked.connect(user.id, did));
      }

      if (!method || !Object.hasOwn(METHODS, method)) throw new Refused(404, 'MethodNotFound', 'There is no such request');
      if (request.method !== METHODS[method]) throw new Refused(405, 'WrongMethod', `${method} is a ${METHODS[method]} request`);
      // Who is asking comes first. Nothing about any vault is looked at until that is settled, and
      // every operation below is given that DID and no other. A request carries a token from the
      // member's own PDS, as the command line and an agent's tools send, or rides on an ohm session,
      // as the page does; a session is worth exactly the one account it was connected to.
      let did;
      let user = null;
      if (request.headers.has('Authorization')) {
        did = await identify(request, method);
      } else {
        user = await ohmUser(request, env, get) ?? (() => { throw new Refused(401, 'SignInRequired', 'Sign in to ohm first'); })();
        fromOurPages(request, env);
        did = await linked.didOf(user.id) ?? (() => { throw new Refused(409, 'NotConnected', 'Connect your AT Protocol account first'); })();
      }
      const posts = postStore(env.DB);
      const query = name => url.searchParams.get(name) ?? undefined;

      if (method === 'com.ohmmmm.vault.listPosts') return json(await posts.list(did, { since: query('since') }));
      if (method === 'com.ohmmmm.vault.getPost') return json(await posts.read(did, query('id')));
      if (method === 'com.ohmmmm.vault.putPost') {
        const { post, replaces = null } = await sent(request);
        return json(await posts.write(did, post, { replaces }));
      }
      if (method === 'com.ohmmmm.vault.deletePost') {
        const { id, replaces = null } = await sent(request);
        return json(await posts.remove(did, id, { replaces }));
      }
      if (method === 'com.ohmmmm.vault.exportFiles') {
        // The whole vault as files: each post where it sits in a folder, and its text.
        return json({ files: (await posts.all(did)).map(postFile) });
      }
      if (method === 'com.ohmmmm.vault.importPublished') {
        // Bring in what the member has already published: a mirror of their repository, read from
        // the PDS their own DID document names. Nothing is saved unless they say `apply`. Nothing
        // has to be told: the website is the one their handle names, and the types of post are the
        // shared one and any of their own that read as posts. Either can still be said outright.
        const { site, from, apply = false } = await sent(request);
        if (from !== undefined && (typeof from !== 'string' || !NSID.test(from) || from === POST)) throw new Refused(400, 'InvalidRequest', 'An older post type is written like com.example.post');
        const pds = await identify.pdsFor?.(did);
        if (!pds) throw new Refused(400, 'NoRepository', 'Your DID document does not say where your repository is kept');
        const handle = site === undefined ? (await findAccount(did, { get }).catch(() => null))?.handle : null;
        const origin = webUrl(site ?? (handle ? `https://${handle}` : pds));
        if (!origin || !origin.startsWith('https://')) throw new Refused(400, 'InvalidRequest', 'Say where your website is, as an https address');
        const types = from ? [from] : await olderPostTypes(get, pds, did);
        // An older type is read first, so a post already in the shared type is the one kept.
        const found = new Map();
        for (const type of [...types, POST]) for (const [key, value] of await published(get, pds, did, type)) found.set(key, value);
        const { posts: read, skipped } = importVault([...found].map(([key, value]) => ({ key, value })), { did, origin: pds, site: origin });
        const noted = name => read.filter(each => each[name].length).map(each => ({ key: each.key, slug: each.post.slug, [name]: each[name] }));
        const report = {
          site: origin, types: [...types, POST], records: found.size, posts: read.length, sameAsPublished: read.filter(each => !each.differs.length).length,
          differs: noted('differs'), lost: noted('lost'), cannotBePublishedYet: noted('problems'), skipped, applied: Boolean(apply),
        };
        if (!apply) return json(report);
        const send = post => posts.write(did, post).then(body => ({ status: 200, body }),
          problem => (problem instanceof Refused ? { status: problem.status, body: { error: problem.code, message: problem.message } } : Promise.reject(problem)));
        const saved = await saveImported(read, send);
        // The first time is remembered, so the page brings a new account's posts in once, on its own.
        if (user) await linked.mirrored(user.id);
        return json({ ...report, ...saved });
      }
      return json(await posts.tree(did));
    } catch (problem) {
      if (problem instanceof Refused) return json({ error: problem.code, message: problem.message, ...problem.extra }, problem.status);
      console.error(problem);
      return json({ error: 'InternalError', message: 'Something went wrong on our side' }, 500);
    }
  };
}

export default { fetch: createService() };
