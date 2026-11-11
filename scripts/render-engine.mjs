// Rebuild a website's own page from a post's record, leaving the page's design untouched.
//
//   record     the content, from the repository
//   template   the page's own markup with the content cut out, and everything only the site has
//   rules      how this site writes things: where content sits on a kind of page, and its inline markup
//
// `adopt` cuts a template out of an existing page. It does not trust itself: every piece it cuts out
// is compared with what the record would put back, and it refuses to hand over a template unless
// each one matches exactly. `build` fills a template from a record. A page that has been adopted
// therefore builds back byte for byte, and any difference is found at the piece that caused it.
import MarkdownIt from 'markdown-it';
import footnotes from 'markdown-it-footnote';

const markdown = new MarkdownIt('commonmark', { html: false }).use(footnotes);
const VOID = new Set(['img', 'br', 'hr', 'input', 'source', 'meta', 'link']);
const TEXT_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const WRAPPERS = new Set(['section', 'div', 'article']);

export class RenderProblem extends Error {}
const stop = message => { throw new RenderProblem(message); };

const escapeText = (text, rules) => {
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  // Some pages also write quotation marks and apostrophes as character references.
  return rules?.inline?.escapeQuotes ? escaped.replaceAll('"', '&quot;').replaceAll("'", '&#x27;') : escaped;
};
const escapeAttribute = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

// ---------------------------------------------------------------------------------------------
// The record's body, as an ordered list of blocks in the site's own inline markup.
// ---------------------------------------------------------------------------------------------
// How the site writes an address. A site that leaves its own domain off links to itself gets them
// back that way: https://example.com/a.html is written /a.html.
function written(href, rules, context) {
  const { site = '', did, collection } = context ?? {};
  // A link to one of the owner's posts is written as that post's address on this site.
  const post = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(href);
  if (post && post[1] === did && post[2] === collection) {
    return rules.posts?.[post[3]] ?? stop(`The rules give no address on this site for the post "${post[3]}"`);
  }
  const local = rules.inline?.ownLinksRelative && site && href.startsWith(`${site}/`) ? href.slice(site.length) : href;
  // A page may write addresses in its own folder without the folder: /work/media/a.png as media/a.png.
  const folder = rules.inline?.linksRelativeTo;
  return folder && local.startsWith(folder) ? local.slice(folder.length) : local;
}

const INLINE = {
  em: ['<em>', '</em>'], strong: ['<strong>', '</strong>'], break: '<br>',
  link: '<a href="{href}">', externalLink: '<a href="{href}" target="_blank" rel="noopener noreferrer">',
  footnoteRef: '<sup><a href="#fn{n}">{n}</a></sup>',
};

function renderInline(children, rules, context) {
  const inline = { ...INLINE, ...rules.inline };
  let out = '';
  for (const token of children) {
    if (token.type === 'text') {
      if (/\[\^[^\]]+\]/.test(token.content)) stop(`A footnote mark with no note to go with it: ${token.content.slice(0, 40)}`);
      out += escapeText(token.content, rules);
    } else if (token.type === 'footnote_ref') {
      out += inline.footnoteRef.replaceAll('{n}', escapeAttribute(String(token.meta.label ?? token.meta.id + 1)));
    } else if (token.type === 'em_open') out += inline.em[0];
    else if (token.type === 'em_close') out += inline.em[1];
    else if (token.type === 'strong_open') out += inline.strong[0];
    else if (token.type === 'strong_close') out += inline.strong[1];
    else if (token.type === 'hardbreak') out += inline.break;
    else if (token.type === 'softbreak') out += '\n';
    else if (token.type === 'link_open') {
      const href = written(token.attrGet('href'), rules, context);
      // A link that leaves the site is written the way the site writes outside links.
      const outside = /^[a-z][a-z0-9+.-]*:/i.test(href) && !(context?.site && href.startsWith(context.site));
      out += (outside ? inline.externalLink : inline.link).replace('{href}', escapeAttribute(href));
    } else if (token.type === 'link_close') out += '</a>';
    else stop(`The site renderer does not handle "${token.type}" inside a line; nothing is dropped silently`);
  }
  return out;
}

export function recordBlocks(body, rules = {}, context = {}) {
  const tokens = markdown.parse(body, {});
  const blocks = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'paragraph_open' || token.type === 'heading_open') {
      const children = tokens[index + 1].children;
      const meaningful = children.filter(child => child.type !== 'softbreak');
      const image = meaningful.find(child => child.type === 'image');
      const linked = meaningful.length === 3 && meaningful[0].type === 'link_open' && meaningful[1].type === 'image';
      if (image && (meaningful.length === 1 || linked)) {
        const src = image.attrGet('src') ?? '';
        if (!src.startsWith('media:')) stop(`An image that is not one of the post's attachments: ${src}`);
        blocks.push({
          type: 'image', id: src.slice('media:'.length), alt: image.content,
          ...(linked ? { href: written(meaningful[0].attrGet('href'), rules, context) } : {}),
        });
      } else if (image) {
        stop('An image inside a line of text is not handled; nothing is dropped silently');
      } else {
        blocks.push({
          type: token.type === 'heading_open' ? token.tag : 'p',
          html: renderInline(children, rules, context),
        });
      }
      index += 2;
    } else if (token.type === 'hr') {
      blocks.push({ type: 'hr' });
    } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const items = [];
      const links = [];
      const close = token.type.replace('open', 'close');
      for (index++; tokens[index].type !== close; index++) {
        if (/^(bullet|ordered)_list_open$/.test(tokens[index].type)) stop('A list inside a list is not handled');
        if (tokens[index].type !== 'inline') continue;
        const { children } = tokens[index];
        const file = children.length === 1 && children[0].type === 'image' && (children[0].attrGet('src') ?? '').startsWith('media:');
        // A site may show a list of links as a row of links, so each link is also kept in parts.
        if (file) links.push({ media: children[0].attrGet('src').slice('media:'.length), label: escapeText(children[0].content, rules) });
        else if (children[0]?.type === 'link_open' && children.at(-1).type === 'link_close' && children.filter(child => child.type === 'link_open').length === 1) {
          links.push({ href: written(children[0].attrGet('href'), rules, context), label: renderInline(children.slice(1, -1), rules, context) });
        }
        items.push(file ? null : renderInline(children, rules, context));
      }
      blocks.push({ type: token.type.startsWith('bullet') ? 'ul' : 'ol', items, ...(links.length === items.length ? { links } : {}) });
    } else if (token.type === 'footnote_block_open') {
      // The notes are a numbered list on the page, one item for each note, in the order they are marked.
      const items = [];
      for (index++; tokens[index].type !== 'footnote_block_close'; index++) {
        if (tokens[index].type === 'footnote_open') items.push(null);
        else if (tokens[index].type === 'inline') {
          if (items.at(-1) !== null) stop('A note with more than one paragraph is not handled');
          items[items.length - 1] = renderInline(tokens[index].children.filter(child => child.type !== 'footnote_anchor'), rules, context);
        }
      }
      blocks.push({ type: 'ol', items });
    } else {
      stop(`The site renderer does not handle "${token.type}"; nothing is dropped silently`);
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Values a record supplies to a page's named slots.
// ---------------------------------------------------------------------------------------------
function slotValue(slot, record, rules) {
  const source = slot.from ?? slot.name;
  if (source === 'publishedAt') {
    const { locale = 'en-US', options = { dateStyle: 'long' }, lowercase } = slot.date ?? {};
    const text = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(new Date(record.publishedAt));
    return lowercase ? text.toLowerCase() : text;
  }
  const value = source.startsWith('site.') ? record.site?.[source.slice(5)] : record[source];
  return escapeText(value === undefined || value === null ? '' : String(value), rules);
}

// Where an image on the page points: the address the page already uses, the place the image first
// came from, or the copy the repository holds.
function imageAddress(media, mode, context) {
  if (mode === 'source') return media.sourceUrl ?? stop(`Attachment ${media.id} has no source address; use the page or repository setting`);
  return context.blobUrl(media);
}

// ---------------------------------------------------------------------------------------------
// Reading a page's markup. Only as much HTML as cutting a template needs.
// ---------------------------------------------------------------------------------------------
function topLevelParts(html) {
  // Splits markup into the elements at its top level and the text between them.
  const parts = [];
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let depth = 0;
  let start = 0;
  let last = 0;
  let name = '';
  for (let match; (match = tag.exec(html));) {
    const [whole, closing, raw] = match;
    const element = raw.toLowerCase();
    if (!closing) {
      if (depth === 0) {
        if (match.index > last) parts.push({ between: html.slice(last, match.index) });
        start = match.index;
        name = element;
      }
      if (VOID.has(element)) {
        if (depth === 0) {
          parts.push({ tag: element, open: whole, inner: '', close: '', outer: whole });
          last = tag.lastIndex;
        }
      } else depth++;
    } else {
      depth--;
      if (depth < 0) stop(`A closing </${element}> with nothing open; the page's markup is not well formed here`);
      if (depth === 0) {
        const outer = html.slice(start, tag.lastIndex);
        const open = /^<[^>]*>/.exec(outer)[0];
        parts.push({ tag: name, open, inner: outer.slice(open.length, outer.length - whole.length), close: whole, outer });
        last = tag.lastIndex;
      }
    }
  }
  if (depth !== 0) stop('An element is never closed; the page\'s markup is not well formed here');
  if (last < html.length) parts.push({ between: html.slice(last) });
  return parts;
}

const attribute = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
const setAttribute = (tag, name, value) => tag.replace(new RegExp(`(\\b${name}=")[^"]*(")`), `$1${value}$2`);

// ---------------------------------------------------------------------------------------------
// adopt: cut a template out of a page, checking every cut against the record.
// ---------------------------------------------------------------------------------------------
function adoptBody(html, blocks, record, rules, options, context, findings, position) {
  let next = position.next;
  const mark = name => `{{${options.prefix ? `${options.prefix}:` : ''}${name}}}`;
  // Elements the rules call the site's own, such as another language's paragraphs, are left alone.
  const own = rules.siteText ? new RegExp(rules.siteText) : null;
  const media = new Map((record.media ?? []).map(item => [item.id, item]));
  const expect = (found, where) => {
    const block = blocks[next];
    if (!block) {
      findings.push({ where, problem: `The page has a <${found}> here, but the post's body has ended` });
      return null;
    }
    return block;
  };
  const differ = (where, page, post) => findings.push({ where, page, post });

  function walk(markup) {
    let out = '';
    for (const part of topLevelParts(markup)) {
      if ('between' in part) {
        if (part.between.trim()) stop(`Words outside any block in the page's body: ${JSON.stringify(part.between.trim().slice(0, 60))}`);
        out += part.between;
        continue;
      }
      const where = `block ${next + 1}`;
      const anchors = WRAPPERS.has(part.tag) ? topLevelParts(part.inner).filter(child => 'tag' in child) : [];
      if (own?.test(part.open)) {
        out += part.outer;
      } else if (anchors.length && anchors.every(child => child.tag === 'a' && !/<img\b/.test(child.inner))) {
        // A row of links. The post holds it as a list in which every item is one link.
        const block = expect(part.tag, where);
        if (block && !block.links) differ(where, `a row of ${anchors.length} links`, `a ${block.type}`);
        let row = part.inner;
        anchors.forEach((anchor, item) => {
          const link = block?.links?.[item];
          const inside = topLevelParts(anchor.inner).filter(child => 'tag' in child && !own?.test(child.open));
          const label = inside.length === 1 ? inside[0].inner : anchor.inner;
          if (block?.links && (!link || link.label !== label)) differ(`${where}, link ${item + 1}`, label, link?.label ?? 'nothing');
          let open = anchor.open;
          if (link?.href !== undefined) {
            const onPage = attribute(open, 'href')?.[1] ?? '';
            // The same place written another way, such as ../writing/a.html for /writing/a.html, is
            // the same address. The page's own spelling is kept.
            const place = address => { try { return new URL(address.replaceAll('&amp;', '&'), `${context.site}${rules.inline?.linksRelativeTo ?? '/'}`).href; } catch { return address; } };
            if (onPage === escapeAttribute(link.href)) open = setAttribute(open, 'href', mark(`b.${next}.h.${item}`));
            else if (place(onPage) !== place(link.href)) differ(`${where}, link ${item + 1} address`, onPage || 'none', link.href);
          }
          const slotted = inside.length === 1
            ? anchor.inner.replace(inside[0].outer, `${inside[0].open}${mark(`b.${next}.i.${item}`)}${inside[0].close}`) : mark(`b.${next}.i.${item}`);
          row = row.replace(anchor.outer, `${open}${slotted}${anchor.close}`);
        });
        if (block?.links && block.links.length !== anchors.length) differ(where, `${anchors.length} links`, `${block.links.length} links`);
        out += part.open + row + part.close;
        next++;
      } else if (WRAPPERS.has(part.tag)) {
        out += part.open + walk(part.inner) + part.close;
      } else if (part.tag === 'hr') {
        const block = expect('hr', where);
        if (block && block.type !== 'hr') differ(where, '<hr>', `a ${block.type}`);
        next++;
        out += part.outer;
      } else if (TEXT_BLOCKS.has(part.tag)) {
        const block = expect(part.tag, where);
        const [, lead, content, trail] = /^(\s*)(.*?)(\s*)$/s.exec(part.inner);
        const attached = block?.type === 'image' && media.get(block.id);
        const link = attached && /^(<a\b[^>]*>)(.*)(<\/a>)$/s.exec(content);
        if (link && attached.$type?.endsWith('#file')) {
          // An attached file is a line holding one link, whose words are the file's description.
          if (link[2] !== escapeText(block.alt, rules)) differ(`${where}, link text`, link[2], block.alt);
          let open = link[1];
          if (options.images !== 'page') {
            const address = escapeAttribute(imageAddress(attached, options.images, context));
            if (attribute(open, 'href')?.[1] !== address) differ(`${where}, file address`, attribute(open, 'href')?.[1] ?? 'none', address);
            open = setAttribute(open, 'href', mark(`b.${next}.src`));
          }
          out += `${part.open}${lead}${open}${mark(`b.${next}.label`)}${link[3]}${trail}${part.close}`;
          next++;
          continue;
        }
        if (block && (block.type !== part.tag || block.html !== content)) {
          differ(`${where} (<${part.tag}>)`, content, block.type === part.tag ? block.html : `a ${block.type}`);
        }
        out += `${part.open}${lead}${mark(`b.${next}`)}${trail}${part.close}`;
        next++;
      } else if (part.tag === 'ul' || part.tag === 'ol') {
        const block = expect(part.tag, where);
        let item = 0;
        let inner = '';
        for (const child of topLevelParts(part.inner)) {
          if ('between' in child) inner += child.between;
          else if (child.tag !== 'li') stop(`A <${child.tag}> directly inside a list`);
          else {
            const [, lead, content, trail] = /^(\s*)(.*?)(\s*)$/s.exec(child.inner);
            if (block && block.items?.[item] !== content) differ(`${where}, item ${item + 1}`, content, block.items?.[item] ?? 'nothing');
            inner += `${child.open}${lead}${mark(`b.${next}.i.${item}`)}${trail}${child.close}`;
            item++;
          }
        }
        if (block && (block.type !== part.tag || block.items.length !== item)) differ(where, `a <${part.tag}> of ${item}`, `${block.type} of ${block.items?.length ?? 0}`);
        out += part.open + inner + part.close;
        next++;
      } else if (part.tag === 'figure' || (['a', 'span'].includes(part.tag) && /<(?:img|video)\b/.test(part.inner))) {
        // An image or a video, in a figure or in a wrapper of its own.
        const block = expect('figure', where);
        const images = part.outer.match(/<(?:img|video)\b[^>]*>/g) ?? [];
        if (images.length !== 1) stop(`${where}: a figure with ${images.length} images is not handled`);
        if (/<figcaption\b[^>]*>\s*\S/.test(part.outer)) stop(`${where}: a figure with a caption is not handled`);
        let image = images[0];
        const item = block?.type === 'image' ? media.get(block.id) : null;
        if (block && !item) differ(where, 'an image', block.type === 'image' ? `attachment ${block.id}, which the post does not have` : `a ${block.type}`);
        let figure = part.outer;
        const cut = (name, value) => {
          // Only what the page states is cut out. An attribute the page omits stays omitted.
          const found = attribute(image, name);
          if (!found) return;
          if (item && found[1] !== escapeAttribute(String(value ?? ''))) differ(`${where}, image ${name}`, found[1], String(value ?? ''));
          const slotted = setAttribute(image, name, mark(`b.${next}.${name}`));
          figure = figure.replace(image, slotted);
          image = slotted;
        };
        cut('alt', block?.alt);
        // While the page keeps its own address for the file, the file and its size are the page's:
        // a gallery may show a smaller copy. They come from the record only when the owner asks.
        if (item && options.images !== 'page') {
          cut('width', item.width);
          cut('height', item.height);
          cut('src', imageAddress(item, options.images, context));
        }
        const link = /<a\b[^>]*>/.exec(figure);
        if (link || block?.href) {
          const found = link && attribute(link[0], 'href');
          if (!found || found[1] !== escapeAttribute(block?.href ?? '')) differ(`${where}, image link`, found?.[1] ?? 'no link', block?.href ?? 'no link');
          if (found) figure = figure.replace(link[0], setAttribute(link[0], 'href', mark(`b.${next}.href`)));
        }
        out += figure;
        next++;
      } else {
        stop(`${where}: the page's body has a <${part.tag}>, which the site renderer does not handle`);
      }
    }
    return out;
  }
  const skeleton = walk(html);
  position.next = next;
  return skeleton;
}

export function adopt(page, record, rules, options, context) {
  // A page that holds several posts is adopted once for each, with a prefix that keeps their slots apart.
  const prefix = options.prefix ? `${options.prefix}:` : '';
  if (page.includes(`{{${prefix}`) && (prefix || !options.prefix)) {
    stop(prefix ? `The page already has slots for "${options.prefix}"` : 'The page already contains "{{", which the template uses for its slots');
  }
  const findings = [];
  const blocks = recordBlocks(record.body, rules, context);
  const position = { next: 0 };
  let template = '';
  let at = 0;
  const slots = [];
  const kept = [];
  for (const slot of rules.slots) {
    // A pattern can name a value given when adopting, such as the place of this post on the page.
    const pattern = new RegExp(slot.pattern.replace(/\{(\w+)\}/g, (whole, name) => options.vars?.[name] ?? whole), 'gs');
    pattern.lastIndex = at;
    const match = pattern.exec(page);
    if (!match) {
      if (slot.optional) continue;
      stop(`Could not find where the ${slot.name} sits on this page (slots are looked for in order, each after the last)`);
    }
    if (match.length !== 4) stop(`The pattern for ${slot.name} needs three groups: before, the content, after`);
    const [, before, content, after] = match;
    const from = match.index + before.length;
    template += page.slice(at, from);
    if ((slot.from ?? slot.name) === 'body') {
      template += adoptBody(content, blocks, record, rules, options, context, findings, position);
    } else {
      const value = slotValue(slot, record, rules);
      if (value !== content && slot.whenSame) {
        // Another edition may repeat the post's words or have its own, such as a translated title.
        // Its own words are the site's, so they stay in the template. This is reported, not hidden.
        kept.push({ where: `the ${slot.name}`, page: content });
        template += content;
        at = from + content.length;
        template += page.slice(at, at + after.length);
        at += after.length;
        continue;
      }
      if (value !== content) findings.push({ where: `the ${slot.name}`, page: content, post: value });
      template += `{{${prefix}${slot.name}}}`;
    }
    slots.push(slot.name);
    at = from + content.length;
    template += page.slice(at, at + after.length);
    at += after.length;
  }
  template += page.slice(at);
  if (position.next < blocks.length) {
    findings.push({ where: `block ${position.next + 1}`, problem: `The post's body has ${blocks.length - position.next} more block(s) than the page` });
  }

  // Content that also sits somewhere the slots do not cover would go stale when the post changes.
  const repeated = [];
  const text = block => block.html?.replace(/<[^>]+>/g, '') ?? '';
  for (const [index, block] of blocks.entries()) {
    if (text(block).length >= 30 && template.includes(block.html)) repeated.push(`block ${index + 1} of the body is still in the template`);
  }
  const title = record.title ? escapeText(record.title, rules) : '';
  const titleLines = title ? template.split('\n').filter(line => line.includes(title)).length : 0;
  return { template, slots, blocks: blocks.map(block => block.type), findings, repeated, kept, titleLines };
}

// ---------------------------------------------------------------------------------------------
// build: fill a template from a record.
// ---------------------------------------------------------------------------------------------
export function build(template, record, rules, options, context, expected) {
  const blocks = recordBlocks(record.body, rules, context);
  if (expected && JSON.stringify(expected) !== JSON.stringify(blocks.map(block => block.type))) {
    stop('The post\'s body no longer has the shape this template was cut for. Adopt the page again.');
  }
  const media = new Map((record.media ?? []).map(item => [item.id, item]));
  const values = new Map(rules.slots.filter(slot => (slot.from ?? slot.name) !== 'body').map(slot => [slot.name, slotValue(slot, record, rules)]));
  for (const [index, block] of blocks.entries()) {
    if (block.html !== undefined) values.set(`b.${index}`, block.html);
    block.items?.forEach((item, position) => values.set(`b.${index}.i.${position}`, block.links?.[position]?.label ?? item));
    block.links?.forEach((link, position) => { if (link.href !== undefined) values.set(`b.${index}.h.${position}`, escapeAttribute(link.href)); });
    if (block.type === 'image') {
      const item = media.get(block.id) ?? stop(`The post has no attachment ${block.id}`);
      values.set(`b.${index}.alt`, escapeAttribute(block.alt));
      values.set(`b.${index}.label`, escapeText(block.alt, rules));
      values.set(`b.${index}.width`, String(item.width ?? ''));
      values.set(`b.${index}.height`, String(item.height ?? ''));
      if (block.href) values.set(`b.${index}.href`, escapeAttribute(block.href));
      if (options.images !== 'page') values.set(`b.${index}.src`, escapeAttribute(imageAddress(item, options.images, context)));
    }
  }
  // With a prefix, only this post's slots are filled; the page's other posts are left for their turn.
  const slot = options.prefix ? new RegExp(`\\{\\{${options.prefix}:([\\w.]+)\\}\\}`, 'g') : /\{\{([\w.]+)\}\}/g;
  return template.replace(slot, (whole, name) => values.has(name) ? values.get(name) : stop(`The template has a slot the post cannot fill: ${name}`));
}

// ---------------------------------------------------------------------------------------------
// compare: say exactly how a built page differs from the original, and never round it off.
// ---------------------------------------------------------------------------------------------
export function compare(original, built) {
  if (original === built) return { verdict: 'identical', differences: [] };
  const differences = [];
  const a = original.split('\n');
  const b = built.split('\n');
  for (let line = 0; line < Math.max(a.length, b.length) && differences.length < 20; line++) {
    if (a[line] === b[line]) continue;
    const from = [...(a[line] ?? '')].findIndex((char, index) => char !== (b[line] ?? '')[index]);
    const at = from < 0 ? Math.min((a[line] ?? '').length, (b[line] ?? '').length) : from;
    differences.push({ line: line + 1, column: at + 1, page: (a[line] ?? '').slice(Math.max(0, at - 30), at + 50), built: (b[line] ?? '').slice(Math.max(0, at - 30), at + 50) });
  }
  const squeeze = text => text.replace(/\s+/g, '');
  const mask = text => text.replace(/(<img\b[^>]*\bsrc=")[^"]*"/g, '$1"');
  const verdict = squeeze(original) === squeeze(built) ? 'whitespace only'
    : mask(original) === mask(built) ? 'image addresses only' : 'different';
  return { verdict, differences };
}
