// Mirror: what the member has already published on their PDS, brought into the vault.
//
// Three steps, each its own function: find what is there (`source`), read it as posts (`read`),
// and save them (`apply`, in the request). Reading the PDS needs no credential: a repository's
// records are public.
import { POST } from '../../../feed/pds.mjs';
import { importVault, saveImported } from '../../../vault/import.mjs';
import { published, whereabouts } from '../member.mjs';
import { Refused } from '../store.mjs';

const NSID = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\.[a-zA-Z][a-zA-Z0-9]{0,62}$/;
// Bluesky's and the protocol's own types are not posts in this form and are not looked at.
const NOT_POSTS = /^(?:app\.bsky|chat\.bsky|com\.atproto|tools\.ozone)\./;
// A redirect is not followed: the answer has to come from the address that was asked.
const asking = () => ({ redirect: 'manual', signal: AbortSignal.timeout(20_000) });

// The types of post in a member's repository other than the shared one: any type of their own
// whose records read as posts, which is to say have a body and a date. Nobody has to name them.
async function olderPostTypes(get, pds, did) {
  const url = new URL('/xrpc/com.atproto.repo.describeRepo', pds);
  url.search = new URLSearchParams({ repo: did });
  const response = await get(url, asking());
  if (!response.ok) throw new Refused(502, 'RepositoryUnreachable', `Your PDS would not describe your repository (HTTP ${response.status})`);
  const named = ((await response.json()).collections ?? []).filter(name => typeof name === 'string' && NSID.test(name) && name !== POST && !NOT_POSTS.test(name));
  const found = [];
  for (const collection of named.slice(0, 20)) {
    const look = new URL('/xrpc/com.atproto.repo.listRecords', pds);
    look.search = new URLSearchParams({ repo: did, collection, limit: '1' });
    const listed = await get(look, asking());
    const first = listed.ok ? (await listed.json()).records?.[0]?.value : null;
    if (first && typeof first.body === 'string' && Number.isFinite(Date.parse(first.publishedAt))) found.push(collection);
  }
  return found;
}

// Where to mirror from: the PDS, the member's website, and the types of post to read. Nothing
// has to be told: the website is the one their handle names, and the types are the shared one and
// any of their own that read as posts. `site` and `from` say either outright.
async function source(context, { site, from }) {
  if (from !== undefined && (typeof from !== 'string' || !NSID.test(from) || from === POST)) throw new Refused(400, 'InvalidRequest', 'An older post type is written like com.example.post');
  const where = await whereabouts(context, { site });
  return { ...where, types: [...(from ? [from] : await olderPostTypes(context.get, where.pds, context.did)), POST] };
}

// Every record at the source, as the posts they would be in the vault, with what would be lost.
async function read({ get, did }, { pds, site, types }) {
  // An older type is read first, so a post already in the shared type is the one kept.
  const found = new Map();
  for (const type of types) for (const [key, value] of await published(get, pds, did, type)) found.set(key, value);
  const { posts, skipped } = importVault([...found].map(([key, value]) => ({ key, value })), { did, origin: pds, site });
  return { records: found.size, posts, skipped };
}

export default {
  name: 'Mirror',
  about: 'Bring what the member has already published on their PDS into the vault. It only reads the PDS, and it never changes a post the member has since changed in the vault.',
  requests: {
    'com.ohmmmm.vault.importPublished': {
      verb: 'POST', asks: 'member', changes: true,
      about: 'Reads the member\'s repository and says what it holds as posts: how many, which would differ from what is published, and what could not be kept. With `apply`, saves them. Without it, changes nothing.',
      takes: { apply: 'optional: save the posts', site: 'optional: the member\'s website, when it is not the one their handle names', from: 'optional: one older post type to read, when it should not be found' },
      gives: '`site`, `types`, `records`, `posts`, `sameAsPublished`, `differs`, `lost`, `cannotBePublishedYet`, `skipped`, `applied`; and with `apply`, `saved`, `unchanged`, `changedThere`, `refused`',
      run: async context => {
        const { site, from, apply = false } = await context.body();
        const where = await source(context, { site, from });
        const { records, posts: found, skipped } = await read(context, where);
        const noted = name => found.filter(each => each[name].length).map(each => ({ key: each.key, slug: each.post.slug, [name]: each[name] }));
        const report = {
          site: where.site, types: where.types, records, posts: found.length, sameAsPublished: found.filter(each => !each.differs.length).length,
          differs: noted('differs'), lost: noted('lost'), cannotBePublishedYet: noted('problems'), skipped, applied: Boolean(apply),
        };
        if (!apply) return report;
        const { posts, did, user, linked } = context;
        const send = post => posts.write(did, post).then(body => ({ status: 200, body }),
          problem => (problem instanceof Refused ? { status: problem.status, body: { error: problem.code, message: problem.message } } : Promise.reject(problem)));
        const saved = await saveImported(found, send);
        // The first time is remembered, so the page brings a new account's posts in once, on its own.
        if (user) await linked.mirrored(user.id);
        return { ...report, ...saved };
      },
    },
  },
};
