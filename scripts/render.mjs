// Rebuild one of your website's own pages from a post's record, leaving the page's design untouched.
//
//   render adopt --page PAGE --slug SLUG --rules RULES --kind KIND --template OUT [--images page|source|repository]
//       Cut a template out of an existing page. Refuses unless every piece it cuts out is exactly
//       what the post's record would put back, and says which piece is not.
//   render build --slug SLUG --template TEMPLATE --rules RULES --kind KIND --out OUT [--against PAGE]
//
// For a page that holds several posts, run each command once per post with --prefix SLUG, feeding
// the result of one run into the next (--page when adopting, --into when building). --set name=value
// fills {name} in a rule's pattern, to say where on the page this post sits.
//       Fill a template from the record. With --against, compare the result with a page and fail
//       on any difference, naming the line.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { pdsConfig, webUrl } from '../feed/pds.mjs';
import { siteVars } from './config.mjs';
import { imageSize } from './image-size.mjs';
import { adopt, build, compare, RenderProblem } from './render-engine.mjs';
import { recordByKey, recordBySlug } from '../feed/repository.mjs';

async function loadRecord(values, pds) {
  if (values.record) {
    const saved = JSON.parse(await readFile(values.record, 'utf8'));
    return saved.record ?? saved.value ?? saved;
  }
  const found = values.key ? await recordByKey(pds, values.key) : await recordBySlug(pds, values.slug);
  if (!found) throw new Error(`No post "${values.key ?? values.slug}" in the repository`);
  return found.value;
}

try {
  const [command] = process.argv.splice(2, 1);
  const { values } = parseArgs({
    options: {
      page: { type: 'string' }, slug: { type: 'string' }, rules: { type: 'string' }, kind: { type: 'string' },
      template: { type: 'string' }, out: { type: 'string' }, against: { type: 'string' }, images: { type: 'string' },
      record: { type: 'string' }, config: { type: 'string' }, key: { type: 'string' },
      prefix: { type: 'string' }, set: { type: 'string', multiple: true, default: [] }, into: { type: 'string' },
    },
  });
  if (!['adopt', 'build'].includes(command) || !values.slug || !values.rules || !values.kind || !values.template) {
    throw new Error('Use: render adopt|build --slug SLUG --rules RULES --kind KIND --template FILE (see the top of scripts/render.mjs)');
  }
  const vars = await siteVars(values.config);
  const pds = pdsConfig(vars);
  const allRules = JSON.parse(await readFile(values.rules, 'utf8'));
  // A kind of page can write things its own way; what it does not say comes from the site's rules.
  const kind = allRules.kinds?.[values.kind] ?? {};
  const rules = { posts: allRules.posts, ...kind, inline: { ...allRules.inline, ...kind.inline } };
  if (!Array.isArray(rules.slots)) throw new Error(`The rules have no kind of page called "${values.kind}"`);
  const record = await loadRecord(values, pds);
  const blobUrl = media => {
    const url = new URL('/xrpc/com.atproto.sync.getBlob', pds.origin);
    url.search = new URLSearchParams({ did: pds.did, cid: media.file.ref.$link });
    return url.href;
  };
  const sidecar = values.prefix ? `${values.template}.${values.prefix}.json` : `${values.template}.json`;
  const imagesFrom = values.images ?? (command === 'build' ? JSON.parse(await readFile(sidecar, 'utf8')).images : 'page');
  // An image's size is needed only when the page takes the image from the record. Older records do
  // not carry it, so it is read from the file.
  for (const media of imagesFrom === 'page' ? [] : record.media ?? []) {
    if (!media.$type?.endsWith('#image') || (media.width && media.height)) continue;
    const response = await fetch(blobUrl(media), { signal: AbortSignal.timeout(60_000) });
    const size = response.ok ? imageSize(new Uint8Array(await response.arrayBuffer())) : null;
    if (size) Object.assign(media, size);
  }
  const context = { blobUrl, site: webUrl(vars.SITE_ORIGIN)?.replace(/\/$/, '') ?? '', did: pds.did, collection: pds.collection };
  // A page holding several posts is adopted and built once for each, with --prefix naming the post.
  const given = Object.fromEntries(values.set.map(pair => pair.split(/=(.*)/s).slice(0, 2)));

  if (command === 'adopt') {
    if (!values.page) throw new Error('adopt needs --page, the existing page to cut the template from');
    const images = imagesFrom;
    if (!['page', 'source', 'repository'].includes(images)) throw new Error('--images is page, source, or repository');
    const page = await readFile(values.page, 'utf8');
    const result = adopt(page, record, rules, { images, prefix: values.prefix, vars: given }, context);
    const report = {
      page: values.page, slug: values.slug, slots: result.slots, blocks: result.blocks.length,
      contentCut: page.length - result.template.replace(/\{\{[\w.]+\}\}/g, '').length,
      matches: result.findings.length === 0, findings: result.findings, keptAsSiteText: result.kept,
      stillInTemplate: result.repeated, linesRepeatingTheTitle: result.titleLines,
    };
    if (result.findings.length || result.repeated.length) {
      console.log(JSON.stringify(report, null, 2));
      throw new Error('Not adopted: the page and the post do not match in the places listed. No template was written.');
    }
    await mkdir(dirname(values.template), { recursive: true });
    await writeFile(values.template, result.template);
    await writeFile(sidecar, JSON.stringify({
      shapeVersion: 2, slug: values.slug, kind: values.kind, images, blocks: result.blocks,
      cutFrom: { page: values.page, sha256: createHash('sha256').update(page).digest('hex') },
    }, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (!values.out) throw new Error('build needs --out, where to write the page');
    const about = JSON.parse(await readFile(sidecar, 'utf8'));
    if (about.shapeVersion !== 2) throw new Error('This template has an older sidecar. Adopt the page again before building; nothing was written.');
    if (about.slug !== values.slug || about.kind !== values.kind) throw new Error('The sidecar belongs to a different post or page kind; adopt this page again');
    // --into is the page being filled, when earlier posts on it have been filled already.
    const built = build(await readFile(values.into ?? values.template, 'utf8'), record, rules, { images: values.images ?? about.images, prefix: values.prefix }, context, about.blocks);
    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, built);
    if (values.against) {
      const result = compare(await readFile(values.against, 'utf8'), built);
      console.log(JSON.stringify({ out: values.out, against: values.against, ...result }, null, 2));
      if (result.verdict !== 'identical') throw new Error(`The built page is not identical to ${values.against}: ${result.verdict}`);
    } else {
      console.log(values.out);
    }
  }
} catch (error) {
  console.error(error instanceof RenderProblem ? `Stopped: ${error.message}` : error.message);
  process.exitCode = 1;
}
