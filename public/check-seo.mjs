import assert from 'node:assert/strict';
const meta=(h,key)=>h.match(new RegExp(`<meta[^>]*(?:property|name)="${key}"[^>]*content="([^"]*)"`))?.[1];
for (const host of ['docs.ohmmmm.com','design.ohmmmm.com']) {
 const origin='https://'+host;
 const sm=await (await fetch(origin+'/sitemap.xml')).text();
 const urls=[...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);
 assert.ok(urls.length>1);
 const titles=new Set(); const descriptions=new Set(); const images=new Set();
 for (const url of urls) {
  const r=await fetch(url,{redirect:'manual'}); assert.equal(r.status,200,url);
  const h=await r.text();const title=h.match(/<title>(.*?)<\/title>/)?.[1];
  assert.ok(title&&!titles.has(title),url+' unique title');titles.add(title);
  const description=meta(h,'description');assert.ok(description&&!descriptions.has(description),url+' unique description');descriptions.add(description);
  assert.ok(!/noindex/i.test(r.headers.get('x-robots-tag') || ''),url+' crawlable');
  assert.ok(h.includes(`rel="canonical" href="${url}"`),url+' canonical');
  assert.equal(meta(h,'og:url'),url);
  for(const k of ['title','description','image']){assert.ok(meta(h,'og:'+k),url+' '+k+' present');assert.equal(meta(h,'og:'+k),meta(h,'twitter:'+k),url+' '+k);}
  assert.equal(meta(h,'twitter:card'),'summary_large_image');images.add(meta(h,'og:image'));
 }
 for(const url of images){ const r=await fetch(url);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/png/);const b=Buffer.from(await r.arrayBuffer());assert.equal(b.readUInt32BE(16),1200);assert.equal(b.readUInt32BE(20),630); }
 for(const p of ['/not-a-real-page-seo-check','/404','/404.html']) {const r=await fetch(origin+p);assert.equal(r.status,404,p);assert.match(r.headers.get('x-robots-tag'),/noindex/);}
 for(const p of ['/','/'+(host.startsWith('docs')?'quick-start':'button')+'?ref=check']) {const r=await fetch('http://'+host+p,{redirect:'manual'});assert.ok([301,308].includes(r.status));assert.equal(r.headers.get('location'),origin+p);}
 console.log('PASS',host,urls.length,'pages: canonical, unique titles, Open Graph/Twitter, images, HTTP redirects, 404s');
 for(const p of host.startsWith('docs')?['/quick-start.html','/quick-start/']:['/button.html','/button/','/overview']) {const r=await fetch(origin+p,{redirect:'manual'});console.log('ALIAS',host,p,r.status,r.headers.get('location'));assert.ok([301,308].includes(r.status));}
}
