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
  assert.match(adopted.template, /<img src="https:\/\/cdn\.example\.org\/small\.jpg" alt="\{\{b\.2\.alt\}\}" loading="lazy" width="\{\{b\.2\.width\}\}" height="\{\{b\.2\.height\}\}">/);
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
  assert.match(adoptPage({ record: { media: [{ ...record.media[0], width: 100 }, record.media[1]] } }).findings[0].where, /block 3, image width/);
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
  stops({ record: { body: record.body.replace('**End.**', 'End.[^1]') } }, /Footnotes are not handled/);
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
