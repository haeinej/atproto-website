// Bring the posts you have already published into your vault. Each record in your repository
// becomes a post with an ID of its own. Without --save this reads your repository, which anyone
// can, prints what would be put in the vault, and changes nothing.
//
//   import [--from com.example.post] [--key KEY] [--config PATH] [--vault URL --vault-did DID] [--save]
//
// --from also reads posts still under an older post type; it defaults to the one an older site
// configuration names. --key prints one post in full, beside the record it came from.
// --save needs ATPROTO_APP_PASSWORD, to ask your PDS for a token that proves to the vault who you are.
import { parseArgs } from 'node:util';
import { isRecordKey, pdsConfig, POST, webUrl } from '../feed/pds.mjs';
import { importVault, saveImported } from '../vault/import.mjs';
import { siteVars } from './config.mjs';
import { rpc, signIn } from './rpc.mjs';
import { vaultClient } from './vault-client.mjs';

// Every record of one type, as the repository lists them. A PDS may repeat one across a page boundary.
async function list(pds, collection) {
  const records = new Map();
  const prefix = `at://${pds.did}/${collection}/`;
  let cursor;
  for (let page = 0; page < 500; page++) {
    const { response, data } = await rpc(pds.origin, 'com.atproto.repo.listRecords', {
      query: { repo: pds.did, collection, limit: '100', ...(cursor ? { cursor } : {}) },
    });
    if (!response.ok) throw new Error(`Listing ${collection} failed (HTTP ${response.status})`);
    for (const record of data.records ?? []) {
      const key = String(record.uri).startsWith(prefix) ? record.uri.slice(prefix.length) : '';
      if (isRecordKey(key)) records.set(key, record.value);
    }
    if (!data.cursor || data.cursor === cursor) return records;
    cursor = data.cursor;
  }
  throw new Error(`${collection} has more records than this command reads`);
}

try {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' }, key: { type: 'string' }, config: { type: 'string' },
      vault: { type: 'string' }, 'vault-did': { type: 'string' }, save: { type: 'boolean' },
    },
  });
  const vars = await siteVars(values.config);
  const pds = pdsConfig(vars);
  const site = webUrl(vars.SITE_ORIGIN);
  if (!site) throw new Error('Set SITE_ORIGIN in the site configuration');
  const from = values.from ?? pds.olderCollection;
  // A post kept under the shared type is the one that counts, when an older copy of it is still there.
  const found = new Map(from && from !== POST ? await list(pds, from) : []);
  for (const [key, value] of await list(pds, POST)) found.set(key, value);
  const { posts, skipped } = importVault([...found].map(([key, value]) => ({ key, value })), { did: pds.did, origin: pds.origin, site, namespace: pds.namespace });

  if (values.key) {
    const one = posts.find(each => each.key === values.key);
    if (!one) throw new Error(`No post was read from the record "${values.key}"`);
    console.log(JSON.stringify({ post: one.post, lost: one.lost, differs: one.differs, cannotBePublishedYet: one.problems, from: one.record }, null, 2));
  } else {
    const labels = {};
    for (const { post } of posts) {
      const name = [post.label || 'other', post.sublabel].filter(Boolean).join(' / ');
      labels[name] = (labels[name] ?? 0) + 1;
    }
    const noted = name => posts.filter(each => each[name].length).map(each => ({ key: each.key, slug: each.post.slug, [name]: each[name] }));
    const report = {
      records: found.size, posts: posts.length, labels,
      // Each post is turned back into the record it would be published as and compared with its source.
      sameAsPublished: posts.filter(each => !each.differs.length).length,
      differs: noted('differs'), lost: noted('lost'), cannotBePublishedYet: noted('problems'), skipped,
    };
    if (!values.save) {
      console.log(JSON.stringify({ ...report, note: 'Nothing was changed. Add --save, with --vault and --vault-did, to put these posts in your vault.' }, null, 2));
    } else {
      const vault = webUrl(values.vault ?? vars.OHM_VAULT_URL);
      const audience = values['vault-did'] ?? vars.OHM_VAULT_DID;
      if (!vault || !audience) throw new Error('Say which vault with --vault URL and --vault-did DID');
      const client = vaultClient({ pds, session: await signIn(pds.origin, pds.did), vault, audience });
      const send = post => client.put(post).then(body => ({ status: 200, body }), problem => ({ status: problem.status ?? 500, body: problem.extra ?? { message: problem.message } }));
      console.log(JSON.stringify({ ...report, ...await saveImported(posts, send) }, null, 2));
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
