import {
  ARCHIVE_POST, BSKY_POST, COLLECTION, isRecordKey, normalizeArchivePost, normalizeNote, normalizePost, pdsConfig,
} from './pds.mjs';
import { postPage, renderArchivePost } from './render.mjs';

const SNAPSHOT_KEY = 'latest';
const MAX_AGE = 48 * 60 * 60;
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
  const latest = notes
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri))
    .slice(0, 20)
    .map(note => typeof note.body === 'string' ? renderArchivePost(note, pds) : note);
  const snapshot = { ...pds, refreshedAt: now.toISOString(), notes: latest };
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
    return new Response(request.method === 'HEAD' ? null : postPage(renderArchivePost(post, pds)), {
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
    if (['/notes', '/posts', '/posts/'].includes(url.pathname)) {
      url.pathname = '/notes/';
      return Response.redirect(url, 308);
    }
    if (url.pathname.startsWith('/posts/')) {
      let key;
      try {
        key = decodeURIComponent(url.pathname.slice('/posts/'.length));
      } catch {
        return new Response('Post not found', { status: 404 });
      }
      return servePost(request, env, key);
    }
    if ((url.pathname === '/' && env.STANDALONE_SITE === 'true') || url.pathname.startsWith('/notes/')) {
      url.pathname = url.pathname === '/' || url.pathname === '/notes/' ? '/index.html' : url.pathname.slice('/notes'.length);
      return env.ASSETS.fetch(new Request(url, request));
    }
    const headers = {
      ...(env.SITE_ORIGIN ? { 'Access-Control-Allow-Origin': env.SITE_ORIGIN } : {}),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (url.pathname !== '/notes.json') return new Response(null, { status: 404, headers });
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
    const snapshot = await env.NOTES.get(SNAPSHOT_KEY, 'json');
    const age = Date.now() - Date.parse(snapshot?.refreshedAt);
    const origin = URL.canParse(env.ATPROTO_PDS_ORIGIN) && new URL(env.ATPROTO_PDS_ORIGIN).origin;
    if (!snapshot || snapshot.did !== env.ATPROTO_DID || snapshot.origin !== origin ||
        (snapshot.collection ?? ARCHIVE_POST) !== (env.ATPROTO_POST_COLLECTION ?? ARCHIVE_POST) ||
        !(age < MAX_AGE * 1000)) {
      return Response.json({ error: 'Notes are unavailable' }, { status: 503, headers });
    }
    return Response.json(snapshot, { headers: { ...headers, 'Cache-Control': 'public, max-age=300' } });
  },
};
