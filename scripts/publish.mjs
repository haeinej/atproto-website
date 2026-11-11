import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import { ARCHIVE_POST, pdsConfig, webUrl } from '../feed/pds.mjs';
import { mediaReferences } from '../feed/render.mjs';

const types = {
  '.avif': 'image/avif', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

async function rpc(origin, endpoint, { query, body, token, mime = 'application/json' } = {}) {
  const url = new URL(`/xrpc/${endpoint}`, origin);
  if (query) url.search = new URLSearchParams(query);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = mime;
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body instanceof Uint8Array ? body : body && JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  return { response, data: await response.json().catch(() => ({})) };
}

async function readAttachments(specs, body) {
  const refs = mediaReferences(body);
  const attachments = new Map();
  for (const spec of specs) {
    const match = /^([A-Za-z0-9_-]{1,64})=(.+)$/.exec(spec);
    if (!match) throw new Error('Use --media ID=PATH');
    const [, id, path] = match;
    const mime = types[extname(path).toLowerCase()];
    if (!mime) throw new Error(`Unsupported media format for ${id}`);
    if (attachments.has(id) || !refs.has(id)) throw new Error(`Duplicate or unreferenced attachment ${id}`);
    const info = await stat(path);
    if (!info.isFile() || info.size === 0 || info.size > 60_000_000) {
      throw new Error(`Attachment ${id} must be a nonempty file no larger than 60 MB`);
    }
    attachments.set(id, { path, mime, size: info.size });
  }
  for (const ref of refs) {
    if (!attachments.has(ref)) throw new Error(`Missing --media ${ref}=PATH`);
  }
  return attachments;
}

async function run() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' }, slug: { type: 'string' }, title: { type: 'string' },
      date: { type: 'string' }, media: { type: 'string', multiple: true, default: [] },
      config: { type: 'string', default: 'feed/wrangler.site.jsonc' }, publish: { type: 'boolean' },
    },
  });
  if (!values.file || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug ?? '') || values.slug.length > 120) {
    throw new Error('Set --file to a Markdown file and --slug to its lowercase permalink slug');
  }
  const { vars } = JSON.parse(await readFile(values.config, 'utf8'));
  const { did, origin } = pdsConfig(vars);
  const site = webUrl(vars.SITE_ORIGIN);
  if (!site) throw new Error('Set SITE_ORIGIN in the feed config');
  const body = (await readFile(values.file, 'utf8')).trim();
  if (!body || Buffer.byteLength(body) > 262_144) throw new Error('Use a nonempty Markdown body of at most 256 KiB');
  const publishedAt = values.date ? new Date(values.date) : new Date();
  if (!Number.isFinite(publishedAt.valueOf())) throw new Error('--date must be a valid date');
  const attachments = await readAttachments(values.media, body);
  const record = {
    $type: ARCHIVE_POST,
    body,
    publishedAt: publishedAt.toISOString(),
    canonicalUrl: new URL(`/posts/${values.slug}`, site).href,
    ...(values.title ? { title: values.title } : {}),
  };
  if (!values.publish) {
    console.log(JSON.stringify({ record, attachments: [...attachments.keys()] }, null, 2));
    return;
  }

  const password = process.env.ATPROTO_APP_PASSWORD;
  if (!password) throw new Error('Set ATPROTO_APP_PASSWORD for the account in your feed config');
  const target = { repo: did, collection: ARCHIVE_POST, rkey: values.slug };
  const existing = await rpc(origin, 'com.atproto.repo.getRecord', { query: target });
  if (existing.response.ok) throw new Error(`A post already exists at ${record.canonicalUrl}`);
  if (existing.data.error !== 'RecordNotFound') throw new Error(`Checking the slug failed (HTTP ${existing.response.status})`);
  const session = await rpc(origin, 'com.atproto.server.createSession', { body: { identifier: did, password } });
  const token = session.data.accessJwt;
  if (!session.response.ok || session.data.did !== did || typeof token !== 'string' || !token) {
    throw new Error(`Could not sign in to the configured account (HTTP ${session.response.status})`);
  }
  if (attachments.size) {
    record.media = [];
    for (const [id, { path, mime, size }] of attachments) {
      const body = await readFile(path);
      if (body.length !== size) throw new Error(`Attachment ${id} changed while preparing the post`);
      const uploaded = await rpc(origin, 'com.atproto.repo.uploadBlob', { body, mime, token });
      const blob = uploaded.data.blob;
      if (!uploaded.response.ok || blob?.$type !== 'blob' || blob.size !== size || blob.mimeType !== mime ||
          typeof blob.ref?.$link !== 'string') {
        throw new Error(`Upload failed for ${id} (HTTP ${uploaded.response.status})`);
      }
      record.media.push({ $type: `${ARCHIVE_POST}#${mime.split('/')[0]}`, id, original: blob });
    }
  }
  const created = await rpc(origin, 'com.atproto.repo.createRecord', { body: { ...target, record }, token });
  if (!created.response.ok || created.data.uri !== `at://${did}/${ARCHIVE_POST}/${values.slug}`) {
    throw new Error(`Publishing failed (HTTP ${created.response.status}). Check the permalink before retrying.`);
  }
  console.log(record.canonicalUrl);
}

try {
  await run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
