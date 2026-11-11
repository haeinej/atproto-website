// The two layers of a record. The fixed layer is the one other AT Protocol software understands: a
// profile has exactly Bluesky's fields, and a post has this project's fixed fields. The optional
// layer is a site's own, saved under the record's `site` field, and is unlisted: applications it
// does not apply to, such as Bluesky, never see it.
//
// The rule these checks enforce: when something means the same as a fixed field, fill that field.
// Only what has no match goes in the optional layer, and only once the site's schema declares it.
import { readFile } from 'node:fs/promises';

export const POST_FIELDS = ['title', 'subtitle', 'body', 'summary', 'publishedAt', 'updatedAt', 'canonicalUrl', 'form', 'label',
  'sublabel', 'connect', 'link', 'source', 'media', 'site'];
export const PROFILE_FIELDS = ['displayName', 'description', 'pronouns', 'website', 'links', 'avatar', 'banner', 'labels',
  'joinedViaStarterPack', 'pinnedPost', 'createdAt', 'site'];

// Other names people use for a fixed field, and how to set the field instead.
export const POST_MATCHES = {
  text: 'the body, which is the Markdown file', content: 'the body, which is the Markdown file',
  heading: '--title', name: '--title', tagline: '--subtitle', deck: '--subtitle',
  date: '--date', createdAt: '--date', published: '--date',
  tags: '--label', tag: '--label', category: '--label', section: '--label', series: '--sublabel', album: '--sublabel',
  url: 'the address, which comes from the label and slug', permalink: 'the address, which comes from the label and slug',
  images: '--media', image: '--media', attachments: '--media', files: '--media', video: '--media', audio: '--media',
  reply: '--connect', replyTo: '--connect', quote: '--connect', parent: '--connect', related: '--connect',
  origin: '--source-platform and --source-url', platform: '--source-platform and --source-url',
  card: 'a link on its own line in the body', embed: 'a link on its own line in the body',
};
export const PROFILE_MATCHES = {
  name: '--name', fullName: '--name', title: '--name',
  bio: '--description', about: '--description', summary: '--description', tagline: '--description',
  pronoun: '--pronouns',
  url: '--link', homepage: '--link', link: '--link', socials: '--link', social: '--link',
  picture: '--avatar', photo: '--avatar', image: '--avatar', icon: '--avatar',
  cover: '--banner', header: '--banner',
};

const fits = {
  string: value => typeof value === 'string', integer: Number.isInteger, boolean: value => typeof value === 'boolean',
  array: Array.isArray, object: value => value !== null && typeof value === 'object' && !Array.isArray(value), unknown: () => true,
};

// Build a record's optional layer from --site values: key=value pairs, or JSON files holding several.
export async function siteLayer(specs, type, schemaPath, { fields, matches, kind }) {
  if (!specs.length) return undefined;
  const path = schemaPath ?? `lexicons/${type.replaceAll('.', '/')}.json`;
  const schema = JSON.parse(await readFile(path, 'utf8').catch(() => {
    throw new Error(`No optional schema at ${path}. Create it with: npm run --silent lexicon -- --kind ${type.split('.').at(-1)} > ${path}`);
  }));
  const declared = schema.defs?.main?.properties ?? {};
  const data = {};
  for (const spec of specs) {
    const pair = /^([A-Za-z][A-Za-z0-9]*)=(.*)$/s.exec(spec);
    Object.assign(data, pair ? { [pair[1]]: pair[2] } : JSON.parse(await readFile(spec, 'utf8')));
  }
  for (const [key, value] of Object.entries(data)) {
    if (fields.includes(key) || key.startsWith('$')) throw new Error(`${key} is a fixed field of a ${kind} and cannot be set under --site`);
    if (Object.hasOwn(matches, key)) throw new Error(`${key} already has a fixed field in a ${kind}; set it with ${matches[key]} so other applications can read it`);
    if (!Object.hasOwn(declared, key)) throw new Error(`Declare ${key} in ${path} before using it; the ${kind} schema itself is fixed`);
    if (!(fits[declared[key].type] ?? fits.unknown)(value)) throw new Error(`${key} must be ${declared[key].type}, as ${path} declares`);
  }
  return { $type: type, ...data };
}
