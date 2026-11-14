// A vault: every note a person has, at every visibility, behind one set of operations. The
// commands, the agent's tools, and the editor all go through here, so a note lands the same way
// whichever of them wrote it.
//
// A store holds the notes of one visibility:
//   get(key)                         -> { record, version } or null
//   list()                           -> [{ key, record, version }]   for browsing; read with get before saving
//   put(key, record, { version })    -> { version }   `version` is the one being replaced; none means create
//   remove(key, { version })
//   putBlob(bytes, mime)             -> the blob as a record holds it
//   getBlob(cid)                     -> bytes, or null
import { filing, POST, postPath } from '../feed/pds.mjs';
import { blobCid, mediaEntry, recordBlobs, recordProblems, VaultProblem, VISIBILITIES } from './core.mjs';

const refuse = message => { throw new VaultProblem(message); };

export function createVault({ stores, collection = POST, now = () => new Date() }) {
  for (const visibility of VISIBILITIES) if (!stores[visibility]) throw new Error(`The vault needs a ${visibility} store`);
  const store = visibility => stores[visibility] ?? refuse(`Visibility is one of: ${VISIBILITIES.join(', ')}`);

  // Where a note is, whichever visibility it has. A key is unique across all three.
  async function find(key) {
    const found = [];
    for (const visibility of VISIBILITIES) {
      const held = await stores[visibility].get(key);
      if (held) found.push({ key, visibility, ...held });
    }
    if (found.length > 1) {
      refuse(`"${key}" is stored as ${found.map(note => note.visibility).join(' and ')}. Both copies are preserved. Use operator access to compare the stores and remove only the unwanted copy using its current version; normal vault operations cannot reconcile duplicate keys.`);
    }
    return found[0] ?? null;
  }

  async function list() {
    const notes = [];
    for (const visibility of VISIBILITIES) {
      for (const held of await stores[visibility].list()) notes.push({ visibility, ...held });
    }
    return notes;
  }

  // Create a note, or replace the version that was read.
  //   files: new attachments by ID, each { bytes, mime, sourceUrl, width, height }
  //   linkImage: a link post's preview image, { bytes, mime }
  //   replace: save over whatever is there at this visibility, without having read it
  async function save({ key, record, visibility = 'private', version, replace = false, files = new Map(), linkImage }) {
    const target = store(visibility);
    const existing = await find(key);
    if (existing && existing.visibility !== visibility) {
      refuse(`A ${existing.visibility} note already uses "${key}". Change its visibility instead of saving it again.`);
    }
    if (existing && replace) version = existing.version;
    if (existing && version === undefined) refuse(`A ${visibility} note already uses "${key}". Read it first, and save over the version you read.`);
    if (existing && version !== existing.version) refuse(`"${key}" has changed since it was read. Read it again before saving.`);
    if (!existing && version !== undefined) refuse(`"${key}" is no longer there to replace.`);

    // The note is checked as it will be stored, before any of its files are sent anywhere.
    const next = structuredClone(record);
    const local = async ({ bytes, mime }) => ({ $type: 'blob', mimeType: mime, size: bytes.length, ref: { $link: await blobCid(bytes) } });
    const added = new Map();
    for (const [id, { bytes, mime, ...rest }] of files) added.set(id, mediaEntry(collection, id, { blob: await local({ bytes, mime }), mime, ...rest }));
    if (files.size) next.media = [...(next.media ?? []).filter(item => !files.has(item?.id)), ...added.values()];
    if (linkImage && next.link) next.link.image = await local(linkImage);
    if (existing) next.updatedAt = now().toISOString();
    const problems = recordProblems(next, key, { collection });
    if (problems.length) refuse(problems.join('\n'));
    for (const [id, { bytes, mime }] of files) added.get(id).file = await target.putBlob(bytes, mime);
    if (linkImage && next.link) next.link.image = await target.putBlob(linkImage.bytes, linkImage.mime);
    const written = await target.put(key, next, existing ? { version } : {});
    return { key, visibility, record: next, version: written.version };
  }

  // Move a note between stores without changing it. Its files go first, then the note, and only
  // then is the old copy removed, so a failure part-way never leaves the note nowhere.
  async function setVisibility(key, to, { version } = {}) {
    const target = store(to);
    const existing = await find(key) ?? refuse(`No note uses "${key}".`);
    if (version !== undefined && version !== existing.version) refuse(`"${key}" has changed since it was read. Read it again before moving it.`);
    if (existing.visibility === to) return existing;
    const source = stores[existing.visibility];
    for (const blob of recordBlobs(existing.record)) {
      const cid = blob.ref.$link;
      const bytes = await source.getBlob(cid) ?? refuse(`A file of "${key}" is missing from the ${existing.visibility} store, so the note was not moved.`);
      const stored = await target.putBlob(bytes, blob.mimeType);
      if (stored?.ref?.$link !== cid) refuse(`A file of "${key}" did not arrive intact in the ${to} store, so the note was not moved.`);
    }
    const written = await target.put(key, existing.record, {});
    try {
      await source.remove(key, { version: existing.version });
    } catch (problem) {
      refuse(`"${key}" was copied to ${to}, but its ${existing.visibility} copy could not be removed (${problem.message}). Both copies were preserved. Normal vault operations refuse duplicate keys: inspect both stores with operator access, choose which copy to keep, and remove only the other copy using that store's current version before retrying.`);
    }
    return { key, visibility: to, record: existing.record, version: written.version };
  }

  async function remove(key, { version } = {}) {
    const existing = await find(key) ?? refuse(`No note uses "${key}".`);
    if (version !== undefined && version !== existing.version) refuse(`"${key}" has changed since it was read. Read it again before removing it.`);
    await stores[existing.visibility].remove(key, { version: existing.version });
    return existing;
  }

  return { find, list, save, setVisibility, remove };
}

// The structure of a vault, as an editor shows it: labels, the sublabels inside each, and the notes
// inside those. A note with no label is under `other`.
export function vaultTree(notes) {
  const labels = new Map();
  for (const { key, visibility, record } of notes) {
    const { form, label, sublabel } = filing(record);
    const folder = labels.get(label) ?? labels.set(label, { label, notes: [], sublabels: new Map() }).get(label);
    const inside = sublabel
      ? folder.sublabels.get(sublabel) ?? folder.sublabels.set(sublabel, { sublabel, notes: [] }).get(sublabel)
      : folder;
    inside.notes.push({
      key, visibility, path: postPath({ label, sublabel }, key),
      ...(record.title ? { title: record.title } : {}),
      ...(form ? { form } : {}),
      publishedAt: record.publishedAt,
    });
  }
  const newestFirst = (a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt));
  return [...labels.values()].sort((a, b) => a.label.localeCompare(b.label)).map(folder => ({
    label: folder.label,
    notes: folder.notes.sort(newestFirst),
    sublabels: [...folder.sublabels.values()].sort((a, b) => a.sublabel.localeCompare(b.sublabel))
      .map(group => ({ sublabel: group.sublabel, notes: group.notes.sort(newestFirst) })),
  }));
}
