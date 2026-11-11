import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageSize } from '../scripts/image-size.mjs';
import { adopt, build, compare, recordBlocks, RenderProblem } from '../scripts/render-engine.mjs';

// A small page in the shape of a real one: a design, two editions, and markup with its own quirks.
// The quirks are deliberate. Each is something a first attempt got wrong.
const page = `<!doctype html>
<html><head><title>A walk — Example</title></head>
<body><nav><a href="/writing/">Writings</a></nav>
<main>
  <div data-edition="en"><article><header><span class="eyebrow">Essay</span>
    <h1>A walk</h1><p class="subtitle">once is never</p>
    <div class="details"><span>June 1, 2026</span></div></header>
    <div class="body"><p>The street went <em>quiet</em> after the rain. </p><p>I read <a href="https://example.org/a" target="_blank" rel="noopener noreferrer">this</a> &amp; <a href="/writing/other.html">that</a>.</p>
<figure class="wide"><a href="https://cdn.example.org/full.jpg" target="_blank"><img src="https://cdn.example.org/small.jpg" alt="A wet street" loading="lazy" width="1456" height="1941"></a></figure><hr><figure class="logo"><img src="/media/logo.png" alt="" decoding="async"></figure><p><strong>End.</strong></p></div></article>
  </div><div data-edition="ko" hidden><article><header><span class="eyebrow">에세이</span>
    <h1>A walk</h1><div class="details"><span>2026년 6월 1일</span></div></header>
    <div class="body-ko"><p>비가 그친 뒤 거리는 조용해졌다.</p></div></article></div>
</main></body></html>
`;
const record = {
  title: 'A walk', subtitle: 'once is never', publishedAt: '2026-06-01T00:00:00.000Z',
  body: [
    'The street went *quiet* after the rain.',
    'I read [this](<https://example.org/a>) & [that](</writing/other.html>).',
    '[![A wet street](media:street)](<https://cdn.example.org/full.jpg>)',
    '---',
    '![](media:logo)',
    '**End.**',
  ].join('\n\n'),
  media: [
    { id: 'street', sourceUrl: 'https://cdn.example.org/small.jpg', width: 1456, height: 1941, original: { ref: { $link: 'bafkstreet' } } },
    { id: 'logo', width: 64, height: 64, original: { ref: { $link: 'bafklogo' } } },
  ],
};
const rules = {
  slots: [
    { name: 'title', pattern: '(<h1>)(.*?)(</h1>)' },
    { name: 'subtitle', pattern: '(<p class="subtitle">)(.*?)(</p>)' },
    { name: 'date', from: 'publishedAt', pattern: '(<div class="details"><span>)(.*?)(</span>)' },
    { name: 'body', pattern: '(<div class="body">)(.*?)(</div></article>)' },
    { name: 'title', pattern: '(<h1>)(.*?)(</h1>)' },
    { name: 'subtitle', optional: true, pattern: '(<p class="subtitle">)(.*?)(</p>)' },
    { name: 'date_ko', from: 'publishedAt', pattern: '(<div class="details"><span>)(.*?)(</span>)', date: { locale: 'ko-KR' } },
  ],
};
const context = { site: 'https://example.com', blobUrl: media => `https://pds.example.com/blob/${media.original.ref.$link}` };
const adoptPage = (changes = {}, options = { images: 'page' }) =>
  adopt(changes.page ?? page, { ...record, ...changes.record }, changes.rules ?? rules, options, context);

test('an adopted page builds back byte for byte, quirks included', () => {
  const adopted = adoptPage();
  assert.deepEqual(adopted.findings, []);
  assert.deepEqual(adopted.repeated, []);
  assert.deepEqual(adopted.blocks, ['p', 'p', 'image', 'hr', 'image', 'p']);
  // The design stays in the template: a stray space before </p>, the line break between two
  // blocks, each image's own class and attributes, and a link's target.
  assert.match(adopted.template, /<p>\{\{b\.0\}\} <\/p><p>\{\{b\.1\}\}<\/p>\n<figure class="wide">/);
  assert.match(adopted.template, /<img src="https:\/\/cdn\.example\.org\/small\.jpg" alt="\{\{b\.2\.alt\}\}" loading="lazy" width="1456" height="1941">/);
  assert.match(adopted.template, /<figure class="logo"><img src="\/media\/logo\.png" alt="\{\{b\.4\.alt\}\}" decoding="async">/);
  // Nothing of the content is left behind, and the other edition's own text is untouched.
  assert.doesNotMatch(adopted.template, /quiet|once is never|June 1/);
  assert.match(adopted.template, /비가 그친 뒤 거리는 조용해졌다/);
  const built = build(adopted.template, record, rules, { images: 'page' }, context, adopted.blocks);
  assert.equal(built, page);
  assert.equal(compare(page, built).verdict, 'identical');
});

test('adopting refuses when the page and the post differ, and names the place', () => {
  // A word changed in the post.
  const reworded = adoptPage({ record: { body: record.body.replace('quiet', 'silent') } });
  assert.equal(reworded.findings.length, 1);
  assert.match(reworded.findings[0].where, /block 1 \(<p>\)/);
  assert.match(reworded.findings[0].page, /quiet/);
  assert.match(reworded.findings[0].post, /silent/);
  // A different date, title, description of an image, size, or link.
  assert.match(adoptPage({ record: { publishedAt: '2026-06-02T00:00:00Z' } }).findings.map(found => found.where).join(), /the date,the date_ko/);
  assert.equal(adoptPage({ record: { title: 'Another' } }).findings.length, 2);
  assert.match(adoptPage({ record: { body: record.body.replace('A wet street', 'A dry street') } }).findings[0].where, /block 3, image alt/);
  // An image's size is the page's own while the page keeps its own file, and the record's once it does not.
  assert.deepEqual(adoptPage({ record: { media: [{ ...record.media[0], width: 100 }, record.media[1]] } }).findings, []);
  assert.match(adoptPage({ record: { media: [{ ...record.media[0], width: 100 }, record.media[1]] } }, { images: 'repository' }).findings.map(found => found.where).join(), /block 3, image width/);
  assert.match(adoptPage({ record: { body: record.body.replace('full.jpg', 'other.jpg') } }).findings[0].where, /block 3, image link/);
  // A block missing from the post, and one missing from the page.
  assert.match(adoptPage({ record: { body: record.body.replace('\n\n**End.**', '') } }).findings[0].problem, /the post's body has ended/);
  assert.match(adoptPage({ record: { body: record.body + '\n\nOne more.' } }).findings[0].problem, /1 more block/);
  // A link written the way the site writes outside links must match that too.
  const plainLinks = adoptPage({ rules: { ...rules, inline: { externalLink: '<a href="{href}">' } } });
  assert.match(plainLinks.findings[0].where, /block 2/);
});

test('content left in the template, or anything unknown, is reported and never dropped', () => {
  // The same paragraph also sits in the other edition: it would go stale when the post changes.
  const copied = page.replace('<p>비가 그친 뒤 거리는 조용해졌다.</p>', '<p>The street went <em>quiet</em> after the rain.</p>');
  assert.deepEqual(adoptPage({ page: copied }).repeated, ['block 1 of the body is still in the template']);
  const stops = (changes, message) => assert.throws(() => adoptPage(changes), error => error instanceof RenderProblem && message.test(error.message));
  stops({ page: page.replace('<hr>', '<table><tr><td>x</td></tr></table>') }, /has a <table>, which the site renderer does not handle/);
  stops({ page: page.replace('<hr>', 'loose words<hr>') }, /Words outside any block/);
  stops({ record: { body: record.body + '\n\n> A quotation.' } }, /does not handle "blockquote_open"/);
  stops({ record: { body: record.body.replace('**End.**', 'End.[^1]') } }, /A footnote mark with no note to go with it/);
  // With the first title gone, the title slot lands on the other edition's, and the next slot is then missing.
  stops({ page: page.replace('<h1>A walk</h1><p class="subtitle">', '<h2>A walk</h2><p class="subtitle">') }, /Could not find where the subtitle sits/);
  stops({ page: page.replace('Essay', '{{Essay}}') }, /already contains "\{\{"/);
  assert.throws(() => recordBlocks('![x](https://example.org/x.png)'), /not one of the post's attachments/);
});

test('where an image points is a setting, and a build can only differ there', () => {
  // The page's own address is kept unless the owner asks for another. A site file has no source.
  assert.throws(() => adoptPage({}, { images: 'source' }), /Attachment logo has no source address/);
  const fromRepository = adoptPage({}, { images: 'repository' });
  assert.match(fromRepository.findings.map(found => found.where).join(), /block 3, image src,block 5, image src/);
  const adopted = adoptPage();
  const template = adopted.template.replace('src="https://cdn.example.org/small.jpg"', 'src="{{b.2.src}}"').replace('src="/media/logo.png"', 'src="{{b.4.src}}"');
  const built = build(template, record, rules, { images: 'repository' }, context, adopted.blocks);
  assert.match(built, /<img src="https:\/\/pds\.example\.com\/blob\/bafkstreet" alt="A wet street"/);
  assert.equal(compare(page, built).verdict, 'image addresses only');
});

test('a build stops when the post has changed shape, and differences are never rounded off', () => {
  const adopted = adoptPage();
  const longer = { ...record, body: record.body + '\n\nOne more.' };
  assert.throws(() => build(adopted.template, longer, rules, { images: 'page' }, context, adopted.blocks), /no longer has the shape/);
  // An edit that keeps the shape builds, and the comparison says exactly where it differs.
  const edited = build(adopted.template, { ...record, body: record.body.replace('quiet', 'silent') }, rules, { images: 'page' }, context, adopted.blocks);
  const result = compare(page, edited);
  assert.equal(result.verdict, 'different');
  assert.deepEqual([result.differences[0].line, /quiet/.test(result.differences[0].page), /silent/.test(result.differences[0].built)], [8, true, true]);
  // A stray space is reported as what it is, not called identical.
  assert.equal(compare(page, page.replace('rain. </p>', 'rain.</p>')).verdict, 'whitespace only');
});

test('an image\'s size is read from the file', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64');
  assert.deepEqual(imageSize(new Uint8Array(png)), { width: 1, height: 1 });
  const gif = Buffer.from('R0lGODlhAgADAIAAAAAAAP///yH5BAEAAAAALAAAAAACAAMAAAICRF4AOw==', 'base64');
  assert.deepEqual(imageSize(new Uint8Array(gif)), { width: 2, height: 3 });
  // JPEG: start, one filler segment, then the frame header with height 5 and width 7.
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 5, 0, 7, 1, 1, 0x11, 0]);
  assert.deepEqual(imageSize(jpeg), { width: 7, height: 5 });
  assert.equal(imageSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), null);
});

test('another edition\'s own words stay with the site, and the site\'s way of writing its links is kept', () => {
  // The second edition has a translated title. Strictly, that is a mismatch.
  const translated = page.replace('<h1>A walk</h1><div class="details">', '<h1>산책</h1><div class="details">');
  assert.deepEqual(adoptPage({ page: translated }).findings.map(found => found.where), ['the title']);
  // Marked as a repeat, it is left in the template as site text, and the report says so.
  const relaxed = { ...rules, slots: rules.slots.map((slot, index) => index === 4 ? { ...slot, whenSame: true } : slot) };
  const adopted = adoptPage({ page: translated, rules: relaxed });
  assert.deepEqual([adopted.findings, adopted.kept], [[], [{ where: 'the title', page: '산책' }]]);
  assert.equal(build(adopted.template, record, relaxed, { images: 'page' }, context, adopted.blocks), translated);
  // The first edition's title is never relaxed: a real mismatch there still stops the adoption.
  assert.equal(adoptPage({ page: translated, rules: relaxed, record: { title: 'Another' } }).findings.length, 1);

  // A post holds full addresses. A site that writes links to itself without its domain gets them back so.
  const full = { body: record.body.replace('</writing/other.html>', '<https://example.com/writing/other.html>') };
  assert.match(adoptPage({ record: full }).findings[0].where, /block 2/);
  assert.deepEqual(adoptPage({ record: full, rules: { ...rules, inline: { ownLinksRelative: true } } }).findings, []);
});

test('headings and lists inside section wrappers are cut and built back', () => {
  const paper = `<main><h1>A paper</h1><div class="body"><section class="part" aria-labelledby="one">
<h2 id="one">1. The problem</h2>
<p>People <strong>rarely</strong> say what they want.</p>
<ul>
  <li><strong>Recall:</strong> can it be found?</li>
  <li>Is it right?</li>
</ul>
</section><section class="part"><h3>A smaller point</h3><ol><li>First.</li><li>Second.</li></ol></section></div></article></main>`;
  const post = {
    title: 'A paper', publishedAt: '2026-01-01T00:00:00Z',
    body: '## 1. The problem\n\nPeople **rarely** say what they want.\n\n- **Recall:** can it be found?\n- Is it right?\n\n### A smaller point\n\n1. First.\n2. Second.',
  };
  const paperRules = { slots: [{ name: 'title', pattern: '(<h1>)(.*?)(</h1>)' }, { name: 'body', pattern: '(<div class="body">)(.*?)(</div></article>)' }] };
  const adopted = adopt(paper, post, paperRules, { images: 'page' }, context);
  assert.deepEqual(adopted.findings, []);
  assert.deepEqual(adopted.blocks, ['h2', 'p', 'ul', 'h3', 'ol']);
  // The section wrappers, the heading's id, and the list's own line breaks are design and stay.
  assert.match(adopted.template, /<section class="part" aria-labelledby="one">\n<h2 id="one">\{\{b\.0\}\}<\/h2>/);
  assert.match(adopted.template, /<ul>\n  <li>\{\{b\.2\.i\.0\}\}<\/li>\n  <li>\{\{b\.2\.i\.1\}\}<\/li>\n<\/ul>/);
  assert.equal(build(adopted.template, post, paperRules, { images: 'page' }, context, adopted.blocks), paper);
  // A list item that differs is named by its position.
  const changed = adopt(paper, { ...post, body: post.body.replace('Is it right?', 'Is it wrong?') }, paperRules, { images: 'page' }, context);
  assert.match(changed.findings[0].where, /block 3, item 2/);
});

test('a paper: an attached file in the header, footnotes, quotes written as references, and links to posts', () => {
  const paper = `<article><header><h1>A paper</h1>
<div class="details"><span>Author</span></div>
<p><a href="/media/paper.pdf" target="_blank" rel="noopener">Read the original PDF ↗</a></p>
</header>
<div class="body"><section>
<p>Discovery<sup><a href="#note-1" aria-label="Footnote 1">1</a></sup> isn&#x27;t &quot;disclosure&quot;<sup><a href="#note-2" aria-label="Footnote 2">2</a></sup>. See <a href="/writing/earlier.html">the earlier piece</a>.</p>
</section>
<section>
<h2 id="notes">Notes</h2>
<ol>
<li id="note-1" value="1">Testing whether alignment exists.</li>
<li id="note-2" value="2">Revealing private context.</li>
</ol>
</section></div>
</article>`;
  const post = {
    title: 'A paper', publishedAt: '2026-01-01T00:00:00Z',
    body: [
      '![Read the original PDF ↗](media:original)',
      'Discovery[^1] isn\'t "disclosure"[^2]. See [the earlier piece](<at://did:web:pds.example.com/com.example.post/earlier>).',
      '## Notes',
      '[^1]: Testing whether alignment exists.\n[^2]: Revealing private context.',
    ].join('\n\n'),
    media: [{ $type: 'com.example.post#file', id: 'original', original: { ref: { $link: 'bafkpaper' } } }],
  };
  const paperRules = {
    posts: { earlier: '/writing/earlier.html' },
    inline: { escapeQuotes: true, footnoteRef: '<sup><a href="#note-{n}" aria-label="Footnote {n}">{n}</a></sup>' },
    slots: [
      { name: 'title', pattern: '(<h1>)(.*?)(</h1>)' },
      // The post's body sits in two places on this page: the file link in the header, then the rest.
      { name: 'body', optional: true, pattern: '(</div>\\n)(<p><a href="[^"]*\\.pdf"[^>]*>[^<]*</a></p>)(\\n</header>)' },
      { name: 'body', pattern: '(<div class="body">)(.*?)(\\s*</div>\\n</article>)' },
    ],
  };
  const where = { ...context, did: 'did:web:pds.example.com', collection: 'com.example.post' };
  const adopted = adopt(paper, post, paperRules, { images: 'page' }, where);
  assert.deepEqual(adopted.findings, []);
  assert.deepEqual(adopted.blocks, ['image', 'p', 'h2', 'ol']);
  assert.match(adopted.template, /<p><a href="\/media\/paper\.pdf" target="_blank" rel="noopener">\{\{b\.0\.label\}\}<\/a><\/p>/);
  assert.match(adopted.template, /<li id="note-2" value="2">\{\{b\.3\.i\.1\}\}<\/li>/);
  assert.equal(build(adopted.template, post, paperRules, { images: 'page' }, where, adopted.blocks), paper);
  // A link to a post the rules give no address for stops, and a missing note is a mismatch.
  assert.throws(() => adopt(paper, post, { ...paperRules, posts: {} }, { images: 'page' }, where), /no address on this site for the post "earlier"/);
  const oneNote = adopt(paper, { ...post, body: post.body.replace('\n[^2]: Revealing private context.', '').replace('"disclosure"[^2]', '"disclosure"') }, paperRules, { images: 'page' }, where);
  assert.ok(oneNote.findings.length >= 2);
});

test('several posts on one page, with the site\'s own language and a row of links', () => {
  const entry = (id, title, rest, body) => `<details id="${id}"><summary><span lang="en">${title} — ${rest}</span><span lang="ko">한국어 제목</span></summary>
<div class="entry"><p lang="en">${body}</p><p lang="ko">한국어 문단.</p>
<div class="links"><a href="https://example.org/${id}" target="_blank" rel="noopener"><span lang="en">Visit ↗</span><span lang="ko">방문 ↗</span></a><a href="media/${id}.pdf"><span lang="en">Read the paper</span><span lang="ko">논문</span></a></div>
</div>
</details>`;
  const shared = '<main>\n' + entry('one', 'First', 'made a thing', 'It <strong>worked</strong>.') + '\n' + entry('two', 'Second', 'made another', 'It also worked.') + '\n</main>';
  const post = (id, title, subtitle, body) => ({
    title, subtitle, publishedAt: '2026-01-01T00:00:00Z',
    body: `${body}\n\n- [Visit ↗](<https://example.org/${id}>)\n- ![Read the paper](media:paper)`,
    media: [{ $type: 'com.example.post#file', id: 'paper', original: { ref: { $link: 'bafk' } } }],
  });
  const posts = { one: post('one', 'First', 'made a thing', 'It **worked**.'), two: post('two', 'Second', 'made another', 'It also worked.') };
  const projectRules = {
    siteText: 'lang="ko"',
    inline: { externalLink: '<a href="{href}" target="_blank" rel="noopener">' },
    slots: [
      { name: 'title', pattern: '(<details id="{place}">.*?<span lang="en">)(.*?)( — )' },
      { name: 'subtitle', pattern: '()(.*?)(</span>)' },
      { name: 'body', pattern: '(<div class="entry">)(.*?)(\\s*</div>\\s*</details>)' },
    ],
  };
  let template = shared;
  const shapes = {};
  for (const id of ['one', 'two']) {
    const adopted = adopt(template, posts[id], projectRules, { images: 'page', prefix: id, vars: { place: id } }, context);
    assert.deepEqual(adopted.findings, [], id);
    ({ template } = adopted);
    shapes[id] = adopted.blocks;
  }
  // Each post's slots carry its name, the Korean stays, and an attached file keeps the page's address.
  assert.match(template, /<span lang="en">\{\{one:title\}\} — \{\{one:subtitle\}\}<\/span><span lang="ko">한국어 제목<\/span>/);
  assert.match(template, /<p lang="en">\{\{two:b\.0\}\}<\/p><p lang="ko">한국어 문단\.<\/p>/);
  assert.match(template, /<a href="\{\{one:b\.1\.h\.0\}\}" target="_blank" rel="noopener"><span lang="en">\{\{one:b\.1\.i\.0\}\}<\/span><span lang="ko">방문 ↗<\/span><\/a><a href="media\/one\.pdf"><span lang="en">\{\{one:b\.1\.i\.1\}\}<\/span>/);
  let built = template;
  for (const id of ['one', 'two']) built = build(built, posts[id], projectRules, { images: 'page', prefix: id }, context, shapes[id]);
  assert.equal(built, shared);
  // A link whose words or address differ is named by its place in the row.
  const other = adopt(shared, { ...posts.one, body: posts.one.body.replace('Visit ↗', 'Go ↗').replace('example.org/one', 'example.org/elsewhere') }, projectRules,
    { images: 'page', prefix: 'one', vars: { place: 'one' } }, context);
  assert.deepEqual(other.findings.map(found => found.where), ['block 2, link 1', 'block 2, link 1 address']);
  // The same place spelled another way matches, and the page keeps its own spelling.
  const spelled = shared.replace('href="https://example.org/one"', 'href="../x/../one-page.html"');
  const sameplace = { ...posts.one, body: posts.one.body.replace('<https://example.org/one>', '<https://example.com/one-page.html>') };
  const kept = adopt(spelled, sameplace, { ...projectRules, inline: { ...projectRules.inline, ownLinksRelative: true, linksRelativeTo: '/work/' } },
    { images: 'page', prefix: 'one', vars: { place: 'one' } }, context);
  assert.deepEqual(kept.findings, []);
  assert.match(kept.template, /<a href="\.\.\/x\/\.\.\/one-page\.html" target="_blank" rel="noopener"><span lang="en">\{\{one:b\.1\.i\.0\}\}/);
  // A link that holds an image is an image, not a row of links.
  const gallery = '<main><h1>T</h1><div class="b"><div class="set"><a class="photo" href="/media/full.png"><img src="/media/a.png" alt="A wall"></a></div></div></article></main>';
  const pictured = adopt(gallery, { title: 'T', publishedAt: '2026-01-01T00:00:00Z', body: '[![A wall](media:a)](</media/full.png>)', media: [{ id: 'a', original: { ref: { $link: 'b' } } }] },
    { slots: [{ name: 'title', pattern: '(<h1>)(.*?)(</h1>)' }, { name: 'body', pattern: '(<div class="b">)(.*?)(</div></article>)' }] }, { images: 'page' }, context);
  assert.deepEqual([pictured.findings, pictured.blocks], [[], ['image']]);
  // Addresses in the page's own folder can be written without the folder.
  assert.equal(recordBlocks('[a](<https://example.com/work/media/a.png>)', { inline: { ownLinksRelative: true, linksRelativeTo: '/work/' } }, context)[0].html, '<a href="media/a.png">a</a>');
});

test('every script parses', async () => {
  // The commands are not imported by these tests, so a slip in one would otherwise go unseen.
  const { readdir } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  for (const folder of ['../scripts/', '../bin/', '../feed/']) {
    for (const file of await readdir(new URL(folder, import.meta.url))) {
      // The path is taken as a file path, so a name with a space in it is checked like any other.
      if (file.endsWith('.mjs')) await promisify(execFile)(process.execPath, ['--check', fileURLToPath(new URL(folder + encodeURIComponent(file), import.meta.url))]);
    }
  }
});

test('a gallery item: a video or image in a wrapper, with the page\'s own smaller copy and caption', () => {
  const gallery = `<main>
  <figure data-year="2025" data-loc="Lisboa" class="item"><span class="frame"><img src="thumb/a.jpg?v=1" width="901" height="1200" alt="" loading="lazy"></span><figcaption>069</figcaption></figure>
  <figure data-year="2026" data-loc="서울" class="item"><span class="frame"><video src="small/b.mp4" width="1080" height="1440" muted loop></video></span><figcaption></figcaption></figure>
</main>`;
  const itemRules = { slots: [
    { name: 'year', from: 'publishedAt', date: { options: { year: 'numeric' } },
      pattern: '(<figure data-year=")([^"]*)("(?= data-loc="[^"]*" class="[^"]*"><span class="frame"><(?:img|video) src="[a-z]+/{file}[?"]))' },
    { name: 'place', from: 'sublabel', pattern: '( data-loc=")([^"]*)(")' },
    { name: 'body', pattern: '(class="[^"]*">)(<span class="frame">.*?</span>)(<figcaption>)' },
  ] };
  const item = (year, place) => ({
    publishedAt: `${year}-01-01T00:00:00Z`, label: 'photographs', sublabel: place, body: '![](media:item)',
    media: [{ id: 'item', width: 1803, height: 2400, original: { ref: { $link: 'bafk' } } }],
  });
  const posts = { a: [item(2025, 'Lisboa'), 'a\\.jpg'], b: [item(2026, '서울'), 'b\\.mp4'] };
  let template = gallery;
  const shapes = {};
  // The second item is adopted first: a pattern finds its own figure, not the first on the page.
  for (const key of ['b', 'a']) {
    const adopted = adopt(template, posts[key][0], itemRules, { images: 'page', prefix: key, vars: { file: posts[key][1] } }, context);
    assert.deepEqual(adopted.findings, [], key);
    ({ template } = adopted);
    shapes[key] = adopted.blocks;
  }
  // The year and place come from the post. The smaller copy, its size, and the caption are the page's.
  assert.match(template, /<figure data-year="\{\{a:year\}\}" data-loc="\{\{a:place\}\}" class="item"><span class="frame"><img src="thumb\/a\.jpg\?v=1" width="901" height="1200" alt="\{\{a:b\.0\.alt\}\}" loading="lazy"><\/span><figcaption>069<\/figcaption>/);
  assert.match(template, /data-loc="\{\{b:place\}\}" class="item"><span class="frame"><video src="small\/b\.mp4"/);
  let built = template;
  for (const key of ['a', 'b']) built = build(built, posts[key][0], itemRules, { images: 'page', prefix: key }, context, shapes[key]);
  assert.equal(built, gallery);
  // A post filed under another place does not match its figure.
  const moved = adopt(gallery, item(2025, 'Porto'), itemRules, { images: 'page', prefix: 'a', vars: { file: 'a\\.jpg' } }, context);
  assert.deepEqual(moved.findings.map(found => found.where), ['the place']);
});

test('a card on an index page takes a post\'s title and facts, and not its body', () => {
  const index = `<main><a class="card" href="/writing/a.html?v=2"><h3>A walk</h3><p class="about">once is never</p><span class="date">june 2026</span></a>
<a class="card" href="/writing/b.html"><h3>Another</h3><p class="about">A line written for this card.</p><span class="date">2026</span></a></main>`;
  const cardRules = { card: true, slots: [
    { name: 'title', pattern: '(<a class="card" href="{href}(?:\\?[^"]*)?">.*?<h3>)(.*?)(</h3>)' },
    { name: 'about', from: 'subtitle', whenSame: true, pattern: '(<p class="about">)(.*?)(</p>)' },
    { name: 'date', from: 'publishedAt', whenSame: true, pattern: '(<span class="date">)(.*?)(</span>)', date: { options: { month: 'long', year: 'numeric' }, lowercase: true } },
  ] };
  const first = adopt(index, record, cardRules, { images: 'page', prefix: 'a', vars: { href: '/writing/a\\.html' } }, context);
  assert.deepEqual([first.findings, first.kept], [[], []]);
  // The second card has a line of its own and a looser date. Both stay the page's, and are reported.
  const other = { ...record, title: 'Another', subtitle: 'a place', publishedAt: '2026-05-01T00:00:00Z' };
  const second = adopt(first.template, other, cardRules, { images: 'page', prefix: 'b', vars: { href: '/writing/b\\.html' } }, context);
  assert.deepEqual(second.findings, []);
  assert.deepEqual(second.kept, [{ where: 'the about', page: 'A line written for this card.' }, { where: 'the date', page: '2026' }]);
  assert.match(second.template, /<h3>\{\{a:title\}\}<\/h3><p class="about">\{\{a:about\}\}<\/p><span class="date">\{\{a:date\}\}<\/span>/);
  assert.match(second.template, /<h3>\{\{b:title\}\}<\/h3><p class="about">A line written for this card\.<\/p><span class="date">2026<\/span>/);
  let built = build(second.template, record, cardRules, { images: 'page', prefix: 'a' }, context, first.blocks);
  built = build(built, other, cardRules, { images: 'page', prefix: 'b' }, context, second.blocks);
  assert.equal(built, index);
  // A card may quote a line of the post's body as its own description. That is the page's text.
  const quoting = index.replace('A line written for this card.', 'The street went <em>quiet</em> after the rain.');
  const quoted = adopt(quoting, { ...other, body: record.body }, cardRules, { images: 'page', prefix: 'b', vars: { href: '/writing/b\\.html' } }, context);
  assert.deepEqual([quoted.findings, quoted.repeated], [[], []]);
  // Without the card setting, a page that leaves out the post's body is a mismatch.
  const { card, ...strict } = cardRules;
  assert.match(adopt(index, record, strict, { images: 'page', prefix: 'a', vars: { href: '/writing/a\\.html' } }, context).findings[0].problem, /more block/);
  // A title that differs is still refused: only the slots marked as repeats are relaxed.
  assert.equal(adopt(index, { ...record, title: 'A stroll' }, cardRules, { images: 'page', prefix: 'a', vars: { href: '/writing/a\\.html' } }, context).findings.length, 1);
});
