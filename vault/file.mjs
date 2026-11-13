// A note as a file: properties at the top, then the body in Markdown. The folder a file is in is
// its label, the folder inside that its sublabel, and the file's name its slug. A file is kept
// exactly as it was written; everything here only reads it, except the two functions at the end,
// which change one property or write a new file.
//
// The same folder opens in Obsidian, so its ways of writing things are read too: properties as
// plain YAML, [[links to other notes]], and ![[embedded files]].
import { POST as POST_TYPE } from '../feed/pds.mjs';
import { assembleRecord, FILE_TYPES, isSlug, kindOf, recordVersion, SLUG, VaultProblem, VISIBILITIES } from './core.mjs';

const HEAD = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

// The properties block as text, and the body after it.
export function splitFile(text) {
  const found = HEAD.exec(text);
  return found ? { head: found[1], body: text.slice(found[0].length) } : { head: null, body: text.replace(/^﻿/, '') };
}

function scalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    const end = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(value);
    if (!end) return { problem: true };
    return { value: end[1].replace(/\\(.)/g, (_, char) => ({ n: '\n', t: '\t' })[char] ?? char) };
  }
  if (value.startsWith("'")) {
    const end = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(value);
    return end ? { value: end[1].replaceAll("''", "'") } : { problem: true };
  }
  // A property can hold something with parts of its own, written as JSON, which YAML also reads.
  if (value.startsWith('{')) {
    try {
      return { value: JSON.parse(value) };
    } catch {
      return { problem: true };
    }
  }
  const plain = value.replace(/\s+#.*$/, '');
  if (/^[|>&*!%@`]/.test(plain)) return { problem: true };
  if (plain === '' || plain === '~' || plain === 'null') return { value: null };
  if (plain === 'true' || plain === 'false') return { value: plain === 'true' };
  if (/^-?\d+(?:\.\d+)?$/.test(plain)) return { value: Number(plain) };
  return { value: plain };
}

function inlineList(raw) {
  const inside = raw.trim().slice(1, -1).trim();
  if (!inside) return { value: [] };
  // Split on the commas between items, not the ones inside quotes.
  const items = [...inside.matchAll(/\s*("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,]*?)\s*(?:,|$)/g)].map(found => found[1]).filter((item, index, all) => item || index < all.length - 1);
  const values = items.map(item => scalar(item));
  return values.some(item => item.problem) ? { problem: true } : { value: values.map(item => item.value) };
}

// Properties are read as plain YAML of the kind Obsidian's own panel writes: text, numbers,
// yes-or-no, dates, and lists. Anything richer is left alone and named, never guessed at.
export function readProperties(head) {
  const properties = {};
  const problems = [];
  if (head === null) return { properties, problems };
  const lines = head.split(/\r?\n/);
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const found = /^([A-Za-z0-9_][A-Za-z0-9_ -]*?)\s*:(?:\s+(.*)|\s*)$/.exec(line);
    if (!found) {
      problems.push(`A line in the properties is not understood: ${line.trim().slice(0, 60)}`);
      continue;
    }
    const [, key, rest = ''] = found;
    let read;
    if (rest.trim().startsWith('[') && rest.trim().endsWith(']')) {
      read = inlineList(rest);
    } else if (rest.trim() === '') {
      // Nothing after the colon: a list written one item a line, or an empty property.
      const items = [];
      while (at + 1 < lines.length && /^\s*-\s+/.test(lines[at + 1])) items.push(scalar(lines[++at].replace(/^\s*-\s+/, '')));
      const nested = at + 1 < lines.length && /^\s+\S/.test(lines[at + 1]);
      read = nested || items.some(item => item.problem) ? { problem: true } : { value: items.length ? items.map(item => item.value) : null };
      while (nested && at + 1 < lines.length && /^\s+\S/.test(lines[at + 1])) at++;
    } else {
      read = scalar(rest);
    }
    if (read.problem) problems.push(`The property "${key}" is written in a way that is not understood, and is left as it is`);
    else properties[key] = read.value;
  }
  return { properties, problems };
}

// Folders that hold something other than notes: an editor's own settings, and files kept for the vault.
const aside = segment => segment.startsWith('.') || segment.startsWith('_');

// Where a file sits: the label and sublabel its folders give it, and its name.
export function filePlace(path) {
  const segments = String(path).split('/').filter(Boolean);
  const file = segments.pop() ?? '';
  if (!/\.md$/i.test(file) || aside(file) || segments.some(aside)) return null;
  return { label: segments[0] ?? '', sublabel: segments[1] ?? '', name: file.replace(/\.md$/i, ''), deeper: segments.length > 2 };
}

// A file name as a slug: "Trap of Independency" -> "trap-of-independency".
export function slugOf(name) {
  return String(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const extension = address => /\.([A-Za-z0-9]{1,5})(?:[?#].*)?$/.exec(address.split('/').at(-1) ?? '')?.[1].toLowerCase();
// What kind of file an address names, when its ending says. A cloud link often does not.
export const addressKind = address => {
  const mime = FILE_TYPES[`.${extension(address) ?? ''}`];
  return mime ? kindOf(mime) : null;
};

// Run `change` over the parts of a body that are not code, so nothing inside a code block or
// between backticks is ever touched.
function outsideCode(body, change) {
  const out = [];
  let fence = null;
  for (const line of body.split('\n')) {
    const mark = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      out.push(line);
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && !line.trim().slice(mark.length).trim()) fence = null;
    } else if (mark) {
      fence = mark;
      out.push(line);
    } else {
      out.push(line.split(/(`+[^`\n]*`+)/).map((part, index) => index % 2 ? part : change(part)).join(''));
    }
  }
  return out.join('\n');
}

// Compare actual media placements, including repeats, while keeping code examples literal.
export function mediaLayout(body) {
  const placements = [];
  const text = outsideCode(String(body ?? ''), part => part.replace(/(!\[[^\]]*\])\(media:([A-Za-z0-9_-]+)\)/g, (_whole, label, id) => {
    placements.push(id);
    return `${label}(media)`;
  }));
  return { body: text.trim(), placements };
}

// The body as a record holds it. A file points at its attachments by address; a record places
// them by ID and holds a stored copy of each. Links to other notes become links to their addresses.
//   noteAddress(name) -> the address of the note with that name or slug, or nothing
export function recordBody(body, { noteAddress = () => undefined } = {}) {
  const attachments = [];
  const unknown = [];
  const idOf = (address, alt) => {
    const held = attachments.find(item => item.address === address);
    if (held) return held.id;
    // An address can end in "#name.ext" to say what the file is called, when the address itself does not.
    const named = /#([^#/?]+\.[A-Za-z0-9]{1,5})$/.exec(address)?.[1];
    const base = slugOf((named ?? address.split(/[?#]/)[0].split('/').at(-1) ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, '')).slice(0, 56) || 'file';
    let id = base;
    for (let count = 2; attachments.some(item => item.id === id); count++) id = `${base}-${count}`;
    attachments.push({ id, address, kind: addressKind(address), ...(alt ? { alt } : {}) });
    return id;
  };
  const place = (alt, address) => `![${alt}](media:${idOf(address, alt)})`;
  const text = outsideCode(body, part => part
    // ![[file.png]] and ![[file.png|a description]], as Obsidian embeds a file.
    .replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (whole, target, alt = '') =>
      addressKind(target.trim()) ? place(alt.trim(), target.trim()) : whole.slice(1))
    // ![a description](address), with the address bare or in angle brackets.
    .replace(/!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g, (whole, alt, angled, bare) => {
      const address = (angled ?? bare).trim();
      return /^(?:media|data):/i.test(address) ? whole : place(alt, address);
    })
    // [[another note]], [[another note|these words]], [[another note#a heading]].
    .replace(/\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (whole, target, _heading, words) => {
      const address = noteAddress(target.trim());
      if (!address) unknown.push(target.trim());
      return address ? `[${(words ?? target).trim()}](${address})` : (words ?? target).trim();
    }));
  return { body: text, attachments, unknown };
}

// The record a post would be published as, and what it points to. `problems` says why it cannot
// be published, in sentences for its author; an empty list means it can.
//   noteAddress(name) -> the address of the post with that name or slug, or nothing
//   postId(slug) -> the ID of the post with that slug, or nothing
//   seenAt: when the post was first seen, used as its date when it gives none
//
// A published post is a record kept under the post's ID, not its slug, so renaming a post leaves
// its record, and everything that points at it, where it was. `key` is that ID.
export function postRecord(post, { did, site, collection = POST_TYPE, noteAddress, postId, seenAt } = {}) {
  const converted = recordBody(post.body ?? '', { noteAddress });
  const problems = converted.unknown.map(name => `It links to "${name}", which is not a post in this vault`);
  const out = { ...(isPostId(post.id) ? { key: post.id } : {}), attachments: converted.attachments, problems };
  if (!isSlug(post.slug)) return out;
  // A connection written as another post's slug is kept as that post's own address in the
  // repository, which is under its ID. With nothing to look slugs up in, they are left for later.
  const connect = (post.connect ?? []).map(value => {
    if (!postId || !SLUG.test(value)) return value;
    const id = postId(value);
    if (!id) problems.push(`It connects to "${value}", which is not a post in this vault`);
    return id ? `at://${did}/${collection}/${id}` : null;
  }).filter(Boolean);
  try {
    const { record } = assembleRecord({
      slug: post.slug, body: converted.body, title: post.title, subtitle: post.subtitle,
      publishedAt: post.date ?? seenAt,
      label: post.label, sublabel: post.sublabel, connect,
      ...(post.source ? { source: post.source } : {}),
      ...(post.site ? { own: post.site } : {}),
      // A file whose address does not say what it is, is taken for an image until it has been fetched.
      kinds: converted.attachments.map(item => item.kind ?? 'image'),
    }, { did, site, collection });
    // A post on a page of the author's own design has that page's address, not one built from its label.
    if (post.address) record.canonicalUrl = post.address;
    out.record = record;
    out.form = record.form;
  } catch (problem) {
    if (!(problem instanceof VaultProblem)) throw problem;
    problems.push(...problem.message.split('\n'));
  }
  return out;
}

// A file read straight through to the record it would be published as.
export function fileNote(path, text, context = {}) {
  const read = filePost(path, text);
  if (!read) return null;
  const { post } = read;
  const made = postRecord(post, context);
  return {
    path, slug: post.slug, label: post.label, sublabel: post.sublabel, visibility: post.visibility, properties: post.properties,
    ...(post.title ? { title: post.title } : {}),
    attachments: made.attachments, problems: [...read.problems, ...made.problems],
    ...(made.record ? { record: made.record, form: made.form } : {}),
  };
}

const written = value => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return value.length ? `\n${value.map(item => `  - ${written(item)}`).join('\n')}` : ' []';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const text = String(value);
  // Quoted when YAML would otherwise read it as something other than this text.
  return /^[\w가-힣][^:#\n"']*$/.test(text) && !/^(?:true|false|null|~|-?\d+(?:\.\d+)?)$/.test(text) && text === text.trim()
    ? text : `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
};
const propertyLine = (key, value) => Array.isArray(value) ? `${key}:${written(value)}` : `${key}: ${written(value)}`;

// A new file, from its properties and body.
export function writeNoteFile({ properties = {}, body = '' }) {
  const lines = Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => propertyLine(key, value));
  return `${lines.length ? `---\n${lines.join('\n')}\n---\n\n` : ''}${body.trim()}\n`;
}

// The same file with one property changed, or removed when the value is nothing. Every other
// line stays exactly as it was written.
export function setProperty(text, key, value) {
  const remove = value === undefined || value === null || value === '';
  const found = HEAD.exec(text);
  if (!found) return remove ? text : `---\n${propertyLine(key, value)}\n---\n\n${text.replace(/^﻿/, '')}`;
  const newline = found[0].includes('\r\n') ? '\r\n' : '\n';
  const lines = found[1].split(/\r?\n/);
  const start = lines.findIndex(line => new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(line));
  let end = start + 1;
  // A property written over several lines, such as a list, goes with its first line.
  while (start >= 0 && end < lines.length && /^\s+\S|^\s*-\s/.test(lines[end])) end++;
  const next = remove ? [] : propertyLine(key, value).split('\n');
  if (start >= 0) lines.splice(start, end - start, ...next);
  else lines.push(...next);
  const kept = lines.filter((line, index) => line.trim() || index < lines.length - 1);
  return kept.length
    ? `---${newline}${kept.join(newline)}${newline}---${newline}${text.slice(found[0].length)}`
    : text.slice(found[0].length).replace(/^\r?\n/, '');
}

// ---- A post and its file ----
//
// The unit of a vault is the post: its ID, its slug, its label and sublabel, who may see it, its
// title, subtitle and date, what it connects to, its body, and any other properties its author gave
// it. The ID is given once, when the post is made, and never changes. Everything else can be
// edited, the slug included, and the post is still the same post.
// A file is how a post appears in a folder, so that a cloud, a local folder or Obsidian can hold
// it. The mapping is exact: a post written as a file and read back is the same post.
//
//   label -> folder      sublabel -> subfolder      slug -> file name
//   title, subtitle, date, visibility, connect, other properties, and the ID -> properties at the top
//   body -> Markdown
const FIELDS = ['title', 'subtitle', 'date', 'visibility', 'connect'];
// Where a post first appeared, when that was somewhere else: three properties in a file, one field in a post.
const SOURCE = { platform: 'platform', uri: 'source', id: 'source id' };
const RESERVED = new Set([...FIELDS, 'slug', 'id', 'address', 'site', ...Object.values(SOURCE)]);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const SORTABLE = '234567abcdefghijklmnopqrstuvwxyz';
const POST_ID = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/;
export const isPostId = value => typeof value === 'string' && POST_ID.test(value);

// A new post's ID: thirteen characters that sort by when they were made, in the form AT Protocol
// uses for its own record keys. Whoever makes the post makes its ID, so that a request to create
// it can be sent twice and still make one post.
export function newPostId(now = Date.now(), random = Math.floor(Math.random() * 1024), micros = 0) {
  let value = ((BigInt(now) * 1000n + BigInt(micros % 1000)) << 10n) | BigInt(random & 1023);
  let text = '';
  for (let at = 0; at < 13; at++, value >>= 5n) text = SORTABLE[Number(value & 31n)] + text;
  return text;
}
const folderName = name => typeof name === 'string' && name === name.trim() && !/[\/\\\u0000-\u001f]/.test(name) && !['.', '..'].includes(name) && !/^[._]/.test(name);

// The fields a post has, and nothing else. What a client sends beyond these is not kept.
export function cleanPost(post) {
  const text = name => (typeof post?.[name] === 'string' && post[name].trim() ? post[name].trim() : undefined);
  return {
    id: post?.id, slug: post?.slug, label: text('label') ?? '', sublabel: text('sublabel') ?? '', visibility: post?.visibility,
    ...(text('title') ? { title: text('title') } : {}),
    ...(text('subtitle') ? { subtitle: text('subtitle') } : {}),
    ...(text('date') ? { date: text('date') } : {}),
    ...(Array.isArray(post?.connect) && post.connect.length ? { connect: post.connect.map(String) } : {}),
    ...(post?.address !== undefined ? { address: post.address } : {}),
    ...(post?.source !== undefined ? { source: post.source } : {}),
    body: post?.body,
    properties: post?.properties && typeof post.properties === 'object' && !Array.isArray(post.properties) ? post.properties : {},
    ...(post?.site !== undefined ? { site: post.site } : {}),
  };
}

// A name for exactly this content of a post. The vault and everything that syncs with it work a
// post's version out the same way, here, so a post that is the same in two places has the same
// version in both.
export const postVersion = post => recordVersion(cleanPost(post));

// Why a post cannot be written as a file. Empty when it can.
export function postProblems(post) {
  const problems = [];
  if (!isPostId(post?.id)) problems.push('A post has an ID, given once when it is made');
  if (!isSlug(post?.slug)) problems.push('A post\'s slug is lowercase Latin letters and digits joined by single hyphens, at most 120 characters');
  if (post?.sublabel && !post.label) problems.push('A sublabel sits inside a label; set both');
  for (const name of ['label', 'sublabel']) {
    if (post?.[name] && !folderName(post[name])) problems.push(`A ${name} is used as a folder's name, so it cannot hold "/" or start with "." or "_"`);
  }
  if (!VISIBILITIES.includes(post?.visibility)) problems.push(`visibility is one of: ${VISIBILITIES.join(', ')}`);
  if (typeof post?.body !== 'string' || post.body !== post.body.trim()) problems.push('A post\'s body is text with no blank space before or after it');
  if (post?.address !== undefined && !(typeof post.address === 'string' && /^https?:\/\//i.test(post.address) && URL.canParse(post.address))) {
    problems.push('A post\'s address, when it is given one, is an HTTP(S) address on the author\'s website');
  }
  if (post?.site !== undefined && !isObject(post.site)) problems.push('A post\'s own layer for its site is a set of named fields');
  if (post?.source !== undefined) {
    const { platform, uri, id, ...more } = post.source ?? {};
    const word = value => typeof value === 'string' && value !== '' && value === value.trim();
    if (!word(platform) || !word(uri) || !/^https?:\/\//i.test(uri) || !URL.canParse(uri) || (id !== undefined && !word(id)) || Object.keys(more).length) {
      problems.push('Where a post first appeared is a platform\'s name and the post\'s address there, with the platform\'s own ID for it if there is one');
    }
  }
  for (const [key, value] of Object.entries(post?.properties ?? {})) {
    const plain = each => ['string', 'number', 'boolean'].includes(typeof each) && (typeof each !== 'string' || (each === each.trim() && each !== ''));
    if (RESERVED.has(key) || !/^[A-Za-z0-9_][A-Za-z0-9_ -]*$/.test(key) || key !== key.trim()) problems.push(`"${key}" cannot be used as the name of a property`);
    else if (!(Array.isArray(value) ? value.every(plain) : plain(value))) problems.push(`The property "${key}" is text, a number, yes or no, or a list of those`);
  }
  return problems;
}

// A post as a file: where it sits, and its text.
export function postFile(post) {
  const problems = postProblems(post);
  if (problems.length) throw new VaultProblem(problems.join('\n'));
  const properties = {
    ...Object.fromEntries(FIELDS.filter(name => name !== 'connect').map(name => [name, post[name]])),
    ...(post.address ? { address: post.address } : {}),
    ...(post.connect?.length ? { connect: post.connect } : {}),
    ...(post.source ? { [SOURCE.platform]: post.source.platform, [SOURCE.uri]: post.source.uri, ...(post.source.id ? { [SOURCE.id]: post.source.id } : {}) } : {}),
    ...post.properties,
    ...(post.site ? { site: post.site } : {}),
    // Last, where it is least in the way of someone reading the file.
    id: post.id,
  };
  return {
    path: [post.label, post.label && post.sublabel, `${post.slug}.md`].filter(Boolean).join('/'),
    text: writeNoteFile({ properties, body: post.body }),
  };
}

// A file as a post. `problems` says what in the file could not be read as part of a post. A file
// that has never been synced has no ID yet; whoever syncs it gives it one and writes it into the file.
export function filePost(path, text) {
  const place = filePlace(path);
  if (!place) return null;
  const { head, body } = splitFile(text);
  const { properties, problems } = readProperties(head);
  const words = name => (typeof properties[name] === 'string' && properties[name].trim() ? properties[name].trim() : undefined);
  const slug = properties.slug === undefined || properties.slug === null ? slugOf(place.name) : String(properties.slug);
  if (!isSlug(slug)) problems.push(`"${place.name}" does not make a slug. Add a slug property in lowercase Latin letters, digits and hyphens.`);
  if (place.deeper) problems.push('A post sits at most two folders deep: its label, and a sublabel inside it');
  const asked = properties.visibility ?? undefined;
  const visibility = VISIBILITIES.includes(asked) ? asked : 'private';
  if (asked !== undefined && visibility !== asked) problems.push(`visibility is one of: ${VISIBILITIES.join(', ')}. This post is treated as private.`);
  const connect = properties.connect === undefined || properties.connect === null ? [] : [properties.connect].flat().map(String);
  const other = {};
  for (const [key, value] of Object.entries(properties)) {
    if (RESERVED.has(key) || value === null || value === '') continue;
    if (isObject(value)) problems.push(`The property "${key}" has parts of its own, which only the site's own layer can hold. It is left as it is.`);
    else other[key] = value;
  }
  const address = typeof properties.address === 'string' && /^https?:\/\//i.test(properties.address.trim()) && URL.canParse(properties.address.trim()) ? properties.address.trim() : undefined;
  if (properties.address !== undefined && properties.address !== null && !address) problems.push('The address property is not an HTTP(S) address');
  if (properties.site !== undefined && properties.site !== null && !isObject(properties.site)) problems.push('The site property is not a set of named fields');
  const date = properties.date === undefined || properties.date === null ? undefined : String(properties.date);
  const id = properties.id === undefined || properties.id === null ? undefined : String(properties.id);
  if (id !== undefined && !isPostId(id)) problems.push('The id property is not one this vault gave. Remove it, and the post will be given a new one.');
  const said = name => (properties[name] === undefined || properties[name] === null ? undefined : String(properties[name]).trim() || undefined);
  const source = said(SOURCE.platform) && said(SOURCE.uri)
    ? { platform: said(SOURCE.platform), uri: said(SOURCE.uri), ...(said(SOURCE.id) ? { id: said(SOURCE.id) } : {}) } : undefined;
  if (!source && Object.values(SOURCE).some(said)) problems.push('A post that first appeared somewhere else names both the platform and its address there, as "platform" and "source"');
  return {
    post: {
      ...(isPostId(id) ? { id } : {}),
      slug, label: place.label, sublabel: place.sublabel, visibility,
      ...(words('title') ? { title: words('title') } : {}),
      ...(words('subtitle') ? { subtitle: words('subtitle') } : {}),
      ...(date ? { date } : {}),
      ...(address ? { address } : {}),
      ...(connect.length ? { connect } : {}),
      ...(source ? { source } : {}),
      body: body.trim(),
      properties: other,
      ...(isObject(properties.site) ? { site: properties.site } : {}),
    },
    problems,
  };
}
