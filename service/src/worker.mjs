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
      const method = /^\/xrpc\/([A-Za-z0-9.]+)$/.exec(url.pathname)?.[1];
      // Finding an account from a handle needs no sign-in: it is the first step of signing in, and
      // everything it answers with is already public.
      if (method === 'com.ohmmmm.identity.findAccount' && request.method === 'GET') {
        return json(await findAccount(url.searchParams.get('account'), { get }));
      }
      if (!method || !Object.hasOwn(METHODS, method)) throw new Refused(404, 'MethodNotFound', 'There is no such request');
      if (request.method !== METHODS[method]) throw new Refused(405, 'WrongMethod', `${method} is a ${METHODS[method]} request`);
      // Who is asking comes first. Nothing about any vault is looked at until that is settled, and
      // every operation below is given that DID and no other.
      const identify = whoIs ?? (made ??= createIdentity({ audience: env.SERVICE_DID, members: env.MEMBERS }));
      const did = await identify(request, method);
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
        // Bring in what the member has already published. Their repository is read from the PDS
        // their own DID document names, and nothing is saved unless they say `apply`.
        const { site, from, apply = false } = await sent(request);
        const origin = webUrl(site);
        if (!origin || !origin.startsWith('https://')) throw new Refused(400, 'InvalidRequest', 'Say where your website is, as an https address');
        if (from !== undefined && (typeof from !== 'string' || !NSID.test(from) || from === POST)) throw new Refused(400, 'InvalidRequest', 'An older post type is written like com.example.post');
        const pds = await identify.pdsFor?.(did);
        if (!pds) throw new Refused(400, 'NoRepository', 'Your DID document does not say where your repository is kept');
        const found = new Map(from ? await published(get, pds, did, from) : []);
        for (const [key, value] of await published(get, pds, did, POST)) found.set(key, value);
        const { posts: read, skipped } = importVault([...found].map(([key, value]) => ({ key, value })),
          { did, origin: pds, site: origin, ...(from ? { namespace: from.slice(0, from.lastIndexOf('.')) } : {}) });
        const noted = name => read.filter(each => each[name].length).map(each => ({ key: each.key, slug: each.post.slug, [name]: each[name] }));
        const report = {
          records: found.size, posts: read.length, sameAsPublished: read.filter(each => !each.differs.length).length,
          differs: noted('differs'), lost: noted('lost'), cannotBePublishedYet: noted('problems'), skipped, applied: Boolean(apply),
        };
        if (!apply) return json(report);
        const send = post => posts.write(did, post).then(body => ({ status: 200, body }),
          problem => (problem instanceof Refused ? { status: problem.status, body: { error: problem.code, message: problem.message } } : Promise.reject(problem)));
        return json({ ...report, ...await saveImported(read, send) });
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
