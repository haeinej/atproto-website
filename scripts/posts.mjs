// List every public post with what an agent needs to suggest labels: its identified form, its
// current label and sublabel, and how it opens. Reads the PDS; changes nothing.
import { normalizeArchivePost, pdsConfig } from '../feed/pds.mjs';
import { renderArchivePost } from '../feed/render.mjs';
import { siteVars, commandConfig } from './config.mjs';
import { listRecords } from '../feed/repository.mjs';

try {
  const vars = await siteVars(commandConfig());
  const pds = pdsConfig(vars);
  const posts = [];
  const { records } = await listRecords({ ...pds, maxPages: 200 });
  for (const record of records) {
    const key = record.uri.split('/').at(-1);
    const normal = normalizeArchivePost(record.value, key, pds);
    if (!normal) continue;
    const post = renderArchivePost(normal, pds);
    const attachments = {};
    for (const { kind } of normal.media.values()) attachments[kind] = (attachments[kind] ?? 0) + 1;
    posts.push({
      key, slug: record.value.slug ?? key,
      date: post.createdAt.slice(0, 10),
      form: post.form,
      label: post.label ?? null,
      sublabel: post.sublabel ?? null,
      platform: post.platform,
      name: post.name || null,
      opening: post.text.replace(/\s+/g, ' ').slice(0, 240),
      characters: post.text.length,
      attachments,
    });
  }
  posts.sort((a, b) => a.date.localeCompare(b.date));
  console.log(JSON.stringify(posts, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
