// The rules every note follows, whichever front it comes from: the commands, the agent's tools, or
// the editor. Nothing here touches a file or a network, so it runs on a machine and in a Worker.
import { cleanName, formProblems, identifyForm, isForm, OTHER } from '../feed/forms.mjs';
import { connectUri, isRecordKey, POST, postPath, webUrl } from '../feed/pds.mjs';
import { bodyFacts } from '../feed/render.mjs';

// Who can see a note. It is decided by where the note is stored, never by a field inside it.
export const VISIBILITIES = ['public', 'friends', 'private'];
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isSlug = value => typeof value === 'string' && value.length <= 120 && SLUG.test(value);
export const graphemes = text => [...new Intl.Segmenter().segment(text)].length;
// The files a note can hold, by the ending of their name.
export const FILE_TYPES = {
  '.avif': 'image/avif', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.pdf': 'application/pdf', '.epub': 'application/epub+zip', '.zip': 'application/zip', '.json': 'application/json',
  '.txt': 'text/plain', '.csv': 'text/csv', '.md': 'text/markdown',
};
// An attachment is an image, a video, audio, or otherwise a file.
export const kindOf = mime => ['image', 'video', 'audio'].find(kind => mime.startsWith(`${kind}/`)) ?? 'file';

const base32 = bytes => {
  const bits = [...bytes].map(byte => byte.toString(2).padStart(8, '0')).join('');
  return bits.match(/.{1,5}/g).map(group => 'abcdefghijklmnopqrstuvwxyz234567'[parseInt(group.padEnd(5, '0'), 2)]).join('');
};

// The address a file's bytes have as an AT Protocol blob: CIDv1, raw codec, SHA-256. The same bytes
// have the same address in every store, which is what lets a note move without changing.
export async function blobCid(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return 'b' + base32([1, 0x55, 0x12, 0x20, ...digest]);
}

const ordered = value => Array.isArray(value) ? value.map(ordered)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]))
    : value;

// A name for exactly this content of a note. A save says which version it started from, so two
// edits made from the same starting point cannot silently overwrite each other.
export async function recordVersion(record) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(ordered(record)))));
  return 'v' + base32(digest);
}

export class VaultProblem extends Error {}
const refuse = message => { throw new VaultProblem(message); };

// Build a note's record from what the author gave. `name` says how a field is called in the
// messages: a command passes its option names, the editor its own.
//   note: slug, body, title, subtitle, publishedAt, updatedAt, form, label, sublabel, connect,
//         source, own (the site's optional layer, already checked), kinds (its attachments' kinds),
//         facts (what the body holds, when the caller has already read it)
export function assembleRecord(note, { did, site, collection = POST, name = field => field } = {}) {
  if (!isSlug(note.slug)) refuse(`The ${name('slug')} is lowercase letters and digits joined by single hyphens, at most 120 characters`);
  const body = typeof note.body === 'string' ? note.body.trim() : '';
  if (!body || new TextEncoder().encode(body).length > 262_144) refuse('Use a nonempty Markdown body of at most 256 KiB');
  const publishedAt = note.publishedAt === undefined ? new Date() : new Date(note.publishedAt);
  if (!Number.isFinite(publishedAt.valueOf())) refuse(`${name('date')} must be a valid date`);
  const self = `at://${did}/${collection}/${note.slug}`;
  const connect = [...new Set((note.connect ?? []).map(value => {
    const uri = SLUG.test(value) ? `at://${did}/${collection}/${value}` : connectUri(value);
    if (!uri || uri === self) refuse(`Use ${name('connect')} with the slug of an earlier post, an AT URI, or an HTTP(S) URL`);
    return uri;
  }))];
  if (connect.length > 32) refuse('A post connects to at most 32 others');
  const title = note.title || undefined;
  if (title !== undefined && graphemes(title) > 300) refuse(`${name('title')} can be at most 300 characters`);
  const facts = note.facts ?? bodyFacts(body);
  // The form is identified from the content and checked. A given form overrides it when the author
  // means something else.
  const content = { title, facts, kinds: note.kinds ?? [] };
  const form = note.form ?? identifyForm(content);
  const problems = formProblems(form, content);
  if (problems.length) refuse(problems.join('\n'));
  // Every post is filed under a label, because its address is built from it. One with no label
  // goes under `other`.
  const sublabel = cleanName(note.sublabel);
  if (sublabel && !cleanName(note.label)) refuse(`A ${name('sublabel')} sits inside a ${name('label')}; set both`);
  const label = cleanName(note.label) || OTHER;
  const subtitle = (note.subtitle ?? '').trim();
  if (subtitle && !title) refuse(`A ${name('subtitle')} sits under a ${name('title')}; set both`);
  if (graphemes(subtitle) > 300) refuse(`${name('subtitle')} can be at most 300 characters`);
  const origin = webUrl(site);
  if (!origin) refuse('The site address must be an HTTP(S) URL');
  const record = {
    $type: collection,
    body,
    publishedAt: publishedAt.toISOString(),
    ...(note.updatedAt ? { updatedAt: new Date(note.updatedAt).toISOString() } : {}),
    // The post's address on the public site, which follows its label and sublabel. It is the same
    // at every visibility, so changing who can see a note moves it without rewriting it.
    canonicalUrl: new URL(postPath({ label, sublabel }, note.slug), origin).href,
    // The record says what its slug is, because it may be kept under a key that is not the slug.
    slug: note.slug,
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
    form,
    label,
    ...(sublabel ? { sublabel } : {}),
    ...(connect.length ? { connect } : {}),
    ...(note.source ? { source: note.source } : {}),
    ...(note.own ? { site: note.own } : {}),
  };
  return { record, form, facts };
}

// One attachment as the record holds it.
export function mediaEntry(collection, id, { blob, mime, sourceUrl, width, height }) {
  return {
    $type: `${collection}#${kindOf(mime)}`, id, file: blob,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(width && height ? { width, height } : {}),
  };
}

// Every stored file a record points to: its attachments, a video's still image, a link's preview.
export function recordBlobs(record) {
  const blobs = [];
  for (const item of Array.isArray(record?.media) ? record.media : []) {
    if (item?.file) blobs.push(item.file);
    if (item?.poster) blobs.push(item.poster);
  }
  if (record?.link?.image) blobs.push(record.link.image);
  return blobs.filter(blob => typeof blob?.ref?.$link === 'string' && typeof blob.mimeType === 'string');
}

// Why a record cannot be saved, as sentences to show the author. Empty when it can. This is the
// check a record gets when it was edited as a whole, in the editor or by an agent.
export function recordProblems(record, key, { collection = POST } = {}) {
  const problems = [];
  if (!isRecordKey(key)) problems.push('The key is not a valid record key');
  if (!record || typeof record !== 'object' || Array.isArray(record)) return [...problems, 'A note is an object'];
  if (record.$type !== collection) problems.push(`A note's type is ${collection}`);
  if (Object.hasOwn(record, 'visibility')) problems.push('Visibility is where a note is stored, not a field in it');
  const body = typeof record.body === 'string' ? record.body : '';
  if (!body.trim() || new TextEncoder().encode(body).length > 262_144) problems.push('Use a nonempty Markdown body of at most 256 KiB');
  if (!Number.isFinite(Date.parse(record.publishedAt))) problems.push('publishedAt must be a valid date');
  if (record.updatedAt !== undefined && !Number.isFinite(Date.parse(record.updatedAt))) problems.push('updatedAt must be a valid date');
  if (!webUrl(record.canonicalUrl)) problems.push('canonicalUrl must be an HTTP(S) URL');
  if (record.slug !== undefined && !isSlug(record.slug)) problems.push('slug is lowercase Latin letters and digits joined by single hyphens, at most 120 characters');
  const text = (field, most) => {
    if (record[field] === undefined) return;
    if (typeof record[field] !== 'string' || graphemes(record[field]) > most) problems.push(`${field} can be at most ${most} characters`);
  };
  text('title', 300); text('subtitle', 300); text('label', 100); text('sublabel', 100);
  if (record.subtitle && !record.title) problems.push('A subtitle sits under a title; set both');
  if (record.sublabel && !record.label) problems.push('A sublabel sits inside a label; set both');
  const connect = record.connect ?? [];
  if (!Array.isArray(connect) || connect.length > 32 || connect.some(uri => !connectUri(uri))) {
    problems.push('connect holds at most 32 AT URIs or HTTP(S) URLs');
  }
  const media = record.media ?? [];
  const kinds = [];
  const ids = new Set();
  if (!Array.isArray(media)) problems.push('media is a list of attachments');
  else for (const item of media) {
    const kind = typeof item?.$type === 'string' && item.$type.startsWith(`${collection}#`) ? item.$type.slice(collection.length + 1) : '';
    if (!['image', 'video', 'audio', 'file'].includes(kind) || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) ||
        ids.has(item.id) || typeof item.file?.ref?.$link !== 'string') {
      problems.push('Each attachment has a kind, an ID unique within the note, and a stored copy');
      continue;
    }
    ids.add(item.id);
    kinds.push(kind);
  }
  if (body.trim() && !problems.length) {
    const facts = bodyFacts(body.trim());
    for (const id of facts.media) if (!ids.has(id)) problems.push(`The body places an attachment "${id}" the note does not hold`);
    for (const id of ids) if (!facts.media.has(id)) problems.push(`The attachment "${id}" is not placed anywhere in the body`);
    // A form this software does not know is read as `other` and has no rules to check.
    if (isForm(record.form)) problems.push(...formProblems(record.form, { title: record.title, facts, kinds }));
  }
  return problems;
}
