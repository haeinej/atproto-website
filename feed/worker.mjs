import {
  ARCHIVE_POST, BSKY_POST, BSKY_PROFILE, COLLECTION, isRecordKey, normalizeArchivePost, normalizeNote, normalizePost,
  normalizeProfile, pdsConfig, siblingCollection,
} from './pds.mjs';
import { OTHER } from './forms.mjs';
import { isDid, resolveIdentity } from './identity.mjs';
import { servePrivate } from './private.mjs';
import { plainName, postPage, renderArchivePost } from './render.mjs';

const SNAPSHOT_KEY = 'latest';
const MAX_AGE = 48 * 60 * 60;

// Every post by URI, with the later posts that branch from it. This is what the tree view draws.
function buildGraph(posts) {
  const graph = {};
  for (const post of posts) {
    graph[post.uri] = {
      href: post.permalink ?? post.postUrl ?? post.sourceUrl ?? null,
      name: post.name ?? plainName(post),
      createdAt: post.createdAt,
      platform: post.platform,
      ...(post.form ? { form: post.form } : {}),
      label: post.label ?? OTHER,
      ...(post.sublabel ? { sublabel: post.sublabel } : {}),
      branches: [],
    };
    // Posts arrive oldest first, so a post only ever branches from an earlier one.
    for (const link of post.links ?? []) graph[link]?.branches.push(post.uri);
  }
  // A post with no title and no words, such as a photograph, is named by its folder and a number:
  // "Lisboa 12". The number is its place among the folder's unnamed posts, oldest first.
  const counts = new Map();
  for (const entry of Object.values(graph)) {
    if (entry.name) continue;
    const folder = entry.sublabel ?? entry.label;
    const key = `${entry.label}\u0000${entry.sublabel ?? ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    entry.name = `${folder} ${counts.get(key)}`;
  }
  return graph;
}

async function readRecord(pds, collection, rkey, request) {
  const url = new URL('/xrpc/com.atproto.repo.getRecord', pds.origin);
  url.search = new URLSearchParams({ repo: pds.did, collection, rkey });
  const response = await request(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  return response.ok ? (await response.json()).value ?? null : null;
}

// The site's own profile record, or the account's Bluesky profile when there is none.
async function loadProfile(pds, request) {
  for (const collection of [siblingCollection(pds.collection, 'profile'), BSKY_PROFILE]) {
    const value = await readRecord(pds, collection, 'self', request);
    if (!value) continue;
    const links = [];
    for (const ref of (Array.isArray(value.links) ? value.links : []).slice(0, 10)) {
      // A profile link is a record in the same repository.
      const [, did, type, rkey] = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(ref?.uri ?? '') ?? [];
      if (did === pds.did && isRecordKey(rkey)) links.push(await readRecord(pds, type, rkey, request));
    }
    const profile = normalizeProfile(value, pds, links.filter(Boolean));
    if (profile) return profile;
  }
  return null;
}

async function listNotes(env, pds, collection, normalize, maxPages, request) {
  const { did, origin } = pds;
  const url = new URL('/xrpc/com.atproto.repo.listRecords', origin);
  url.search = new URLSearchParams({ repo: did, collection, limit: '100' });
  const notes = new Map();
  const cursors = new Set();
  const prefix = `at://${did}/${collection}/`;

  for (let page = 0; page < maxPages; page++) {
    const response = await request(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    if ([400, 401, 403, 404, 410].includes(response.status)) await env.NOTES.delete(SNAPSHOT_KEY);
    if (!response.ok) throw new Error(`PDS returned HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.records)) throw new Error('PDS returned an invalid record list');

    for (const record of data.records) {
      if (typeof record?.uri !== 'string' || !record.uri.startsWith(prefix)) continue;
      const key = record.uri.slice(prefix.length);
      if (!isRecordKey(key)) continue;
      const note = normalize(record.value, key, pds);
      if (note) notes.set(record.uri, { uri: record.uri, ...note });
    }

    if (!data.cursor) return { records: [...notes.values()], pages: page + 1 };
    if (typeof data.cursor !== 'string' || cursors.has(data.cursor)) throw new Error('PDS returned an invalid cursor');
    cursors.add(data.cursor);
    url.searchParams.set('cursor', data.cursor);
  }
  throw new Error(`${collection} exceeds the ${maxPages}-page refresh limit`);
}

export async function refreshNotes(env, request = fetch, now = new Date()) {
  const pds = pdsConfig(env);
  const collections = [[pds.collection, normalizeArchivePost]];
  if (env.INCLUDE_BLUESKY_POSTS !== 'false') collections.push([BSKY_POST, normalizePost]);
  if (env.INCLUDE_LEGACY_NOTES === 'true') collections.push([COLLECTION, normalizeNote]);
  const notes = [];
  let pagesLeft = 48;
  for (const [index, [collection, normalize]] of collections.entries()) {
    const reservedPages = collections.length - index - 1;
    const { records, pages } = await listNotes(env, pds, collection, normalize, pagesLeft - reservedPages, request);
    notes.push(...records);
    pagesLeft -= pages;
  }
  const rendered = notes
    .map(note => typeof note.body === 'string' ? renderArchivePost(note, pds) : note)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.uri.localeCompare(b.uri));
  const graph = buildGraph(rendered);
  const latest = rendered.reverse().slice(0, 20).map(({ name, ...note }) => note);
  // Check the identity the site is built on. The DID's own document says which PDS hosts it; if that
  // is some other server, this configuration is reading a repository the identity does not own.
  const resolved = await resolveIdentity(pds.did, request).catch(() => null);
  if (resolved?.pds && resolved.pds !== pds.origin && new URL(pds.origin).protocol === 'https:') {
    throw new Error(`${pds.did} is hosted at ${resolved.pds}, not the configured ${pds.origin}`);
  }
  const identity = {
    did: pds.did,
    ...(resolved?.handleVerified ? { handle: resolved.handle } : {}),
    repository: `at://${pds.did}`,
  };
  // A profile that cannot be read leaves the feed as it is.
  const profile = await loadProfile(pds, request).catch(() => null);
  const snapshot = { ...pds, refreshedAt: now.toISOString(), notes: latest, graph, identity, ...(profile ? { profile } : {}) };
  await env.NOTES.put(SNAPSHOT_KEY, JSON.stringify(snapshot), { expirationTtl: MAX_AGE });
  return snapshot;
}

export async function servePost(request, env, key, get = fetch) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  if (!isRecordKey(key)) return new Response('Post not found', { status: 404 });
  try {
    const pds = pdsConfig(env);
    const url = new URL('/xrpc/com.atproto.repo.getRecord', pds.origin);
    url.search = new URLSearchParams({ repo: pds.did, collection: pds.collection, rkey: key });
    const response = await get(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) return new Response('Post not found', { status: 404 });
    const data = await response.json();
    if (response.status === 400 && data.error === 'RecordNotFound') {
      return new Response('Post not found', { status: 404 });
    }
    if (!response.ok) throw new Error(`PDS returned HTTP ${response.status}`);
    const post = data.uri === `at://${pds.did}/${pds.collection}/${key}` &&
      normalizeArchivePost(data.value, key, pds);
    if (!post) return new Response('Post not found', { status: 404 });
    // A post has one address, which follows its label and sublabel. The short address, an old one
    // from before it was refiled, or any other path ending in its key is sent on to it.
    const asked = new URL(request.url).pathname;
    if (asked.startsWith('/posts/') && decodeURIComponent(asked) !== decodeURIComponent(post.permalink)) {
      return Response.redirect(new URL(post.permalink, request.url), 308);
    }
    const rendered = renderArchivePost({ ...post, uri: data.uri }, pds);
    // An unnamed post takes the name the list gave it, when the list has been built.
    if (!rendered.name && env.NOTES) {
      rendered.name = (await env.NOTES.get(SNAPSHOT_KEY, 'json').catch(() => null))?.graph?.[data.uri]?.name ?? '';
    }
    return new Response(request.method === 'HEAD' ? null : postPage(rendered), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Post is temporarily unavailable', { status: 502 });
  }
}

export default {
  async scheduled(_controller, env) {
    await refreshNotes(env);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (['/notes', '/posts'].includes(url.pathname)) {
      url.pathname += '/';
      return Response.redirect(url, 308);
    }
    // An address ending in a slash is a folder: /posts/ is every post, /posts/writings/ one label.
    // Any other address under /posts/ is a post, named by its last step.
    const folder = url.pathname.startsWith('/posts/') && url.pathname.endsWith('/');
    if (url.pathname.startsWith('/posts/') && !folder) {
      let key;
      try {
        key = decodeURIComponent(url.pathname.split('/').at(-1));
      } catch {
        return new Response('Post not found', { status: 404 });
      }
      return servePost(request, env, key);
    }
    if (url.pathname === '/notes/private' || url.pathname.startsWith('/notes/private/')) {
      return servePrivate(request, env, url.pathname);
    }
    // The graph lives under /notes/ so an attached site needs no extra route.
    // Handle resolution: a site whose domain is the account's handle answers with its DID here.
    if (url.pathname === '/.well-known/atproto-did' && isDid(env.ATPROTO_DID)) {
      return new Response(env.ATPROTO_DID, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=300' } });
    }
    const isFeed = ['/notes.json', '/notes/graph.json', '/notes/profile.json', '/notes/identity.json'].includes(url.pathname);
    if (!isFeed && ((url.pathname === '/' && env.STANDALONE_SITE === 'true') || url.pathname.startsWith('/notes/') || folder)) {
      url.pathname = url.pathname === '/' || url.pathname === '/notes/' || folder ? '/index.html' : url.pathname.slice('/notes'.length);
      return env.ASSETS.fetch(new Request(url, request));
    }
    const headers = {
      ...(env.SITE_ORIGIN ? { 'Access-Control-Allow-Origin': env.SITE_ORIGIN } : {}),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (!isFeed) return new Response(null, { status: 404, headers });
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
    const snapshot = await env.NOTES.get(SNAPSHOT_KEY, 'json');
    const age = Date.now() - Date.parse(snapshot?.refreshedAt);
    const origin = URL.canParse(env.ATPROTO_PDS_ORIGIN) && new URL(env.ATPROTO_PDS_ORIGIN).origin;
    if (!snapshot || snapshot.did !== env.ATPROTO_DID || snapshot.origin !== origin ||
        (snapshot.collection ?? ARCHIVE_POST) !== (env.ATPROTO_POST_COLLECTION ?? ARCHIVE_POST) ||
        !(age < MAX_AGE * 1000)) {
      return Response.json({ error: 'Notes are unavailable' }, { status: 503, headers });
    }
    const { graph = {}, profile = {}, identity = { did: snapshot.did, repository: `at://${snapshot.did}` }, ...feed } = snapshot;
    const body = { '/notes.json': feed, '/notes/graph.json': graph, '/notes/profile.json': profile, '/notes/identity.json': identity };
    return Response.json(body[url.pathname], {
      headers: { ...headers, 'Cache-Control': 'public, max-age=300' },
    });
  },
};
