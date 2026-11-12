// Print a schema. The post schema is shared and the same on every site, so it is printed as it is.
// The others are a site's own, and are printed under the person's namespace.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ownCollection, ownNamespace, siteNamespace } from '../feed/pds.mjs';
import { siteVars } from './config.mjs';

try {
  const { values } = parseArgs({
    options: {
      namespace: { type: 'string' }, kind: { type: 'string', default: 'post' },
      config: { type: 'string' }, collection: { type: 'string' },
    },
  });
  if (!['post', 'postSite', 'profile', 'profileLink', 'profileSite'].includes(values.kind)) {
    throw new Error('--kind is post, postSite, profile, profileLink, or profileSite');
  }
  if (values.collection !== undefined) {
    throw new Error('Every post is com.ohmmmm.post, so there is no post type to choose. For your own schemas, set --namespace to your domain written backwards, such as com.example');
  }
  if (values.kind === 'post') {
    console.log((await readFile(new URL('../lexicons/com/ohmmmm/post.json', import.meta.url), 'utf8')).trimEnd());
  } else {
    const namespace = values.namespace ? ownNamespace(values.namespace) : siteNamespace(await siteVars(values.config)).namespace;
    const schema = JSON.parse(await readFile(new URL(`../lexicons/com/haeinjung/${values.kind}.json`, import.meta.url), 'utf8'));
    schema.id = ownCollection(namespace, values.kind);
    console.log(JSON.stringify(schema, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
