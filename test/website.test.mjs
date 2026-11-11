import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { FORMS, formProblems, identifyForm } from '../feed/forms.mjs';
import { ARCHIVE_POST, BSKY_POST } from '../feed/pds.mjs';
import { bodyFacts } from '../feed/render.mjs';
import { servePrivate } from '../feed/private.mjs';
import worker, { refreshNotes, servePost } from '../feed/worker.mjs';

const example = JSON.parse(await readFile(new URL('../examples/image-text-image-video.json', import.meta.url), 'utf8'));
const did = 'did:web:pds.example.test';
const config = {
  ATPROTO_DID: did,
  ATPROTO_PDS_ORIGIN: 'https://pds.example.test',
  INCLUDE_BLUESKY_POSTS: 'false',
};
const uri = `at://${did}/${ARCHIVE_POST}/test-post`;

test('the scheduled feed displays an archive post without a Bluesky copy', async () => {
  let cached;
  const env = { ...config, NOTES: {
    put: async (_key, snapshot) => { cached = JSON.parse(snapshot); },
    get: async () => cached,
  } };
  await refreshNotes(env, async url => {
    assert.equal(url.searchParams.get('collection'), ARCHIVE_POST);
    return Response.json({ records: [{ uri, value: { ...example, tags: ['Photographs', '  Daily notes  ', 'Photographs'] } }] });
  });
  const response = await worker.fetch(new Request('https://example.test/notes.json'), env);
  const { notes } = await response.json();
  assert.equal(response.status, 200);
  assert.equal(notes[0].permalink, '/posts/test-post');
  assert.deepEqual([notes[0].form, notes[0].label, notes[0].sublabel], ['note', 'Photographs', 'Daily notes']);
  assert.match(notes[0].bodyHtml, /<img.*The light changed.*<img.*<video/s);
  assert.match(notes[0].bodyHtml, /https:\/\/pds\.example\.test\/xrpc\/com\.atproto\.sync\.getBlob/);
});

test('an individual post resolves its record and escapes untrusted content', async () => {
  const request = new Request('https://example.test/posts/test-post');
  const result = await servePost(request, config, 'test-post', async url => {
    assert.equal(url.searchParams.get('rkey'), 'test-post');
    return Response.json({ uri, value: {
      ...example, title: '<script>alert(1)</script>', form: 'writing', label: 'Things I make', sublabel: '<script>', body: example.body + '\n\n' +
        '<img src=x onerror=alert(1)> [link](javascript:alert(1)) ![External](https://other.example/pixel.png)',
    } });
  });
  const html = await result.text();
  assert.equal(result.status, 200);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Things I make · &lt;script&gt;/);
  assert.match(html, /data-form="writing"/);
  assert.doesNotMatch(html, /<script|<img src=x|href="javascript:|src="https:\/\/other\.example/);
  const missing = await servePost(request, config, 'test-post', async () =>
    Response.json({ error: 'RecordNotFound' }, { status: 400 }));
  assert.equal(missing.status, 404);
});

test('quoted passages and ordered groups link to the same record addresses', async () => {
  const first = `at://${did}/${ARCHIVE_POST}/trap-of-independency`;
  const second = `at://${did}/${ARCHIVE_POST}/just-buy-that-jacket`;
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

test('a site-owned collection drives the feed, individual pages, and AT links', async () => {
  const collection = 'net.example.journalEntry';
  const recordUri = `at://${did}/${collection}/test-post`;
  const linkedUri = `at://${did}/${collection}/earlier`;
  const value = {
    ...example,
    $type: collection,
    body: example.body + `\n\n[Earlier](${linkedUri})`,
    media: example.media.map(item => ({ ...item, $type: item.$type.replace(ARCHIVE_POST, collection) })),
  };
  let snapshot;
  const env = { ...config, ATPROTO_POST_COLLECTION: collection, NOTES: {
    put: async (_key, body) => { snapshot = JSON.parse(body); },
    get: async () => snapshot,
  } };
  const feedRequest = new Request('https://example.test/notes.json');
  await refreshNotes(env, async url => {
    assert.equal(url.searchParams.get('collection'), collection);
    return Response.json({ records: [{ uri: recordUri, value }] });
  });
  const result = await worker.fetch(feedRequest, env);
  assert.equal(result.status, 200);
  const [post] = (await result.json()).notes;
  assert.deepEqual(post.links, [linkedUri]);
  assert.match(post.bodyHtml, /<img.*href="\/posts\/earlier"/s);
  assert.equal((await worker.fetch(feedRequest, { ...env, ATPROTO_POST_COLLECTION: ARCHIVE_POST })).status, 503);

  const page = await servePost(new Request('https://example.test/posts/test-post'), env, 'test-post', async url => {
    assert.equal(url.searchParams.get('collection'), collection);
    return Response.json({ uri: recordUri, value });
  });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<img.*href="\/posts\/earlier"/s);
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
  const earlier = `at://${did}/${ARCHIVE_POST}/earlier`;
  const later = `at://${did}/${ARCHIVE_POST}/later`;
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
  assert.equal('name' in notes[0] || 'label' in notes[0], false);

  const graph = await (await worker.fetch(new Request('https://example.test/notes/graph.json'), env)).json();
  assert.deepEqual(graph, {
    [earlier]: {
      href: '/posts/earlier', name: 'The street went quiet.', createdAt: '2024-11-06T09:00:00.000Z',
      platform: 'x', form: 'note', label: 'Field notes', branches: [later],
    },
    [later]: {
      href: '/posts/later', name: 'Later', createdAt: '2025-02-01T00:00:00.000Z', platform: 'website', form: 'writing',
      branches: [],
    },
  });

  const page = key => servePost(new Request(`https://example.test/posts/${key}`), env, key, async () =>
    Response.json(records.find(record => record.uri.endsWith(`/${key}`)))).then(response => response.text());
  const untitled = await page('earlier');
  assert.match(untitled, /<title>The street went quiet\.<\/title>/);
  assert.match(untitled, /<a class="note-platform" href="https:\/\/x\.com\/i\/web\/status\/1">x<\/a>/);
  assert.doesNotMatch(untitled, /<h1>|\/posts\/later/);
  assert.doesNotMatch(await page('later'), /\/posts\/earlier|example\.org/);
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
  const earlier = `at://${did}/${ARCHIVE_POST}/earlier`;
  const stored = new Map([
    ['private:draft', { ...example, title: 'A draft', form: 'writing', label: 'Drafts', connect: [earlier], canonicalUrl: 'https://example.test/notes/private/posts/draft' }],
    ['private-blob:' + example.media[0].original.ref.$link, new Uint8Array([1, 2, 3]).buffer],
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
  assert.deepEqual(graph, { [`at://${did}/${ARCHIVE_POST}/draft`]: {
    href: '/notes/private/posts/draft', name: 'A draft', createdAt: '2024-11-06T09:00:00.000Z', platform: 'website',
    form: 'writing', label: 'Drafts', visibility: 'private', links: [earlier], branches: [],
  } });
  const page = await ask('/notes/private/posts/draft', valid);
  const html = await page.text();
  assert.equal(page.headers.get('Cache-Control'), 'private, no-store');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<img src="\/notes\/private\/blob\/draft\/media-1"/);
  const blob = await ask('/notes/private/blob/draft/media-1', valid);
  assert.equal(blob.headers.get('Content-Type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 2, 3]);
  assert.equal((await ask('/notes/private/blob/draft/media-3', valid)).status, 404);
  assert.equal((await ask('/notes/private/', valid)).headers.get('Location'), '/notes/?by=visibility');
  assert.equal((await ask('/notes/private/posts/missing', valid)).status, 404);
});

test('the form is fixed and checked, while labels are the author\'s own', async () => {
  const lexicon = JSON.parse(await readFile(new URL('../lexicons/com/haeinjung/post.json', import.meta.url), 'utf8'));
  const guide = await readFile(new URL('../docs/labels.md', import.meta.url), 'utf8');
  const { form, label, sublabel } = lexicon.defs.main.record.properties;
  assert.deepEqual(form.enum, Object.keys(FORMS));
  assert.equal(label.enum ?? sublabel.enum, undefined);
  for (const name of form.enum) assert.ok(guide.includes('| ' + name + ' |'), `${name} is missing from docs/labels.md`);

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
