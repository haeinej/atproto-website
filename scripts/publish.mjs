import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cleanName, formProblems, identifyForm, isPlayer, OTHER } from '../feed/forms.mjs';
import { connectUri, pdsConfig, postPath, siblingCollection, webUrl } from '../feed/pds.mjs';
import { PRIVATE_BLOB, PRIVATE_POST } from '../feed/private.mjs';
import { bodyFacts } from '../feed/render.mjs';
import { POST_FIELDS, POST_MATCHES, siteLayer } from './layers.mjs';
import { rpc, signIn } from './rpc.mjs';

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
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const plain = (text, limit) => text
  .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, decimal, hex, name) =>
    decimal ? String.fromCodePoint(Number(decimal)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : entities[name.toLowerCase()] ?? whole)
  .replace(/\s+/g, ' ').trim().slice(0, limit);

// What a page says about itself: its title, description, site name, and preview image.
function pageFacts(html, url) {
  const meta = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = Object.fromEntries([...tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
      .map(([, name, double, single]) => [name.toLowerCase(), double ?? single]));
    const key = (attributes.property ?? attributes.name)?.toLowerCase();
    if (key && attributes.content && !(key in meta)) meta[key] = attributes.content;
  }
  const title = plain(meta['og:title'] ?? /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '', 300);
  const description = plain(meta['og:description'] ?? meta.description ?? '', 1000);
  const site = plain(meta['og:site_name'] ?? '', 100);
  const image = meta['og:image'] && URL.canParse(plain(meta['og:image'], 2000), url) ? webUrl(new URL(plain(meta['og:image'], 2000), url).href) : undefined;
  return { ...(title ? { title } : {}), ...(description ? { description } : {}), ...(site ? { site } : {}), ...(image ? { image } : {}) };
}

// Look at what an address points to. A file comes back saved in `folder`, ready to attach, with the
// address as its source. A web page comes back as what it says about itself.
// `sure` means the address itself names a file type; otherwise only what is plainly media is taken.
async function inspect(url, folder, id, sure = Boolean(fileType(url))) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; post-publisher)', Accept: '*/*' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  const declared = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (['text/html', 'application/xhtml+xml'].includes(declared)) {
    return { page: pageFacts((await response.text()).slice(0, 1_000_000), response.url || url), declared };
  }
  const generic = ['', 'application/octet-stream', 'binary/octet-stream'].includes(declared);
  const mime = generic ? fileType(url) : aliases[declared] ?? declared;
  const attachable = Object.values(types).includes(mime) && (sure || /^(?:image|video|audio)\/|^application\/pdf$/.test(mime));
  if (!attachable || Number(response.headers.get('content-length')) > 60_000_000) {
    await response.body?.cancel();
    return { declared };
  }
  const path = join(folder, id);
  await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  return { file: { path, mime, sourceUrl: url }, declared };
}

// `taken` holds attachments already brought in from the web, by ID.
async function readAttachments(specs, refs, folder, taken = new Map()) {
  const attachments = new Map();
  const add = async (id, { path, mime, sourceUrl }) => {
    if (!mime) throw new Error(`Unsupported media format for ${id}`);
    if (attachments.has(id) || !refs.has(id)) throw new Error(`Duplicate or unreferenced attachment ${id}`);
    const info = await stat(path);
    if (!info.isFile() || info.size === 0 || info.size > 60_000_000) {
      throw new Error(`Attachment ${id} must be a nonempty file no larger than 60 MB`);
    }
    attachments.set(id, { path, mime, size: info.size, ...(sourceUrl ? { sourceUrl } : {}) });
  };
  for (const spec of specs) {
    const match = /^([A-Za-z0-9_-]{1,64})=(.+)$/.exec(spec);
    if (!match) throw new Error('Use --media ID=PATH or --media ID=URL');
    const [, id, location] = match;
    const address = /^https?:\/\//i.test(location) && webUrl(location);
    if (!address) {
      await add(id, { path: location, mime: types[extname(location).toLowerCase()] });
      continue;
    }
    // An attachment named by its address is a file whatever the address looks like.
    const { file, declared } = await inspect(address, folder, id, true);
    if (!file) throw new Error(`${address} is ${declared || 'an unknown type'}, which cannot be attached`);
    await add(id, file);
  }
  for (const [id, file] of taken) await add(id, file);
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
      file: { type: 'string' }, slug: { type: 'string' }, title: { type: 'string' }, subtitle: { type: 'string' },
      date: { type: 'string' }, media: { type: 'string', multiple: true, default: [] },
      form: { type: 'string' }, label: { type: 'string' }, sublabel: { type: 'string' },
      connect: { type: 'string', multiple: true, default: [] },
      'source-platform': { type: 'string' }, 'source-url': { type: 'string' }, 'source-id': { type: 'string' },
      config: { type: 'string', default: 'feed/wrangler.site.jsonc' }, publish: { type: 'boolean' },
      private: { type: 'boolean' },
      site: { type: 'string', multiple: true, default: [] }, 'site-schema': { type: 'string' },
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
  // Look at what the post's link points to. This decides two things below: whether the post is the
  // file itself, and what a link or embed post keeps about its page.
  const pointer = webUrl(facts.bareLink || facts.links[0]);
  const expectsFile = facts.soleLink && pointer && !isPlayer(pointer) && !['link', 'embed'].includes(values.form);
  const mayBeLink = !facts.media.size &&
    ['link', 'embed'].includes(values.form ?? identifyForm({ title: values.title, facts, kinds: [] }));
  let seen = {};
  if (pointer && (expectsFile || mayBeLink)) {
    seen = await inspect(pointer, folder, 'web').catch(error => ({ problem: error.message }));
  }
  // A post that is nothing but a link to an image, video, audio, or file is that object, not a link.
  // Take the file in and keep the link as its source. --form link leaves it as a link.
  let attachments;
  if (expectsFile && seen.file) {
    const described = `![${/^\[([^\]]*)\]\(/.exec(body)?.[1] ?? ''}](media:web)`;
    attachments = await readAttachments(values.media, bodyFacts(described).media, folder, new Map([['web', seen.file]]));
    body = described;
    facts = bodyFacts(body);
  } else if (expectsFile && fileType(pointer)) {
    console.error(`Kept ${pointer} as a link: ${seen.problem ?? `it is ${seen.declared || 'an unknown type'}`}`);
  }
  attachments ??= await readAttachments(values.media, facts.media, folder);
  // The form is identified from the content and checked. --form overrides it when the author means
  // something else. The label and sublabel are the author's own names.
  const content = { title: values.title, facts, kinds: [...attachments.values()].map(({ mime }) => kindOf(mime)) };
  const form = values.form ?? identifyForm(content);
  const problems = formProblems(form, content);
  if (problems.length) throw new Error(problems.join('\n'));
  // Every post is filed under a label, because its address is built from it. One published without
  // a label goes under `other`.
  const sublabel = cleanName(values.sublabel);
  if (sublabel && !cleanName(values.label)) throw new Error('A --sublabel sits inside a --label; set both');
  const label = cleanName(values.label) || OTHER;
  const subtitle = (values.subtitle ?? '').trim();
  if (subtitle && !values.title) throw new Error('A --subtitle sits under a --title; set both');
  if (subtitle.length > 300) throw new Error('--subtitle can be at most 300 characters');
  const own = await siteLayer(values.site, siblingCollection(collection, 'postSite'), values['site-schema'],
    { fields: POST_FIELDS, matches: POST_MATCHES, kind: 'post' });
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
    // A public post's address follows its label and sublabel.
    canonicalUrl: new URL(values.private ? `/notes/private/posts/${values.slug}` : postPath({ label, sublabel }, values.slug), site).href,
    ...(values.title ? { title: values.title } : {}),
    ...(subtitle ? { subtitle } : {}),
    form,
    label,
    ...(sublabel ? { sublabel } : {}),
    ...(connect.length ? { connect } : {}),
    ...(source ? { source } : {}),
    ...(own ? { site: own } : {}),
  };
  // A link or embed keeps what its page said about itself, and a copy of the page's preview image.
  let preview;
  if (['link', 'embed'].includes(form) && pointer) {
    const { image, ...page } = seen.page ?? {};
    record.link = { uri: pointer, ...page };
    if (image) {
      const found = await inspect(image, folder, 'link-image', true).catch(() => ({}));
      const size = found.file?.mime.startsWith('image/') ? (await stat(found.file.path)).size : 0;
      if (size > 0 && size <= 5_000_000) preview = { ...found.file, size };
    }
  }
  if (!values.publish) {
    const fromWeb = Object.fromEntries([...attachments].filter(([, { sourceUrl }]) => sourceUrl).map(([id, { sourceUrl }]) => [id, sourceUrl]));
    console.log(JSON.stringify({
      ...(values.private ? { visibility: 'private' } : {}), record, attachments: [...attachments.keys()],
      ...(Object.keys(fromWeb).length ? { fromWeb } : {}),
      ...(preview ? { linkImage: preview.sourceUrl } : {}),
    }, null, 2));
    return;
  }

  if (!values.private && !process.env.ATPROTO_APP_PASSWORD) {
    throw new Error('Set ATPROTO_APP_PASSWORD for the account in your feed config');
  }
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
    if (preview) {
      const cid = await blobCid(await readFile(preview.path));
      kvPut(values.config, PRIVATE_BLOB + cid, preview.path);
      record.link.image = { $type: 'blob', mimeType: preview.mime, size: preview.size, ref: { $link: cid } };
    }
    const file = join(folder, 'record.json');
    await writeFile(file, JSON.stringify(record));
    kvPut(values.config, PRIVATE_POST + values.slug, file);
    console.log(record.canonicalUrl);
    return;
  }
  const token = await signIn(origin, did);
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
  if (preview) {
    const uploaded = await rpc(origin, 'com.atproto.repo.uploadBlob', { body: await readFile(preview.path), mime: preview.mime, token });
    if (uploaded.response.ok && uploaded.data.blob?.$type === 'blob') record.link.image = uploaded.data.blob;
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
