export const COLLECTION = 'com.haeinjung.note';
export const BSKY_POST = 'app.bsky.feed.post';
export const ARCHIVE_POST = 'com.haeinjung.post';
const DID = /^(?:did:plc:[a-z2-7]{24}|did:web:[a-zA-Z0-9.-]+)$/;
const RECORD_KEY = /^[a-zA-Z0-9._:~-]{1,512}$/;
const NSID = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\.[a-zA-Z][a-zA-Z0-9]{0,62}$/;

export function postCollection(value = ARCHIVE_POST) {
  const authority = typeof value === 'string' ? value.slice(0, value.lastIndexOf('.')) : '';
  if (!authority || authority.length > 253 || value.trim() !== value || !NSID.test(value) ||
      value.startsWith('com.atproto.') || value.startsWith('app.bsky.') || value === COLLECTION) {
    throw new Error('Use a custom post NSID under your domain, such as com.example.post');
  }
  return value;
}

export function isRecordKey(key) {
  return typeof key === 'string' && RECORD_KEY.test(key) && key !== '.' && key !== '..';
}

export function postLink(uri, ownerDid, archiveCollection = ARCHIVE_POST) {
  if (typeof uri !== 'string') return null;
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!match) return null;
  const [, did, collection, key] = match;
  if (!DID.test(did) || !isRecordKey(key)) return null;
  if (collection === archiveCollection && did === ownerDid) return `/posts/${encodeURIComponent(key)}`;
  if (collection === BSKY_POST) return `https://bsky.app/profile/${did}/post/${encodeURIComponent(key)}`;
  return null;
}

export function webUrl(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.filter(tag => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean))];
}

export function pdsConfig(env) {
  const did = env.ATPROTO_DID;
  const origin = URL.canParse(env.ATPROTO_PDS_ORIGIN) && new URL(env.ATPROTO_PDS_ORIGIN);
  if (!DID.test(did)) throw new Error('Set ATPROTO_DID to your PDS account DID');
  const loopback = origin?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname);
  if (!origin || (origin.protocol !== 'https:' && !loopback) || origin.href !== `${origin.origin}/`) {
    throw new Error('Set the PDS origin to an HTTPS URL or a loopback HTTP URL for local development');
  }
  return { did, origin: origin.origin, collection: postCollection(env.ATPROTO_POST_COLLECTION) };
}

export function normalizeNote(value) {
  if (value?.$type !== COLLECTION || typeof value.text !== 'string' || !value.text.trim() ||
      new TextEncoder().encode(value.text).length > 10_000 || typeof value.createdAt !== 'string') return null;
  const time = Date.parse(value.createdAt);
  if (!Number.isFinite(time)) return null;
  const note = { text: value.text, createdAt: new Date(time).toISOString() };
  if (value.sourceUrl !== undefined) {
    if (typeof value.sourceUrl !== 'string' || !/^https:\/\/x\.com\/i\/web\/status\/\d{1,19}$/.test(value.sourceUrl)) return null;
    note.sourceUrl = value.sourceUrl;
  }
  return note;
}

function blobUrl(blob, type, { did, origin }) {
  const cid = blob?.ref?.$link;
  if (blob?.$type !== 'blob' || !type.test(blob.mimeType) || typeof cid !== 'string' ||
      !/^b[a-z2-7]{20,120}$/.test(cid)) return null;
  const url = new URL('/xrpc/com.atproto.sync.getBlob', origin);
  url.search = new URLSearchParams({ did, cid });
  return url.href;
}

export function normalizePost(value, key, pds) {
  if (value?.$type !== BSKY_POST || typeof value.text !== 'string' ||
      typeof value.createdAt !== 'string' || new TextEncoder().encode(value.text).length > 3_000) return null;
  const time = Date.parse(value.createdAt);
  if (!Number.isFinite(time)) return null;

  const media = value.embed?.$type === 'app.bsky.embed.recordWithMedia' ? value.embed.media : value.embed;
  const images = [];
  if (media?.$type === 'app.bsky.embed.images' && Array.isArray(media.images)) {
    for (const image of media.images.slice(0, 4)) {
      const url = blobUrl(image?.image, /^image\/(?:jpeg|png|webp|gif)$/, pds);
      if (url) images.push({ url, alt: typeof image.alt === 'string' ? image.alt.slice(0, 2_000) : '' });
    }
  }
  const video = media?.$type === 'app.bsky.embed.video' ? blobUrl(media.video, /^video\/mp4$/, pds) : null;
  if (!value.text.trim() && !images.length && !video) return null;
  return {
    text: value.text,
    createdAt: new Date(time).toISOString(),
    postUrl: `https://bsky.app/profile/${pds.did}/post/${encodeURIComponent(key)}`,
    ...(images.length ? { images } : {}),
    ...(video ? { video } : {}),
  };
}

const MEDIA_TYPES = {
  image: /^image\/(?:jpeg|png|webp|gif|avif)$/,
  video: /^video\/(?:mp4|webm|ogg|quicktime)$/,
  audio: /^audio\/(?:mpeg|mp4|ogg|wav|wave|webm|aac|flac|x-wav|x-m4a)$/,
};

export function normalizeArchivePost(value, key, pds) {
  const collection = pds.collection ?? ARCHIVE_POST;
  if (value?.$type !== collection || typeof value.body !== 'string' ||
      typeof value.publishedAt !== 'string' || new TextEncoder().encode(value.body).length > 262_144) return null;
  const time = Date.parse(value.publishedAt);
  const canonicalUrl = webUrl(value.canonicalUrl);
  if (!Number.isFinite(time) || !canonicalUrl) return null;
  const tags = normalizeTags(value.tags);
  const media = new Map();
  if (Array.isArray(value.media)) {
    for (const attachment of value.media) {
      const kind = typeof attachment?.$type === 'string' && attachment.$type.startsWith(collection + '#')
        ? attachment.$type.slice(collection.length + 1) : '';
      if (!Object.hasOwn(MEDIA_TYPES, kind) || typeof attachment.id !== 'string' || media.has(attachment.id)) continue;
      const url = blobUrl(attachment.original, MEDIA_TYPES[kind], pds);
      if (!url) continue;
      media.set(attachment.id, {
        kind,
        url,
        alt: typeof attachment.alt === 'string' ? attachment.alt : '',
        caption: typeof attachment.caption === 'string' ? attachment.caption : '',
        poster: kind === 'video' ? blobUrl(attachment.poster, MEDIA_TYPES.image, pds) : null,
      });
    }
  }
  return {
    body: value.body,
    title: typeof value.title === 'string' ? value.title.trim().slice(0, 300) : '',
    summary: typeof value.summary === 'string' ? value.summary.trim().slice(0, 300) : '',
    createdAt: new Date(time).toISOString(),
    canonicalUrl,
    permalink: `/posts/${encodeURIComponent(key)}`,
    sourceUrl: webUrl(value.source?.uri),
    ...(tags.length ? { tags } : {}),
    media,
  };
}
