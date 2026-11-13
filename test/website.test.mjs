import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { FORMS, formProblems, identifyForm } from '../feed/forms.mjs';
import { BSKY_POST, pdsConfig, POST, POST_FIELDS } from '../feed/pds.mjs';
import { bodyFacts } from '../feed/render.mjs';
import { servePrivate } from '../feed/private.mjs';
import { upgradePost } from '../feed/upgrade.mjs';
import worker, { refreshNotes, servePost } from '../feed/worker.mjs';

const example = JSON.parse(await readFile(new URL('../examples/image-text-image-video.json', import.meta.url), 'utf8'));
const did = 'did:web:pds.example.test';
const config = {
  ATPROTO_DID: did,
  ATPROTO_PDS_ORIGIN: 'https://pds.example.test',
  INCLUDE_BLUESKY_POSTS: 'false',
  // The person's own namespace, where their optional schemas are declared.
  ATPROTO_SITE_NAMESPACE: 'com.example',
};
const uri = `at://${did}/${POST}/test-post`;

test('the scheduled feed displays an archive post without a Bluesky copy', async () => {
  let cached;
  const env = { ...config, NOTES: {
    put: async (_key, snapshot) => { cached = JSON.parse(snapshot); },
    get: async () => cached,
  } };
  await refreshNotes(env, async url => {
    assert.equal(url.searchParams.get('collection'), POST);
    return Response.json({ records: [{ uri, value: { ...example, tags: ['Photographs', '  Daily notes  ', 'Photographs'] } }] });
  });
  const response = await worker.fetch(new Request('https://example.test/notes.json'), env);
  const { notes } = await response.json();
  assert.equal(response.status, 200);
  assert.equal(notes[0].permalink, '/posts/photographs/daily-notes/test-post');
  assert.deepEqual([notes[0].form, notes[0].label, notes[0].sublabel], ['note', 'Photographs', 'Daily notes']);
  assert.match(notes[0].bodyHtml, /<img.*The light changed.*<img.*<video/s);
  assert.match(notes[0].bodyHtml, /https:\/\/pds\.example\.test\/xrpc\/com\.atproto\.sync\.getBlob/);
});

test('an individual post resolves its record and escapes untrusted content', async () => {
  const request = new Request('https://example.test/posts/other/test-post');
  const filed = new Request('https://example.test/posts/things-i-make/script/test-post');
  const result = await servePost(filed, config, 'test-post', async url => {
    assert.equal(url.searchParams.get('rkey'), 'test-post');
    return Response.json({ uri, value: {
      ...example, title: '<script>alert(1)</script>', subtitle: 'einmal ist <keinmal>', form: 'writing', label: 'Things I make',
      sublabel: '<script>', body: example.body + '\n\n' +
        '<img src=x onerror=alert(1)> [link](javascript:alert(1)) ![External](https://other.example/pixel.png)',
    } });
  });
  const html = await result.text();
  assert.equal(result.status, 200);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Things I make · &lt;script&gt;/);
  assert.match(html, /data-form="writing"/);
  assert.match(html, /<\/h1><p class="post-subtitle">einmal ist &lt;keinmal&gt;<\/p>/);
  assert.match(html, /<link rel="alternate" href="at:\/\/did:web:pds\.example\.test\/com\.ohmmmm\.post\/test-post">/);
  assert.doesNotMatch(html, /<script|<img src=x|href="javascript:|src="https:\/\/other\.example/);
  const linked = await servePost(request, config, 'test-post', async () => Response.json({ uri, value: {
    ...example, media: [], body: '<https://example.org/a>', form: 'link',
    link: { uri: 'https://www.example.org/a', title: 'A <b>page</b>', description: 'About it.', image: example.media[0].file },
  } }));
  const card = await linked.text();
  assert.match(card, /<title>A &lt;b&gt;page&lt;\/b&gt;<\/title>/);
  assert.match(card, /class="link-card" href="https:\/\/www\.example\.org\/a"><img src="https:\/\/pds\.example\.test\/xrpc\/com\.atproto\.sync\.getBlob[^"]*" alt=""/);
  assert.match(card, /<strong>A &lt;b&gt;page&lt;\/b&gt;<\/strong><span>About it\.<\/span><small>example\.org<\/small>/);
  const noted = await servePost(request, config, 'test-post', async () => Response.json({ uri, value: {
    ...example, media: [], body: 'Discovery[^1] demands disclosure[^2].\n\n[^1]: Testing whether alignment exists.\n[^2]: Revealing private context.',
  } }));
  const footnoted = await noted.text();
  assert.match(footnoted, /Discovery<sup class="footnote-ref"><a href="#fn-test-post-1" id="fnref-test-post-1">1<\/a><\/sup>/);
  assert.match(footnoted, /<li id="fn-test-post-2" class="footnote-item"><p>Revealing private context\.\s*<\/p>/);
  const missing = await servePost(request, config, 'test-post', async url =>
    url.pathname.endsWith('listRecords') ? Response.json({ records: [] }) : Response.json({ error: 'RecordNotFound' }, { status: 400 }));
  assert.equal(missing.status, 404);
});

test('quoted passages and ordered groups link to the same record addresses', async () => {
  const first = `at://${did}/${POST}/trap-of-independency`;
  const second = `at://${did}/${POST}/just-buy-that-jacket`;
  const bluesky = `at://${did}/${BSKY_POST}/3lx2zi2fp2c2u`;
  const body = `1. [First](${first})
2. [Second](${second})

> A short quotation.

[Source](${first}) · [Bluesky](${bluesky})`;
  const snapshot = await refreshNotes({ ...config, NOTES: { put: async () => {} } },
    async () => Response.json({ records: [{ uri, value: { ...example, body } }] }));
  const [post] = snapshot.notes;
  assert.deepEqual(post.links, [first, second, bluesky]);
  assert.match(post.bodyHtml, /<ol>.*href="\/posts\/trap-of-independency".*href="\/posts\/just-buy-that-jacket".*<blockquote>/s);
  assert.match(post.bodyHtml, /href="https:\/\/bsky\.app\/profile\/did:web:pds\.example\.test\/post\/3lx2zi2fp2c2u"/);
});

test('a standalone site serves its root while an attached site uses the posts routes', async () => {
  const assets = { fetch: async request => new Response(new URL(request.url).pathname) };
  const request = new Request('https://example.test/');
  assert.equal((await worker.fetch(request, { ASSETS: assets })).status, 404);
  const response = await worker.fetch(request, { ASSETS: assets, STANDALONE_SITE: 'true' });
  assert.equal(await response.text(), '/index.html');
});

test('every site reads the one shared post type, whatever an older configuration names', async () => {
  // A configuration from before the schema was shared names a post type under the person's domain.
  // Posts are read from the shared type all the same; the older name still gives the namespace.
  const older = 'net.example.journalEntry';
  assert.deepEqual(pdsConfig({ ...config, ATPROTO_SITE_NAMESPACE: undefined, ATPROTO_POST_COLLECTION: older }), {
    did, origin: 'https://pds.example.test', collection: POST, namespace: 'net.example', olderCollection: older,
  });
  assert.deepEqual(pdsConfig({ ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: 'https://pds.example.test' }), {
    did, origin: 'https://pds.example.test', collection: POST,
  });
  assert.throws(() => pdsConfig({ ...config, ATPROTO_SITE_NAMESPACE: 'app.bsky' }), /namespace of your own domain/);
  assert.throws(() => pdsConfig({ ...config, ATPROTO_POST_COLLECTION: 'not a type' }), /every post is com\.ohmmmm\.post/);

  const linkedUri = `at://${did}/${POST}/earlier`;
  const value = { ...example, body: example.body + `\n\n[Earlier](${linkedUri})` };
  let snapshot;
  const env = { ...config, ATPROTO_SITE_NAMESPACE: undefined, ATPROTO_POST_COLLECTION: older, NOTES: {
    put: async (_key, body) => { snapshot = JSON.parse(body); },
    get: async () => snapshot,
  } };
  const feedRequest = new Request('https://example.test/notes.json');
  await refreshNotes(env, async url => {
    assert.equal(url.searchParams.get('collection'), POST);
    return Response.json({ records: [{ uri, value }] });
  });
  const result = await worker.fetch(feedRequest, env);
  assert.equal(result.status, 200);
  const feed = await result.json();
  assert.deepEqual([feed.collection, feed.notes[0].links], [POST, [linkedUri]]);
  assert.match(feed.notes[0].bodyHtml, /<img.*href="\/posts\/earlier"/s);
  // A record of any other type is not a post, and a snapshot built from an older type is not served.
  await refreshNotes(env, async () => Response.json({ records: [{ uri, value: { ...value, $type: older } }] }));
  assert.deepEqual((await (await worker.fetch(feedRequest, env)).json()).notes, []);
  snapshot = { ...snapshot, collection: older };
  assert.equal((await worker.fetch(feedRequest, env)).status, 503);

  const page = await servePost(new Request('https://example.test/posts/other/test-post'), env, 'test-post', async url => {
    assert.equal(url.searchParams.get('collection'), POST);
    return Response.json({ uri, value });
  });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<img.*href="\/posts\/earlier"/s);
});

test('a post saved under an older post type is brought to the shared one', async () => {
  const from = 'com.example.post';
  const blob = { ref: { $link: 'bafkreihdzy2dvbgahbcfwbhwiez7uixljuvceehhq2mhupen255ahrltvu' }, mimeType: 'image/png', size: 116 };
  const old = {
    $type: from, title: 'A walk', body: `Words. [Earlier](at://${did}/${from}/earlier) ![A street](media:a)`,
    publishedAt: '2026-01-01T00:00:00Z', canonicalUrl: 'https://example.test/notes/private/posts/a-walk',
    tags: ['Writings', 'Walks'], summary: 'A short walk.', mood: 'calm',
    connect: [`at://${did}/${from}/earlier`, 'https://example.org/a', `at://did:web:other.test/${from}/theirs`],
    link: { uri: 'https://example.org/a', site: 'Example', image: { ...blob, original: { $type: 'blob', ...blob } } },
    source: { platform: 'substack', uri: 'https://me.substack.com/p/a-walk', author: 'Someone' },
    // Cirrus lists a blob with its type on a nested copy.
    media: [{ $type: `${from}#image`, id: 'a', alt: 'A street', credit: 'Me', original: { ...blob, original: { $type: 'blob', ...blob } } }],
  };
  const clean = { $type: 'blob', ref: blob.ref, mimeType: 'image/png', size: 116 };
  const { record, left, moved } = upgradePost(old, { did, key: 'a-walk', namespace: 'com.example' });
  assert.deepEqual(record, {
    $type: POST, title: 'A walk', body: `Words. [Earlier](at://${did}/${POST}/earlier) ![A street](media:a)`,
    publishedAt: '2026-01-01T00:00:00Z',
    // A post holds its public address, even one that was saved as private.
    canonicalUrl: 'https://example.test/posts/writings/walks/a-walk',
    connect: [`at://${did}/${POST}/earlier`, 'https://example.org/a', `at://did:web:other.test/${from}/theirs`],
    link: { uri: 'https://example.org/a', siteName: 'Example', image: clean },
    source: { platform: 'substack', uri: 'https://me.substack.com/p/a-walk' },
    media: [{ $type: `${POST}#image`, id: 'a', file: clean, alt: 'A street' }],
    // What the shared schema has no place for is kept in the person's own layer.
    site: { summary: 'A short walk.', mood: 'calm', $type: 'com.example.postSite' },
    label: 'Writings', sublabel: 'Walks',
  });
  assert.deepEqual([moved, left], [['summary', 'mood'], ['source.author', 'media a.credit']]);
  // Without a namespace there is no layer of the person's own to keep them in.
  assert.deepEqual(upgradePost(old, { did, key: 'a-walk' }).left, ['summary', 'mood', 'source.author', 'media a.credit']);
  // A post already in the shared schema is left exactly as it is.
  assert.equal(upgradePost(record, { did, key: 'a-walk' }).record, record);
  // The schema file agrees with what the upgrade writes.
  const lexicon = JSON.parse(await readFile(new URL('../lexicons/com/ohmmmm/post.json', import.meta.url), 'utf8'));
  assert.equal(lexicon.id, POST);
  for (const field of Object.keys(record)) assert.ok(field === '$type' || field in lexicon.defs.main.record.properties, field);
  for (const [part, value] of [['link', record.link], ['source', record.source], ['image', record.media[0]]]) {
    for (const field of Object.keys(value)) assert.ok(field === '$type' || field in lexicon.defs[part].properties, `${part}.${field}`);
  }
});

test('existing deployments can include native Bluesky posts', async () => {
  const snapshot = await refreshNotes({ ...config, INCLUDE_BLUESKY_POSTS: 'true', NOTES: { put: async () => {} } },
    async url => Response.json({
      records: url.searchParams.get('collection') === BSKY_POST
        ? [{ uri: `at://${did}/${BSKY_POST}/3lx2zi2fp2c2u`, value: {
            $type: BSKY_POST, text: 'A native post', createdAt: '2025-01-01T00:00:00Z',
          } }] : [],
    }));
  assert.equal(snapshot.notes[0].text, 'A native post');
});

test('connections stay off the pages and shape the tree view', async () => {
  const earlier = `at://${did}/${POST}/earlier`;
  const later = `at://${did}/${POST}/later`;
  const records = [
    { uri: earlier, value: {
      ...example, media: [], body: 'The street went *quiet*.\nA second line.', form: 'note', label: 'Field notes',
      source: { platform: 'x', uri: 'https://x.com/i/web/status/1' }, connect: [later],
    } },
    { uri: later, value: {
      ...example, media: [], title: 'Later', body: 'It rained again.', publishedAt: '2025-02-01T00:00:00Z', form: 'made-up',
      connect: [earlier, 'https://www.example.org/article/', 'javascript:alert(1)', later, earlier],
    } },
  ];
  const stored = new Map();
  const env = { ...config, NOTES: {
    put: async (key, value) => { stored.set(key, JSON.parse(value)); },
    get: async key => stored.get(key),
  } };
  const { notes } = await refreshNotes(env, async () => Response.json({ records }));
  assert.deepEqual(notes[0].connect, [earlier, 'https://www.example.org/article/']);
  assert.deepEqual(notes[0].links, notes[0].connect);
  assert.deepEqual(notes.map(note => note.platform), ['website', 'x']);
  assert.equal('name' in notes[0], false);
  // A post nobody labelled is filed under `other`, so its address still shows a folder.
  assert.deepEqual([notes[0].label, notes[0].permalink], ['other', '/posts/other/later']);

  const graph = await (await worker.fetch(new Request('https://example.test/notes/graph.json'), env)).json();
  assert.deepEqual(graph, {
    [earlier]: {
      href: '/posts/field-notes/earlier', name: 'The street went quiet.', createdAt: '2024-11-06T09:00:00.000Z',
      platform: 'x', form: 'note', label: 'Field notes', branches: [later],
    },
    [later]: {
      href: '/posts/other/later', name: 'Later', createdAt: '2025-02-01T00:00:00.000Z', platform: 'website',
      // A form this software does not know is read as other.
      form: 'other',
      label: 'other', branches: [],
    },
  });

  const open = (path, key = path.split('/').at(-1)) => servePost(new Request(`https://example.test${path}`), env, key, async () =>
    Response.json(records.find(record => record.uri.endsWith(`/${key}`))));
  const page = path => open(path).then(response => response.text());
  // A post's address follows its label. The short address and a stale one are sent on to it.
  for (const path of ['/posts/earlier', '/posts/an-old-label/earlier']) {
    const moved = await open(path);
    assert.equal(moved.status, 308);
    assert.equal(moved.headers.get('Location'), 'https://example.test/posts/field-notes/earlier');
  }
  const untitled = await page('/posts/field-notes/earlier');
  assert.match(untitled, /<title>The street went quiet\.<\/title>/);
  assert.match(untitled, /<a class="note-platform" href="https:\/\/x\.com\/i\/web\/status\/1">x<\/a>/);
  assert.doesNotMatch(untitled, /<h1>|\/posts\/later/);
  assert.doesNotMatch(await page('/posts/other/later'), /\/posts\/earlier|example\.org/);
});

test('private posts stay off the PDS and are served only to a signed-in owner', async () => {
  const team = 'example.cloudflareaccess.com';
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'key-1' };
  const encode = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  const token = async claims => {
    const signed = `${encode({ alg: 'RS256', kid: 'key-1' })}.${encode({
      iss: `https://${team}`, aud: ['audience-1'], exp: Date.now() / 1000 + 60, ...claims,
    })}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(signed));
    return `${signed}.${Buffer.from(signature).toString('base64url')}`;
  };
  const certs = async url => {
    assert.equal(String(url), `https://${team}/cdn-cgi/access/certs`);
    return Response.json({ keys: [jwk] });
  };
  const earlier = `at://${did}/${POST}/earlier`;
  const stored = new Map([
    ['private:draft', { ...example, title: 'A draft', form: 'writing', label: 'Drafts', connect: [earlier], canonicalUrl: 'https://example.test/posts/drafts/draft' }],
    // A private post saved before the post schema was shared, as it was written then.
    ['private:older', {
      ...example, $type: 'com.example.post', title: 'An older draft', form: 'writing', label: 'Drafts',
      canonicalUrl: 'https://example.test/notes/private/posts/older', connect: [`at://${did}/com.example.post/earlier`],
      media: example.media.map(({ file, ...item }) => ({ ...item, $type: item.$type.replace(POST, 'com.example.post'), original: file })),
    }],
    ['private-blob:' + example.media[0].file.ref.$link, new Uint8Array([1, 2, 3]).buffer],
    ['latest', { notes: [] }],
  ]);
  const env = { ...config, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: 'audience-1', NOTES: {
    list: async ({ prefix }) => ({ keys: [...stored.keys()].filter(name => name.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
    get: async key => stored.get(key) ?? null,
  } };
  const ask = async (path, jwt, environment = env) => servePrivate(new Request(`https://example.test${path}`, {
    headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {},
  }), environment, path, certs);

  const valid = await token();
  for (const [jwt, environment] of [
    [undefined, env], [await token({ aud: ['another-app'] }), env], [await token({ exp: Date.now() / 1000 - 60 }), env],
    [valid.slice(0, -4) + 'AAAA', env], [valid, { ...env, ACCESS_AUD: undefined }],
  ]) {
    assert.equal((await ask('/notes/private/graph.json', jwt, environment)).status, 404);
  }
  assert.equal((await worker.fetch(new Request('https://example.test/notes/private/posts/draft'), env)).status, 404);

  const graph = await (await ask('/notes/private/graph.json', valid)).json();
  const listed = name => ({
    href: `/notes/private/posts/${name}`, name: name === 'draft' ? 'A draft' : 'An older draft', createdAt: '2024-11-06T09:00:00.000Z',
    platform: 'website', form: 'writing', label: 'Drafts', visibility: 'private', links: [earlier], branches: [],
  });
  assert.deepEqual(graph, { [`at://${did}/${POST}/draft`]: listed('draft'), [`at://${did}/${POST}/older`]: listed('older') });
  const page = await ask('/notes/private/posts/draft', valid);
  const html = await page.text();
  assert.equal(page.headers.get('Cache-Control'), 'private, no-store');
  assert.match(html, /<meta name="robots" content="noindex">/);
  // A private post holds the address it would have if it were public, and is served from the private area.
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/posts\/drafts\/draft">/);
  // The older one is read as the shared schema has it, attachments included.
  assert.match(await (await ask('/notes/private/posts/older', valid)).text(), /<link rel="canonical" href="https:\/\/example\.test\/posts\/drafts\/older">.*<img src="\/notes\/private\/blob\/older\/media-1"/s);
  assert.equal((await ask('/notes/private/blob/older/media-1', valid)).headers.get('Content-Type'), 'image/png');
  assert.match(html, /<img src="\/notes\/private\/blob\/draft\/media-1"/);
  const blob = await ask('/notes/private/blob/draft/media-1', valid);
  assert.equal(blob.headers.get('Content-Type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 2, 3]);
  assert.equal((await ask('/notes/private/blob/draft/media-3', valid)).status, 404);
  assert.equal((await ask('/notes/private/', valid)).headers.get('Location'), '/notes/?by=visibility');
  assert.equal((await ask('/notes/private/posts/missing', valid)).status, 404);
});

test('the form is checked and its list can grow, while labels are the author\'s own', async () => {
  const lexicon = JSON.parse(await readFile(new URL('../lexicons/com/ohmmmm/post.json', import.meta.url), 'utf8'));
  const guide = await readFile(new URL('../docs/labels.md', import.meta.url), 'utf8');
  const { form, label, sublabel } = lexicon.defs.main.record.properties;
  // The schema lists the forms these tools write without closing the list, so one can be added later.
  assert.deepEqual([form.knownValues, form.enum], [Object.keys(FORMS), undefined]);
  assert.equal(label.enum ?? sublabel.enum, undefined);
  for (const name of form.knownValues) assert.ok(guide.includes('| ' + name + ' |'), `${name} is missing from docs/labels.md`);

  const check = (name, body, kinds = [], title) => formProblems(name, { title, facts: bodyFacts(body), kinds });
  const identify = (body, kinds = [], title) => identifyForm({ title, facts: bodyFacts(body), kinds });
  const photo = '![A wet street](media:a)';
  const cases = [
    ['writing', 'Words, then a picture.\n\n' + photo, ['image', 'video'], 'A title'],
    ['note', 'Just words, with [a link](https://example.org/a) in passing.'],
    ['note', 'A caption.\n\n' + photo, ['image']],
    ['image', photo, ['image']],
    ['gallery', photo + '\n\n![Another](media:b)', ['image', 'image']],
    ['video', '![A clip](media:a)', ['video']],
    ['audio', '![A recording](media:a)', ['audio']],
    ['file', '![The paper](media:a)', ['file']],
    ['media', photo + '\n\n![A recording](media:b)', ['image', 'audio']],
    ['link', 'Worth reading.\n\n<https://example.org/a>'],
    ['embed', 'A song for today.\n\n<https://www.youtube.com/watch?v=abc>'],
    ['embed', '<https://artist.bandcamp.com/album/a>'],
    ['quote', '> A line.\n\n[Source](https://example.org/a)'],
    ['list', '1. [First](https://example.org/a)\n2. [Second](https://example.org/b)', [], 'Collisions'],
    ['code', '```js\nconsole.log(1);\n```', [], 'A snippet'],
  ];
  // Each example is identified as its form, and fits that form.
  for (const [form, body, kinds, title] of cases) {
    assert.equal(identify(body, kinds, title), form, body);
    assert.deepEqual(check(form, body, kinds, title), [], form);
  }
  assert.match(check('writing', 'No title.')[0], /needs a title/);
  assert.match(check('note', 'Titled.', [], 'A title')[0], /has no title/);
  assert.match(check('image', 'A caption.\n\n' + photo, ['image'])[0], /no words of its own/);
  assert.match(check('image', photo, ['video'])[0], /cannot hold video/);
  assert.match(check('image', photo + photo, ['image', 'image'])[0], /several images are a gallery/);
  assert.match(check('gallery', photo, ['image'])[0], /at least 2/);
  assert.match(check('video', '![Clip](https://example.org/a.mp4)').join(), /at least 1/);
  assert.match(check('link', 'No link here.')[0], /needs a link/);
  assert.match(check('embed', '<https://example.org/a>')[0], /something that plays/);
  assert.match(check('quote', '> A line with no source.')[0], /quoted passage and a link/);
  assert.match(check('list', 'A sentence.\n\n- An item')[0], /nothing in its body but a list/);
  assert.match(check('code', 'Words.\n\n```\ncode\n```').join(), /no words of its own/);
  assert.match(check('essays', 'Words.', [], 'A title')[0], /Set the form to one of/);
  assert.match(check(undefined, 'Words.')[0], /Set the form to one of/);
});

test('a post that is a link to a file takes the file in and keeps its source', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64');
  const server = createServer((request, response) => {
    if (request.url === '/street.png') response.writeHead(200, { 'Content-Type': 'image/png' }).end(png);
    else if (request.url === '/photo-123?w=800') response.writeHead(200, { 'Content-Type': 'image/png' }).end(png);
    else if (request.url === '/page.png') response.writeHead(200, { 'Content-Type': 'text/html' }).end('<p>A page</p>');
    else if (request.url === '/an-article') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<html><head><title>Fallback</title>
        <meta property="og:title" content="On walking in weather &amp; why">
        <meta content="A short essay about rain." name="description">
        <meta property="og:site_name" content="Example Review"><meta property="og:image" content="/street.png">
        </head><body>An article</body></html>`);
    }
    else response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const web = `http://127.0.0.1:${server.address().port}`;
  const folder = await mkdtemp(join(tmpdir(), 'publish-test-'));
  try {
    await writeFile(join(folder, 'site.jsonc'), JSON.stringify({ vars: {
      ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: 'https://pds.example.test', SITE_ORIGIN: 'https://example.test',
      ATPROTO_SITE_NAMESPACE: 'com.example',
    } }));
    const preview = async (body, ...options) => {
      await writeFile(join(folder, 'post.md'), body);
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [
        new URL('../scripts/publish.mjs', import.meta.url).pathname, '--config', join(folder, 'site.jsonc'),
        '--file', join(folder, 'post.md'), '--slug', 'a-post', ...options,
      ]);
      return { ...JSON.parse(stdout), stderr };
    };
    const image = await preview(`[A wet street](${web}/street.png)`);
    assert.equal(image.record.form, 'image');
    assert.equal(image.record.body, '![A wet street](media:web)');
    assert.deepEqual(image.fromWeb, { web: `${web}/street.png` });

    // The address need not look like a file: what the other site returns decides it.
    const bare = await preview(`<${web}/photo-123?w=800>`);
    assert.equal(bare.record.form, 'image');
    assert.deepEqual(bare.fromWeb, { web: `${web}/photo-123?w=800` });

    // A link keeps what its page says about itself, and a copy of the page's preview image.
    const article = await preview(`Worth reading.\n\n<${web}/an-article>`);
    assert.equal(article.record.form, 'link');
    assert.deepEqual(article.record.link, {
      uri: `${web}/an-article`, title: 'On walking in weather & why', description: 'A short essay about rain.', siteName: 'Example Review',
    });
    assert.equal(article.linkImage, `${web}/street.png`);
    assert.equal(article.stderr, '');

    // A comment beside it, a page that only looks like a file, or --form link: each stays a link.
    assert.equal((await preview(`Look at this.\n\n<${web}/street.png>`)).record.form, 'link');
    const page = await preview(`<${web}/page.png>`);
    assert.equal(page.record.form, 'link');
    assert.match(page.stderr, /Kept .* as a link: .* text\/html/);
    assert.equal((await preview(`<${web}/street.png>`, '--form', 'link')).fromWeb, undefined);

    const placed = await preview('Words first.\n\n![A wet street](media:street)', '--media', `street=${web}/street.png`);
    assert.equal(placed.record.form, 'note');
    assert.deepEqual(placed.fromWeb, { street: `${web}/street.png` });
  } finally {
    server.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('the author\'s profile has Bluesky\'s fields and falls back to the Bluesky record', async () => {
  // The fields of app.bsky.actor.profile and app.bsky.actor.link as published on 2026-11-12.
  const read = async name => JSON.parse(await readFile(new URL(`../lexicons/com/haeinjung/${name}.json`, import.meta.url), 'utf8')).defs.main;
  const profileSchema = await read('profile');
  assert.equal(profileSchema.key, 'literal:self');
  assert.deepEqual(Object.keys(profileSchema.record.properties).sort(), [
    'avatar', 'banner', 'createdAt', 'description', 'displayName', 'joinedViaStarterPack', 'labels', 'links', 'pinnedPost',
    'pronouns', 'site', 'website',
  ]);
  assert.deepEqual(Object.keys((await read('profileLink')).record.properties).sort(), ['createdAt', 'icon', 'labels', 'title', 'url']);

  const picture = { $type: 'blob', mimeType: 'image/jpeg', size: 9, ref: example.media[0].file.ref };
  const records = {
    'com.example.profile/self': {
      displayName: ' Haein Jung ', pronouns: 'she/her', description: 'i collect fragments.', avatar: picture,
      links: [{ uri: `at://${did}/com.example.profileLink/3lx2zi2fp2c2u`, cid: 'bafy' }, { uri: 'at://did:web:other.test/x.y.z/1', cid: 'bafy' }],
    },
    'com.example.profileLink/3lx2zi2fp2c2u': { url: 'https://www.example.org/me', createdAt: '2026-01-01T00:00:00Z' },
    'app.bsky.actor.profile/self': { displayName: 'From Bluesky', website: 'https://example.org/' },
  };
  const serve = available => async url => {
    const key = `${url.searchParams.get('collection')}/${url.searchParams.get('rkey')}`;
    if (!url.pathname.endsWith('getRecord')) return Response.json({ records: [] });
    return available.includes(key) ? Response.json({ value: records[key] }) : Response.json({ error: 'RecordNotFound' }, { status: 400 });
  };
  const profileFor = async available => {
    let stored;
    const env = { ...config, NOTES: { put: async (_key, value) => { stored = JSON.parse(value); }, get: async () => stored } };
    await refreshNotes(env, serve(available));
    assert.equal('profile' in await (await worker.fetch(new Request('https://example.test/notes.json'), env)).json(), false);
    return (await worker.fetch(new Request('https://example.test/notes/profile.json'), env)).json();
  };
  const own = await profileFor(Object.keys(records));
  assert.deepEqual({ ...own, avatar: own.avatar.split('?')[0] }, {
    name: 'Haein Jung', description: 'i collect fragments.', pronouns: 'she/her',
    avatar: 'https://pds.example.test/xrpc/com.atproto.sync.getBlob', links: [{ url: 'https://www.example.org/me', title: 'example.org' }],
  });
  assert.deepEqual(await profileFor(['app.bsky.actor.profile/self']), { name: 'From Bluesky', website: 'https://example.org/' });
  assert.deepEqual(await profileFor([]), {});
});

test('addresses follow labels in any script, and a folder address shows the list', async () => {
  const { postPath } = await import('../feed/pds.mjs');
  assert.equal(postPath({ label: 'things i make' }, 'ohm'), '/posts/things-i-make/ohm');
  assert.equal(postPath({ label: 'Writings', sublabel: 'Collisions' }, 'trap-of-independency'), '/posts/writings/collisions/trap-of-independency');
  assert.equal(decodeURIComponent(postPath({ label: 'photographs', sublabel: '서울' }, 'a')), '/posts/photographs/서울/a');
  assert.equal(postPath({ label: 'photographs', sublabel: 'Ciudad de México' }, 'a'), '/posts/photographs/ciudad-de-m%C3%A9xico/a');
  assert.equal(postPath({ sublabel: 'No label, so no folder' }, 'a'), '/posts/a');
  const assets = { fetch: async request => new Response(new URL(request.url).pathname) };
  for (const path of ['/posts/', '/posts/writings/', '/posts/writings/collisions/']) {
    assert.equal(await (await worker.fetch(new Request(`https://example.test${path}`), { ASSETS: assets })).text(), '/index.html');
  }
  const bare = await worker.fetch(new Request('https://example.test/posts'), { ASSETS: assets });
  assert.equal(bare.headers.get('Location'), 'https://example.test/posts/');
});

test('the post schema is fixed, and a site adds its own fields only through its optional layer', async () => {
  const schema = JSON.parse(await readFile(new URL('../lexicons/com/ohmmmm/post.json', import.meta.url), 'utf8')).defs.main.record;
  // Adding a field here is a change to the shared schema for every site. A field one site needs
  // belongs in that site's optional schema instead.
  assert.deepEqual(Object.keys(schema.properties), [
    'title', 'subtitle', 'body', 'publishedAt', 'updatedAt', 'canonicalUrl', 'slug', 'form', 'label', 'sublabel', 'connect', 'link',
    'source', 'site', 'media',
  ]);
  assert.deepEqual(Object.keys(schema.properties).sort(), [...POST_FIELDS].sort());
  assert.equal(schema.properties.site.type, 'unknown');

  // The site's layer reaches the site's own pages through the feed, and nothing else shows it.
  const own = { $type: 'com.example.postSite', eyebrow: 'collisions — ep.01', episode: 1 };
  let stored;
  const env = { ...config, NOTES: { put: async (_key, value) => { stored = JSON.parse(value); }, get: async () => stored } };
  await refreshNotes(env, async url => url.pathname.endsWith('listRecords')
    ? Response.json({ records: [{ uri, value: { ...example, media: [], site: own } }] }) : Response.json({ error: 'RecordNotFound' }, { status: 400 }));
  const get = async path => (await worker.fetch(new Request(`https://example.test${path}`), env)).text();
  assert.deepEqual(JSON.parse(await get('/notes.json')).notes[0].site, own);
  assert.doesNotMatch(await get('/notes/graph.json'), /eyebrow|ep\.01/);
  const page = await servePost(new Request('https://example.test/posts/other/test-post'), config, 'test-post', async () =>
    Response.json({ uri, value: { ...example, media: [], site: own } }));
  assert.doesNotMatch(await page.text(), /eyebrow|ep\.01/);

  const folder = await mkdtemp(join(tmpdir(), 'site-layer-'));
  try {
    await writeFile(join(folder, 'site.jsonc'), JSON.stringify({ vars: {
      ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: 'https://pds.example.test', SITE_ORIGIN: 'https://example.test',
      ATPROTO_SITE_NAMESPACE: 'com.example',
    } }));
    await writeFile(join(folder, 'post.md'), 'Words.');
    await writeFile(join(folder, 'postSite.json'), JSON.stringify({ defs: { main: { type: 'object', properties: {
      eyebrow: { type: 'string' }, episode: { type: 'integer' },
    } } } }));
    await writeFile(join(folder, 'more.json'), JSON.stringify({ episode: 1 }));
    const preview = (...options) => promisify(execFile)(process.execPath, [
      new URL('../scripts/publish.mjs', import.meta.url).pathname, '--config', join(folder, 'site.jsonc'),
      '--file', join(folder, 'post.md'), '--slug', 'a-post', '--site-schema', join(folder, 'postSite.json'), ...options,
    ]).then(({ stdout }) => JSON.parse(stdout).record, error => error.stderr.trim());
    assert.deepEqual((await preview('--site', 'eyebrow=collisions — ep.01', '--site', join(folder, 'more.json'))).site, own);
    assert.equal((await preview()).site, undefined);
    assert.match(await preview('--site', 'mood=calm'), /Declare mood in .* the post schema itself is fixed/);
    const profile = (...options) => promisify(execFile)(process.execPath, [
      new URL('../scripts/profile.mjs', import.meta.url).pathname, '--config', join(folder, 'site.jsonc'),
      '--site-schema', join(folder, 'profileSite.json'), ...options,
    ]).then(({ stdout }) => JSON.parse(stdout).record, error => error.stderr.trim());
    await writeFile(join(folder, 'profileSite.json'), JSON.stringify({ defs: { main: { type: 'object', properties: { now: { type: 'string' } } } } }));
    assert.match(await profile('--site', 'bio=i collect fragments'), /bio already has a fixed field in a profile; set it with --description/);
    assert.deepEqual((await profile('--description', 'i collect fragments', '--site', 'now=in Seoul')).site, { $type: 'com.example.profileSite', now: 'in Seoul' });
    assert.match(await preview('--site', 'title=Another'), /title is a fixed field of a post/);
    // Something that means the same as a fixed field is filled there, where other applications read it.
    assert.match(await preview('--site', 'tags=essays'), /tags already has a fixed field in a post; set it with --label/);
    assert.match(await preview('--site', 'episode=one'), /episode must be integer/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('identity starts from the DID, and the site only reads the repository that DID owns', async () => {
  const { didDocumentUrl, resolveIdentity } = await import('../feed/identity.mjs');
  assert.equal(didDocumentUrl('did:web:pds.example.test'), 'https://pds.example.test/.well-known/did.json');
  assert.equal(didDocumentUrl('did:plc:z72i7hdynmk6r22z27h6tvur'), 'https://plc.directory/did:plc:z72i7hdynmk6r22z27h6tvur');
  const document = (hosted = 'https://pds.example.test') => ({
    id: did, alsoKnownAs: ['at://Example.test'],
    verificationMethod: [{ id: `${did}#atproto`, type: 'Multikey', publicKeyMultibase: 'zQ3shKey' }],
    service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: hosted }],
  });
  // A small internet: the DID document, and the handle's two ways of pointing at a DID.
  const net = ({ hosted, wellKnown = did, dns } = {}) => async url => {
    const address = String(url);
    if (address === 'https://pds.example.test/.well-known/did.json') return Response.json(document(hosted));
    if (address === 'https://example.test/.well-known/atproto-did') return wellKnown ? new Response(wellKnown) : new Response('', { status: 404 });
    if (address.startsWith('https://cloudflare-dns.com/')) return Response.json({ Answer: dns ? [{ data: `"did=${dns}"` }] : [] });
    return address.includes('listRecords') ? Response.json({ records: [] }) : Response.json({ error: 'RecordNotFound' }, { status: 400 });
  };
  const whole = { did, handle: 'example.test', pds: 'https://pds.example.test', signingKey: 'zQ3shKey', handleVerified: true };
  assert.deepEqual(await resolveIdentity(did, net()), whole);
  assert.deepEqual(await resolveIdentity('example.test', net()), whole);
  assert.deepEqual(await resolveIdentity('example.test', net({ wellKnown: '', dns: did })), whole);
  // A handle is only trusted when it points back at the DID that claims it.
  assert.equal((await resolveIdentity(did, net({ wellKnown: 'did:web:someone-else.test' }))).handleVerified, false);
  await assert.rejects(resolveIdentity('example.test', net({ wellKnown: '' })), /does not resolve to a DID/);

  let stored;
  const env = { ...config, NOTES: { put: async (_key, value) => { stored = JSON.parse(value); }, get: async () => stored } };
  await refreshNotes(env, net());
  const get = path => worker.fetch(new Request(`https://example.test${path}`), env);
  assert.deepEqual(await (await get('/notes/identity.json')).json(), { did, handle: 'example.test', repository: `at://${did}` });
  assert.equal(await (await get('/.well-known/atproto-did')).text(), did);
  // A configuration pointing at a server the DID does not name is refused.
  await assert.rejects(refreshNotes(env, net({ hosted: 'https://other-pds.test' })), /is hosted at https:\/\/other-pds\.test, not the configured/);
});

test('a post with no title and no words is named by its folder and a number', async () => {
  const photo = (key, publishedAt, filing) => ({ uri: `at://${did}/${POST}/${key}`, value: {
    ...example, body: '![](media:media-1)', media: [example.media[0]], publishedAt, ...filing,
  } });
  const records = [
    photo('b', '2025-01-01T00:00:00Z', { label: 'photographs', sublabel: 'Lisboa' }),
    photo('a', '2025-01-01T00:00:00Z', { label: 'photographs', sublabel: 'Lisboa' }),
    photo('c', '2026-01-01T00:00:00Z', { label: 'photographs', sublabel: 'Lisboa' }),
    photo('d', '2025-01-01T00:00:00Z', { label: 'photographs', sublabel: '서울' }),
    photo('e', '2025-01-01T00:00:00Z', { label: 'photographs' }),
    // A description is a name of its own, so this one takes no number.
    { ...photo('f', '2025-06-01T00:00:00Z', { label: 'photographs', sublabel: 'Lisboa' }), value: {
      ...example, body: '![A tram at dusk](media:media-1)', media: [example.media[0]], publishedAt: '2025-06-01T00:00:00Z',
      label: 'photographs', sublabel: 'Lisboa',
    } },
  ];
  let stored;
  const env = { ...config, NOTES: { put: async (_key, value) => { stored = JSON.parse(value); }, get: async () => stored } };
  await refreshNotes(env, async url => url.pathname.endsWith('listRecords') ? Response.json({ records }) : Response.json({ error: 'RecordNotFound' }, { status: 400 }));
  const graph = await (await worker.fetch(new Request('https://example.test/notes/graph.json'), env)).json();
  const names = Object.fromEntries(Object.entries(graph).map(([address, post]) => [address.split('/').at(-1), post.name]));
  // Numbered oldest first within each folder; posts on the same day keep a fixed order.
  assert.deepEqual(names, { a: 'Lisboa 1', b: 'Lisboa 2', c: 'Lisboa 3', d: '서울 1', e: 'photographs 1', f: 'A tram at dusk' });
  const page = await servePost(new Request('https://example.test/posts/photographs/lisboa/c'), env, 'c', async () => Response.json(records[2]));
  assert.match(await page.text(), /<title>Lisboa 3<\/title>/);
});

test('a private post previews with its public address, and says where the owner reads it', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'private-preview-'));
  try {
    await writeFile(join(folder, 'site.jsonc'), JSON.stringify({ vars: {
      ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: 'https://pds.example.test', SITE_ORIGIN: 'https://example.test',
    } }));
    await writeFile(join(folder, 'post.md'), 'Not yet.');
    const preview = (...options) => promisify(execFile)(process.execPath, [
      new URL('../scripts/publish.mjs', import.meta.url).pathname, '--config', join(folder, 'site.jsonc'),
      '--file', join(folder, 'post.md'), '--slug', 'hello', '--title', 'Hello', '--label', 'Writings', '--date', '2026-01-01', ...options,
    ]).then(({ stdout }) => JSON.parse(stdout), error => error.stderr.trim());
    const open = await preview();
    const closed = await preview('--private');
    assert.equal(open.record.$type, POST);
    // The record is the same either way, so making the post public later moves it without rewriting it.
    assert.deepEqual(closed.record, open.record);
    assert.equal(closed.record.canonicalUrl, 'https://example.test/posts/writings/hello');
    assert.deepEqual([closed.visibility, closed.privateUrl, open.privateUrl], ['private', 'https://example.test/notes/private/posts/hello', undefined]);
    // Limits count characters, so they are the same in any script.
    assert.equal((await preview('--label', '글'.repeat(100))).record.label, '글'.repeat(100));
    assert.equal((await preview('--title', '글'.repeat(300))).record.title, '글'.repeat(300));
    assert.match(await preview('--title', '글'.repeat(301)), /--title can be at most 300 characters/);
    // A site with no namespace of its own cannot add its own fields yet.
    assert.match(await preview('--site', 'mood=calm'), /Set ATPROTO_SITE_NAMESPACE/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('migrate copies posts from an older post type, and changes nothing until told to publish', async () => {
  const from = 'com.example.post';
  const blob = { ref: { $link: 'bafkreihdzy2dvbgahbcfwbhwiez7uixljuvceehhq2mhupen255ahrltvu' }, mimeType: 'image/png', size: 116 };
  const older = key => ({ uri: `at://${did}/${from}/${key}`, value: {
    $type: from, title: key, body: `Words. ![A street](media:a)`, publishedAt: '2026-01-01T00:00:00Z',
    canonicalUrl: `https://example.test/writing/${key}.html`, tags: ['Writings'], summary: 'Short.',
    media: [{ $type: `${from}#image`, id: 'a', original: { ...blob, original: { $type: 'blob', ...blob } } }],
  } });
  const repository = { [from]: [older('one'), older('two'), older('three')], [POST]: [{ uri: `at://${did}/${POST}/two`, value: { $type: POST } }] };
  const written = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const send = (body, status = 200) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    let sent = '';
    for await (const chunk of request) sent += chunk;
    if (url.pathname.endsWith('listRecords')) {
      // Two to a page, to check that every page is read.
      const all = repository[url.searchParams.get('collection')] ?? [];
      const start = Number(url.searchParams.get('cursor') ?? 0);
      return send({ records: all.slice(start, start + 2), ...(start + 2 < all.length ? { cursor: String(start + 2) } : {}) });
    }
    if (url.pathname.endsWith('createSession')) {
      return JSON.parse(sent).password === 'app-password' ? send({ did, accessJwt: 'token' }) : send({}, 401);
    }
    if (url.pathname.endsWith('createRecord') && request.headers.authorization === 'Bearer token') {
      const { collection, rkey, record } = JSON.parse(sent);
      written.push({ collection, rkey, record });
      return send({ uri: `at://${did}/${collection}/${rkey}` });
    }
    send({}, 404);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const folder = await mkdtemp(join(tmpdir(), 'migrate-test-'));
  try {
    // An older configuration: it names the post type, which is where --from and the namespace come from.
    await writeFile(join(folder, 'site.jsonc'), JSON.stringify({ vars: {
      ATPROTO_DID: did, ATPROTO_PDS_ORIGIN: `http://127.0.0.1:${server.address().port}`, SITE_ORIGIN: 'https://example.test',
      ATPROTO_POST_COLLECTION: from,
    } }));
    const run = (options = [], env = {}) => promisify(execFile)(process.execPath, [
      new URL('../scripts/migrate.mjs', import.meta.url).pathname, '--config', join(folder, 'site.jsonc'), ...options,
    ], { env: { ...process.env, ATPROTO_APP_PASSWORD: '', ...env } }).then(({ stdout }) => JSON.parse(stdout), error => error.stderr.trim());

    const preview = await run();
    assert.deepEqual(preview, {
      from, to: POST, repository: `at://${did}`, found: 3, toCopy: 2, copied: 0, alreadyThere: 1, cannotBeCopied: 0,
      movedToSite: { summary: 3 }, leftBehind: {}, problems: {}, written: false,
    });
    assert.deepEqual(written, []);
    const one = await run(['--key', 'one']);
    assert.deepEqual(one.record, {
      $type: POST, title: 'one', body: 'Words. ![A street](media:a)', publishedAt: '2026-01-01T00:00:00Z',
      canonicalUrl: 'https://example.test/writing/one.html',
      media: [{ $type: `${POST}#image`, id: 'a', file: { $type: 'blob', ...blob } }],
      site: { summary: 'Short.', $type: 'com.example.postSite' }, label: 'Writings',
    });
    assert.match(await run(['--key', 'missing']), /No post "missing"/);
    assert.match(await run(['--from', POST]), /already where they belong/);
    // Writing needs the account's app password, and nothing is written without it.
    assert.match(await run(['--publish']), /Set ATPROTO_APP_PASSWORD/);
    assert.deepEqual(written, []);

    const done = await run(['--publish'], { ATPROTO_APP_PASSWORD: 'app-password' });
    assert.deepEqual([done.copied, done.toCopy, done.alreadyThere, done.written], [2, 0, 1, true]);
    // The posts keep their keys, the one already there is left alone, and nothing is deleted.
    assert.deepEqual(written.map(({ collection, rkey }) => [collection, rkey]), [[POST, 'one'], [POST, 'three']]);
    assert.deepEqual(written[0].record, one.record);
  } finally {
    server.close();
    await rm(folder, { recursive: true, force: true });
  }
});
