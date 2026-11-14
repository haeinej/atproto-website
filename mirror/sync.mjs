// The mirror: copy what the owner has published elsewhere into their repository. It runs one way
// only. Each source is followed; nothing is ever written back to a platform, and a post that has
// not changed since the last run is left alone.
import { cleanName, formProblems, identifyForm, OTHER } from '../feed/forms.mjs';
import { connectUri, pdsConfig, postPath, webUrl } from '../feed/pds.mjs';
import { bodyFacts } from '../feed/render.mjs';
import { htmlToMarkdown } from './html-to-markdown.mjs';
import { reader } from './sources.mjs';
import { recordByKey } from '../feed/repository.mjs';
import { recordVersion } from '../vault/core.mjs';

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
  if (!Number.isSafeInteger(budget) || budget < 0 || budget > 1000) throw new Error('MIRROR_BUDGET must be an integer from 0 to 1000');
  const report = { at: now.toISOString(), sources: [] };
  const tasks = [];
  const legacyGroups = new Map();
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
      try {
        // Every operation that depends on untrusted source data belongs inside this boundary.
        const legacyKey = keyFor(source, item);
        if (!legacyKey || !item.publishedAt || !webUrl(item.url)) throw new Error('no valid address or no date');
        const binding = await digest([pds.did, pds.origin, pds.collection, site, source.platform, source.feed ?? source.userId]);
        const identity = await digest([binding, String(item.id ?? item.url)]);
        // A feed can repeat an item; conflicting copies need review instead of last-write-wins.
        const duplicate = tasks.find(task => task.identity === identity);
        if (duplicate) { duplicate.blocked = true; throw new Error('duplicate source item identity; review the feed'); }
        const post = draft(source, item);
        if (!post.body.trim()) throw new Error('nothing to mirror');
        tasks.push({ source, item, post, result, binding, identity, legacyKey });
        legacyGroups.set(legacyKey, (legacyGroups.get(legacyKey) ?? 0) + 1);
      } catch (problem) {
        result.problems.push(`${item.url ?? item.id}: ${problem.message}`);
      }
    }
  }
  // Rotate across all sources, not just the beginning of each feed. A failed expensive item
  // consumes an attempt, but cannot monopolize every later run. The cursor survives crashes.
  const cursorKey = `mirror:cursor:${await digest([pds.did, pds.origin, pds.collection, site, report.sources.map(source => [source.platform, source.from])])}`;
  const cursor = await env.MIRROR.get(cursorKey, 'json');
  const start = tasks.findIndex(task => task.identity === cursor?.after) + 1;
  const ordered = [...tasks.slice(start), ...tasks.slice(0, start)];
  for (const task of ordered) {
    if (task.blocked) continue;
    const { source, item, post, result, binding, identity, legacyKey } = task;
    const stateKey = `mirror:v2:${identity}`;
    const errorKey = `mirror:error:${identity}`;
    try {
        let last = await env.MIRROR.get(stateKey, 'json');
        if (last && (last.binding !== binding || last.identity !== identity)) throw new Error('checkpoint ownership is invalid; review it before retrying');
        let key = last?.key ?? (legacyGroups.get(legacyKey) > 1 ? `${legacyKey.slice(0, 80)}-${identity.slice(0, 20)}` : legacyKey);
        const hashFor = key => digest([post.title, post.body, post.images, post.publishedAt, source.label, source.sublabel, post.connect,
          source.platform === 'website' ? item.url : new URL(postPath(source, key), site).href, source.platform, String(item.id), item.url]);
        let hash = await hashFor(key);
        if (last?.phase === 'complete' && last.hash === hash) { result.unchanged++; continue; }
        if (left <= 0) {
          result.waiting++;
          const earlier = await env.MIRROR.get(errorKey, 'json');
          if (earlier?.message) result.problems.push(`${item.url}: waiting to retry (${earlier.message})`);
          continue;
        }
        left--;
        await env.MIRROR.put(cursorKey, JSON.stringify({ after: identity }));
        const legacy = await env.MIRROR.get(`mirror:${source.platform}:${legacyKey}`, 'json');
        if (!last && legacy && legacyGroups.get(legacyKey) > 1) throw new Error('ambiguous legacy mirror mapping; review existing records/checkpoints before migration');
        let held = await recordByKey(pds, key, get);
        if (!last && held) {
          const value = held.value;
          const provenance = value.$type === pds.collection && (source.platform === 'website'
            ? value.canonicalUrl === item.url
            : value.source?.platform === source.platform && value.source?.uri === item.url && String(value.source?.id) === String(item.id));
          const oldHash = await digest([value.title ?? '', value.body, (value.media ?? []).map(image => image.sourceUrl), value.label ?? OTHER, value.sublabel ?? '', value.connect ?? []]);
          // V1 checkpoints never hashed dates, blob identity or extension fields. Only a text
          // record whose complete content still matches this source can be rebound automatically;
          // otherwise an operator must establish ownership without discarding either copy.
          const legacyFields = new Set(['$type', 'body', 'publishedAt', 'canonicalUrl', 'updatedAt', 'title', 'form', 'label', 'sublabel', 'connect', 'source']);
          const legacyText = !(value.media?.length) && Object.keys(value).every(field => legacyFields.has(field)) &&
            value.publishedAt === post.publishedAt && value.body === post.body && (value.title ?? '') === post.title &&
            value.label === source.label && (value.sublabel ?? '') === source.sublabel &&
            JSON.stringify(value.connect ?? []) === JSON.stringify(post.connect) &&
            value.canonicalUrl === (source.platform === 'website' ? item.url : new URL(postPath(source, key), site).href) &&
            value.form === identifyForm({ title: post.title, facts: bodyFacts(post.body), kinds: [] }) &&
            await recordVersion(value.source ?? null) === await recordVersion(source.platform === 'website' ? null : { platform: source.platform, uri: webUrl(item.url), id: String(item.id) });
          if (legacy && provenance && legacy.hash === oldHash && legacyText) {
            last = { binding, identity, key, cid: held.cid, recordHash: await recordVersion(value) };
          } else if (legacy) {
            throw new Error('legacy mirror ownership/content is ambiguous; preserve the record and review its checkpoint');
          } else {
            // A different publisher owns the old friendly key. Allocate a deterministic new key,
            // never overwrite it and never silently move an established mirror mapping.
            key = `${legacyKey.slice(0, 80)}-${identity.slice(0, 20)}`;
            hash = await hashFor(key);
            held = await recordByKey(pds, key, get);
            if (held) throw new Error('the collision-safe key is occupied; review the record before retrying');
          }
        }
        if (held && (typeof held.cid !== 'string' || !held.cid)) throw new Error('the PDS did not supply a version for the mirrored record');
        if (last?.phase === 'pending' && held && await recordVersion(held.value) === await recordVersion(last.intended)) {
          // The record committed, but its success checkpoint did not. Acknowledge those exact
          // bytes before considering a newer source revision; never create a second record.
          last = { binding, identity, key, phase: 'complete', hash: last.intendedHash, recordHash: await recordVersion(held.value), cid: held.cid, at: report.at };
          await env.MIRROR.put(stateKey, JSON.stringify(last));
          if (last.hash === hash) { result.unchanged++; await env.MIRROR.put(errorKey, 'null'); continue; }
        }
        if (last && held && (!last.recordHash || await recordVersion(held.value) !== last.recordHash)) throw new Error('the mirrored record changed outside the mirror; review it before retrying');
        if (last && !held && (last.phase !== 'pending' || last.recordHash)) throw new Error('the mirrored record was removed; review the deletion before recreating it');
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
          ...(held ? { updatedAt: now.toISOString() } : {}),
          ...(post.title && form !== 'note' && form !== 'quote' ? { title: post.title } : {}),
          form, label: source.label, ...(source.sublabel ? { sublabel: source.sublabel } : {}),
          ...(post.connect.length ? { connect: post.connect } : {}),
          // Where this post first appeared. Its platform is what the posts list files it under.
          ...(source.platform === 'website' ? {} : { source: { platform: source.platform, uri: webUrl(item.url) ?? site, id: String(item.id) } }),
          ...(media.length ? { media } : {}),
        };
        await env.MIRROR.put(stateKey, JSON.stringify({ ...last, binding, identity, key, phase: 'pending', intended: record, intendedHash: hash }));
        const written = await call(pds, env.PDS_AUTH_TOKEN, held ? 'com.atproto.repo.putRecord' : 'com.atproto.repo.createRecord', {
          body: { repo: pds.did, collection: pds.collection, rkey: key, record, ...(held ? { swapRecord: held.cid } : {}) },
        }, get);
        if (written.uri !== `at://${pds.did}/${pds.collection}/${key}` || typeof written.cid !== 'string' || !written.cid) throw new Error('PDS returned an invalid write acknowledgement; retry to reconcile it');
        await env.MIRROR.put(stateKey, JSON.stringify({ binding, identity, key, phase: 'complete', hash, recordHash: await recordVersion(record), cid: written.cid, at: report.at }));
        await env.MIRROR.put(errorKey, 'null');
        result.written.push({ key, form, ...(post.simplified.length ? { simplified: post.simplified } : {}) });
      } catch (problem) {
        result.problems.push(`${item.url ?? item.id}: ${problem.message}`);
        await env.MIRROR.put(errorKey, JSON.stringify({ message: problem.message, at: report.at }));
      }
  }
  await env.MIRROR.put('mirror:last', JSON.stringify(report));
  return report;
}
