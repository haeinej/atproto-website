// Set who the site's author is: name, description, pronouns, pictures, and links. The record has
// the same fields as a Bluesky profile. Without --publish this prints the record and changes nothing.
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import { pdsConfig, siblingCollection, webUrl } from '../feed/pds.mjs';
import { siteVars } from './config.mjs';
import { PROFILE_FIELDS, PROFILE_MATCHES, siteLayer } from './layers.mjs';
import { rpc, signIn } from './rpc.mjs';

const pictures = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const graphemes = text => [...new Intl.Segmenter().segment(text)].length;

function text(value, name, most) {
  const trimmed = value.trim();
  if (graphemes(trimmed) > most) throw new Error(`--${name} can be at most ${most} characters`);
  return trimmed;
}

async function picture(path, name) {
  const mime = pictures[extname(path).toLowerCase()];
  const info = await stat(path);
  if (!mime || !info.isFile() || info.size === 0 || info.size > 1_000_000) {
    throw new Error(`--${name} must be a PNG or JPEG no larger than 1 MB`);
  }
  return { path, mime, size: info.size };
}

try {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' }, description: { type: 'string' }, pronouns: { type: 'string' },
      website: { type: 'string' }, avatar: { type: 'string' }, banner: { type: 'string' },
      link: { type: 'string', multiple: true }, 'from-bluesky': { type: 'boolean' },
      site: { type: 'string', multiple: true, default: [] }, 'site-schema': { type: 'string' },
      config: { type: 'string' }, publish: { type: 'boolean' },
    },
  });
  const vars = await siteVars(values.config);
  const { did, origin, collection } = pdsConfig(vars);
  const profileType = siblingCollection(collection, 'profile');
  const linkType = siblingCollection(collection, 'profileLink');
  // A preview still works when the PDS cannot be reached; saving does not, since it would lose what is there.
  const read = type => rpc(origin, 'com.atproto.repo.getRecord', { query: { repo: did, collection: type, rkey: 'self' } })
    .then(result => result.data.value, problem => { if (values.publish) throw problem; });

  // Start from what is already saved, so setting one field leaves the others alone.
  // --from-bluesky starts from the account's Bluesky profile instead.
  const saved = (values['from-bluesky'] ? await read('app.bsky.actor.profile') : await read(profileType)) ?? {};
  const { links: savedLinks, ...kept } = saved;
  const record = { ...kept, $type: profileType };
  if (values.name !== undefined) record.displayName = text(values.name, 'name', 64);
  if (values.description !== undefined) record.description = text(values.description, 'description', 256);
  if (values.pronouns !== undefined) record.pronouns = text(values.pronouns, 'pronouns', 20);
  if (values.website !== undefined) {
    record.website = webUrl(values.website);
    if (!record.website) throw new Error('--website must be an HTTP(S) URL');
  }
  for (const field of ['displayName', 'description', 'pronouns', 'website']) if (!record[field]) delete record[field];
  const files = {};
  for (const name of ['avatar', 'banner']) if (values[name]) files[name] = await picture(values[name], name);

  // --link 'Title=https://…' or just the URL. Giving any replaces the whole list, in the order given.
  const links = (values.link ?? []).map(spec => {
    const [, title = '', address] = /^(?:([^=]*)=)?(https?:\/\/.+)$/i.exec(spec) ?? [];
    const url = webUrl(address);
    if (!url?.startsWith('https://')) throw new Error("Use --link 'Title=https://…' or --link https://…");
    return { $type: linkType, url, ...(title.trim() ? { title: text(title, 'link title', 40) } : {}) };
  });
  if (links.length > 10) throw new Error('A profile shows at most 10 links');
  // A Bluesky profile's links are Bluesky's own records, so they are not carried across.
  if (!values.link && savedLinks && !values['from-bluesky']) record.links = savedLinks;
  // Sections Bluesky has no field for go in the site's own layer. Giving any replaces that layer.
  const own = await siteLayer(values.site, siblingCollection(collection, 'profileSite'), values['site-schema'],
    { fields: PROFILE_FIELDS, matches: PROFILE_MATCHES, kind: 'profile' });
  if (own) record.site = own;
  if (values['from-bluesky'] && !own) delete record.site;
  record.createdAt ??= new Date().toISOString();

  if (!values.publish) {
    console.log(JSON.stringify({
      record: { ...record, ...Object.fromEntries(Object.entries(files).map(([name, file]) => [name, file.path])) },
      ...(values.link ? { links } : {}),
    }, null, 2));
  } else {
    const token = await signIn(origin, did);
    for (const [name, { path, mime, size }] of Object.entries(files)) {
      const uploaded = await rpc(origin, 'com.atproto.repo.uploadBlob', { body: await readFile(path), mime, token });
      if (!uploaded.response.ok || uploaded.data.blob?.size !== size) throw new Error(`Uploading the ${name} failed (HTTP ${uploaded.response.status})`);
      record[name] = uploaded.data.blob;
    }
    if (values.link) {
      record.links = [];
      for (const link of links) {
        const created = await rpc(origin, 'com.atproto.repo.createRecord', {
          body: { repo: did, collection: linkType, record: { ...link, createdAt: new Date().toISOString() } }, token,
        });
        if (!created.response.ok || !created.data.uri || !created.data.cid) throw new Error(`Saving the link ${link.url} failed (HTTP ${created.response.status})`);
        record.links.push({ uri: created.data.uri, cid: created.data.cid });
      }
      if (!record.links.length) delete record.links;
    }
    const put = await rpc(origin, 'com.atproto.repo.putRecord', { body: { repo: did, collection: profileType, rkey: 'self', record }, token });
    if (!put.response.ok) throw new Error(`Saving the profile failed (HTTP ${put.response.status})`);
    console.log(put.data.uri ?? `at://${did}/${profileType}/self`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
