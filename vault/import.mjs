// Bring what a person has already published into their vault. Each record in their repository
// becomes a post, and each post is then turned back into the record it would be published as and
// compared with the one it came from, so anything that would not survive is named, never dropped
// in silence.
import { filing, isRecordKey, POST, postPath, webUrl } from '../feed/pds.mjs';
import { upgradePost } from '../feed/upgrade.mjs';
import { FILE_TYPES, isSlug } from './core.mjs';
import { addressKind, isPostId, mediaLayout, newPostId, postProblems, postRecord, slugOf } from './file.mjs';

// A number worked out from text, the same every time.
function hashOf(text) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash;
}

// The ID a record's post is given. A record already kept under a post's ID keeps it. Any other is
// given one worked out from when it was published and the key it is under, so bringing the same
// vault in a second time gives every post the ID it was given the first time.
export function importedId(did, key, publishedAt) {
  if (isPostId(key)) return key;
  const hash = hashOf(`${did}/${key}`);
  return newPostId(Date.parse(publishedAt), hash & 1023, (hash >>> 10) % 1000);
}

const ending = mime => Object.entries(FILE_TYPES).find(([, type]) => type === mime)?.[0] ?? '';

// Where a file kept in the repository can be fetched from, ending in what the file is called so
// that its kind is known without fetching it.
export function blobAddress({ did, origin }, entry) {
  const cid = entry?.file?.ref?.$link;
  if (typeof cid !== 'string' || typeof entry.file.mimeType !== 'string') return null;
  const url = new URL('/xrpc/com.atproto.sync.getBlob', origin);
  url.search = new URLSearchParams({ did, cid });
  return `${url.href}#${entry.id}${ending(entry.file.mimeType)}`;
}

// One record as a post. `lost` names what the post has no place for.
//   slugForKey(key) -> the slug of the person's own post kept under that key, or nothing
export function recordPost(record, key, { did, origin, site, collection = POST, slugForKey = () => undefined } = {}) {
  const lost = [];
  const { label, sublabel } = filing(record);
  const slug = isSlug(record.slug) ? record.slug : isSlug(key) ? key : slugOf(key);
  const media = new Map((Array.isArray(record.media) ? record.media : []).map(entry => [entry?.id, entry]));
  const placed = new Set();
  // In a record the body places a file by its ID. In a post it points at where the file is.
  const body = String(record.body ?? '').replace(/!\[([^\]]*)\]\(media:([A-Za-z0-9_-]{1,64})\)/g, (whole, alt, id) => {
    const entry = media.get(id);
    // A file points at where its original is, when the record says and that address shows what kind
    // of file it is. Otherwise it points at the copy kept in the repository.
    const original = webUrl(entry?.sourceUrl);
    const address = entry?.file && original && addressKind(original) === entry.$type?.split('#').at(-1) && !/[\s()<>]/.test(original)
      ? original : blobAddress({ did, origin }, entry);
    if (address && address !== original && entry?.sourceUrl) lost.push(`where "${id}" first came from (${entry.sourceUrl})`);
    if (!address) {
      lost.push(`the file "${id}" its body places, which the record does not hold`);
      return alt;
    }
    placed.add(id);
    return `![${alt}](${address})`;
  }).trim();
  for (const [id, entry] of media) {
    if (!placed.has(id)) lost.push(`the attachment "${id}", which its body does not place`);
    for (const field of ['caption', 'poster', 'durationMs']) if (entry?.[field] !== undefined && placed.has(id)) lost.push(`the ${field} of "${id}"`);
  }
  const own = `at://${did}/${collection}/`;
  const connect = (Array.isArray(record.connect) ? record.connect : []).map(uri => {
    if (typeof uri !== 'string' || !uri.startsWith(own)) return uri;
    // A connection to one of the person's own posts is kept as that post's slug, so it follows
    // the post when its record moves to being kept under an ID.
    const other = slugForKey(uri.slice(own.length));
    if (!other) lost.push(`a connection to ${uri}, which is not one of the posts brought in`);
    return other ?? null;
  }).filter(value => typeof value === 'string');
  if (record.link) lost.push('what its linked page said about itself, which is read again when the post is published');
  // The address a post was published at is kept when it is not the one its label and slug would
  // give it: a page of the author's own design.
  const usual = site && URL.canParse(postPath({ label, sublabel }, slug), site) ? new URL(postPath({ label, sublabel }, slug), site).href : null;
  const address = webUrl(record.canonicalUrl) && record.canonicalUrl !== usual ? record.canonicalUrl : undefined;
  const layer = record.site !== null && typeof record.site === 'object' && !Array.isArray(record.site) ? record.site : undefined;
  const source = record.source?.platform && record.source?.uri
    ? { platform: String(record.source.platform), uri: String(record.source.uri), ...(record.source.id ? { id: String(record.source.id) } : {}) } : undefined;
  const post = {
    id: importedId(did, key, record.publishedAt),
    slug, label: label === 'other' ? '' : label, sublabel, visibility: 'public',
    ...(typeof record.title === 'string' && record.title.trim() ? { title: record.title.trim() } : {}),
    ...(typeof record.subtitle === 'string' && record.subtitle.trim() ? { subtitle: record.subtitle.trim() } : {}),
    date: record.publishedAt,
    ...(address ? { address } : {}),
    ...(connect.length ? { connect } : {}),
    ...(source ? { source } : {}),
    body,
    properties: {},
    // The site's own layer comes across whole, whatever it holds.
    ...(layer ? { site: layer } : {}),
  };
  return { post, lost };
}

// What differs between the record a post came from and the record it would be published as now.
// The ID a file is placed by is not compared, only that the same files are placed in the same order.
export function differences(before, after) {
  const found = [];
  const say = (what, was, now) => { if (JSON.stringify(was) !== JSON.stringify(now)) found.push(`${what}: was ${JSON.stringify(was ?? null)}, would be ${JSON.stringify(now ?? null)}`); };
  if (!after) return ['it could not be turned back into a record'];
  const places = body => mediaLayout(body).body;
  say('body', places(before.body), places(after.body));
  for (const field of ['title', 'subtitle', 'sublabel']) say(field, before[field]?.trim?.() || undefined, after[field]);
  // The same moment written two ways is the same date.
  if (Date.parse(before.publishedAt) !== Date.parse(after.publishedAt)) say('publishedAt', before.publishedAt, after.publishedAt);
  say('label', filing(before).label, filing(after).label);
  if (before.form !== undefined) say('form', before.form, after.form);
  say('address', before.canonicalUrl, after.canonicalUrl);
  say('the site\'s own layer', before.site, after.site);
  say('where it first appeared', before.source && { platform: before.source.platform, uri: before.source.uri, ...(before.source.id ? { id: String(before.source.id) } : {}) }, after.source);
  return found;
}

// Every record as a post, ready to be put in the vault, with what would be lost and what would differ.
//   records: [{ key, value }] as the repository lists them, of the shared post type or an older one
export function importVault(records, { did, origin, site, namespace, collection = POST } = {}) {
  const read = [];
  const skipped = [];
  for (const { key, value } of records) {
    // A record of an older type keeps its extra fields in its own layer, named for its own type
    // (com.example.post gives com.example) unless a namespace was given for all of them.
    const type = typeof value?.$type === 'string' ? value.$type : '';
    const { record, left } = upgradePost(value, { did, key, namespace: namespace ?? (type.includes('.') ? type.slice(0, type.lastIndexOf('.')) : undefined) });
    if (!isRecordKey(key) || !record || typeof record.body !== 'string' || !Number.isFinite(Date.parse(record.publishedAt))) {
      skipped.push({ key, why: 'it has no body or no date that can be read' });
      continue;
    }
    read.push({ key, record, left: left.map(name => `"${name}", which the shared post has no place for`) });
  }
  const slugs = new Map(read.map(({ key, record }) => [key, isSlug(record.slug) ? record.slug : isSlug(key) ? key : slugOf(key)]));
  const posts = read.map(({ key, record, left }) => {
    const { post, lost } = recordPost(record, key, { did, origin, site, collection, slugForKey: other => slugs.get(other) });
    return { key, record, post, lost: [...left, ...lost] };
  });
  // Two posts cannot share a slug or an ID. The later one, by date, is left out and named.
  const kept = [];
  const taken = { slug: new Set(), id: new Set() };
  for (const each of posts.sort((a, b) => String(a.post.date).localeCompare(String(b.post.date)) || a.key.localeCompare(b.key))) {
    const problems = postProblems(each.post);
    const clash = ['slug', 'id'].find(name => taken[name].has(each.post[name]));
    if (problems.length || clash) {
      skipped.push({ key: each.key, why: clash ? `another post already has its ${clash}, "${each.post[clash]}"` : problems.join('; ') });
      continue;
    }
    taken.slug.add(each.post.slug);
    taken.id.add(each.post.id);
    kept.push(each);
  }
  const ids = new Map(kept.map(each => [each.post.slug, each.post.id]));
  for (const each of kept) {
    const made = postRecord(each.post, { did, site, collection, postId: slug => ids.get(slug) });
    each.differs = differences(each.record, made.record);
    each.problems = made.problems;
  }
  return { posts: kept, skipped };
}

// Put the posts in the vault, one request each. `send(post)` makes the request and answers with
// its status and what came back. Sending the same posts again changes nothing: a post that is
// already there as it is, is left, and one that has since been changed in the vault is not
// overwritten.
export async function saveImported(posts, send) {
  const result = { saved: [], unchanged: [], changedThere: [], refused: [] };
  for (const { key, post } of posts) {
    const { status, body } = await send(post);
    if (status === 200) (body.unchanged ? result.unchanged : result.saved).push(post.slug);
    else if (status === 409 && body.error === 'Changed') result.changedThere.push(post.slug);
    else result.refused.push({ key, slug: post.slug, why: body.message ?? `HTTP ${status}` });
  }
  return result;
}
