import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { identifyForm, isPlayer } from '../feed/forms.mjs';
import { pdsConfig, webUrl } from '../feed/pds.mjs';
import { bodyFacts } from '../feed/render.mjs';
import { assembleRecord, FILE_TYPES, isSlug, kindOf } from '../vault/core.mjs';
import { memoryKv, ownStores, pdsStore } from '../vault/stores.mjs';
import { createVault } from '../vault/vault.mjs';
import { configPath } from './config.mjs';
import { imageSize } from './image-size.mjs';
import { wranglerKv } from './kv.mjs';
import { POST_FIELDS, POST_MATCHES, siteLayer } from './layers.mjs';
import { signIn } from './rpc.mjs';

const types = FILE_TYPES;
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
  const siteName = plain(meta['og:site_name'] ?? '', 100);
  const image = meta['og:image'] && URL.canParse(plain(meta['og:image'], 2000), url) ? webUrl(new URL(plain(meta['og:image'], 2000), url).href) : undefined;
  return { ...(title ? { title } : {}), ...(description ? { description } : {}), ...(siteName ? { siteName } : {}), ...(image ? { image } : {}) };
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
    // An image's width and height are saved with it, so a page can lay it out before it loads.
    const dimensions = mime.startsWith('image/') ? imageSize(new Uint8Array(await readFile(path))) : null;
    attachments.set(id, { path, mime, size: info.size, ...(sourceUrl ? { sourceUrl } : {}), ...(dimensions ?? {}) });
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
      config: { type: 'string' }, publish: { type: 'boolean' },
      private: { type: 'boolean' }, friends: { type: 'boolean' },
      site: { type: 'string', multiple: true, default: [] }, 'site-schema': { type: 'string' },
    },
  });
  if (!values.file || !isSlug(values.slug)) {
    throw new Error('Set --file to a Markdown file and --slug to its lowercase permalink slug');
  }
  const configFile = configPath(values.config);
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  const { vars } = config;
  const { did, origin, collection, namespace } = pdsConfig(vars);
  const site = webUrl(vars.SITE_ORIGIN);
  if (!site) throw new Error('Set SITE_ORIGIN in the feed config');
  let body = (await readFile(values.file, 'utf8')).trim();
  if (!body || Buffer.byteLength(body) > 262_144) throw new Error('Use a nonempty Markdown body of at most 256 KiB');
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
  const own = await siteLayer(values.site, namespace && `${namespace}.postSite`, values['site-schema'],
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
  // The record is built by the same rules the agent's tools and the editor use. --form overrides the
  // form identified from the content, when the author means something else.
  const { record, form } = assembleRecord({
    slug: values.slug, body, title: values.title, subtitle: values.subtitle,
    ...(values.date ? { publishedAt: values.date } : {}),
    form: values.form, label: values.label, sublabel: values.sublabel, connect: values.connect, source, own,
    kinds: [...attachments.values()].map(({ mime }) => kindOf(mime)), facts,
  }, { did, site, collection, name: field => `--${field}` });
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
  if (values.private && values.friends) throw new Error('A post is --private or for --friends, not both');
  const visibility = values.private ? 'private' : values.friends ? 'friends' : 'public';
  // Where the owner reads a post that is not public, signed in. It is not part of the record.
  const privateUrl = new URL(`/notes/private/posts/${values.slug}`, site).href;
  if (!values.publish) {
    const fromWeb = Object.fromEntries([...attachments].filter(([, { sourceUrl }]) => sourceUrl).map(([id, { sourceUrl }]) => [id, sourceUrl]));
    console.log(JSON.stringify({
      ...(visibility !== 'public' ? { visibility, privateUrl } : {}), record, attachments: [...attachments.keys()],
      ...(Object.keys(fromWeb).length ? { fromWeb } : {}),
      ...(preview ? { linkImage: preview.sourceUrl } : {}),
    }, null, 2));
    return;
  }

  if (visibility === 'public' && !process.env.ATPROTO_APP_PASSWORD) {
    throw new Error('Set ATPROTO_APP_PASSWORD for the account in your feed config');
  }
  // Public posts are records on the PDS. The others are written straight to the site's own store
  // with your own Wrangler login, and nothing about them is sent to the PDS. A site that has no
  // store of its own yet has nothing in it to check.
  const hasOwnStore = visibility !== 'public' || (config.kv_namespaces ?? []).some(space => space.binding === 'NOTES' && space.id);
  let token;
  const vault = createVault({ stores: {
    public: pdsStore({ did, origin, collection, token: async () => (token ??= await signIn(origin, did)) }),
    ...ownStores(hasOwnStore ? wranglerKv(configFile) : memoryKv()),
  } });
  const files = new Map();
  for (const [id, { path, mime, size, sourceUrl, width, height }] of attachments) {
    const bytes = new Uint8Array(await readFile(path));
    if (bytes.length !== size) throw new Error(`Attachment ${id} changed while preparing the post`);
    files.set(id, { bytes, mime, sourceUrl, width, height });
  }
  await vault.save({
    key: values.slug, record, visibility, files,
    ...(preview ? { linkImage: { bytes: new Uint8Array(await readFile(preview.path)), mime: preview.mime } } : {}),
    // A slug is used once, whoever can see the post. Publishing the same slug again replaces a
    // post that is not public; a public post is never replaced from here.
    replace: visibility !== 'public',
  });
  console.log(visibility === 'public' ? record.canonicalUrl : privateUrl);
}

try {
  await run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
