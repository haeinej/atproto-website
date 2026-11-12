import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../feed/pds.mjs';
import { filePlace, fileNote, readProperties, recordBody, setProperty, slugOf, splitFile, writeNoteFile } from '../vault/file.mjs';

const did = 'did:web:pds.example.test';
const site = 'https://example.test';
const read = (path, text, extra = {}) => fileNote(path, text, { did, site, collection: POST, seenAt: '2026-11-12T00:00:00.000Z', ...extra });

test('a file is a note: its folders are its label and sublabel, its name its slug, its properties the rest', () => {
  const note = read('Writings/Collisions/Trap of Independency.md', [
    '---', 'title: Trap of independency', 'date: 2026-03-01', 'visibility: public', 'mood: restless', '---', '',
    'The body, in **Markdown**.', '',
  ].join('\n'));
  assert.deepEqual([note.slug, note.label, note.sublabel, note.visibility, note.form, note.problems],
    ['trap-of-independency', 'Writings', 'Collisions', 'public', 'writing', []]);
  assert.deepEqual(note.record, {
    $type: POST, body: 'The body, in **Markdown**.', publishedAt: '2026-03-01T00:00:00.000Z',
    canonicalUrl: 'https://example.test/posts/writings/collisions/trap-of-independency', slug: 'trap-of-independency',
    title: 'Trap of independency', form: 'writing', label: 'Writings', sublabel: 'Collisions',
  });
  // A property the schema has no place for stays in the file and is not published.
  assert.equal(note.properties.mood, 'restless');
  assert.equal(JSON.stringify(note.record).includes('restless'), false);

  // No properties at all: private, untitled, dated from when the file was first seen, filed under `other`.
  const loose = read('loose-thought.md', 'Rain makes a city honest.\n');
  assert.deepEqual([loose.slug, loose.label, loose.visibility, loose.form, loose.record.label, loose.record.publishedAt, loose.problems],
    ['loose-thought', '', 'private', 'note', 'other', '2026-11-12T00:00:00.000Z', []]);
});

test('a file that says nothing clear about who may see it is private', () => {
  for (const [line, problem] of [['visibility: everyone', /visibility is one of/], ['visibility: Public', /visibility is one of/], ['visibility:', null], ['published: true', null]]) {
    const note = read('a.md', `---\n${line}\n---\nWords.`);
    assert.equal(note.visibility, 'private');
    assert.equal(note.problems.some(text => /visibility/.test(text)), Boolean(problem));
  }
  assert.equal(read('a.md', '---\nvisibility: friends\n---\nWords.').visibility, 'friends');
});

test('attachments are pointers to wherever the file is, and the record places them by ID', () => {
  const note = read('Photographs/Lisboa/lisboa.md', [
    '---', 'date: 2026-05-02', '---',
    '![The hill at dusk](https://photos.example.com/lisboa-12.jpg)',
    '![](<../My Photos/lisboa 13.png>)',
    '![[tram.webp|The tram]]',
    '![again](https://photos.example.com/lisboa-12.jpg)',
  ].join('\n'));
  assert.deepEqual(note.attachments, [
    { id: 'lisboa-12', address: 'https://photos.example.com/lisboa-12.jpg', kind: 'image', alt: 'The hill at dusk' },
    { id: 'lisboa-13', address: '../My Photos/lisboa 13.png', kind: 'image' },
    { id: 'tram', address: 'tram.webp', kind: 'image', alt: 'The tram' },
  ]);
  assert.equal(note.record.body, '![The hill at dusk](media:lisboa-12)\n![](media:lisboa-13)\n![The tram](media:tram)\n![again](media:lisboa-12)');
  // A file that only places pictures is a gallery; one picture is an image.
  assert.equal(note.form, 'gallery');
  assert.equal(read('p.md', '![One](one.jpg)').form, 'image');
  assert.equal(read('p.md', '![A clip](clip.mp4)').form, 'video');
  // Two files with the same name in different places get different IDs, and a cloud link that
  // does not say what it is, is taken for an image until it is fetched.
  const two = recordBody('![a](one/photo.jpg) ![b](two/photo.jpg) ![c](https://drive.example.com/file/d/abc123/view)');
  assert.deepEqual(two.attachments.map(item => [item.id, item.kind]), [['photo', 'image'], ['photo-2', 'image'], ['view', null]]);
});

test('links to other notes are read as Obsidian writes them, and nothing inside code is touched', () => {
  const noteAddress = name => ({ 'trap of independency': 'https://example.test/posts/writings/collisions/trap-of-independency' })[name.toLowerCase()];
  const body = [
    'See [[Trap of Independency]] and [[Trap of Independency|the earlier piece]], and [[Missing Note]].', '',
    'Inline `[[not a link]]` and `![[not-a-file.png]]` stay.', '',
    '```', '![[inside-a-block.png]]', '[[also not a link]]', '```',
  ].join('\n');
  const converted = recordBody(body, { noteAddress });
  assert.equal(converted.body, [
    'See [Trap of Independency](https://example.test/posts/writings/collisions/trap-of-independency) and [the earlier piece](https://example.test/posts/writings/collisions/trap-of-independency), and Missing Note.', '',
    'Inline `[[not a link]]` and `![[not-a-file.png]]` stay.', '',
    '```', '![[inside-a-block.png]]', '[[also not a link]]', '```',
  ].join('\n'));
  assert.deepEqual([converted.attachments, converted.unknown], [[], ['Missing Note']]);
  assert.match(read('a.md', body, { noteAddress }).problems.join(' '), /links to "Missing Note", which is not a post in this vault/);
});

test('a file that cannot be published says why, and is still read', () => {
  // A name in another script gives no slug; a slug property supplies one.
  const korean = read('글/서울.md', '서울에 대하여.');
  assert.equal(korean.record, undefined);
  assert.match(korean.problems.join(' '), /does not make a slug\. Add a slug property/);
  const named = read('글/서울.md', '---\nslug: seoul\ntitle: 서울\n---\n서울에 대하여.');
  assert.deepEqual([named.slug, named.label, named.record.canonicalUrl, named.problems], ['seoul', '글', 'https://example.test/posts/%EA%B8%80/seoul', []]);

  assert.match(read('a/b/c/deep.md', 'Words.').problems.join(' '), /at most two folders deep/);
  assert.match(read('a.md', '---\ntitle: T\ndate: not a date\n---\nWords.').problems.join(' '), /must be a valid date/);
  assert.match(read('a.md', '---\ntitle: T\n---\n').problems.join(' '), /nonempty Markdown body/);
  assert.match(read('a.md', '---\ntitle: T\nmeta: {a: 1}\n---\nWords.').problems.join(' '), /"meta" is written in a way that is not understood/);
  // Things that are not notes: an editor's own settings, files kept aside, and anything that is not Markdown.
  for (const path of ['.obsidian/workspace.md', '_media/abc.md', 'Writings/photo.jpg', 'Writings/.hidden.md']) assert.equal(read(path, 'x'), null);
  assert.deepEqual(filePlace('Writings/a.md'), { label: 'Writings', sublabel: '', name: 'a', deeper: false });
  assert.equal(slugOf('Café — déjà vu!'), 'cafe-deja-vu');
});

test('properties are read as Obsidian writes them', () => {
  const { properties, problems } = readProperties([
    'title: "A: title, with #punctuation"', "subtitle: 'It''s here'", 'date: 2026-03-01', 'draft: false', 'count: 3',
    'tags:', '  - writing', '  - "two words"', 'aliases: [one, "two, three"]', 'empty:', '# a comment', 'note: plain text # trailing comment',
  ].join('\n'));
  assert.deepEqual(properties, {
    title: 'A: title, with #punctuation', subtitle: "It's here", date: '2026-03-01', draft: false, count: 3,
    tags: ['writing', 'two words'], aliases: ['one', 'two, three'], empty: null, note: 'plain text',
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(splitFile('No properties here.'), { head: null, body: 'No properties here.' });
  assert.deepEqual(splitFile('---\r\ntitle: T\r\n---\r\nBody').head, 'title: T');
});

test('changing one property leaves every other line of the file as it was', () => {
  const file = '---\ntitle: Trap\n# keep this comment\ntags:\n  - one\n  - two\nvisibility: private\n---\n\nThe body with [[a link]].\n';
  const open = setProperty(file, 'visibility', 'public');
  assert.equal(open, file.replace('visibility: private', 'visibility: public'));
  assert.equal(setProperty(open, 'visibility', 'private'), file);
  // A list is replaced whole, a property can be removed, and a new one is added at the end.
  assert.equal(setProperty(file, 'tags', ['three']), file.replace('  - one\n  - two', '  - three'));
  assert.equal(setProperty(file, 'tags', undefined), file.replace('tags:\n  - one\n  - two\n', ''));
  assert.equal(setProperty(file, 'date', '2026-03-01'), file.replace('visibility: private\n', 'visibility: private\ndate: 2026-03-01\n'));
  // A file with no properties gains a block; a title that YAML would misread is quoted.
  assert.equal(setProperty('Just words.\n', 'title', 'A: title'), '---\ntitle: "A: title"\n---\n\nJust words.\n');
  assert.equal(setProperty('---\ntitle: T\n---\nBody\n', 'title', undefined), 'Body\n');
  assert.equal(setProperty('---\r\ntitle: T\r\n---\r\nBody', 'title', 'U'), '---\r\ntitle: U\r\n---\r\nBody');

  const made = writeNoteFile({ properties: { title: '서울', date: '2026-03-01', visibility: 'private', connect: ['trap'], empty: '' }, body: 'Words.\n\n' });
  assert.equal(made, '---\ntitle: 서울\ndate: 2026-03-01\nvisibility: private\nconnect:\n  - trap\n---\n\nWords.\n');
  assert.deepEqual(readProperties(splitFile(made).head).properties, { title: '서울', date: '2026-03-01', visibility: 'private', connect: ['trap'] });
});

test('a post written as a file and read back is the same post', async () => {
  const { filePost, postFile, postProblems } = await import('../vault/file.mjs');
  const posts = [
    { id: '3lf2abcdefg22', slug: 'trap-of-independency', label: 'Writings', sublabel: 'Collisions', visibility: 'public', title: 'Trap of independency',
      subtitle: 'On needing nobody', date: '2026-03-01', connect: ['why-i-started-ohm', 'https://example.org/a'],
      body: 'The body, with [[A Wikilink]] and ![[an-embed.png]].\n\n```\n---\nnot: properties\n---\n```\n\nTrailing spaces inside a line  \nstay.', properties: {} },
    // The smallest post there is: no label, no title, private.
    { id: '3lf2abcdefg23', slug: 'loose-thought', label: '', sublabel: '', visibility: 'private', body: 'Rain makes a city honest.', properties: {} },
    // Text that YAML would misread unless it is quoted, in several scripts.
    { id: '3lf2abcdefg24', slug: 'seoul', label: '글', sublabel: '', visibility: 'friends', title: '서울: "첫" 번째 #글', date: '2026-03-01T09:30:00.000Z',
      body: '서울에 대하여.', properties: { mood: 'true', year: '2026', 'reading time': 4, pinned: true, tags: ['a, b', "it's", '42'], note: '- not a list' } },
    { id: '3lf2abcdefg25', slug: 'titled-like-a-number', label: 'other', sublabel: '', visibility: 'private', title: '2026', subtitle: 'null', body: '---\n\nA body that starts with a rule.', properties: {} },
    { id: '3lf2abcdefg26', slug: 'a', label: 'Things I make', sublabel: 'ohm — 2026', visibility: 'public', title: "It's a title", body: 'x', properties: { ratio: 0.5, off: false } },
  ];
  for (const post of posts) {
    assert.deepEqual(postProblems(post), [], post.slug);
    const { path, text } = postFile(post);
    const back = filePost(path, text);
    assert.deepEqual(back.problems, [], post.slug);
    assert.deepEqual(back.post, post, post.slug);
    // And once more, so the file itself is stable: the same post always gives the same file.
    assert.deepEqual(postFile(back.post), { path, text }, post.slug);
  }
  assert.deepEqual(posts.map(post => postFile(post).path),
    ['Writings/Collisions/trap-of-independency.md', 'loose-thought.md', '글/seoul.md', 'other/titled-like-a-number.md', 'Things I make/ohm — 2026/a.md']);

  // What cannot be a post's file is refused, with the reason, before anything is written.
  const good = posts[1];
  for (const [change, problem] of [
    [{ id: undefined }, /A post has an ID/],
    [{ id: 'not-an-id' }, /A post has an ID/],
    [{ slug: 'Not A Slug' }, /slug is lowercase Latin letters/],
    [{ label: 'a/b' }, /cannot hold "\/"/],
    [{ label: '.hidden' }, /start with "\." or "_"/],
    [{ sublabel: 'Alone' }, /A sublabel sits inside a label/],
    [{ visibility: 'everyone' }, /visibility is one of/],
    [{ body: ' padded ' }, /no blank space before or after/],
    [{ properties: { title: 'x' } }, /"title" cannot be used as the name of a property/],
    [{ properties: { nested: { a: 1 } } }, /text, a number, yes or no, or a list of those/],
  ]) {
    assert.match(postProblems({ ...good, ...change }).join(' '), problem);
    assert.throws(() => postFile({ ...good, ...change }), problem);
  }
});

test('a file written by hand or in Obsidian is read as a post, and what it says loosely is read safely', async () => {
  const { filePost } = await import('../vault/file.mjs');
  const { post, problems } = filePost('Writings/My First Post.md', [
    '---', 'title:   Spaced out  ', '# a comment', 'tags: [one, two]', 'visibility: Friends', 'date: 2026-03-01', 'empty:', '---', '', '', 'Body.', '', '',
  ].join('\r\n'));
  assert.deepEqual(post, { slug: 'my-first-post', label: 'Writings', sublabel: '', visibility: 'private', title: 'Spaced out', date: '2026-03-01', body: 'Body.', properties: { tags: ['one', 'two'] } });
  assert.match(problems.join(' '), /visibility is one of.*treated as private/);
  assert.equal(filePost('.obsidian/app.md', 'x'), null);
  // A file that has never been synced has no ID. One that carries an ID keeps it whatever the
  // file is renamed to or wherever it is moved, which is how a renamed post is known to be the same post.
  const { newPostId, isPostId, setProperty } = await import('../vault/file.mjs');
  assert.equal(post.id, undefined);
  const id = newPostId(Date.parse('2026-11-12T00:00:00Z'), 7);
  assert.deepEqual([isPostId(id), id.length, newPostId(Date.parse('2026-11-12T00:00:00Z'), 7)], [true, 13, id]);
  assert.ok(newPostId(Date.parse('2026-11-12T00:00:01Z'), 0) > id);
  const synced = setProperty('---\ntitle: First\n---\nBody.\n', 'id', id);
  assert.equal(synced, `---\ntitle: First\nid: ${id}\n---\nBody.\n`);
  const moved = filePost('Essays/2026/A New Name.md', synced).post;
  assert.deepEqual([moved.id, moved.slug, moved.label, moved.sublabel], [id, 'a-new-name', 'Essays', '2026']);
  assert.match(filePost('a.md', '---\nid: 12345\n---\nBody.').problems.join(' '), /id property is not one this vault gave/);
});

test('a published post is kept under its ID, and its connections point at other posts by theirs', async () => {
  const { postRecord } = await import('../vault/file.mjs');
  const ids = { 'why-i-started-ohm': '3lf2abcdefg27', 'an-older-essay': '3lf2abcdefg28' };
  const trap = { id: '3lf2abcdefg22', slug: 'trap-of-independency', label: 'Writings', sublabel: 'Collisions', visibility: 'public', title: 'Trap',
    date: '2026-03-01', connect: ['why-i-started-ohm', 'https://example.org/a', `at://${did}/${POST}/3lf2abcdefg28`, 'gone'], body: 'Words.', properties: {} };
  const made = postRecord(trap, { did, site, postId: slug => ids[slug] });
  assert.equal(made.key, '3lf2abcdefg22');
  assert.deepEqual(made.record.connect, [`at://${did}/${POST}/3lf2abcdefg27`, 'https://example.org/a', `at://${did}/${POST}/3lf2abcdefg28`]);
  assert.deepEqual(made.problems, ['It connects to "gone", which is not a post in this vault']);
  // The address still ends in the slug, which is what a reader sees and what can be edited.
  assert.equal(made.record.canonicalUrl, 'https://example.test/posts/writings/collisions/trap-of-independency');
  // Renamed, it is the same record under the same key, at a new address.
  const renamed = postRecord({ ...trap, slug: 'the-trap', connect: [] }, { did, site, postId: slug => ids[slug] });
  assert.deepEqual([renamed.key, renamed.record.canonicalUrl], ['3lf2abcdefg22', 'https://example.test/posts/writings/collisions/the-trap']);
});
