// A member's posts. Four operations and nothing else: list, read, write, remove. Every write and
// removal names the version it replaces, and the database itself makes that check in the same
// statement that makes the change.
//
// A post is known by its ID, which is given once when it is made and never changes. Its slug is an
// ordinary field: changing it changes the post's address, and it is still the same post.
//
// `db` has the shape of a Cloudflare D1 database.
import { POST } from '../../feed/pds.mjs';
import { cleanPost, isPostId, postProblems, postRecord, postVersion } from '../../vault/file.mjs';

const PAGE = 1000;
const LARGEST = 600_000;

export class Refused extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    Object.assign(this, { status, code, extra });
  }
}

export function postStore(db) {
  const current = (did, id) => db.prepare('SELECT version, post, seq FROM posts WHERE did = ?1 AND id = ?2').bind(did, id).first();
  const next = '(SELECT COALESCE(MAX(seq), 0) + 1 FROM posts WHERE did = ?1)';
  const changed = (id, held) => new Refused(409, 'Changed', 'The post has changed since the version this request names', { id, current: held?.version ?? null });
  const known = id => isPostId(id) ? id : (() => { throw new Refused(400, 'InvalidPost', 'Say which post with its ID'); })();

  return {
    // Every post there is, or with `since`, everything that changed after that point, removals included.
    async list(did, { since } = {}) {
      const after = since === undefined ? 0 : Number(since);
      if (!Number.isSafeInteger(after) || after < 0) throw new Refused(400, 'InvalidCursor', 'since is a value an earlier list returned');
      const { results } = await db.prepare(
        `SELECT id, version, slug, label, sublabel, visibility, title, seq FROM posts
         WHERE did = ?1 AND seq > ?2 ${since === undefined ? 'AND version IS NOT NULL' : ''} ORDER BY seq LIMIT ${PAGE + 1}`,
      ).bind(did, after).all();
      const page = results.slice(0, PAGE);
      // With nothing new, the point stays where it was. A first list of an empty vault starts at the latest change.
      const latest = page.length ? page.at(-1).seq
        : since !== undefined ? after
        : (await db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM posts WHERE did = ?1').bind(did).first()).seq;
      return {
        posts: page.map(row => row.version === null ? { id: row.id, removed: true } : {
          id: row.id, version: row.version, slug: row.slug, label: row.label, sublabel: row.sublabel, visibility: row.visibility,
          ...(row.title ? { title: row.title } : {}),
        }),
        cursor: String(latest),
        ...(results.length > PAGE ? { more: true } : {}),
      };
    },

    async read(did, id) {
      const held = await current(did, known(id));
      if (!held || held.version === null) throw new Refused(404, 'NotFound', 'There is no such post');
      return { post: JSON.parse(held.post), version: held.version };
    },

    // `replaces` is the version being replaced, and nothing for a post that is new.
    async write(did, given, { replaces = null, now = new Date() } = {}) {
      const post = cleanPost(given);
      const problems = postProblems(post);
      if (problems.length) throw new Refused(400, 'InvalidPost', problems.join('\n'));
      const text = JSON.stringify(post);
      if (new TextEncoder().encode(text).length > LARGEST) throw new Refused(413, 'TooLarge', 'A post can be at most 600 KB of text');
      const version = await postVersion(post);
      const held = await current(did, post.id);
      const was = held?.version ?? null;
      // The same post again: nothing to do, so a request sent twice ends the same as sent once.
      if (was === version) return { id: post.id, version, unchanged: true };
      if (was !== replaces) throw changed(post.id, held);
      // What the post would be published as is worked out now, so the vault can say what kind of
      // thing it is and whether anything stops it being published. Links to other posts are
      // settled at Publish, when every post is there to be linked to.
      const made = postRecord(post, { did, site: 'https://vault.invalid', collection: POST, seenAt: now.toISOString(), noteAddress: name => `post:${name}` });
      let written;
      try {
        written = await db.prepare(
          `INSERT INTO posts (did, id, version, slug, label, sublabel, visibility, title, form, date, problems, post, seq, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ${next}, ?13, ?13)
           ON CONFLICT (did, id) DO UPDATE SET version = excluded.version, slug = excluded.slug, label = excluded.label,
             sublabel = excluded.sublabel, visibility = excluded.visibility, title = excluded.title, form = excluded.form,
             date = excluded.date, problems = excluded.problems, post = excluded.post, seq = excluded.seq, updated_at = excluded.updated_at
           WHERE posts.version IS ?14
           RETURNING seq`,
        ).bind(did, post.id, version, post.slug, post.label, post.sublabel, post.visibility, post.title ?? null, made.form ?? null,
          made.record?.publishedAt ?? null, JSON.stringify(made.problems), text, now.toISOString(), replaces).first();
      } catch (problem) {
        if (/UNIQUE constraint failed: posts\.did, posts\.slug|posts_slug/i.test(String(problem?.message))) {
          throw new Refused(409, 'SlugTaken', `Another post already has the slug "${post.slug}". A slug is used once in a vault.`, { id: post.id });
        }
        throw problem;
      }
      // Another request changed the post between the look above and this write.
      if (!written) throw changed(post.id, await current(did, post.id));
      return { id: post.id, version };
    },

    async remove(did, id, { replaces = null, now = new Date() } = {}) {
      const held = await current(did, known(id));
      if (!held || held.version === null) return { id, removed: true, unchanged: true };
      if (held.version !== replaces) throw changed(id, held);
      const gone = await db.prepare(
        `UPDATE posts SET version = NULL, slug = NULL, post = NULL, problems = NULL, seq = ${next}, updated_at = ?3
         WHERE did = ?1 AND id = ?2 AND version IS ?4 RETURNING seq`,
      ).bind(did, id, now.toISOString(), replaces).first();
      if (!gone) throw changed(id, await current(did, id));
      return { id, removed: true };
    },

    // Every post in full, for writing the whole vault out.
    async all(did) {
      const { results } = await db.prepare('SELECT post FROM posts WHERE did = ?1 AND version IS NOT NULL ORDER BY label, sublabel, slug').bind(did).all();
      return results.map(row => JSON.parse(row.post));
    },

    // The vault's structure: labels, the sublabels inside them, and each post with who may see it.
    async tree(did) {
      const { results } = await db.prepare(
        `SELECT id, slug, label, sublabel, visibility, title, form, date, problems FROM posts
         WHERE did = ?1 AND version IS NOT NULL ORDER BY label, sublabel, date DESC, slug`,
      ).bind(did).all();
      const labels = new Map();
      const counts = { public: 0, friends: 0, private: 0 };
      for (const row of results) {
        counts[row.visibility]++;
        const problems = JSON.parse(row.problems ?? '[]');
        const folder = labels.get(row.label) ?? labels.set(row.label, { label: row.label || 'other', posts: [], sublabels: new Map() }).get(row.label);
        const inside = row.sublabel
          ? folder.sublabels.get(row.sublabel) ?? folder.sublabels.set(row.sublabel, { sublabel: row.sublabel, posts: [] }).get(row.sublabel)
          : folder;
        inside.posts.push({
          id: row.id, slug: row.slug, visibility: row.visibility,
          ...(row.title ? { title: row.title } : {}), ...(row.form ? { form: row.form } : {}), ...(row.date ? { date: row.date } : {}),
          // A post with problems is kept and shown, and is left out when the vault is published.
          ...(problems.length ? { problems } : {}),
        });
      }
      return {
        posts: results.length, ...counts,
        labels: [...labels.values()].map(folder => ({ label: folder.label, posts: folder.posts, sublabels: [...folder.sublabels.values()] })),
      };
    },
  };
}
