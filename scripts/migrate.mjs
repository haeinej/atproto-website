// Copy a repository's posts from an older post type, such as com.example.post, to the shared one,
// com.ohmmmm.post. Each post keeps its key, so its address does not change. The older records are
// left where they are. Without --publish this reads the repository, prints what would be written,
// and changes nothing.
//
//   migrate [--from com.example.post] [--key KEY] [--config PATH] [--publish]
//
// --from defaults to the post type an older site configuration names (ATPROTO_POST_COLLECTION).
// --key prints one post's new record in full.
import { parseArgs } from 'node:util';
import { normalizeArchivePost, pdsConfig, POST } from '../feed/pds.mjs';
import { upgradePost } from '../feed/upgrade.mjs';
import { siteVars } from './config.mjs';
import { rpc, signIn } from './rpc.mjs';
import { listRecords } from '../feed/repository.mjs';

const graphemes = text => [...new Intl.Segmenter().segment(text)].length;
const LIMITS = { title: 300, subtitle: 300, label: 100, sublabel: 100 };

// Every record of one type, by key. A PDS may repeat a record across a page boundary.
async function list(pds, collection) {
  const { records } = await listRecords({ ...pds, collection, maxPages: 500 });
  return new Map(records.map(record => [record.uri.split('/').at(-1), record.value]));
}

// How many posts hold each name in one of their lists. An attachment's own ID is left out of the
// name, so `media a.credit` and `media b.credit` are counted together as `media.credit`.
function tally(posts, list) {
  const plain = name => name.replace(/^media \S+?\./, 'media.').replace(/ \(.*\)$/, '');
  const counts = {};
  for (const post of posts) for (const name of new Set(post[list].map(plain))) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}

// Why a record would not be accepted as a post, as sentences. Empty when it is fine.
function problems(record, key, pds) {
  const found = [];
  if (!normalizeArchivePost(record, key, pds)) found.push('it has no body, date, or address the site can read');
  for (const [field, most] of Object.entries(LIMITS)) {
    if (typeof record[field] === 'string' && graphemes(record[field]) > most) found.push(`its ${field} is longer than ${most} characters`);
  }
  if (Array.isArray(record.connect) && record.connect.length > 32) found.push('it connects to more than 32 posts');
  for (const entry of record.media ?? []) if (!entry.file) found.push(`its attachment ${entry.id} has no file`);
  return found;
}

try {
  const { values } = parseArgs({
    options: { from: { type: 'string' }, key: { type: 'string' }, config: { type: 'string' }, publish: { type: 'boolean' } },
  });
  const pds = pdsConfig(await siteVars(values.config));
  const from = values.from ?? pds.olderCollection;
  if (!from) throw new Error('Set --from to the post type your posts are under now, such as com.example.post');
  if (from === POST) throw new Error(`Posts under ${POST} are already where they belong`);

  const older = await list(pds, from);
  const there = await list(pds, POST);
  const posts = [];
  for (const [key, value] of older) {
    if (value?.$type !== from) continue;
    const { record, left, moved } = upgradePost(value, { did: pds.did, key, namespace: pds.namespace });
    const wrong = problems(record, key, pds);
    posts.push({
      key, record, left, moved,
      state: there.has(key) ? 'already there' : wrong.length ? 'cannot be copied' : 'to copy',
      ...(wrong.length ? { problems: wrong } : {}),
    });
  }
  if (values.key) {
    const post = posts.find(found => found.key === values.key);
    if (!post) throw new Error(`No post "${values.key}" under ${from}`);
    console.log(JSON.stringify(post, null, 2));
  } else {
    const count = state => posts.filter(post => post.state === state).length;
    let copied = 0;
    if (values.publish) {
      const token = await signIn(pds.origin, pds.did);
      for (const post of posts.filter(found => found.state === 'to copy')) {
        const created = await rpc(pds.origin, 'com.atproto.repo.createRecord', {
          body: { repo: pds.did, collection: POST, rkey: post.key, record: post.record }, token,
        });
        if (!created.response.ok || created.data.uri !== `at://${pds.did}/${POST}/${post.key}`) {
          throw new Error(`Copying ${post.key} failed (HTTP ${created.response.status}) after ${copied} posts were copied. Run the command again to continue; posts already copied are skipped.`);
        }
        post.state = 'copied';
        copied++;
      }
    }
    console.log(JSON.stringify({
      from, to: POST, repository: `at://${pds.did}`,
      found: posts.length, toCopy: count('to copy'), copied, alreadyThere: count('already there'), cannotBeCopied: count('cannot be copied'),
      // Fields the shared schema has no place for, with how many posts hold each. The first set is
      // kept in your own layer, under each post's `site`: declare them in your postSite schema. The
      // second is not kept.
      movedToSite: tally(posts, 'moved'),
      leftBehind: tally(posts, 'left'),
      problems: Object.fromEntries(posts.filter(post => post.problems).map(post => [post.key, post.problems])),
      written: Boolean(values.publish),
    }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
