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
  const versions = new Map();
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
    if (/\/com.atproto.repo\.(putRecord|createRecord)$/.test(address)) {
      if (options.headers.Authorization !== 'Bearer pds-token') return Response.json({}, { status: 401 });
      const { rkey, record, swapRecord } = JSON.parse(options.body);
      if (address.endsWith('createRecord') && records.has(rkey)) return Response.json({ error: 'RecordAlreadyExists' }, { status: 400 });
      if (address.endsWith('putRecord') && swapRecord !== versions.get(rkey)) return Response.json({ error: 'InvalidSwap' }, { status: 400 });
      records.set(rkey, record);
      const cid = `cid-${versions.size}-${JSON.stringify(record).length}`;
      versions.set(rkey, cid);
      return Response.json({ uri: `at://did:web:pds.example.test/com.ohmmmm.post/${rkey}`, cid });
    }
    if (address.includes('/xrpc/com.atproto.repo.getRecord')) {
      const key = new URL(address).searchParams.get('rkey');
      return records.has(key) ? Response.json({ uri: `at://did:web:pds.example.test/com.ohmmmm.post/${key}`, cid: versions.get(key), value: records.get(key) }) : Response.json({ error: 'RecordNotFound' }, { status: 400 });
    }
    if (address === 'https://example.com/media/street.jpg') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
    if (address in feeds) return typeof feeds[address] === 'string' ? new Response(feeds[address]) : Response.json(feeds[address]);
    return new Response('', { status: 404 });
  };
  const env = {
    ATPROTO_DID: 'did:web:pds.example.test', ATPROTO_PDS_ORIGIN: 'https://pds.example.test', ATPROTO_SITE_NAMESPACE: 'com.example',
    SITE_ORIGIN: 'https://example.com', PDS_AUTH_TOKEN: 'pds-token', MIRROR_TOKEN: 'button-token',
    MIRROR_SOURCES: JSON.stringify([
      { platform: 'website', feed: 'https://example.com/feed.json', label: 'Writing' },
      { platform: 'Substack', feed: 'https://me.substack.com/feed', label: 'Writing', sublabel: 'Letters' },
    ]),
    MIRROR: { get: async key => (kv.has(key) ? JSON.parse(kv.get(key)) : null), put: async (key, value) => { kv.set(key, value); } },
  };
  return { records, versions, blobs, feeds, get, env, kv };
}

test('one run mirrors every connected platform, and the next run writes only what changed', async () => {
  const { records, blobs, feeds, get, env } = world();
  const first = await mirror(env, { get, now: new Date('2026-06-04T00:00:00Z') });
  assert.deepEqual(first.sources.map(source => [source.platform, source.seen, source.written.map(post => post.key), source.problems]), [
    ['website', 2, ['a-walk', 'second'], []], ['substack', 1, ['substack-a-letter'], []],
  ]);
  assert.deepEqual(records.get('a-walk'), {
    $type: 'com.ohmmmm.post', body: 'The street went quiet.\n\n![A wet street](media:image-1)', publishedAt: '2026-06-01T09:00:00.000Z',
    // A post mirrored from the person's website is at the page it came from.
    canonicalUrl: 'https://example.com/writing/a-walk.html', title: 'A walk', form: 'writing', label: 'Writing',
    media: [{ $type: 'com.ohmmmm.post#image', id: 'image-1', file: { $type: 'blob', mimeType: 'image/jpeg', size: 3, ref: { $link: 'bafk1' } },
      sourceUrl: 'https://example.com/media/street.jpg', alt: 'A wet street' }],
  });
  // A post from another platform says where it first appeared, and is filed where its source says.
  const letter = records.get('substack-a-letter');
  assert.deepEqual([letter.source, letter.label, letter.sublabel, letter.canonicalUrl], [
    { platform: 'substack', uri: 'https://me.substack.com/p/a-letter', id: 's1' }, 'Writing', 'Letters',
    'https://example.com/posts/writing/letters/substack-a-letter',
  ]);

  // Nothing changed: nothing is written, and no image is fetched again.
  const second = await mirror(env, { get });
  assert.deepEqual([second.sources.map(source => source.unchanged), records.size, blobs.length], [[2, 1], 3, 1]);

  // One post is edited on the website: only that record is replaced.
  feeds['https://example.com/feed.json'].items[1].content_html = '<p>More, revised.</p>';
  const third = await mirror(env, { get });
  assert.deepEqual([third.sources[0].written.map(post => post.key), records.size, records.get('second').body], [['second'], 3, 'More, revised.']);
  // A record written again because its source changed says when.
  assert.equal(records.get('second').updatedAt, third.at);

  // What an earlier version wrote under another post type is written again under the shared one.
  const { records: moved, get: fetchMoved, env: older } = world();
  await older.MIRROR.put('mirror:website:second', JSON.stringify({ hash: 'any', at: '2026-01-01T00:00:00.000Z' }));
  const again = await mirror(older, { get: fetchMoved });
  assert.deepEqual([again.sources[0].written.map(post => post.key), moved.get('second').$type, 'updatedAt' in moved.get('second')], [['a-walk', 'second'], 'com.ohmmmm.post', false]);
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

test('distinct same-basename items get stable separate keys and cannot overwrite unowned records', async () => {
  const { env, get, feeds, records, versions } = world();
  const feed = feeds['https://example.com/feed.json'];
  feed.items = [feed.items[1], { ...feed.items[1], id: 'c', url: 'https://example.com/other/second.html', content_html: '<p>Different.</p>' }];
  records.set('second', { body: 'Owner content' }); versions.set('second', 'owner-cid');
  const first = await mirror(env, { get });
  const written = first.sources[0].written.map(item => item.key);
  assert.equal(new Set(written).size, 2); assert.ok(written.every(key => key.startsWith('second-')));
  assert.deepEqual(records.get('second'), { body: 'Owner content' });
  const second = await mirror(env, { get }); assert.equal(second.sources[0].unchanged, 2);
});

test('checkpoints bind the owner, PDS, site and feed instead of skipping another destination', async () => {
  for (const [field, value] of [['ATPROTO_DID', 'did:web:other.example.test'], ['ATPROTO_PDS_ORIGIN', 'https://other-pds.example.test'], ['SITE_ORIGIN', 'https://other-site.example.test']]) {
    const w = world(); await mirror(w.env, { get: w.get });
    let calls = 0;
    const report = await mirror({ ...w.env, [field]: value }, { get: async (...args) => { if (String(args[0]).includes('com.atproto.repo.getRecord')) calls++; return w.get(...args); } });
    assert.ok(calls > 0, field); assert.equal(report.sources[0].unchanged, 0, field);
  }
  const w = world(); await mirror(w.env, { get: w.get });
  w.feeds['https://elsewhere.example.test/feed'] = w.feeds['https://example.com/feed.json'];
  const sources = JSON.parse(w.env.MIRROR_SOURCES); sources[0].feed = 'https://elsewhere.example.test/feed';
  const report = await mirror({ ...w.env, MIRROR_SOURCES: JSON.stringify(sources) }, { get: w.get });
  assert.equal(report.sources[0].unchanged, 0);
});

test('material dates and image metadata changes are mirrored with a read CID; owner edits are refused', async () => {
  const w = world(); await mirror(w.env, { get: w.get });
  w.feeds['https://example.com/feed.json'].items[1].date_published = '2026-06-09T00:00:00Z';
  let swap;
  const report = await mirror(w.env, { get: async (url, options) => {
    if (String(url).endsWith('putRecord')) swap = JSON.parse(options.body).swapRecord;
    return w.get(url, options);
  } });
  assert.ok(swap); assert.deepEqual(report.sources[0].written.map(item => item.key), ['second']);
  assert.equal(w.records.get('second').publishedAt, '2026-06-09T00:00:00.000Z');
  const edited = { ...w.records.get('second'), body: 'An owner edit.' }; w.records.set('second', edited);
  w.feeds['https://example.com/feed.json'].items[1].content_html = '<p>Source edited.</p>';
  const refused = await mirror(w.env, { get: w.get });
  assert.ok(refused.sources[0].problems.some(text => text.includes('outside the mirror')));
  assert.deepEqual(w.records.get('second'), edited);
});

test('malformed URL escapes do not stop healthy items and a failed first item cannot starve later sources', async () => {
  const w = world();
  w.feeds['https://example.com/feed.json'].items.unshift({ id: 'bad', url: 'https://example.com/%GG.html', date_published: '2026-01-01', content_text: 'Bad.' });
  const get = (url, options) => String(url) === 'https://example.com/media/street.jpg' ? new Response('', { status: 503 }) : w.get(url, options);
  const first = await mirror(w.env, { get, budget: 1 });
  assert.equal(first.sources[0].problems.length, 2); assert.equal(w.records.size, 0);
  const second = await mirror(w.env, { get, budget: 1 }); assert.ok(w.records.has('second')); assert.equal(second.sources[0].waiting, 1);
  assert.ok(second.sources[0].problems.some(text => text.includes('waiting to retry')));
  await mirror(w.env, { get, budget: 1 }); assert.ok(w.records.has('substack-a-letter'));
});

test('a PDS write followed by a failed checkpoint is reconciled without creating a second record', async () => {
  const w = world();
  const original = w.env.MIRROR.put; let fail = true;
  w.env.MIRROR.put = async (key, value) => {
    if (fail && key.startsWith('mirror:v2:') && JSON.parse(value).phase === 'complete') { fail = false; throw Error('checkpoint unavailable'); }
    return original(key, value);
  };
  const first = await mirror(w.env, { get: w.get }); assert.ok(first.sources[0].problems.some(text => text.includes('checkpoint unavailable')));
  const second = await mirror(w.env, { get: w.get }); assert.equal(w.records.size, 3); assert.deepEqual(second.sources[0].problems, []);
  assert.equal(second.sources[0].unchanged, 2);
});

// PDS JSON objects need not retain the key order of a submitted record, including in blobs
// and source metadata. Array order and all values remain exactly as stored by the fixture.
function reorderedPds(get) {
  const reorder = value => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]))
      : value;
  return async (url, options) => {
    const response = await get(url, options);
    if (!String(url).includes('com.atproto.repo.getRecord') || !response.ok) return response;
    const data = await response.json();
    const value = reorder(data.value);
    assert.deepEqual(value, data.value);
    return Response.json({ ...data, value });
  };
}

test('mirror updates owned records after recursive PDS JSON key reordering', async () => {
  const w = world(), get = reorderedPds(w.get);
  await mirror(w.env, { get });
  w.feeds['https://example.com/feed.json'].items[0].content_html = '<p>A new street.</p><p><img src="https://example.com/media/street.jpg" alt="A wet street"></p>';
  w.feeds['https://me.substack.com/feed'] = w.feeds['https://me.substack.com/feed'].replace('Dear reader.', 'Dear reader, revised.');
  const changed = await mirror(w.env, { get });
  assert.deepEqual(changed.sources.map(source => source.problems), [[], []]);
  assert.deepEqual(changed.sources.map(source => source.written.map(item => item.key)), [['a-walk'], ['substack-a-letter']]);
  assert.match(w.records.get('a-walk').body, /A new street/);
  assert.equal(w.records.get('substack-a-letter').body, 'Dear reader, revised.');
  assert.equal(w.records.size, 3);
});

test('pending writes reconcile after recursive PDS JSON key reordering without another write', async () => {
  const w = world(), get = reorderedPds(w.get);
  w.env.MIRROR_SOURCES = JSON.stringify([{ platform: 'website', feed: 'https://example.com/feed.json', label: 'Writing' }]);
  w.feeds['https://example.com/feed.json'].items = [w.feeds['https://example.com/feed.json'].items[0]];
  const put = w.env.MIRROR.put; let fail = true;
  w.env.MIRROR.put = async (key, value) => {
    if (fail && key.startsWith('mirror:v2:') && JSON.parse(value).phase === 'complete') { fail = false; throw Error('checkpoint unavailable'); }
    return put(key, value);
  };
  const first = await mirror(w.env, { get });
  assert.match(first.sources[0].problems[0], /checkpoint unavailable/);
  const stateKey = [...w.kv.keys()].find(key => key.startsWith('mirror:v2:'));
  assert.equal(JSON.parse(w.kv.get(stateKey)).phase, 'pending');
  let writes = 0;
  const retried = await mirror(w.env, { get: (url, options = {}) => { if (options.method === 'POST') writes++; return get(url, options); } });
  assert.deepEqual(retried.sources[0].problems, []);
  assert.equal(retried.sources[0].unchanged, 1);
  assert.equal(JSON.parse(w.kv.get(stateKey)).phase, 'complete');
  assert.equal(writes, 0); assert.equal(w.records.size, 1); assert.equal(w.blobs.length, 1);
});

test('a genuine nested owner edit still refuses without writes after recursive PDS JSON key reordering', async () => {
  const w = world(), get = reorderedPds(w.get);
  await mirror(w.env, { get });
  const edited = structuredClone(w.records.get('a-walk'));
  edited.media[0].file.ref.$link = 'owner-edited-blob';
  w.records.set('a-walk', edited); w.versions.set('a-walk', 'owner-edited-cid');
  w.feeds['https://example.com/feed.json'].items[0].content_html = '<p>New source writing.</p>';
  let writes = 0;
  const refused = await mirror(w.env, { get: (url, options = {}) => { if (options.method === 'POST') writes++; return get(url, options); } });
  assert.ok(refused.sources[0].problems.some(problem => problem.includes('outside the mirror')));
  assert.equal(writes, 0);
  assert.deepEqual(w.records.get('a-walk'), edited);
});

test('unambiguous legacy mappings retain their keys; legacy collisions refuse migration', async () => {
  const w = world(); await mirror(w.env, { get: w.get });
  const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const record = w.records.get('second');
  for (const key of [...w.kv.keys()]) if (key.startsWith('mirror:v2:')) w.kv.delete(key);
  w.kv.set('mirror:website:second', JSON.stringify({ hash: await hash([record.title, record.body, [], record.label, '', []]), collection: record.$type }));
  const kept = await mirror(w.env, { get: w.get }); assert.ok(kept.sources[0].written.some(item => item.key === 'second'));
  for (const key of [...w.kv.keys()]) if (key.startsWith('mirror:v2:')) w.kv.delete(key);
  w.feeds['https://example.com/feed.json'].items.push({ ...w.feeds['https://example.com/feed.json'].items[1], id: 'other', url: 'https://example.com/other/second.html' });
  const before = structuredClone(w.records.get('second'));
  const refused = await mirror(w.env, { get: w.get });
  assert.equal(refused.sources[0].problems.filter(text => text.includes('ambiguous legacy')).length, 2);
  assert.deepEqual(w.records.get('second'), before);
});

test('legacy text mappings accept recursively reordered source metadata and retain connect order', async () => {
  const w = world(), now = new Date('2026-06-04T00:00:00Z');
  w.env.X_BEARER_TOKEN = 'x-token';
  w.env.MIRROR_SOURCES = JSON.stringify([{ platform: 'x', userId: 'owner', label: 'Notes' }]);
  const get = async (url, options) => String(url).startsWith('https://api.x.com/2/users/owner/tweets')
    ? Response.json({ data: [{ id: '100', text: 'A plain text note.', created_at: '2026-06-01T09:00:00Z',
      referenced_tweets: [{ type: 'replied_to', id: '12' }, { type: 'quoted', id: '34' }] }] })
    : w.get(url, options);
  await mirror(w.env, { get });
  const record = structuredClone(w.records.get('x-100'));
  assert.deepEqual(record.connect, ['https://x.com/i/web/status/12', 'https://x.com/i/web/status/34']);
  const legacy = async value => {
    for (const key of [...w.kv.keys()]) if (key.startsWith('mirror:v2:')) w.kv.delete(key);
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(
      [value.title ?? '', value.body, [], value.label, value.sublabel ?? '', value.connect]))));
    w.kv.set('mirror:x:x-100', JSON.stringify({ hash: [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''), collection: value.$type }));
  };
  await legacy(record);
  const reordered = reorderedPds(get);
  const adopted = await mirror(w.env, { get: reordered, now });
  assert.deepEqual(adopted.sources[0].problems, []);
  assert.deepEqual(adopted.sources[0].written.map(item => item.key), ['x-100']);
  assert.equal(w.records.size, 1); assert.deepEqual(w.records.get('x-100'), { ...record, updatedAt: now.toISOString() });

  // Even a matching V1 hash cannot adopt a different connect-array order than the source.
  const edited = { ...w.records.get('x-100'), connect: [...record.connect].reverse() };
  w.records.set('x-100', edited); w.versions.set('x-100', 'owner-edited-cid');
  await legacy(edited);
  let writes = 0;
  const refused = await mirror(w.env, { get: (url, options = {}) => { if (options.method === 'POST') writes++; return reordered(url, options); } });
  assert.ok(refused.sources[0].problems.some(problem => problem.includes('ambiguous')));
  assert.equal(writes, 0); assert.deepEqual(w.records.get('x-100'), edited);
});

test('legacy hashes cannot authorize removal of dates, blob identity or extra source/site metadata', async () => {
  for (const extra of [
    { publishedAt: '2026-06-20T00:00:00.000Z' },
    { source: { platform: 'owner', uri: 'https://elsewhere.example.test/' } },
    { site: { $type: 'com.example.postSite', caption: 'Owner text' } },
    { media: [{ id: 'owner-file', file: { ref: { $link: 'owner-cid' } } }] },
  ]) {
    const w = world(); w.feeds['https://example.com/feed.json'].items = [w.feeds['https://example.com/feed.json'].items[1]];
    w.env.MIRROR_SOURCES = JSON.stringify([{ platform: 'website', feed: 'https://example.com/feed.json', label: 'Writing' }]);
    await mirror(w.env, { get: w.get });
    const record = w.records.get('second');
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([record.title, record.body, [], record.label, '', []]))));
    w.kv.set('mirror:website:second', JSON.stringify({ hash: [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''), collection: record.$type }));
    for (const key of [...w.kv.keys()]) if (key.startsWith('mirror:v2:')) w.kv.delete(key);
    const edited = { ...record, ...extra }; w.records.set('second', edited);
    let writes = 0;
    const refused = await mirror(w.env, { get: async (url, options = {}) => { if (options.method === 'POST') writes++; return w.get(url, options); } });
    assert.ok(refused.sources[0].problems.some(text => text.includes('ambiguous')), JSON.stringify(extra));
    assert.equal(writes, 0); assert.deepEqual(w.records.get('second'), edited);
  }
});
