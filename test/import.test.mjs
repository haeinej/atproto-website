import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { POST } from '../feed/pds.mjs';
import { postStore } from '../service/src/store.mjs';
import { filePost, isPostId, postFile } from '../vault/file.mjs';
import { blobAddress, importedId, importVault, saveImported } from '../vault/import.mjs';
import { testDatabase } from './d1.mjs';

const did = 'did:web:pds.example.test';
const context = { did, origin: 'https://pds.example.test', site: 'https://example.test', namespace: 'com.example' };
const walk = JSON.parse(await readFile(new URL('../examples/image-text-image-video.json', import.meta.url), 'utf8'));
const written = (slug, extra = {}) => ({
  $type: POST, body: 'Words.', publishedAt: '2026-01-01T00:00:00.000Z', canonicalUrl: `https://example.test/posts/writings/${slug}`,
  title: slug, form: 'writing', label: 'Writings', ...extra,
});

test('each published record becomes a post, and is found the same when turned back', () => {
  const { posts, skipped } = importVault([
    { key: 'trap-of-independency', value: written('trap-of-independency', {
      sublabel: 'Collisions', canonicalUrl: 'https://example.test/posts/writings/collisions/trap-of-independency', subtitle: 'On needing nobody',
      connect: [`at://${did}/${POST}/why-i-started-ohm`, 'https://example.org/a'], body: 'The body.\n\nSecond paragraph.' }) },
    { key: 'why-i-started-ohm', value: written('why-i-started-ohm', { publishedAt: '2025-11-01T09:00:00.000Z' }) },
    { key: 'loose', value: { $type: POST, body: 'Rain makes a city honest.', publishedAt: '2026-02-02T00:00:00.000Z', canonicalUrl: 'https://example.test/posts/other/loose', form: 'note', label: 'other' } },
    { key: 'a-letter', value: written('a-letter', { source: { platform: 'substack', uri: 'https://x.substack.com/p/a-letter', id: 77 } }) },
  ], context);
  assert.deepEqual(skipped, []);
  assert.deepEqual(posts.map(each => [each.key, each.differs, each.lost, each.problems]), [
    ['why-i-started-ohm', [], [], []], ['a-letter', [], [], []], ['trap-of-independency', [], [], []], ['loose', [], [], []],
  ]);
  const trap = posts.find(each => each.key === 'trap-of-independency').post;
  assert.deepEqual(trap, {
    id: trap.id, slug: 'trap-of-independency', label: 'Writings', sublabel: 'Collisions', visibility: 'public', title: 'trap-of-independency',
    subtitle: 'On needing nobody', date: '2026-01-01T00:00:00.000Z',
    // A connection to another of the person's posts is kept as that post's slug.
    connect: ['why-i-started-ohm', 'https://example.org/a'], body: 'The body.\n\nSecond paragraph.', properties: {},
  });
  assert.ok(isPostId(trap.id));
  // A post with no label is unfiled in the vault, and where a post first appeared comes with it.
  assert.equal(posts.find(each => each.key === 'loose').post.label, '');
  assert.deepEqual(posts.find(each => each.key === 'a-letter').post.source, { platform: 'substack', uri: 'https://x.substack.com/p/a-letter', id: '77' });
  // Every imported post can be written as a file and read back as the same post.
  for (const { post } of posts) {
    const file = postFile(post);
    assert.deepEqual(filePost(file.path, file.text).post, post, post.slug);
  }
});

test('a post is given the same ID every time its vault is brought in', () => {
  const records = [{ key: 'trap', value: written('trap') }, { key: 'draft', value: written('draft') }, { key: '3lf2abcdefg22', value: written('kept', { slug: 'kept' }) }];
  const once = importVault(records, context).posts.map(each => [each.key, each.post.id]);
  assert.deepEqual(importVault(records.toReversed(), context).posts.map(each => [each.key, each.post.id]).sort(), once.toSorted());
  // A record already kept under a post's ID keeps that ID, and its slug is the one it names.
  const kept = importVault(records, context).posts.find(each => each.key === '3lf2abcdefg22').post;
  assert.deepEqual([kept.id, kept.slug], ['3lf2abcdefg22', 'kept']);
  // Records published at the very same moment still get IDs of their own, in another vault too.
  const ids = new Set(Array.from({ length: 200 }, (_, index) => importedId(did, `post-${index}`, '2026-01-01T00:00:00.000Z')));
  assert.equal(ids.size, 200);
  assert.notEqual(importedId(did, 'trap', '2026-01-01T00:00:00.000Z'), importedId('did:web:pds.other.test', 'trap', '2026-01-01T00:00:00.000Z'));
  // IDs still sort by when the post was published.
  assert.ok(importedId(did, 'a', '2025-01-01T00:00:00.000Z') < importedId(did, 'a', '2026-01-01T00:00:00.000Z'));
});

test('a post\'s files are pointed at where they are kept, and what has no place in a post is named', () => {
  const { posts } = importVault([{ key: 'walk-after-the-rain', value: { ...walk, label: 'Field notes', canonicalUrl: 'https://example.test/posts/field-notes/walk-after-the-rain' } }], context);
  const [{ post, differs, lost }] = posts;
  const first = blobAddress(context, walk.media[0]);
  assert.equal(first, `https://pds.example.test/xrpc/com.atproto.sync.getBlob?did=did%3Aweb%3Apds.example.test&cid=${walk.media[0].file.ref.$link}#media-1.png`);
  assert.ok(post.body.startsWith(`![Street after the rain](${first})\n\nThe light changed`));
  assert.match(post.body, /#media-3\.mp4\)$/);
  // Turned back into a record, the same files are placed in the same order and it is the same kind of thing.
  assert.deepEqual(differs, []);
  // What a post has nowhere to keep is said, not dropped in silence.
  const noted = importVault([{ key: 'noted', value: written('noted', {
    body: '![A](media:a)\n\n![Gone](media:gone)', form: undefined, link: { uri: 'https://example.org' },
    media: [{ $type: `${POST}#image`, id: 'a', file: walk.media[0].file, caption: 'A caption', sourceUrl: 'https://example.org/a.png' }, { $type: `${POST}#image`, id: 'unused', file: walk.media[0].file }],
    site: { $type: 'com.example.postSite', episode: 4, eyebrow: 'collisions', nested: { a: 1 } },
    connect: [`at://${did}/${POST}/not-brought-in`],
  }) }], context).posts[0];
  // The site's own layer comes across whole, and a file points at where its original is.
  assert.deepEqual([noted.post.site, noted.post.properties], [{ $type: 'com.example.postSite', episode: 4, eyebrow: 'collisions', nested: { a: 1 } }, {}]);
  assert.ok(noted.post.body.startsWith('![A](https://example.org/a.png)'));
  for (const words of [/file "gone" its body places/, /attachment "unused", which its body does not place/, /the caption of "a"/,
    /connection to at:\/\/.*not-brought-in/, /what its linked page said about itself/]) {
    assert.match(noted.lost.join(' | '), words);
  }
  assert.doesNotMatch(noted.lost.join(' | '), /first came from|site's own field/);
  // An original address that does not show what kind of file it is cannot be pointed at safely, so
  // the copy in the repository is, and the original address is named as lost.
  const cloud = importVault([{ key: 'cloud', value: written('cloud', { body: '![A](media:a)', form: 'image', title: undefined,
    media: [{ $type: `${POST}#image`, id: 'a', file: walk.media[0].file, sourceUrl: 'https://drive.example.com/file/d/abc/view' }] }) }], context).posts[0];
  assert.match(cloud.post.body, /getBlob\?did=.*#a\.png\)$/);
  assert.match(cloud.lost.join(' | '), /where "a" first came from \(https:\/\/drive\.example\.com/);
});

test('a record that cannot be a post, and a post from an older type, are handled and reported', () => {
  const { posts, skipped } = importVault([
    { key: 'older', value: { $type: 'com.example.post', body: 'Older words.', publishedAt: '2024-05-05T00:00:00.000Z', canonicalUrl: 'https://example.test/posts/older',
      title: 'Older', tags: ['Writings', 'Early'], eyebrow: 'ep.01', connect: ['at://did:web:pds.example.test/com.example.post/first'] } },
    { key: 'first', value: { $type: 'com.example.post', body: 'First.', publishedAt: '2024-01-01T00:00:00.000Z', canonicalUrl: 'https://example.test/posts/first' } },
    { key: 'no-date', value: { $type: POST, body: 'x' } },
    { key: 'second-copy', value: written('first', { publishedAt: '2026-06-01T00:00:00.000Z', slug: 'first' }) },
    { key: 'bad-label', value: written('bad-label', { label: 'a/b' }) },
  ], context);
  const older = posts.find(each => each.key === 'older').post;
  // Tags from before labels become the label and sublabel, a field of the site's own comes along,
  // and a connection follows the post it points at.
  assert.deepEqual([older.label, older.sublabel, older.site, older.properties, older.connect], ['Writings', 'Early', { eyebrow: 'ep.01', $type: 'com.example.postSite' }, {}, ['first']]);
  assert.deepEqual(skipped.map(each => each.key).sort(), ['bad-label', 'no-date', 'second-copy']);
  assert.match(skipped.find(each => each.key === 'second-copy').why, /another post already has its slug, "first"/);
  assert.match(skipped.find(each => each.key === 'bad-label').why, /cannot hold "\/"/);
  assert.match(skipped.find(each => each.key === 'no-date').why, /no body or no date/);
});

test('bringing a vault in twice puts each post in once, and never overwrites one changed since', async () => {
  const store = postStore(await testDatabase());
  const send = async post => {
    try {
      return { status: 200, body: await store.write(did, post) };
    } catch (problem) {
      return { status: problem.status, body: { error: problem.code, message: problem.message } };
    }
  };
  const { posts } = importVault([{ key: 'trap', value: written('trap') }, { key: 'draft', value: written('draft') }], context);
  assert.deepEqual(await saveImported(posts, send), { saved: ['draft', 'trap'], unchanged: [], changedThere: [], refused: [] });
  assert.deepEqual(await saveImported(posts, send), { saved: [], unchanged: ['draft', 'trap'], changedThere: [], refused: [] });
  // The person edits one in the vault. Bringing the vault in again leaves their edit alone.
  const trap = posts.find(each => each.key === 'trap').post;
  const held = await store.read(did, trap.id);
  await store.write(did, { ...held.post, title: 'Edited in the vault' }, { replaces: held.version });
  assert.deepEqual(await saveImported(posts, send), { saved: [], unchanged: ['draft'], changedThere: ['trap'], refused: [] });
  assert.equal((await store.read(did, trap.id)).post.title, 'Edited in the vault');
  assert.equal((await store.tree(did)).public, 2);
});

test('a post on a page of the author\'s own design keeps that page\'s address and everything its site added', () => {
  // The shape of a real one: its own address, a layer of the site's own with a translation inside
  // it, and pictures that came from the site.
  const record = {
    $type: POST, body: 'I grew up consuming society\u2019s advertisement on independence.\n\n![Passengers](media:independence)\n\nMore words.',
    publishedAt: '2026-04-01T00:00:00.000Z', canonicalUrl: 'https://example.test/writing/series/collisions/episode-01.html',
    title: 'Trap of independency', label: 'Writings', sublabel: 'Collisions',
    media: [{ $type: `${POST}#image`, id: 'independence', file: { ...walk.media[0].file, mimeType: 'image/webp' }, sourceUrl: 'https://example.test/writing/series/collisions/media/ep01-independence.webp' }],
    site: { $type: 'com.example.postSite', summary: 'i had confused independence with defensibility.', language: 'en',
      translations: [{ language: 'ko', title: '독립이라는 함정', body: '나는 사회가 팔아온 \u2018독립\u2019이라는 광고를\n\n너무 곧이곧대로 받아들이며 자랐다.' }] },
  };
  const [{ post, differs, lost, problems }] = importVault([{ key: 'trap-of-independency', value: record }], context).posts;
  assert.deepEqual([differs, lost, problems], [[], [], []]);
  assert.deepEqual([post.address, post.site], ['https://example.test/writing/series/collisions/episode-01.html', record.site]);
  assert.match(post.body, /!\[Passengers\]\(https:\/\/example\.test\/writing\/series\/collisions\/media\/ep01-independence\.webp\)/);
  // As a file it is still exact, translation and all, and can be read back.
  const file = postFile(post);
  assert.match(file.text, /^address: "https:\/\/example\.test\/writing\/series\/collisions\/episode-01\.html"$/m);
  assert.deepEqual(filePost(file.path, file.text), { post, problems: [] });
  // A post at the address its label and slug give it does not carry one.
  assert.equal(importVault([{ key: 'plain', value: written('plain') }], context).posts[0].post.address, undefined);
});
