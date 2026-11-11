import { BSKY_POST, COLLECTION, normalizeNote, normalizePost, pdsConfig } from './pds.mjs';

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
    const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if ([400, 401, 403, 404, 410].includes(response.status)) await env.NOTES.delete(SNAPSHOT_KEY);
    if (!response.ok) throw new Error(`PDS returned HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.records)) throw new Error('PDS returned an invalid record list');

    for (const record of data.records) {
      if (typeof record?.uri !== 'string' || !record.uri.startsWith(prefix)) continue;
      const key = record.uri.slice(prefix.length);
      if (!/^[a-zA-Z0-9._:~-]{1,512}$/.test(key) || key === '.' || key === '..') continue;
      const note = normalize(record.value, key, pds);
      if (note) notes.set(record.uri, { uri: record.uri, ...note });
    }

    if (!data.cursor) return [...notes.values()];
    if (typeof data.cursor !== 'string' || cursors.has(data.cursor)) throw new Error('PDS returned an invalid cursor');
    cursors.add(data.cursor);
    url.searchParams.set('cursor', data.cursor);
  }
  throw new Error(`${collection} exceeds the ${maxPages}-page refresh limit`);
}

export async function refreshNotes(env, request = fetch, now = new Date()) {
  const pds = pdsConfig(env);
  const includeLegacy = env.INCLUDE_LEGACY_NOTES === 'true';
  const notes = await listNotes(env, pds, BSKY_POST, normalizePost, includeLegacy ? 40 : 48, request);
  if (includeLegacy) notes.push(...await listNotes(env, pds, COLLECTION, normalizeNote, 8, request));
  const latest = notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri)).slice(0, 20);
  const snapshot = { ...pds, refreshedAt: now.toISOString(), notes: latest };
  await env.NOTES.put(SNAPSHOT_KEY, JSON.stringify(snapshot), { expirationTtl: MAX_AGE });
  return snapshot;
}

export default {
  async scheduled(_controller, env) {
    await refreshNotes(env);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/notes') {
      url.pathname = '/notes/';
      return Response.redirect(url, 308);
    }
    if (url.pathname.startsWith('/notes/')) {
      url.pathname = url.pathname === '/notes/' ? '/index.html' : url.pathname.slice('/notes'.length);
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
    if (!snapshot || snapshot.did !== env.ATPROTO_DID || snapshot.origin !== origin || !(age < MAX_AGE * 1000)) {
      return Response.json({ error: 'Notes are unavailable' }, { status: 503, headers });
    }
    return Response.json(snapshot, { headers: { ...headers, 'Cache-Control': 'public, max-age=300' } });
  },
};
