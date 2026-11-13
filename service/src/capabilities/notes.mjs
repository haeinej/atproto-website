import { cleanMemory, cortexVersion, InvalidMemory, memoryVersion, NAME } from '../../../cortex/core.mjs';
import { memoryStore } from '../../../cortex/store.mjs';
import { Refused } from '../store.mjs';

const invalid = message => { throw new Refused(400, 'InvalidRequest', message); };
const changed = message => { throw new Refused(409, 'Changed', message); };
const line = (value, max) => typeof value === 'string' && !!value.trim() && [...value].length <= max && !/[\r\n\u0000\u2028\u2029]/u.test(value);
// Source IDs must also fit the foundation memory.notes limit in UTF-16 code units.
const noteId = value => line(value, 200) && value.length <= 200;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(`Use only: ${allowed.join(', ')}`);
};
const projectOf = value => value ?? '';
const rows = async (db, did) => (await db.prepare('SELECT * FROM cortex_notes WHERE did = ?1 ORDER BY created_at, id').bind(did).all()).results;
const publicNote = row => ({
  id: row.id, text: row.text, session: row.session, project: row.project,
  writtenBy: row.written_by, when: row.created_at,
  ...(row.settled_at ? { settledAt: row.settled_at, outcome: row.outcome } : {}),
});

async function addNote({ env: { DB: db }, did, body }) {
  const sent = await body();
  fields(sent, ['id', 'note', 'session', 'project']);
  if (!noteId(sent.id)) invalid('id is a client-made ID, one nonempty line of at most 200 UTF-16 code units');
  if (!line(sent.note, 500)) invalid('note is one nonempty line, at most 500 characters');
  if (!line(sent.session, 200)) invalid('session is one nonempty line, at most 200 characters');
  if (sent.project !== undefined && (typeof sent.project !== 'string' || sent.project.length > 2000 || /[\r\n\u0000\u2028\u2029]/u.test(sent.project))) invalid('project is a repository name or address, at most 2,000 characters');
  const project = sent.project || null;
  await db.prepare(`INSERT INTO cortex_notes (did, id, text, session, project, written_by, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?1, ?6) ON CONFLICT (did, id) DO NOTHING`)
    .bind(did, sent.id, sent.note, sent.session, project, new Date().toISOString()).run();
  const held = await db.prepare('SELECT * FROM cortex_notes WHERE did = ?1 AND id = ?2').bind(did, sent.id).first();
  if (held.text !== sent.note || held.session !== sent.session || held.project !== project) changed('This note ID already holds a different observation');
  return { id: held.id };
}

async function listNotes({ env: { DB: db }, did, url }) {
  const settled = url.searchParams.get('settled');
  if (settled !== null && !['0', '1', 'false', 'true'].includes(settled)) invalid('settled is 1 or true to include settled notes');
  return { notes: (await rows(db, did)).filter(row => ['1', 'true'].includes(settled) || !row.settled_at).map(publicNote) };
}

async function settleNotes({ env: { DB: db }, did, body }) {
  const sent = await body();
  fields(sent, ['notes']);
  if (!Array.isArray(sent.notes) || !sent.notes.length || sent.notes.length > 100) invalid('notes is from 1 to 100 explicit outcomes');
  const ids = new Set();
  for (const item of sent.notes) {
    fields(item, ['id', 'outcome', 'version']);
    if (!noteId(item.id) || ids.has(item.id)) invalid('Each note needs a distinct ID of at most 200 UTF-16 code units');
    ids.add(item.id);
    if (!['kept', 'dropped'].includes(item.outcome) && !(typeof item.outcome === 'string' && item.outcome.length <= 100 && NAME.test(item.outcome))) invalid('outcome is kept, dropped, or a memory name');
    if (['kept', 'dropped'].includes(item.outcome)) {
      if (item.version !== undefined) invalid('Only a memory outcome names a version');
    } else if (!line(item.version, 200)) invalid('A memory outcome names its current version');
  }

  const all = new Map((await rows(db, did)).map(row => [row.id, row]));
  const active = [];
  for (const item of sent.notes) {
    const held = all.get(item.id);
    if (!held) throw new Refused(404, 'NotFound', 'There is no such note');
    if (held.settled_at) {
      if (held.outcome !== item.outcome) changed('A note already has a different settlement outcome');
    } else active.push(item);
  }
  // A successful receipt stays successful even after its memory is edited or removed.
  if (!active.length) return { settled: sent.notes.map(item => item.id) };

  const outcomes = new Map(active.map(item => [item.id, item.outcome]));
  const targets = new Map();
  for (const item of active.filter(item => !['kept', 'dropped'].includes(item.outcome))) {
    if (targets.has(item.outcome) && targets.get(item.outcome) !== item.version) invalid('Notes going into the same memory name the same version');
    targets.set(item.outcome, item.version);
  }
  const store = memoryStore(db);
  const snapshots = new Map(sent.notes.map(item => [item.id, all.get(item.id)]));
  const updates = [];
  const now = new Date().toISOString();
  for (const [name, expected] of targets) {
    const { memory: previous, version: heldVersion } = await store.read(did, name);
    if (heldVersion !== expected) changed('The target memory has changed; read it before settling notes');
    const row = await db.prepare('SELECT seq, version FROM cortex_memories WHERE did = ?1 AND name = ?2').bind(did, name).first();
    if (row?.version !== heldVersion) changed('The target memory has changed; read it before settling notes');
    const incoming = active.filter(item => item.outcome === name).map(item => item.id);
    const sources = [...new Set([...(previous.notes ?? []), ...incoming])];
    // Prior kept observations remain usable evidence, without changing their immutable receipts.
    // Never count a client-supplied number, foreign note, dropped note or another project's note.
    for (const id of sources) {
      const note = all.get(id);
      if (!note || projectOf(note.project) !== projectOf(previous.project)
        || !(['kept', name].includes(note.outcome) || outcomes.get(id) === name)) {
        throw new Refused(400, 'InvalidMemory', 'Source notes must belong to this member and project, and be kept or settled into this memory');
      }
      snapshots.set(id, note);
    }
    const evidence = [...all.values()].filter(note => projectOf(note.project) === projectOf(previous.project)
      && (note.outcome === name || sources.includes(note.id)));
    for (const note of evidence) snapshots.set(note.id, note);
    const sessions = new Set(evidence.map(note => note.session));
    if (!previous.stated && sessions.size < 2) throw new Refused(400, 'InvalidMemory', 'An inferred memory needs observations from at least two distinct sessions');
    let memory;
    try {
      memory = cleanMemory({ ...previous, notes: sources,
        seen: { count: sessions.size, last: evidence.map(note => note.created_at).sort().at(-1) ?? null } });
    } catch (problem) {
      if (problem instanceof InvalidMemory) throw new Refused(400, 'InvalidMemory', problem.message);
      throw problem;
    }
    // Text, stated status and author are unchanged. Only the service's evidence is revised here.
    // Use the same revision recipe and history trigger as memoryStore.write.
    const version = await cortexVersion({ content: await memoryVersion(memory), after: row.seq });
    updates.push(db.prepare(`UPDATE cortex_memories SET memory = ?3, version = ?4,
      seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM cortex_memories WHERE did = ?1), updated_at = ?5
      WHERE did = ?1 AND name = ?2 AND version = ?6`)
      .bind(did, name, JSON.stringify(memory), version, now, expected));
  }

  // D1 batch is a transaction. Its first statement asserts all read preconditions *inside*
  // that transaction; malformed JSON deliberately aborts and rolls back the whole batch.
  // This closes the race between reads and writes without process-local Worker locks.
  const guard = db.prepare(`SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM json_each(?2) expected WHERE NOT EXISTS (
      SELECT 1 FROM cortex_notes WHERE did = ?1 AND id = json_extract(expected.value, '$.id')
      AND settled_at IS json_extract(expected.value, '$.settled_at') AND outcome IS json_extract(expected.value, '$.outcome'))
    ) AND NOT EXISTS (
    SELECT 1 FROM json_each(?3) expected WHERE NOT EXISTS (
      SELECT 1 FROM cortex_memories WHERE did = ?1 AND name = json_extract(expected.value, '$.name')
      AND version = json_extract(expected.value, '$.version'))
    ) THEN 1 ELSE json('cortex-notes-changed') END`)
    .bind(did, JSON.stringify([...snapshots.values()].map(({ id, settled_at, outcome }) => ({ id, settled_at, outcome }))),
      JSON.stringify([...targets].map(([name, version]) => ({ name, version }))));
  const settle = db.prepare(`UPDATE cortex_notes SET settled_at = ?3,
    outcome = (SELECT json_extract(value, '$.outcome') FROM json_each(?2) WHERE json_extract(value, '$.id') = cortex_notes.id)
    WHERE did = ?1 AND settled_at IS NULL AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?2))`)
    .bind(did, JSON.stringify(active), now);
  try {
    await db.batch([guard, ...updates, settle]);
  } catch (problem) {
    if (/malformed JSON/i.test(problem.message)) changed('Notes or target memories changed while settling; read them again');
    throw problem;
  }
  return { settled: sent.notes.map(item => item.id) };
}

export default {
  name: 'Notes',
  about: 'Private observations with client-made IDs and immutable explicit settlement receipts. The member’s agent judges; the service makes no model calls.',
  requests: {
    'com.ohmmmm.cortex.addNote': {
      verb: 'POST', asks: 'member', changes: true,
      about: 'Record one observation without changing memory. The service records the authenticated author and time. Retrying the same ID and content is safe; reusing an ID for different content is refused.',
      takes: { id: 'a client-made ID, at most 200 characters', note: 'one nonempty line, at most 500 characters', session: 'the originating session, at most 200 characters', project: 'optional: repository, at most 2,000 characters' },
      gives: '`id`', run: addNote,
    },
    'com.ohmmmm.cortex.listNotes': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'List unsettled observations, oldest first. With settled=1, include immutable receipts and kept observations to compare across sessions.',
      takes: { settled: 'optional: 1 or true to include settled notes' },
      gives: '`notes` (id, text, session, project, writtenBy, when, and if settled, settledAt and outcome)', run: listNotes,
    },
    'com.ohmmmm.cortex.settleNotes': {
      verb: 'POST', asks: 'member', changes: true,
      about: 'Atomically record from 1 to 100 explicit outcomes: kept, dropped or a memory name with its current version. Each note is settled once. Memory evidence counts distinct originating sessions and preserves earlier memory versions; retries do not count twice.',
      takes: { notes: '1–100 distinct {id, outcome, version?}; a memory outcome requires the current memory version' },
      gives: '`settled` (the note IDs acknowledged)', run: settleNotes,
    },
  },
};
