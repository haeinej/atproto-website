import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { postCollection, siblingCollection } from '../feed/pds.mjs';
import { siteVars } from './config.mjs';

try {
  const { values } = parseArgs({
    options: {
      collection: { type: 'string' }, kind: { type: 'string', default: 'post' },
      config: { type: 'string' },
    },
  });
  const collection = values.collection ?? (await siteVars(values.config)).ATPROTO_POST_COLLECTION;
  if (!collection) throw new Error('Set ATPROTO_POST_COLLECTION in your site config or pass --collection');
  if (!['post', 'postSite', 'profile', 'profileLink', 'profileSite'].includes(values.kind)) {
    throw new Error('--kind is post, postSite, profile, profileLink, or profileSite');
  }
  const template = new URL(`../lexicons/com/haeinjung/${values.kind}.json`, import.meta.url);
  const schema = JSON.parse(await readFile(template, 'utf8'));
  // The profile schemas sit beside the post schema, under the same domain.
  schema.id = values.kind === 'post' ? postCollection(collection) : siblingCollection(postCollection(collection), values.kind);
  console.log(JSON.stringify(schema, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
