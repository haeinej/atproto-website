import MarkdownIt from 'markdown-it';
import { postLink } from './pds.mjs';

const markdown = new MarkdownIt('commonmark', { html: false });
const escape = markdown.utils.escapeHtml;

markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const uri = token.attrGet('href');
  const href = postLink(uri, env.did, env.collection);
  if (href) {
    env.links.add(uri);
    token.attrSet('href', href);
  }
  return renderer.renderToken(tokens, index, options);
};

markdown.renderer.rules.image = (tokens, index, _options, env) => {
  const token = tokens[index];
  const src = token.attrGet('src');
  const label = token.content;
  const attachment = src?.startsWith('media:') && env.media.get(src.slice('media:'.length));
  if (!attachment) return escape(label);
  const { kind, url, alt, caption, poster } = attachment;
  const srcAttr = `src="${escape(url)}"`;
  let content;
  if (kind === 'image') {
    content = `<img ${srcAttr} alt="${escape(alt || label)}" loading="lazy" decoding="async">`;
  } else if (kind === 'video') {
    const posterAttr = poster ? ` poster="${escape(poster)}"` : '';
    content = `<video ${srcAttr}${posterAttr} controls playsinline preload="none" aria-label="${escape(label || 'Video')}"></video>`;
  } else {
    content = `<audio ${srcAttr} controls preload="none" aria-label="${escape(label || 'Audio')}"></audio>`;
  }
  return caption ? `${content}<span class="attachment-caption">${escape(caption)}</span>` : content;
};

export function renderArchivePost({ body, media, ...post }, { did, collection } = {}) {
  const links = new Set();
  const bodyHtml = markdown.render(body, { media, did, collection, links });
  return { ...post, text: body, bodyHtml, ...(links.size ? { links: [...links] } : {}) };
}

export function mediaReferences(body) {
  const ids = new Set();
  function visit(tokens) {
    for (const token of tokens) {
      if (token.type === 'image') {
        const src = token.attrGet('src');
        if (src?.startsWith('media:')) ids.add(src.slice('media:'.length));
      } else if (token.children) {
        visit(token.children);
      }
    }
  }
  visit(markdown.parse(body, {}));
  return ids;
}

export function postPage(post) {
  const title = escape(post.title || 'Post');
  const date = escape(new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(post.createdAt)));
  const source = post.sourceUrl ? `<a href="${escape(post.sourceUrl)}">Original post</a>` : '';
  const labels = post.tags?.length ? `<span>${escape(post.tags.join(' · '))}</span>` : '';
  const summary = post.summary ? `<meta name="description" content="${escape(post.summary)}">` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="canonical" href="${escape(post.canonicalUrl)}">
  <link rel="stylesheet" href="/notes/notes.css">
  ${summary}
</head>
<body>
  <main class="notes-page">
    <nav aria-label="Posts"><a href="/notes/">All posts</a></nav>
    <article class="post-page">
      <h1>${title}</h1>
      <div class="note-meta">
        <time datetime="${escape(post.createdAt)}">${date}</time>
        ${labels}
        ${source}
      </div>
      <div class="post-body">${post.bodyHtml}</div>
    </article>
  </main>
</body>
</html>`;
}
