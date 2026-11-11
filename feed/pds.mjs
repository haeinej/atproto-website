export const COLLECTION = 'com.haeinjung.note';
export const BSKY_POST = 'app.bsky.feed.post';
const DID = /^(?:did:plc:[a-z2-7]{24}|did:web:[a-zA-Z0-9.-]+)$/;

export function pdsConfig(env) {
  const did = env.ATPROTO_DID;
  const origin = URL.canParse(env.ATPROTO_PDS_ORIGIN) && new URL(env.ATPROTO_PDS_ORIGIN);
  if (!DID.test(did)) throw new Error('Set ATPROTO_DID to your PDS account DID');
  if (!origin || origin.protocol !== 'https:' || origin.href !== `${origin.origin}/`) {
    throw new Error('Set ATPROTO_PDS_ORIGIN to the HTTPS origin of your PDS');
  }
  return { did, origin: origin.origin };
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
