// Private posts never reach the PDS, where every record is public. They live in the site's KV
// namespace and are served only to a request that Cloudflare Access has signed in.
import { isRecordKey, normalizeArchivePost, pdsConfig } from './pds.mjs';
import { postPage, renderArchivePost } from './render.mjs';
import { upgradePost } from './upgrade.mjs';

export const PRIVATE_POST = 'private:';
export const PRIVATE_BLOB = 'private-blob:';
const TEAM = /^[a-z0-9-]+\.cloudflareaccess\.com$/;
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};

const decode = part => Uint8Array.from(atob(part.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
const json = part => JSON.parse(new TextDecoder().decode(decode(part)));

// Cloudflare Access puts a signed token on every request it lets through. Check it here too, so a
// request that reaches the Worker some other way gets nothing.
// https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
export async function signedIn(request, env, get = fetch) {
  const team = env.ACCESS_TEAM_DOMAIN;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!TEAM.test(team ?? '') || !env.ACCESS_AUD || !token) return false;
  try {
    const [head, payload, signature, extra] = token.split('.');
    const { alg, kid } = json(head);
    const claims = json(payload);
    if (extra !== undefined || alg !== 'RS256' || claims.iss !== `https://${team}` ||
        ![claims.aud].flat().includes(env.ACCESS_AUD) || !(claims.exp > Date.now() / 1000)) return false;
    const response = await get(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(10_000) });
    const jwk = (await response.json()).keys.find(key => key.kid === kid);
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(signature), new TextEncoder().encode(`${head}.${payload}`));
  } catch {
    return false;
  }
}

// A private post saved before the post schema was shared is read as the shared schema has it.
const saved = (value, key, pds) => upgradePost(value, { did: pds.did, key, namespace: pds.namespace }).record;

function privatePost(value, key, pds) {
  const post = normalizeArchivePost(saved(value, key, pds), key, {
    ...pds,
    mediaHref: id => `/notes/private/blob/${encodeURIComponent(key)}/${encodeURIComponent(id)}`,
  });
  return post && renderArchivePost({ ...post, permalink: `/notes/private/posts/${encodeURIComponent(key)}`, visibility: 'private' }, pds);
}

// A private post uses the address it would have on the PDS, so links to it keep working if it is
// published later.
async function privateGraph(env, pds) {
  const graph = {};
  let cursor;
  do {
    const page = await env.NOTES.list({ prefix: PRIVATE_POST, cursor });
    for (const { name } of page.keys) {
      const key = name.slice(PRIVATE_POST.length);
      const post = isRecordKey(key) && privatePost(await env.NOTES.get(name, 'json'), key, pds);
      if (!post) continue;
      graph[`at://${pds.did}/${pds.collection}/${key}`] = {
        href: post.permalink,
        name: post.name || post.sublabel || post.label,
        createdAt: post.createdAt,
        platform: post.platform,
        ...(post.form ? { form: post.form } : {}),
        ...(post.label ? { label: post.label } : {}),
        ...(post.sublabel ? { sublabel: post.sublabel } : {}),
        visibility: 'private',
        links: post.links ?? [],
        branches: [],
      };
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return graph;
}

export async function servePrivate(request, env, pathname, get = fetch) {
  const missing = () => new Response('Not found', { status: 404, headers });
  if (!['GET', 'HEAD'].includes(request.method) || !(await signedIn(request, env, get))) return missing();
  let parts;
  try {
    parts = pathname.slice('/notes/private'.length).split('/').slice(1).map(decodeURIComponent);
  } catch {
    return missing();
  }
  const [section = '', key, id] = parts;
  // Signing in lands here; send the owner on to the list with their private posts in it.
  if (section === '' && parts.length <= 1) {
    return new Response(null, { status: 302, headers: { ...headers, Location: '/notes/?by=visibility' } });
  }
  const pds = pdsConfig(env);
  if (section === 'graph.json' && parts.length === 1) return Response.json(await privateGraph(env, pds), { headers });
  if (!isRecordKey(key)) return missing();
  const value = saved(await env.NOTES.get(PRIVATE_POST + key, 'json'), key, pds);
  if (section === 'posts' && parts.length === 2) {
    const post = privatePost(value, key, pds);
    if (!post) return missing();
    return new Response(request.method === 'HEAD' ? null : postPage(post), {
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  if (section === 'blob' && parts.length === 3) {
    // `~link` is the preview image of a link post; any other ID is one of the post's attachments.
    const blob = id === '~link' ? value?.link?.image
      : Array.isArray(value?.media) && value.media.find(item => item?.id === id)?.file;
    const cid = blob?.ref?.$link;
    if (!/^(?:image|video|audio|application|text)\/[a-z0-9.+-]+$/.test(blob?.mimeType ?? '') || !/^b[a-z2-7]{20,120}$/.test(cid ?? '')) return missing();
    const bytes = await env.NOTES.get(PRIVATE_BLOB + cid, 'arrayBuffer');
    if (!bytes) return missing();
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: { ...headers, 'Content-Type': blob.mimeType } });
  }
  return missing();
}
