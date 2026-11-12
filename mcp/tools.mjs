// What an agent can do in a person's vault. Each tool goes through the vault, so a note written by
// an agent lands exactly as one written by a command or in the editor.
//
// Reading is free. Anything that changes what other people can see, or removes a note, takes two
// calls: the first says exactly what would happen and returns a `confirm` value, and only a second
// call carrying that value does it. The person sees the first answer before the second is made.
import { formProblems, isForm } from '../feed/forms.mjs';
import { filing } from '../feed/pds.mjs';
import { bodyFacts } from '../feed/render.mjs';
import { assembleRecord, FILE_TYPES, kindOf, recordVersion, VaultProblem, VISIBILITIES } from '../vault/core.mjs';
import { vaultTree } from '../vault/vault.mjs';

const refuse = message => { throw new VaultProblem(message); };
const text = { type: 'string' };

export const TOOLS = [
  {
    name: 'vault_tree',
    description: "The structure of the person's vault: its labels, the sublabels inside them, and each note with who can see it. Start here to learn what the vault holds.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'vault_list',
    description: 'List notes, newest first, optionally only those under a label or sublabel or at one visibility.',
    inputSchema: { type: 'object', properties: {
      label: text, sublabel: text, visibility: { type: 'string', enum: VISIBILITIES }, limit: { type: 'integer', minimum: 1, maximum: 200 },
    } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'vault_read',
    description: 'Read one note in full, with its version. The version is needed to save changes to it.',
    inputSchema: { type: 'object', properties: { key: text }, required: ['key'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'vault_search',
    description: "Search the person's own notes at every visibility, private ones included. Returns the best matches with a passage from each.",
    inputSchema: { type: 'object', properties: {
      query: text, visibility: { type: 'string', enum: VISIBILITIES }, limit: { type: 'integer', minimum: 1, maximum: 50 },
    }, required: ['query'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'vault_save',
    description: 'Create a note, or change one that was read. A new note is always private; use vault_set_visibility to show it to anyone. To change a note, pass the version vault_read gave; fields left out stay as they are. Changing a note other people can see needs the two calls described in the answer.',
    inputSchema: { type: 'object', properties: {
      key: { type: 'string', description: 'The note\'s slug: lowercase letters and digits joined by hyphens. It is the last part of its address.' },
      body: { type: 'string', description: 'Markdown. Place an attachment with ![description](media:ID).' },
      title: { type: 'string', description: 'Leave out for a note with no title. Pass an empty string to remove one.' },
      subtitle: text,
      label: { type: 'string', description: "The section of the person's site the note belongs to, in their own words." },
      sublabel: { type: 'string', description: 'A group inside the label, such as a series.' },
      date: { type: 'string', description: 'When it was published. Now, if left out for a new note.' },
      connect: { type: 'array', items: text, description: 'What this note branches from: slugs of other notes, AT URIs, or web addresses.' },
      media: { type: 'array', description: 'Files to attach, each placed in the body by its ID.', items: {
        type: 'object', properties: { id: text, path: { type: 'string', description: "A file on the person's machine." } }, required: ['id', 'path'],
      } },
      version: { type: 'string', description: 'The version being replaced. Required to change an existing note.' },
      confirm: text,
    }, required: ['key'] },
  },
  {
    name: 'vault_set_visibility',
    description: 'Change who can see a note: public (everyone, on the website), friends, or private (only the person). The note itself does not change. Always takes two calls.',
    inputSchema: { type: 'object', properties: { key: text, to: { type: 'string', enum: VISIBILITIES }, confirm: text }, required: ['key', 'to'] },
  },
  {
    name: 'vault_delete',
    description: 'Remove a note for good. Always takes two calls.',
    inputSchema: { type: 'object', properties: { key: text, confirm: text }, required: ['key'] },
    annotations: { destructiveHint: true },
  },
];

const audience = {
  public: 'Everyone can read it, on the website and through any AT Protocol application.',
  friends: 'It is for the people the person follows who follow them back. There is no network for friends to read through yet, so for now only the person sees it.',
  private: 'Only the person can read it.',
};

function summary({ key, visibility, record, version }) {
  const { form, label, sublabel } = filing(record);
  return {
    key, visibility,
    ...(record.title ? { title: record.title } : {}),
    label, ...(sublabel ? { sublabel } : {}), ...(form ? { form } : {}),
    publishedAt: record.publishedAt, ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    address: record.canonicalUrl,
    ...(version ? { version } : {}),
  };
}

// The passage around the first place a note mentions any of the words.
function passage(body, words) {
  const lower = body.toLowerCase();
  const at = Math.min(...words.map(word => lower.indexOf(word)).filter(index => index >= 0), body.length);
  const from = Math.max(0, at - 80);
  return `${from ? '…' : ''}${body.slice(from, at + 160).replace(/\s+/g, ' ').trim()}${at + 160 < body.length ? '…' : ''}`;
}

// `files` reads a file on the person's machine: { bytes, size } for a path.
export function createTools({ vault, did, site, collection, files, imageSize = () => null }) {
  // The value a second call must carry: a name for exactly this request against exactly this note.
  const token = async plan => 'c' + (await recordVersion(plan)).slice(1, 17);
  async function twoSteps(args, plan, willHappen, act) {
    const expected = await token(plan);
    if (args.confirm === undefined) return { done: false, willHappen, confirm: expected, next: 'Show this to the person. If they agree, call again with the same values and this confirm value.' };
    if (args.confirm !== expected) refuse('The note or the request has changed since it was shown. Call again without confirm to see what would happen now.');
    return { done: true, ...await act() };
  }

  async function attachments(media = []) {
    const added = new Map();
    for (const { id, path } of media) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id ?? '') || added.has(id)) refuse('Each attachment needs an ID of letters, digits, hyphens or underscores, used once');
      const mime = FILE_TYPES[/\.[^./\\]+$/.exec(path ?? '')?.[0].toLowerCase()] ?? refuse(`${path} is not a kind of file a note can hold`);
      const { bytes } = await files(path);
      if (!bytes.length || bytes.length > 60_000_000) refuse(`Attachment ${id} must be a nonempty file no larger than 60 MB`);
      const size = mime.startsWith('image/') ? imageSize(bytes) : null;
      added.set(id, { bytes, mime, ...(size ?? {}) });
    }
    return added;
  }

  const calls = {
    async vault_tree() {
      const notes = await vault.list();
      const counts = Object.fromEntries(VISIBILITIES.map(visibility => [visibility, notes.filter(note => note.visibility === visibility).length]));
      return { notes: notes.length, ...counts, labels: vaultTree(notes) };
    },

    async vault_list({ label, sublabel, visibility, limit = 50 }) {
      const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
      const notes = (await vault.list()).filter(note => {
        const filed = filing(note.record);
        return (!visibility || note.visibility === visibility) && (!label || same(filed.label, label)) && (!sublabel || same(filed.sublabel, sublabel));
      }).sort((a, b) => String(b.record.publishedAt).localeCompare(String(a.record.publishedAt)));
      return { found: notes.length, notes: notes.slice(0, limit).map(note => summary({ ...note, version: undefined })) };
    },

    async vault_read({ key }) {
      const note = await vault.find(key) ?? refuse(`No note uses "${key}".`);
      const { record } = note;
      return {
        ...summary(note),
        ...(record.subtitle ? { subtitle: record.subtitle } : {}),
        body: record.body,
        ...(record.connect?.length ? { connect: record.connect } : {}),
        ...(record.media?.length ? { media: record.media.map(item => ({ id: item.id, kind: item.$type.split('#').at(-1), ...(item.alt ? { alt: item.alt } : {}) })) } : {}),
        ...(record.source ? { source: record.source } : {}),
        ...(record.link ? { link: { uri: record.link.uri, ...(record.link.title ? { title: record.link.title } : {}) } } : {}),
        ...(record.site ? { site: record.site } : {}),
      };
    },

    async vault_search({ query, visibility, limit = 10 }) {
      const words = [...new Set(String(query).toLowerCase().split(/\s+/).filter(Boolean))];
      if (!words.length) refuse('Give at least one word to search for');
      const count = (field, word) => field ? field.toLowerCase().split(word).length - 1 : 0;
      const scored = [];
      for (const note of await vault.list()) {
        if (visibility && note.visibility !== visibility) continue;
        const { label, sublabel } = filing(note.record);
        const scores = words.map(word => 5 * count(note.record.title, word) + 3 * count(`${label} ${sublabel}`, word) + count(note.record.body, word));
        // Every word has to appear somewhere in the note.
        if (scores.every(Boolean)) scored.push({ score: scores.reduce((sum, each) => sum + each, 0), note });
      }
      scored.sort((a, b) => b.score - a.score || String(b.note.record.publishedAt).localeCompare(String(a.note.record.publishedAt)));
      return { found: scored.length, notes: scored.slice(0, limit).map(({ note }) => ({ ...summary({ ...note, version: undefined }), passage: passage(note.record.body ?? '', words) })) };
    },

    async vault_save(args) {
      const { key } = args;
      const existing = await vault.find(key);
      const added = await attachments(args.media);
      if (!existing) {
        if (args.version !== undefined) refuse(`"${key}" is no longer there to change.`);
        if (typeof args.body !== 'string') refuse('A new note needs a body');
        const { record } = assembleRecord({
          slug: key, body: args.body, title: args.title, subtitle: args.subtitle,
          ...(args.date ? { publishedAt: args.date } : {}),
          label: args.label, sublabel: args.sublabel, connect: args.connect,
          kinds: [...added.values()].map(({ mime }) => kindOf(mime)),
        }, { did, site, collection });
        const saved = await vault.save({ key, record, visibility: 'private', files: added });
        return { done: true, created: true, ...summary(saved), note: 'It is private. Use vault_set_visibility to show it to friends or everyone.' };
      }

      if (args.version === undefined) refuse(`A ${existing.visibility} note already uses "${key}". Read it with vault_read and pass its version to change it.`);
      if (args.version !== existing.version) refuse(`"${key}" has changed since it was read. Read it again before saving.`);
      const before = existing.record;
      const given = name => args[name] !== undefined;
      const body = given('body') ? args.body : before.body;
      const title = given('title') ? args.title : before.title;
      const facts = bodyFacts(String(body).trim());
      // A note's attachments follow its body: one the body no longer places is let go.
      const kept = (before.media ?? []).filter(item => facts.media.has(item.id) && !added.has(item.id));
      const kinds = [...kept.map(item => item.$type.split('#').at(-1)), ...[...added.values()].map(({ mime }) => kindOf(mime))];
      // The form it had is kept when it still fits; otherwise it is identified again from the content.
      const fits = isForm(before.form) && !formProblems(before.form, { title: title || undefined, facts, kinds }).length;
      const filed = filing(before);
      const label = given('label') ? args.label : filed.label;
      const sublabel = given('sublabel') ? args.sublabel : filed.sublabel;
      const { record } = assembleRecord({
        slug: key, body, title, subtitle: given('subtitle') ? args.subtitle : (title ? before.subtitle : undefined),
        publishedAt: given('date') ? args.date : before.publishedAt,
        form: fits ? before.form : undefined,
        label, sublabel, connect: given('connect') ? args.connect : before.connect,
        source: before.source, own: before.site, kinds, facts,
      }, { did, site, collection });
      // The address is worked out again only when the note is refiled, so a note mirrored from the
      // person's own website keeps the address of the page it came from.
      const refiled = record.label !== filed.label || (record.sublabel ?? '') !== (filed.sublabel ?? '');
      if (!refiled) record.canonicalUrl = before.canonicalUrl;
      if (kept.length) record.media = kept;
      if (before.link && ['link', 'embed'].includes(record.form)) record.link = before.link;
      const write = async () => summary(await vault.save({ key, record, visibility: existing.visibility, version: existing.version, files: added }));
      if (existing.visibility === 'private') return { done: true, ...await write() };
      const changed = ['title', 'subtitle', 'body', 'label', 'sublabel', 'publishedAt', 'canonicalUrl', 'connect', 'form']
        .filter(field => JSON.stringify(record[field]) !== JSON.stringify(before[field]));
      return twoSteps(args, { tool: 'vault_save', key, from: existing.version, to: await recordVersion(record), files: [...added.keys()] }, {
        note: before.title ?? key, visibility: existing.visibility, audience: audience[existing.visibility],
        changes: [...changed, ...(added.size ? ['attachments'] : [])],
        ...(refiled ? { addressBefore: before.canonicalUrl, addressAfter: record.canonicalUrl } : { address: record.canonicalUrl }),
      }, write);
    },

    async vault_set_visibility(args) {
      const { key, to } = args;
      if (!VISIBILITIES.includes(to)) refuse(`Visibility is one of: ${VISIBILITIES.join(', ')}`);
      const existing = await vault.find(key) ?? refuse(`No note uses "${key}".`);
      if (existing.visibility === to) return { done: true, unchanged: true, ...summary(existing) };
      return twoSteps(args, { tool: 'vault_set_visibility', key, from: existing.version, to }, {
        note: existing.record.title ?? key, from: existing.visibility, to, audience: audience[to],
        address: existing.record.canonicalUrl,
        ...(existing.visibility === 'public' ? { warning: 'Making a public note less visible removes it from the website. Copies other people or applications already made of it stay where they are.' } : {}),
      }, async () => summary(await vault.setVisibility(key, to, { version: existing.version })));
    },

    async vault_delete(args) {
      const existing = await vault.find(args.key) ?? refuse(`No note uses "${args.key}".`);
      return twoSteps(args, { tool: 'vault_delete', key: args.key, from: existing.version }, {
        note: existing.record.title ?? args.key, visibility: existing.visibility, address: existing.record.canonicalUrl,
        warning: 'The note is removed for good and cannot be brought back from here.',
      }, async () => ({ removed: summary({ ...await vault.remove(args.key, { version: existing.version }), version: undefined }) }));
    },
  };

  return {
    list: TOOLS,
    async call(name, args = {}) {
      if (!Object.hasOwn(calls, name)) refuse(`There is no tool named ${name}`);
      return calls[name](args);
    },
  };
}
