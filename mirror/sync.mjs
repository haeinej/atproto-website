// The mirror: copy what the owner has published elsewhere into their repository. It runs one way
// only. Each source is followed; nothing is ever written back to a platform, and a post that has
// not changed since the last run is left alone.
import { cleanName, formProblems, identifyForm, OTHER } from '../feed/forms.mjs';
import { connectUri, pdsConfig, postPath, webUrl } from '../feed/pds.mjs';
import { bodyFacts } from '../feed/render.mjs';
import { htmlToMarkdown } from './html-to-markdown.mjs';
import { reader } from './sources.mjs';

const escape = text => text.replace(/([\\`*_[\]<>])/g, '\\$1').replace(/^(#{1,6} |[-+>] )/gm, '\\$1').replace(/^(\d+)([.)] )/gm, '$1\\$2');
const IMAGE = /^image\/(?:jpeg|png|webp|gif|avif)$/;

export function sources(env) {
  const list = typeof env.MIRROR_SOURCES === 'string' ? JSON.parse(env.MIRROR_SOURCES || '[]') : env.MIRROR_SOURCES ?? [];
  if (!Array.isArray(list)) throw new Error('MIRROR_SOURCES is a list of sources');
  return list.map(source => {
    const platform = cleanName(source.platform).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(platform)) throw new Error('Each source needs a platform name, such as website or substack');
    return { ...source, platform, label: cleanName(source.label) || OTHER, sublabel: cleanName(source.sublabel) };
  });
}

// The record's key. It comes from the post's own address, so the same post always lands on the same
// record. A platform other than the owner's website is named in the key, so two platforms cannot
// overwrite each other.
export function keyFor(source, item) {
  if (source.platform === 'x') return `x-${item.id}`;
  const path = URL.canParse(item.url) ? new URL(item.url).pathname : String(item.id);
  const slug = decodeURIComponent(path).replace(/\/+$/, '').split('/').at(-1).replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  if (!slug) return null;
  return source.platform === 'website' ? slug : `${source.platform}-${slug}`;
}

async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function call(pds, token, method, { body, mime = 'application/json' } = {}, get = fetch) {
  const response = await get(new URL(`/xrpc/${method}`, pds.origin), {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': mime },
    body: body instanceof Uint8Array ? body : JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} failed (HTTP ${response.status}${data.message ? `: ${data.message}` : ''})`);
  return data;
}

// One post from a source, as the body and attachments of a record.
function draft(source, item) {
  const converted = item.html ? htmlToMarkdown(item.html, item.url) : { markdown: escape(item.text ?? ''), images: [], simplified: [] };
  const images = [...converted.images, ...(item.images ?? [])];
  const references = (item.images ?? []).map(image => `![${escape(image.alt ?? '')}](media:${image.id})`);
  return {
    title: cleanName(item.title).slice(0, 300), body: [converted.markdown, ...references].filter(Boolean).join('\n\n'),
    images, simplified: converted.simplified, publishedAt: item.publishedAt,
    connect: (item.connect ?? []).map(connectUri).filter(Boolean),
  };
}

export async function mirror(env, { get = fetch, now = new Date(), budget = Number(env.MIRROR_BUDGET ?? 25) } = {}) {
  const pds = pdsConfig(env);
  const site = webUrl(env.SITE_ORIGIN);
  if (!site || !env.PDS_AUTH_TOKEN) throw new Error('The mirror needs SITE_ORIGIN and the PDS_AUTH_TOKEN secret');
  const report = { at: now.toISOString(), sources: [] };
  let left = budget;
  for (const source of sources(env)) {
    const result = { platform: source.platform, from: source.feed ?? `@${source.userId}`, seen: 0, written: [], unchanged: 0, waiting: 0, problems: [] };
    report.sources.push(result);
    let items;
    try {
      items = await reader(source)(source, get, env.X_BEARER_TOKEN);
    } catch (problem) {
      result.problems.push(problem.message);
      continue;
    }
    result.seen = items.length;
    for (const item of items) {
      const key = keyFor(source, item);
      try {
        if (!key || !item.publishedAt) throw new Error('no address or no date');
        const post = draft(source, item);
        if (!post.body.trim()) throw new Error('nothing to mirror');
        const hash = await digest([post.title, post.body, post.images.map(image => image.url), source.label, source.sublabel, post.connect]);
        const stateKey = `mirror:${source.platform}:${key}`;
        // What the last run wrote. A post written under another post type has to be written again.
        const last = await env.MIRROR.get(stateKey, 'json');
        const written = last?.collection === pds.collection;
        if (written && last.hash === hash) { result.unchanged++; continue; }
        // A run does a bounded amount of work; what is left is picked up by the next one.
        if (left <= 0) { result.waiting++; continue; }
        left--;
        const media = [];
        for (const image of post.images) {
          const response = await get(image.url, { signal: AbortSignal.timeout(60_000) });
          const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
          if (!response.ok || !IMAGE.test(mime)) throw new Error(`could not fetch the image ${image.url}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > 20_000_000) throw new Error(`the image ${image.url} is larger than 20 MB`);
          const { blob } = await call(pds, env.PDS_AUTH_TOKEN, 'com.atproto.repo.uploadBlob', { body: bytes, mime }, get);
          media.push({ $type: `${pds.collection}#image`, id: image.id, file: blob, sourceUrl: image.url, ...(image.alt ? { alt: image.alt } : {}) });
        }
        const content = { title: post.title, facts: bodyFacts(post.body), kinds: media.map(() => 'image') };
        const form = identifyForm(content);
        const problems = formProblems(form, content);
        if (problems.length) throw new Error(problems.join('; '));
        const record = {
          $type: pds.collection, body: post.body, publishedAt: post.publishedAt,
          // The post's address on the person's own site. A post mirrored from their website is at
          // the page it came from; one from another platform is on the posts page.
          canonicalUrl: (source.platform === 'website' && webUrl(item.url)) || new URL(postPath(source, key), site).href,
          // The source's version changed since this record was last written.
          ...(written ? { updatedAt: now.toISOString() } : {}),
          ...(post.title && form !== 'note' && form !== 'quote' ? { title: post.title } : {}),
          form, label: source.label, ...(source.sublabel ? { sublabel: source.sublabel } : {}),
          ...(post.connect.length ? { connect: post.connect } : {}),
          // Where this post first appeared. Its platform is what the posts list files it under.
          ...(source.platform === 'website' ? {} : { source: { platform: source.platform, uri: webUrl(item.url) ?? site, id: String(item.id) } }),
          ...(media.length ? { media } : {}),
        };
        await call(pds, env.PDS_AUTH_TOKEN, 'com.atproto.repo.putRecord', { body: { repo: pds.did, collection: pds.collection, rkey: key, record } }, get);
        await env.MIRROR.put(stateKey, JSON.stringify({ hash, at: report.at, collection: pds.collection }));
        result.written.push({ key, form, ...(post.simplified.length ? { simplified: post.simplified } : {}) });
      } catch (problem) {
        result.problems.push(`${item.url ?? item.id}: ${problem.message}`);
      }
    }
  }
  await env.MIRROR.put('mirror:last', JSON.stringify(report));
  return report;
}
