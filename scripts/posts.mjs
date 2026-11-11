// List every public post with what an agent needs to suggest labels: its identified form, its
// current label and sublabel, and how it opens. Reads the PDS; changes nothing.
import { normalizeArchivePost, pdsConfig } from '../feed/pds.mjs';
import { renderArchivePost } from '../feed/render.mjs';
import { siteVars } from './config.mjs';

try {
  const vars = await siteVars(process.argv[2]);
  const pds = pdsConfig(vars);
  const url = new URL('/xrpc/com.atproto.repo.listRecords', pds.origin);
  url.search = new URLSearchParams({ repo: pds.did, collection: pds.collection, limit: '100' });
  const posts = [];
  for (let page = 0; page < 200; page++) {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Listing posts failed (HTTP ${response.status})`);
    const data = await response.json();
    for (const record of data.records ?? []) {
      const slug = String(record.uri).split('/').at(-1);
      const normal = normalizeArchivePost(record.value, slug, pds);
      if (!normal) continue;
      const post = renderArchivePost(normal, pds);
      const attachments = {};
      for (const { kind } of normal.media.values()) attachments[kind] = (attachments[kind] ?? 0) + 1;
      posts.push({
        slug,
        date: post.createdAt.slice(0, 10),
        form: post.form,
        label: post.label ?? null,
        sublabel: post.sublabel ?? null,
        platform: post.platform,
        name: post.name,
        opening: post.text.replace(/\s+/g, ' ').slice(0, 240),
        characters: post.text.length,
        attachments,
      });
    }
    if (!data.cursor) break;
    url.searchParams.set('cursor', data.cursor);
  }
  posts.sort((a, b) => a.date.localeCompare(b.date));
  console.log(JSON.stringify(posts, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
