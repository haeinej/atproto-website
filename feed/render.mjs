import MarkdownIt from 'markdown-it';
import { identifyForm } from './forms.mjs';
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
  } else if (kind === 'file') {
    content = `<a class="attachment-file" href="${escape(url)}">${escape(label || 'File')}</a>`;
  } else if (kind === 'video') {
    const posterAttr = poster ? ` poster="${escape(poster)}"` : '';
    content = `<video ${srcAttr}${posterAttr} controls playsinline preload="none" aria-label="${escape(label || 'Video')}"></video>`;
  } else {
    content = `<audio ${srcAttr} controls preload="none" aria-label="${escape(label || 'Audio')}"></audio>`;
  }
  return caption ? `${content}<span class="attachment-caption">${escape(caption)}</span>` : content;
};

const clip = text => [...text.trim()].slice(0, 80).join('');

// The first line of text, or failing that the first image description, names an untitled post.
function firstLine(tokens) {
  let alt = '';
  for (const token of tokens) {
    if (token.type !== 'inline') continue;
    let line = '';
    for (const child of token.children) {
      if (child.type === 'text' || child.type === 'code_inline') line += child.content;
      else if (child.type === 'image') alt ||= child.content;
      else if (child.type.endsWith('break') && line.trim()) break;
    }
    if (line.trim()) return clip(line);
  }
  return clip(alt);
}

export function plainName({ text, createdAt }) {
  return clip(text.split('\n').find(line => line.trim()) ?? '') || dateLabel(createdAt);
}

export function dateLabel(value) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value));
}

// `links` is the post's full set of connections: its `connect` field plus posts linked in the body.
export function renderArchivePost({ body, media, ...post }, { did, collection } = {}) {
  const links = new Set(post.connect);
  const env = { media, did, collection, links };
  const tokens = markdown.parse(body, env);
  const bodyHtml = markdown.renderer.render(tokens, markdown.options, env);
  // A link is known by its page's title, the way a bookmark is.
  const name = post.title || post.link?.title || firstLine(tokens) || dateLabel(post.createdAt);
  // A record that does not say its form has it identified from its content.
  const form = post.form ?? identifyForm({
    title: post.title, facts: tokenFacts(tokens), kinds: [...media?.values() ?? []].map(item => item.kind),
  });
  return { ...post, form, text: body, bodyHtml, name, ...(links.size ? { links: [...links] } : {}) };
}


// What a body holds: its attachments, whether it has words of its own, its links, and whether it
// quotes something. A post's form is checked against this.
export function bodyFacts(body) {
  return tokenFacts(markdown.parse(body, {}));
}

function tokenFacts(tokens) {
  const lists = ['bullet_list_open', 'bullet_list_close', 'ordered_list_open', 'ordered_list_close'];
  const blocks = tokens.filter(token => token.level === 0);
  const facts = {
    media: new Set(), text: false, code: false, links: [], quote: false, bareLink: '',
    onlyList: blocks.length > 0 && blocks.every(token => lists.includes(token.type)),
    // The whole body is a single paragraph; whether that paragraph is one link is settled below.
    soleLink: tokens.length === 3 && tokens[0].type === 'paragraph_open',
  };
  function visit(tokens) {
    for (const token of tokens) {
      if (token.type === 'inline') {
        // A paragraph that is nothing but one link.
        const parts = token.children.filter(child => !child.type.endsWith('break') && (child.type !== 'text' || child.content.trim()));
        if (parts[0]?.type === 'link_open' && parts.at(-1).type === 'link_close' &&
            parts.filter(child => child.type === 'link_open').length === 1) facts.bareLink ||= parts[0].attrGet('href');
      }
      if (token.type === 'image') {
        const src = token.attrGet('src');
        if (src?.startsWith('media:')) facts.media.add(src.slice('media:'.length));
        else facts.text = true;
      } else if (token.type === 'link_open') {
        facts.links.push(token.attrGet('href'));
      } else if (token.type === 'blockquote_open') {
        facts.quote = true;
      } else if (['fence', 'code_block'].includes(token.type)) {
        facts.code = true;
      } else if (['text', 'code_inline'].includes(token.type) && token.content.trim()) {
        facts.text = true;
      } else if (token.children) {
        visit(token.children);
      }
    }
  }
  visit(tokens);
  facts.soleLink &&= Boolean(facts.bareLink);
  return facts;
}

export function postPage(post) {
  const heading = post.title ? `<h1>${escape(post.title)}</h1>` : '';
  const date = escape(dateLabel(post.createdAt));
  const platform = post.sourceUrl
    ? `<a class="note-platform" href="${escape(post.sourceUrl)}">${escape(post.platform)}</a>`
    : `<span class="note-platform">${escape(post.platform)}</span>`;
  const label = post.label ? `<span>${escape([post.label, post.sublabel].filter(Boolean).join(' · '))}</span>` : '';
  const hidden = post.visibility === 'private';
  const { link } = post;
  const card = link ? `<a class="link-card" href="${escape(link.uri)}">${
    link.image ? `<img src="${escape(link.image)}" alt="" loading="lazy" decoding="async">` : ''}<span class="link-text">${
    link.title ? `<strong>${escape(link.title)}</strong>` : ''}${
    link.description ? `<span>${escape(link.description)}</span>` : ''}<small>${escape(link.site)}</small></span></a>` : '';
  const summary = post.summary ? `<meta name="description" content="${escape(post.summary)}">` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(post.name)}</title>
  <link rel="canonical" href="${escape(post.canonicalUrl)}">
  ${post.uri ? `<link rel="alternate" href="${escape(post.uri)}">` : ''}
  <link rel="stylesheet" href="/notes/notes.css">
  ${summary}
  ${hidden ? '<meta name="robots" content="noindex">' : ''}
</head>
<body>
  <main class="notes-page">
    <nav aria-label="Posts"><a href="/notes/">All posts</a></nav>
    <article class="post-page"${post.form ? ` data-form="${escape(post.form)}"` : ''}>
      ${heading}
      <div class="note-meta">
        <time datetime="${escape(post.createdAt)}">${date}</time>
        ${platform}
        ${label}
        ${hidden ? '<span>private</span>' : ''}
      </div>
      <div class="post-body">${post.bodyHtml}</div>
      ${card}
    </article>
  </main>
</body>
</html>`;
}
