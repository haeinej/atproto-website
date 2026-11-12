// Bring a post saved under an older post type, such as com.example.post, to the shared one. The
// migrate command uses this to copy a repository's public posts across, and the site uses it to
// read a private post that was saved before the schema was shared.
import { cleanName, OTHER } from './forms.mjs';
import { POST, POST_FIELDS, postPath } from './pds.mjs';

// What each part of a post holds. Anything else in an older record is left behind and reported.
const MEDIA_FIELDS = {
  image: ['id', 'file', 'sourceUrl', 'alt', 'caption', 'width', 'height'],
  video: ['id', 'file', 'sourceUrl', 'poster', 'caption', 'durationMs'],
  audio: ['id', 'file', 'sourceUrl', 'caption', 'durationMs'],
  file: ['id', 'file', 'sourceUrl', 'caption'],
};
const LINK_FIELDS = ['uri', 'title', 'description', 'siteName', 'image'];
const SOURCE_FIELDS = ['platform', 'uri', 'id', 'publishedAt'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pick = (value, fields) => Object.fromEntries(fields.filter(field => value[field] !== undefined).map(field => [field, value[field]]));

// A reference to a file in the repository, in the one shape a record holds it. Cirrus lists a blob
// with its type moved onto a nested copy; that is undone here.
function blob(value) {
  const typed = value?.$type === 'blob' ? value : value?.original?.$type === 'blob' ? { ...value.original, ...value } : null;
  const cid = typed?.ref?.$link;
  if (typeof cid !== 'string' || typeof typed.mimeType !== 'string') return undefined;
  return { $type: 'blob', ref: { $link: cid }, mimeType: typed.mimeType, ...(Number.isInteger(typed.size) ? { size: typed.size } : {}) };
}

// `value` is the older record, `key` its record key, `did` the repository it is in, and `namespace`
// the person's own, such as com.example. Returns the post in the shared schema, with:
//   moved  fields of the post the shared schema has no place for, now in the person's own layer
//          under `site`. They need declaring in the person's postSite schema.
//   left   what could not be kept: such a field when no namespace is given, and parts of a link,
//          source, or attachment that the shared schema does not have.
// A record that is already in the shared schema comes back as it is.
export function upgradePost(value, { did, key, namespace } = {}) {
  if (!isObject(value) || typeof value.$type !== 'string') return { record: null, left: [], moved: [] };
  if (value.$type === POST) return { record: value, left: [], moved: [] };
  const from = value.$type;
  const left = [];
  const moved = [];
  const record = { $type: POST, ...pick(value, POST_FIELDS) };
  const own = isObject(value.site) ? { ...value.site } : {};
  for (const field of Object.keys(value)) {
    if (field.startsWith('$') || POST_FIELDS.includes(field) || field === 'tags') continue;
    if (!namespace || field in own) {
      left.push(field);
    } else {
      own[field] = value[field];
      moved.push(field);
    }
  }
  if (moved.length) record.site = { ...own, $type: own.$type ?? `${namespace}.postSite` };

  // Before labels there were free-form tags: the first is the label and the second the sublabel.
  const tags = Array.isArray(value.tags) ? value.tags.map(cleanName).filter(Boolean) : [];
  if (!cleanName(record.label) && tags[0]) {
    record.label = tags[0];
    if (tags[1]) record.sublabel = tags[1];
    if (tags.length > 2) left.push(`tags (${tags.slice(2).join(', ')})`);
  } else if (tags.length) {
    left.push(`tags (${tags.join(', ')})`);
  }

  // Links to the person's own posts name the older type; they follow the posts to the new one.
  const follow = uri => (did && typeof uri === 'string' && uri.startsWith(`at://${did}/${from}/`)
    ? `at://${did}/${POST}/${uri.slice(`at://${did}/${from}/`.length)}` : uri);
  if (typeof record.body === 'string' && did) record.body = record.body.replaceAll(`at://${did}/${from}/`, `at://${did}/${POST}/`);
  if (Array.isArray(record.connect)) record.connect = record.connect.map(follow);

  // A private post used to hold its private address. A post holds the address it has when public.
  if (typeof record.canonicalUrl === 'string' && URL.canParse(record.canonicalUrl) && key &&
      new URL(record.canonicalUrl).pathname.startsWith('/notes/private/')) {
    record.canonicalUrl = new URL(postPath({ label: cleanName(record.label) || OTHER, sublabel: cleanName(record.sublabel) }, key), record.canonicalUrl).href;
  }

  if (isObject(record.link)) {
    const { site, ...link } = record.link;
    const image = blob(link.image);
    record.link = pick({ ...link, ...(typeof site === 'string' && link.siteName === undefined ? { siteName: site } : {}), image }, LINK_FIELDS);
    for (const field of Object.keys(link)) if (!LINK_FIELDS.includes(field)) left.push(`link.${field}`);
  }
  if (isObject(record.source)) {
    for (const field of Object.keys(record.source)) if (!SOURCE_FIELDS.includes(field)) left.push(`source.${field}`);
    record.source = pick(record.source, SOURCE_FIELDS);
  }
  if (Array.isArray(record.media)) {
    record.media = record.media.map(entry => {
      const kind = typeof entry?.$type === 'string' && entry.$type.startsWith(`${from}#`) ? entry.$type.slice(from.length + 1) : '';
      if (!Object.hasOwn(MEDIA_FIELDS, kind)) {
        left.push(`media ${entry?.id ?? '?'} (${entry?.$type ?? 'no type'})`);
        return null;
      }
      const { original, ...rest } = entry;
      const item = { ...rest, file: blob(rest.file ?? original), ...(rest.poster ? { poster: blob(rest.poster) } : {}) };
      for (const field of Object.keys(rest)) {
        if (!field.startsWith('$') && !MEDIA_FIELDS[kind].includes(field)) left.push(`media ${entry.id}.${field}`);
      }
      return { $type: `${POST}#${kind}`, ...pick(item, MEDIA_FIELDS[kind]) };
    }).filter(Boolean);
    if (!record.media.length) delete record.media;
  }
  return { record, left, moved };
}
