import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { postCollection, siblingCollection } from '../feed/pds.mjs';

try {
  const { values } = parseArgs({
    options: {
      collection: { type: 'string' }, kind: { type: 'string', default: 'post' },
      config: { type: 'string', default: 'feed/wrangler.site.jsonc' },
    },
  });
  const collection = values.collection ?? JSON.parse(await readFile(values.config, 'utf8')).vars.ATPROTO_POST_COLLECTION;
  if (!collection) throw new Error('Set ATPROTO_POST_COLLECTION in your site config or pass --collection');
  if (!['post', 'profile', 'profileLink'].includes(values.kind)) throw new Error('--kind is post, profile, or profileLink');
  const template = new URL(`../lexicons/com/haeinjung/${values.kind}.json`, import.meta.url);
  const schema = JSON.parse(await readFile(template, 'utf8'));
  // The profile schemas sit beside the post schema, under the same domain.
  schema.id = values.kind === 'post' ? postCollection(collection) : siblingCollection(postCollection(collection), values.kind);
  console.log(JSON.stringify(schema, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
