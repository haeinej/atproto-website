// Turn the HTML a platform hands out into a post body: Markdown, with each image lifted out as an
// attachment to fetch. A mirror follows a source it does not control, so markup it has no Markdown
// for is reduced to its words and named in `simplified`, never dropped without a trace.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export const decode = text => text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, decimal, hex, name) =>
  decimal ? String.fromCodePoint(Number(decimal)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()] ?? whole);
const escape = text => text.replace(/([\\`*_[\]<>])/g, '\\$1');
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'figure', 'figcaption', 'header', 'footer', 'main', 'aside', 'table', 'tr', 'ul', 'ol', 'blockquote', 'pre']);
const SKIPPED = new Set(['script', 'style', 'svg', 'noscript', 'template', 'form', 'button']);
const QUIET = new Set(['span', 'html', 'body', 'picture', 'source', 'tbody', 'thead', 'td', 'th', 'small', 'u', 'time', 'font', 'center', 'wbr']);

export function htmlToMarkdown(html, base) {
  const blocks = [];
  const images = [];
  const simplified = new Set();
  const lists = [];
  const links = [];
  let line = '';
  let heading = '';
  let quote = 0;
  let pre = false;
  let skip = 0;
  const flush = () => {
    // A line break the author made is kept; the line breaks of the HTML source itself are not.
    const text = pre ? line.replace(/^\n+|\n+$/g, '')
      : line.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/ {2,}/g, ' ').trim().replace(/ ?\u0000 ?/g, '\\\n').replace(/^(?:\\\n)+|(?:\\\n)+$/g, '');
    const level = heading;
    line = '';
    heading = '';
    if (!text) return;
    const item = lists.at(-1);
    const body = pre ? '```\n' + text + '\n```' : item?.pending ? `${item.ordered ? `${item.count}.` : '-'} ${text}`
      : level + text.replace(/^(#{1,6} |[-+>] )/, '\\$1').replace(/^(\d+)([.)] )/, '$1\\$2');
    if (item?.pending) item.pending = false;
    const prefixed = quote ? body.split('\n').map(part => `> ${part}`).join('\n') : body;
    // Items of one list stay together; everything else is its own block.
    if (item && blocks.length && item.joined) blocks[blocks.length - 1] += `\n${prefixed}`;
    else blocks.push(prefixed);
    if (item) item.joined = true;
  };
  const absolute = value => (URL.canParse(value, base) ? new URL(value, base).href : null);

  for (const [, text, closing, name, attributes = ''] of html.matchAll(/([^<]+)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|<!--[\s\S]*?-->|</g)) {
    if (text !== undefined) {
      if (!skip) line += pre ? decode(text) : escape(decode(text));
      continue;
    }
    if (!name) continue;
    const tag = name.toLowerCase();
    const get = key => new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attributes)?.slice(1).find(value => value !== undefined);
    if (SKIPPED.has(tag)) { skip += closing ? -1 : 1; continue; }
    if (skip) continue;
    if (/^h[1-6]$/.test(tag)) {
      flush();
      if (!closing) heading = '#'.repeat(Number(tag[1])) + ' ';
    } else if (tag === 'li') {
      flush();
      const list = lists.at(-1);
      if (!closing && list) { list.count++; list.pending = true; }
    } else if (BLOCKS.has(tag)) {
      flush();
      if (tag === 'ul' || tag === 'ol') closing ? lists.pop() : lists.push({ ordered: tag === 'ol', count: 0 });
      if (tag === 'blockquote') quote += closing ? -1 : 1;
      if (tag === 'pre') pre = !closing;
      if (tag === 'table' && !closing) simplified.add('table');
    } else if (tag === 'br') line += pre ? '\n' : '\u0000';
    else if (tag === 'hr') { flush(); blocks.push('---'); }
    else if (tag === 'em' || tag === 'i') line += '*';
    else if (tag === 'strong' || tag === 'b') line += '**';
    else if (tag === 'code') line += pre ? '' : '`';
    else if (tag === 'a') {
      if (!closing) { links.push(absolute(decode(get('href') ?? ''))); line += links.at(-1) ? '[' : ''; }
      else { const href = links.pop(); line += href ? `](<${href}>)` : ''; }
    } else if (tag === 'img') {
      const url = absolute(decode(get('src') ?? ''));
      if (!url || !/^https?:/.test(url)) continue;
      // An image stands on its own, where it was. A link around it is kept around it.
      const wrapping = links.at(-1) && line.endsWith('[') ? links.at(-1) : null;
      if (wrapping) line = line.slice(0, -1);
      flush();
      const id = `image-${images.length + 1}`;
      images.push({ id, url, alt: decode(get('alt') ?? '') });
      const image = `![${escape(decode(get('alt') ?? ''))}](media:${id})`;
      blocks.push(wrapping ? `[${image}](<${wrapping}>)` : image);
      if (wrapping) links[links.length - 1] = null;
    } else if (!QUIET.has(tag)) simplified.add(tag);
  }
  flush();
  return { markdown: blocks.join('\n\n'), images, simplified: [...simplified] };
}
