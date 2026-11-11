import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cleanName, formProblems, identifyForm } from '../feed/forms.mjs';
import { connectUri, pdsConfig, webUrl } from '../feed/pds.mjs';
import { PRIVATE_BLOB, PRIVATE_POST } from '../feed/private.mjs';
import { bodyFacts } from '../feed/render.mjs';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const types = {
  '.avif': 'image/avif', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.pdf': 'application/pdf', '.epub': 'application/epub+zip', '.zip': 'application/zip', '.json': 'application/json',
  '.txt': 'text/plain', '.csv': 'text/csv', '.md': 'text/markdown',
};
// An attachment is an image, a video, audio, or otherwise a file.
const kindOf = mime => ['image', 'video', 'audio'].find(kind => mime.startsWith(`${kind}/`)) ?? 'file';

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

// The address a file's bytes have as an AT Protocol blob: CIDv1, raw codec, SHA-256.
async function blobCid(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const bits = [1, 0x55, 0x12, 0x20, ...digest].map(byte => byte.toString(2).padStart(8, '0')).join('');
  return 'b' + bits.match(/.{1,5}/g).map(group => 'abcdefghijklmnopqrstuvwxyz234567'[parseInt(group.padEnd(5, '0'), 2)]).join('');
}

// Private posts are written straight to the site's KV namespace with your own Wrangler login.
function kvPut(config, key, path) {
  const result = spawnSync('pnpm', [
    '--dir', fileURLToPath(new URL('../cirrus', import.meta.url)), 'exec', 'wrangler', 'kv', 'key', 'put', key,
    '--config', resolve(config), '--binding', 'NOTES', '--remote', '--path', resolve(path),
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (result.status !== 0) throw new Error(`Saving ${key} failed. Check that Wrangler is signed in.`);
}

const fileType = url => types[extname(new URL(url).pathname).toLowerCase()];
const aliases = {
  'image/jpg': 'image/jpeg', 'audio/mp3': 'audio/mpeg', 'audio/x-m4a': 'audio/mp4', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav',
};

// Take a file in from the web, so the post holds the thing itself and not a pointer to it. The
// address it came from is kept as its source.
async function download(url, folder, id) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  const declared = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  const generic = ['', 'application/octet-stream', 'binary/octet-stream'].includes(declared);
  const mime = generic ? fileType(url) : aliases[declared] ?? declared;
  if (!Object.values(types).includes(mime)) throw new Error(`${url} is ${declared || 'an unknown type'}, which cannot be attached`);
  if (Number(response.headers.get('content-length')) > 60_000_000) throw new Error(`${url} is larger than 60 MB`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const path = join(folder, id);
  await writeFile(path, bytes);
  return { path, mime, sourceUrl: url };
}

async function readAttachments(specs, refs, folder) {
  const attachments = new Map();
  for (const spec of specs) {
    const match = /^([A-Za-z0-9_-]{1,64})=(.+)$/.exec(spec);
    if (!match) throw new Error('Use --media ID=PATH or --media ID=URL');
    const [, id, location] = match;
    if (attachments.has(id) || !refs.has(id)) throw new Error(`Duplicate or unreferenced attachment ${id}`);
    const fromWeb = /^https?:\/\//i.test(location) && webUrl(location);
    const { path, mime, sourceUrl } = fromWeb
      ? await download(fromWeb, folder, id)
      : { path: location, mime: types[extname(location).toLowerCase()] };
    if (!mime) throw new Error(`Unsupported media format for ${id}`);
    const info = await stat(path);
    if (!info.isFile() || info.size === 0 || info.size > 60_000_000) {
      throw new Error(`Attachment ${id} must be a nonempty file no larger than 60 MB`);
    }
    attachments.set(id, { path, mime, size: info.size, ...(sourceUrl ? { sourceUrl } : {}) });
  }
  for (const ref of refs) {
    if (!attachments.has(ref)) throw new Error(`Missing --media ${ref}=PATH`);
  }
  return attachments;
}

async function run() {
  const folder = await mkdtemp(join(tmpdir(), 'post-'));
  try {
    await publish(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function publish(folder) {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' }, slug: { type: 'string' }, title: { type: 'string' },
      date: { type: 'string' }, media: { type: 'string', multiple: true, default: [] },
      form: { type: 'string' }, label: { type: 'string' }, sublabel: { type: 'string' },
      connect: { type: 'string', multiple: true, default: [] },
      'source-platform': { type: 'string' }, 'source-url': { type: 'string' }, 'source-id': { type: 'string' },
      config: { type: 'string', default: 'feed/wrangler.site.jsonc' }, publish: { type: 'boolean' },
      private: { type: 'boolean' },
    },
  });
  if (!values.file || !SLUG.test(values.slug ?? '') || values.slug.length > 120) {
    throw new Error('Set --file to a Markdown file and --slug to its lowercase permalink slug');
  }
  const { vars } = JSON.parse(await readFile(values.config, 'utf8'));
  const { did, origin, collection } = pdsConfig(vars);
  const site = webUrl(vars.SITE_ORIGIN);
  if (!site) throw new Error('Set SITE_ORIGIN in the feed config');
  let body = (await readFile(values.file, 'utf8')).trim();
  if (!body || Buffer.byteLength(body) > 262_144) throw new Error('Use a nonempty Markdown body of at most 256 KiB');
  const publishedAt = values.date ? new Date(values.date) : new Date();
  if (!Number.isFinite(publishedAt.valueOf())) throw new Error('--date must be a valid date');
  const self = `at://${did}/${collection}/${values.slug}`;
  const connect = [...new Set(values.connect.map(value => {
    const uri = SLUG.test(value) ? `at://${did}/${collection}/${value}` : connectUri(value);
    if (!uri || uri === self) {
      throw new Error('Use --connect with the slug of an earlier post, an AT URI, or an HTTP(S) URL');
    }
    return uri;
  }))];
  let facts = bodyFacts(body);
  let attachments;
  // A post that is nothing but a link to an image, video, audio, or file is that object, not a link.
  // Take the file in and keep the link as its source. --form link leaves it as a link.
  if (facts.soleLink && webUrl(facts.bareLink) && fileType(facts.bareLink) && !['link', 'embed'].includes(values.form)) {
    const described = `![${/^\[([^\]]*)\]\(/.exec(body)?.[1] ?? ''}](media:web)`;
    try {
      attachments = await readAttachments([...values.media, `web=${facts.bareLink}`], bodyFacts(described).media, folder);
      body = described;
      facts = bodyFacts(body);
    } catch (error) {
      console.error(`Kept ${facts.bareLink} as a link: ${error.message}`);
    }
  }
  attachments ??= await readAttachments(values.media, facts.media, folder);
  // The form is identified from the content and checked. --form overrides it when the author means
  // something else. The label and sublabel are the author's own names.
  const content = { title: values.title, facts, kinds: [...attachments.values()].map(({ mime }) => kindOf(mime)) };
  const form = values.form ?? identifyForm(content);
  const problems = formProblems(form, content);
  if (problems.length) throw new Error(problems.join('\n'));
  const label = cleanName(values.label);
  const sublabel = cleanName(values.sublabel);
  if (sublabel && !label) throw new Error('A --sublabel sits inside a --label; set both');
  let source;
  if (['source-platform', 'source-url', 'source-id'].some(option => values[option] !== undefined)) {
    const platform = values['source-platform']?.trim();
    const uri = webUrl(values['source-url']);
    const id = values['source-id']?.trim();
    if (!platform || !uri || id === '') {
      throw new Error('Provide --source-platform and an HTTP(S) --source-url; --source-id is optional');
    }
    source = { platform, uri, ...(id ? { id } : {}) };
  }
  const record = {
    $type: collection,
    body,
    publishedAt: publishedAt.toISOString(),
    canonicalUrl: new URL(`${values.private ? '/notes/private' : ''}/posts/${values.slug}`, site).href,
    ...(values.title ? { title: values.title } : {}),
    form,
    ...(label ? { label } : {}),
    ...(sublabel ? { sublabel } : {}),
    ...(connect.length ? { connect } : {}),
    ...(source ? { source } : {}),
  };
  if (!values.publish) {
    const fromWeb = Object.fromEntries([...attachments].filter(([, { sourceUrl }]) => sourceUrl).map(([id, { sourceUrl }]) => [id, sourceUrl]));
    console.log(JSON.stringify({
      ...(values.private ? { visibility: 'private' } : {}), record, attachments: [...attachments.keys()],
      ...(Object.keys(fromWeb).length ? { fromWeb } : {}),
    }, null, 2));
    return;
  }

  const password = process.env.ATPROTO_APP_PASSWORD;
  if (!values.private && !password) throw new Error('Set ATPROTO_APP_PASSWORD for the account in your feed config');
  const target = { repo: did, collection, rkey: values.slug };
  const existing = await rpc(origin, 'com.atproto.repo.getRecord', { query: target });
  if (existing.response.ok) throw new Error(`A public post already uses the slug ${values.slug}`);
  if (existing.data.error !== 'RecordNotFound') throw new Error(`Checking the slug failed (HTTP ${existing.response.status})`);
  if (values.private) {
    // Nothing is sent to the PDS. Publishing the same slug again replaces the private post.
    if (attachments.size) record.media = [];
    for (const [id, { path, mime, size, sourceUrl }] of attachments) {
      if (size > 25_000_000) throw new Error(`Private attachment ${id} must be no larger than 25 MB`);
      const cid = await blobCid(await readFile(path));
      kvPut(values.config, PRIVATE_BLOB + cid, path);
      record.media.push({
        $type: `${collection}#${kindOf(mime)}`, id,
        original: { $type: 'blob', mimeType: mime, size, ref: { $link: cid } },
        ...(sourceUrl ? { sourceUrl } : {}),
      });
    }
    const file = join(folder, 'record.json');
    await writeFile(file, JSON.stringify(record));
    kvPut(values.config, PRIVATE_POST + values.slug, file);
    console.log(record.canonicalUrl);
    return;
  }
  const session = await rpc(origin, 'com.atproto.server.createSession', { body: { identifier: did, password } });
  const token = session.data.accessJwt;
  if (!session.response.ok || session.data.did !== did || typeof token !== 'string' || !token) {
    throw new Error(`Could not sign in to the configured account (HTTP ${session.response.status})`);
  }
  if (attachments.size) {
    record.media = [];
    for (const [id, { path, mime, size, sourceUrl }] of attachments) {
      const body = await readFile(path);
      if (body.length !== size) throw new Error(`Attachment ${id} changed while preparing the post`);
      const uploaded = await rpc(origin, 'com.atproto.repo.uploadBlob', { body, mime, token });
      const blob = uploaded.data.blob;
      if (!uploaded.response.ok || blob?.$type !== 'blob' || blob.size !== size || blob.mimeType !== mime ||
          typeof blob.ref?.$link !== 'string') {
        throw new Error(`Upload failed for ${id} (HTTP ${uploaded.response.status})`);
      }
      record.media.push({ $type: `${collection}#${kindOf(mime)}`, id, original: blob, ...(sourceUrl ? { sourceUrl } : {}) });
    }
  }
  const created = await rpc(origin, 'com.atproto.repo.createRecord', { body: { ...target, record }, token });
  if (!created.response.ok || created.data.uri !== `at://${did}/${collection}/${values.slug}`) {
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
