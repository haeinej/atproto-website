// Read-only production crawl: npm run home:seo (optional origin argument for staging).
import assert from 'node:assert/strict';
import {parse} from 'parse5';

const origin = process.argv[2] || 'https://ohmmmm.com';
const canonicalOrigin = 'https://ohmmmm.com';
const pages = ['/', '/about', '/support', '/privacy', '/terms', '/delete-account'];
const titles = new Set();
const descriptions = new Set();
const resources = new Set();
function nodes(node) { return [node, ...(node.childNodes || []).flatMap(nodes)]; }
function attr(node, name) { return node.attrs?.find(a => a.name === name)?.value; }
function text(node) { return node.value || (node.childNodes || []).map(text).join(''); }
async function get(path, status = 200) {
  const response = await fetch(new URL(path, origin), {redirect: 'manual'});
  assert.equal(response.status, status, `${path}: HTTP status`);
  return response;
}

const robots = await (await get('/robots.txt')).text();
assert.match(robots, /Sitemap: https:\/\/ohmmmm\.com\/sitemap\.xml/);
assert.doesNotMatch(robots, /Disallow:\s*\/(?:\s|$)/);
const sitemap = await (await get('/sitemap.xml')).text();
assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).sort(), pages.map(p => canonicalOrigin + p).sort());
for (const path of pages) {
  const response = await get(path);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex|none/i);
  const all = nodes(parse(await response.text()));
  const find = (tag, key, value) => all.filter(n => n.tagName === tag && (!key || attr(n, key) === value));
  const meta = name => find('meta', 'name', name).map(n => attr(n, 'content'));
  const og = name => find('meta', 'property', name).map(n => attr(n, 'content'));
  assert.equal(find('h1').length, 1, `${path}: one primary heading`);
  const title = text(find('title')[0]);
  const description = meta('description')[0];
  assert.ok(title && !titles.has(title), `${path}: distinct title`);
  assert.ok(description && !descriptions.has(description), `${path}: distinct description`);
  titles.add(title); descriptions.add(description);
  assert.deepEqual(find('link', 'rel', 'canonical').map(n => attr(n, 'href')), [canonicalOrigin + path]);
  assert.ok(meta('robots').every(v => !/noindex|none/i.test(v)));
  assert.deepEqual(og('og:url'), [canonicalOrigin + path]);
  assert.deepEqual(og('og:title'), [title]);
  assert.deepEqual(meta('twitter:card'), ['summary_large_image']);
  for (const n of all) {
    const href = attr(n, 'href') || attr(n, 'src');
    if (href?.startsWith('/') && !href.startsWith('//')) resources.add(href);
  }
  og('og:image').forEach(url => resources.add(new URL(url).pathname));
  if (path === '/') {
    assert.equal(meta('google-site-verification').length, 1);
    const data = find('script', 'type', 'application/ld+json').map(n => JSON.parse(text(n)));
    const graph = data.flatMap(d => d['@graph'] || [d]);
    for (const type of ['WebSite', 'Organization']) assert.ok(graph.some(d => d['@type'] === type && d.url === canonicalOrigin + '/'));
  }
  console.log(`PASS ${path}: crawlable, canonical, unique metadata, share cards`);
}
await Promise.all([...resources].map(path => get(path)));
for (const path of ['/seo-missing-page-404-check', '/404', '/404.html', '/404/']) {
  const response = await get(path, 404);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.match(await response.text(), /<h1[^>]*>Not found<\/h1>/);
}
const aliases = [['/index.html', '/'], ['/privacy-policy.html', '/privacy']];
for (const p of pages.filter(p => p !== '/')) aliases.push([p + '.html', p], [p + '/', p], [p + '/index.html', p]);
for (const [from, to] of aliases) {
  const response = await get(from + '?ref=seo-check', 308);
  assert.equal(response.headers.get('location'), `${origin}${to}?ref=seo-check`);
}
if (origin === canonicalOrigin) {
  for (const url of ['http://ohmmmm.com/support.html', 'https://www.ohmmmm.com/support.html']) {
    let current = url;
    for (let hop = 0; hop < 3 && current !== canonicalOrigin + '/support'; hop++) {
      const response = await fetch(current, {redirect: 'manual'});
      assert.ok([301, 308].includes(response.status), `${current}: permanent redirect`);
      current = new URL(response.headers.get('location'), current).href;
    }
    assert.equal(current, canonicalOrigin + '/support');
  }
}
console.log(`PASS sitemap, robots, ${resources.size} linked resources, 404s and ${aliases.length} canonical redirects`);
