import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlToMarkdown } from '../mirror/html-to-markdown.mjs';
import { readFeed } from '../mirror/sources.mjs';
import { keyFor, mirror } from '../mirror/sync.mjs';
import { handle } from '../mirror/worker.mjs';

test('HTML from a platform becomes a post body, and what has no Markdown is named', () => {
  const { markdown, images, simplified } = htmlToMarkdown(`
    <h2>A walk</h2>
    <p>The street went <em>quiet</em> &amp; <strong>still</strong>.<br>Then a *star* and <a href="/more">more</a>.</p>
    <figure><a href="https://cdn.example.org/full.jpg"><img src="/small.jpg" alt="A wet street"></a><figcaption>After the rain</figcaption></figure>
    <ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol>
    <blockquote><p>Once is never.</p></blockquote><hr>
    <p>1. Not a list</p><script>alert(1)</script><iframe src="https://player.example.org"></iframe>
    <pre><code>let a = 1 &lt; 2;</code></pre>`, 'https://example.com/writing/a-walk.html');
  assert.equal(markdown, [
    '## A walk',
    'The street went *quiet* & **still**.\\\nThen a \\*star\\* and [more](<https://example.com/more>).',
    '[![A wet street](media:image-1)](<https://cdn.example.org/full.jpg>)',
    'After the rain',
    '- One\n- Two',
    '1. First',
    '> Once is never.',
    '---',
    '1\\. Not a list',
    '```\nlet a = 1 < 2;\n```',
  ].join('\n\n'));
  assert.deepEqual(images, [{ id: 'image-1', url: 'https://example.com/small.jpg', alt: 'A wet street' }]);
  assert.deepEqual(simplified, ['iframe']);
});

test('a feed in any of the three common formats reads the same', async () => {
  const serve = (body, type) => async () => new Response(body, { headers: { 'Content-Type': type } });
  const expected = [{ id: 'one', url: 'https://example.com/writing/a-walk.html', title: 'A walk & more', html: '<p>Words.</p>', text: '', publishedAt: '2026-06-01T09:00:00.000Z' }];
  const rss = `<rss><channel><item><title>A walk &amp; more</title><link>https://example.com/writing/a-walk.html</link><guid>one</guid>
    <pubDate>Mon, 01 Jun 2026 09:00:00 GMT</pubDate><description>Short.</description><content:encoded><![CDATA[<p>Words.</p>]]></content:encoded></item></channel></rss>`;
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A walk &amp; more</title><id>one</id>
    <link rel="self" href="https://example.com/feed"/><link rel="alternate" href="https://example.com/writing/a-walk.html"/>
    <published>2026-06-01T09:00:00Z</published><content type="html">&lt;p&gt;Words.&lt;/p&gt;</content></entry></feed>`;
  const json = JSON.stringify({ items: [{ id: 'one', url: 'https://example.com/writing/a-walk.html', title: 'A walk & more', content_html: '<p>Words.</p>', date_published: '2026-06-01T09:00:00Z' }] });
  assert.deepEqual(await readFeed({ feed: 'https://example.com/feed.xml' }, serve(rss, 'application/rss+xml')), expected);
  assert.deepEqual(await readFeed({ feed: 'https://example.com/atom.xml' }, serve(atom, 'application/atom+xml')), expected);
  assert.deepEqual(await readFeed({ feed: 'https://example.com/feed.json' }, serve(json, 'application/feed+json')), expected);
  await assert.rejects(readFeed({ feed: 'https://example.com/gone' }, async () => new Response('', { status: 404 })), /answered HTTP 404/);
});

// A stand-in for the owner's PDS and the platforms the mirror reads.
function world() {
  const records = new Map();
  const blobs = [];
  const kv = new Map();
  const feeds = {
    'https://example.com/feed.json': { items: [
      { id: 'a', url: 'https://example.com/writing/a-walk.html', title: 'A walk', date_published: '2026-06-01T09:00:00Z',
        content_html: '<p>The street went quiet.</p><p><img src="https://example.com/media/street.jpg" alt="A wet street"></p>' },
      { id: 'b', url: 'https://example.com/writing/second.html', title: 'Second', date_published: '2026-06-02T09:00:00Z', content_html: '<p>More.</p>' },
    ] },
    'https://me.substack.com/feed': '<rss><channel><item><title>A letter</title><link>https://me.substack.com/p/a-letter</link><guid>s1</guid><pubDate>Wed, 03 Jun 2026 09:00:00 GMT</pubDate><content:encoded><![CDATA[<p>Dear reader.</p>]]></content:encoded></item></channel></rss>',
  };
  const get = async (url, options = {}) => {
    const address = String(url);
    if (address.endsWith('/xrpc/com.atproto.repo.uploadBlob')) {
      if (options.headers.Authorization !== 'Bearer pds-token') return Response.json({}, { status: 401 });
      blobs.push(options.headers['Content-Type']);
      return Response.json({ blob: { $type: 'blob', mimeType: options.headers['Content-Type'], size: options.body.length, ref: { $link: `bafk${blobs.length}` } } });
    }
    if (address.endsWith('/xrpc/com.atproto.repo.putRecord')) {
      if (options.headers.Authorization !== 'Bearer pds-token') return Response.json({}, { status: 401 });
      const { rkey, record } = JSON.parse(options.body);
      records.set(rkey, record);
      return Response.json({ uri: `at://did:web:pds.example.test/com.example.post/${rkey}` });
    }
    if (address === 'https://example.com/media/street.jpg') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
    if (address in feeds) return typeof feeds[address] === 'string' ? new Response(feeds[address]) : Response.json(feeds[address]);
    return new Response('', { status: 404 });
  };
  const env = {
    ATPROTO_DID: 'did:web:pds.example.test', ATPROTO_PDS_ORIGIN: 'https://pds.example.test', ATPROTO_POST_COLLECTION: 'com.example.post',
    SITE_ORIGIN: 'https://example.com', PDS_AUTH_TOKEN: 'pds-token', MIRROR_TOKEN: 'button-token',
    MIRROR_SOURCES: JSON.stringify([
      { platform: 'website', feed: 'https://example.com/feed.json', label: 'Writing' },
      { platform: 'Substack', feed: 'https://me.substack.com/feed', label: 'Writing', sublabel: 'Letters' },
    ]),
    MIRROR: { get: async key => (kv.has(key) ? JSON.parse(kv.get(key)) : null), put: async (key, value) => { kv.set(key, value); } },
  };
  return { records, blobs, feeds, get, env };
}

test('one run mirrors every connected platform, and the next run writes only what changed', async () => {
  const { records, blobs, feeds, get, env } = world();
  const first = await mirror(env, { get, now: new Date('2026-06-04T00:00:00Z') });
  assert.deepEqual(first.sources.map(source => [source.platform, source.seen, source.written.map(post => post.key), source.problems]), [
    ['website', 2, ['a-walk', 'second'], []], ['substack', 1, ['substack-a-letter'], []],
  ]);
  assert.deepEqual(records.get('a-walk'), {
    $type: 'com.example.post', body: 'The street went quiet.\n\n![A wet street](media:image-1)', publishedAt: '2026-06-01T09:00:00.000Z',
    canonicalUrl: 'https://example.com/posts/writing/a-walk', title: 'A walk', form: 'writing', label: 'Writing',
    media: [{ $type: 'com.example.post#image', id: 'image-1', original: { $type: 'blob', mimeType: 'image/jpeg', size: 3, ref: { $link: 'bafk1' } },
      sourceUrl: 'https://example.com/media/street.jpg', alt: 'A wet street' }],
  });
  // A post from another platform says where it first appeared, and is filed where its source says.
  const letter = records.get('substack-a-letter');
  assert.deepEqual([letter.source, letter.label, letter.sublabel, letter.canonicalUrl], [
    { platform: 'substack', uri: 'https://me.substack.com/p/a-letter', id: 's1' }, 'Writing', 'Letters',
    'https://example.com/posts/writing/letters/substack-a-letter',
  ]);

  // Nothing changed: nothing is written, and no image is fetched again.
  records.clear();
  const second = await mirror(env, { get });
  assert.deepEqual([second.sources.map(source => source.unchanged), records.size, blobs.length], [[2, 1], 0, 1]);

  // One post is edited on the website: only that record is replaced.
  feeds['https://example.com/feed.json'].items[1].content_html = '<p>More, revised.</p>';
  const third = await mirror(env, { get });
  assert.deepEqual([third.sources[0].written.map(post => post.key), [...records.keys()], records.get('second').body], [['second'], ['second'], 'More, revised.']);
});

test('a run does a bounded amount of work, and a problem with one post does not stop the rest', async () => {
  const { records, feeds, get, env } = world();
  feeds['https://example.com/feed.json'].items.unshift({ id: 'c', url: 'https://example.com/writing/broken.html', title: 'Broken', date_published: '2026-06-03T09:00:00Z',
    content_html: '<p>Words.</p><img src="https://example.com/media/missing.jpg">' });
  const bounded = await mirror(env, { get, budget: 2 });
  assert.match(bounded.sources[0].problems[0], /broken\.html: could not fetch the image/);
  assert.deepEqual([[...records.keys()], bounded.sources[0].waiting, bounded.sources[1].waiting], [['a-walk'], 1, 1]);
  // The next run picks up what was waiting.
  const next = await mirror(env, { get, budget: 5 });
  assert.deepEqual([next.sources[0].unchanged, [...records.keys()].sort()], [1, ['a-walk', 'second', 'substack-a-letter']]);
  // A source that cannot be read is reported, and the others still run.
  env.MIRROR_SOURCES = JSON.stringify([{ platform: 'blog', feed: 'https://gone.example/feed' }, ...JSON.parse(env.MIRROR_SOURCES)]);
  const partial = await mirror(env, { get });
  assert.deepEqual([partial.sources[0].problems, partial.sources.length], [['https://gone.example/feed answered HTTP 404'], 3]);
  assert.equal(keyFor({ platform: 'x' }, { id: '123' }), 'x-123');
  assert.equal(keyFor({ platform: 'website' }, { url: 'https://example.com/writing/série/Été 2026.html' }), 't-2026');
});

test('the mirror page and its button answer only the owner', async () => {
  const { records, get, env } = world();
  const ask = (path, options) => handle(new Request(`https://example.com${path}`, options), env, get);
  assert.equal((await ask('/mirror/')).status, 404);
  assert.equal((await ask('/mirror/run', { method: 'POST', headers: { Authorization: 'Bearer wrong' } })).status, 404);
  const owner = { headers: { Authorization: 'Bearer button-token' } };
  const before = await (await ask('/mirror/', owner)).text();
  assert.match(before, /<strong>website<\/strong> <span>https:\/\/example\.com\/feed\.json<\/span>.*not run yet.*<strong>substack<\/strong>.*Mirror now/s);
  const run = await ask('/mirror/run', { method: 'POST', ...owner });
  assert.deepEqual([(await run.json()).sources.map(source => source.written.length), records.size], [[2, 1], 3]);
  assert.match(await (await ask('/mirror/', owner)).text(), /2 seen · 2 written · 0 unchanged/);
  assert.equal((await (await ask('/mirror/status.json', owner)).json()).sources.length, 2);
});
