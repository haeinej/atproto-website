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

const markdown = new MarkdownIt('commonmark', { html: false });
const VOID = new Set(['img', 'br', 'hr', 'input', 'source', 'meta', 'link']);
const TEXT_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const WRAPPERS = new Set(['section', 'div', 'article']);

export class RenderProblem extends Error {}
const stop = message => { throw new RenderProblem(message); };

const escapeText = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeAttribute = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

// ---------------------------------------------------------------------------------------------
// The record's body, as an ordered list of blocks in the site's own inline markup.
// ---------------------------------------------------------------------------------------------
// How the site writes an address. A site that leaves its own domain off links to itself gets them
// back that way: https://example.com/a.html is written /a.html.
function written(href, rules, site) {
  return rules.inline?.ownLinksRelative && site && href.startsWith(`${site}/`) ? href.slice(site.length) : href;
}

const INLINE = {
  em: ['<em>', '</em>'], strong: ['<strong>', '</strong>'], break: '<br>',
  link: '<a href="{href}">', externalLink: '<a href="{href}" target="_blank" rel="noopener noreferrer">',
};

function renderInline(children, rules, site) {
  const inline = { ...INLINE, ...rules.inline };
  let out = '';
  for (const token of children) {
    if (token.type === 'text') {
      if (/\[\^[^\]]+\]/.test(token.content)) stop('Footnotes are not handled by the site renderer yet');
      out += escapeText(token.content);
    } else if (token.type === 'em_open') out += inline.em[0];
    else if (token.type === 'em_close') out += inline.em[1];
    else if (token.type === 'strong_open') out += inline.strong[0];
    else if (token.type === 'strong_close') out += inline.strong[1];
    else if (token.type === 'hardbreak') out += inline.break;
    else if (token.type === 'softbreak') out += '\n';
    else if (token.type === 'link_open') {
      const href = token.attrGet('href');
      // A link that leaves the site is written the way the site writes outside links.
      const outside = /^[a-z][a-z0-9+.-]*:/i.test(href) && !(site && href.startsWith(site));
      out += (outside ? inline.externalLink : inline.link).replace('{href}', escapeAttribute(written(href, rules, site)));
    } else if (token.type === 'link_close') out += '</a>';
    else stop(`The site renderer does not handle "${token.type}" inside a line; nothing is dropped silently`);
  }
  return out;
}

export function recordBlocks(body, rules = {}, site = '') {
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
          ...(linked ? { href: written(meaningful[0].attrGet('href'), rules, site) } : {}),
        });
      } else if (image) {
        stop('An image inside a line of text is not handled; nothing is dropped silently');
      } else {
        blocks.push({
          type: token.type === 'heading_open' ? token.tag : 'p',
          html: renderInline(children, rules, site),
        });
      }
      index += 2;
    } else if (token.type === 'hr') {
      blocks.push({ type: 'hr' });
    } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const items = [];
      const close = token.type.replace('open', 'close');
      for (index++; tokens[index].type !== close; index++) {
        if (tokens[index].type === 'inline') items.push(renderInline(tokens[index].children, rules, site));
        else if (/^(bullet|ordered)_list_open$/.test(tokens[index].type)) stop('A list inside a list is not handled');
      }
      blocks.push({ type: token.type.startsWith('bullet') ? 'ul' : 'ol', items });
    } else {
      stop(`The site renderer does not handle "${token.type}"; nothing is dropped silently`);
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Values a record supplies to a page's named slots.
// ---------------------------------------------------------------------------------------------
function slotValue(slot, record) {
  const source = slot.from ?? slot.name;
  if (source === 'publishedAt') {
    const { locale = 'en-US', options = { dateStyle: 'long' }, lowercase } = slot.date ?? {};
    const text = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(new Date(record.publishedAt));
    return lowercase ? text.toLowerCase() : text;
  }
  const value = source.startsWith('site.') ? record.site?.[source.slice(5)] : record[source];
  return escapeText(value === undefined || value === null ? '' : String(value));
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
function adoptBody(html, blocks, record, rules, options, context, findings) {
  let next = 0;
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
      if (WRAPPERS.has(part.tag)) {
        out += part.open + walk(part.inner) + part.close;
      } else if (part.tag === 'hr') {
        const block = expect('hr', where);
        if (block && block.type !== 'hr') differ(where, '<hr>', `a ${block.type}`);
        next++;
        out += part.outer;
      } else if (TEXT_BLOCKS.has(part.tag)) {
        const block = expect(part.tag, where);
        const [, lead, content, trail] = /^(\s*)(.*?)(\s*)$/s.exec(part.inner);
        if (block && (block.type !== part.tag || block.html !== content)) {
          differ(`${where} (<${part.tag}>)`, content, block.type === part.tag ? block.html : `a ${block.type}`);
        }
        out += `${part.open}${lead}{{b.${next}}}${trail}${part.close}`;
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
            inner += `${child.open}${lead}{{b.${next}.i.${item}}}${trail}${child.close}`;
            item++;
          }
        }
        if (block && (block.type !== part.tag || block.items.length !== item)) differ(where, `a <${part.tag}> of ${item}`, `${block.type} of ${block.items?.length ?? 0}`);
        out += part.open + inner + part.close;
        next++;
      } else if (part.tag === 'figure') {
        const block = expect('figure', where);
        const images = part.outer.match(/<img\b[^>]*>/g) ?? [];
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
          const slotted = setAttribute(image, name, `{{b.${next}.${name}}}`);
          figure = figure.replace(image, slotted);
          image = slotted;
        };
        cut('alt', block?.alt);
        if (item) {
          cut('width', item.width);
          cut('height', item.height);
          // The address is cut out only when the owner wants it to come from the record.
          if (options.images !== 'page') cut('src', imageAddress(item, options.images, context));
        }
        const link = /<a\b[^>]*>/.exec(figure);
        if (link || block?.href) {
          const found = link && attribute(link[0], 'href');
          if (!found || found[1] !== escapeAttribute(block?.href ?? '')) differ(`${where}, image link`, found?.[1] ?? 'no link', block?.href ?? 'no link');
          if (found) figure = figure.replace(link[0], setAttribute(link[0], 'href', `{{b.${next}.href}}`));
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
  if (next < blocks.length) findings.push({ where: `block ${next + 1}`, problem: `The post's body has ${blocks.length - next} more block(s) than the page` });
  return skeleton;
}

export function adopt(page, record, rules, options, context) {
  if (page.includes('{{')) stop('The page already contains "{{", which the template uses for its slots');
  const findings = [];
  const blocks = recordBlocks(record.body, rules, context.site);
  let template = '';
  let at = 0;
  const slots = [];
  const kept = [];
  for (const slot of rules.slots) {
    const pattern = new RegExp(slot.pattern, 'gs');
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
      template += adoptBody(content, blocks, record, rules, options, context, findings);
    } else {
      const value = slotValue(slot, record);
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
      template += `{{${slot.name}}}`;
    }
    slots.push(slot.name);
    at = from + content.length;
    template += page.slice(at, at + after.length);
    at += after.length;
  }
  template += page.slice(at);

  // Content that also sits somewhere the slots do not cover would go stale when the post changes.
  const repeated = [];
  const text = block => block.html?.replace(/<[^>]+>/g, '') ?? '';
  for (const [index, block] of blocks.entries()) {
    if (text(block).length >= 30 && template.includes(block.html)) repeated.push(`block ${index + 1} of the body is still in the template`);
  }
  const title = record.title ? escapeText(record.title) : '';
  const titleLines = title ? template.split('\n').filter(line => line.includes(title)).length : 0;
  return { template, slots, blocks: blocks.map(block => block.type), findings, repeated, kept, titleLines };
}

// ---------------------------------------------------------------------------------------------
// build: fill a template from a record.
// ---------------------------------------------------------------------------------------------
export function build(template, record, rules, options, context, expected) {
  const blocks = recordBlocks(record.body, rules, context.site);
  if (expected && JSON.stringify(expected) !== JSON.stringify(blocks.map(block => block.type))) {
    stop('The post\'s body no longer has the shape this template was cut for. Adopt the page again.');
  }
  const media = new Map((record.media ?? []).map(item => [item.id, item]));
  const values = new Map(rules.slots.filter(slot => (slot.from ?? slot.name) !== 'body').map(slot => [slot.name, slotValue(slot, record)]));
  for (const [index, block] of blocks.entries()) {
    if (block.html !== undefined) values.set(`b.${index}`, block.html);
    block.items?.forEach((item, position) => values.set(`b.${index}.i.${position}`, item));
    if (block.type === 'image') {
      const item = media.get(block.id) ?? stop(`The post has no attachment ${block.id}`);
      values.set(`b.${index}.alt`, escapeAttribute(block.alt));
      values.set(`b.${index}.width`, String(item.width ?? ''));
      values.set(`b.${index}.height`, String(item.height ?? ''));
      if (block.href) values.set(`b.${index}.href`, escapeAttribute(block.href));
      if (options.images !== 'page') values.set(`b.${index}.src`, escapeAttribute(imageAddress(item, options.images, context)));
    }
  }
  return template.replace(/\{\{([\w.]+)\}\}/g, (whole, name) => values.has(name) ? values.get(name) : stop(`The template has a slot the post cannot fill: ${name}`));
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
