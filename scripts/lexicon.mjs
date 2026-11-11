import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { postCollection } from '../feed/pds.mjs';

try {
  const { values } = parseArgs({
    options: {
      collection: { type: 'string' },
      config: { type: 'string', default: 'feed/wrangler.site.jsonc' },
    },
  });
  const collection = values.collection ?? JSON.parse(await readFile(values.config, 'utf8')).vars.ATPROTO_POST_COLLECTION;
  if (!collection) throw new Error('Set ATPROTO_POST_COLLECTION in your site config or pass --collection');
  const template = new URL('../lexicons/com/haeinjung/post.json', import.meta.url);
  const schema = JSON.parse(await readFile(template, 'utf8'));
  schema.id = postCollection(collection);
  console.log(JSON.stringify(schema, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
