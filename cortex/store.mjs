import { cleanMemory, cortexVersion, InvalidMemory, KINDS, memoryVersion, NAME } from './core.mjs';
import { Refused } from '../service/src/store.mjs';

const PAGE = 1000;
const next = '(SELECT COALESCE(MAX(seq), 0) + 1 FROM cortex_memories WHERE did = ?1)';
const changed = (name, held) => new Refused(409, 'Changed', 'The memory has changed since the version this request names', { name, current: held?.version ?? null });
const known = name => typeof name === 'string' && name.length <= 100 && NAME.test(name) ? name : (() => { throw new Refused(400, 'InvalidMemory', 'Say which memory with its lowercase, hyphenated name'); })();

export function memoryStore(db) {
  const current = (did, name) => db.prepare('SELECT * FROM cortex_memories WHERE did = ?1 AND name = ?2').bind(did, name).first();
  const store = {
    async seed(did) {
      const seeds = [
        { name: 'identity', description: 'Who this member is; compose with them from what they say and show', kind: 'person', body: `Authenticated account: ${did}.\nWhether this is a person or a company, what they do, and how they sound has not yet been composed with them.` },
        { name: 'vault-map', description: 'The current vault structure and the member’s descriptions of its labels', kind: 'reference', body: 'Label descriptions have not yet been composed. Context supplies the current structure, counts and recent posts alongside this memory.' },
        { name: 'working-style', description: 'How this member wants work done, learned from what they say and correct', kind: 'preference', body: 'No working preferences have been stated yet. Learn them from the member; do not infer them from this seed.' },
      ];
      for (const seed of seeds) {
        const memory = cleanMemory({ ...seed, always: true, stated: false, writtenBy: did, seen: { count: 0, last: null } });
        const version = await memoryVersion(memory);
        const now = new Date().toISOString();
        await db.prepare(`INSERT INTO cortex_memories (did, name, version, description, kind, memory, written_by, seq, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?1, ${next}, ?7, ?7) ON CONFLICT (did, name) DO NOTHING`)
          .bind(did, memory.name, version, memory.description, memory.kind, JSON.stringify(memory), now).run();
      }
    },

    async list(did, { since, kind } = {}) {
      const after = since === undefined ? 0 : Number(since);
      if ((since !== undefined && !/^\d+$/.test(String(since))) || !Number.isSafeInteger(after) || after < 0) throw new Refused(400, 'InvalidCursor', 'since is a cursor an earlier list returned');
      if (kind !== undefined && !KINDS.includes(kind)) throw new Refused(400, 'InvalidRequest', `kind is one of: ${KINDS.join(', ')}`);
      const { results } = await db.prepare(`SELECT * FROM cortex_memories WHERE did = ?1 AND seq > ?2
        ${since === undefined ? 'AND version IS NOT NULL' : ''} ORDER BY seq LIMIT ${PAGE + 1}`).bind(did, after).all();
      const page = results.slice(0, PAGE);
      const latest = page.at(-1)?.seq ?? (since !== undefined ? after : (await db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM cortex_memories WHERE did = ?1').bind(did).first()).seq);
      return {
        // An incremental filtered view also removes names that moved to another kind.
        memories: page.filter(row => since !== undefined || !kind || row.kind === kind).map(row => row.version === null || kind && row.kind !== kind ? { name: row.name, removed: true } : {
          name: row.name, version: row.version, description: row.description, kind: row.kind, writtenBy: row.written_by, when: row.updated_at,
        }),
        cursor: String(latest), ...(results.length > PAGE ? { more: true } : {}),
      };
    },

    async read(did, name, { version, history = false } = {}) {
      known(name);
      const live = await current(did, name);
      const held = version === undefined || live?.version === version ? live : await db.prepare(
        'SELECT memory, version FROM cortex_memory_versions WHERE did = ?1 AND name = ?2 AND version = ?3 ORDER BY seq DESC LIMIT 1',
      ).bind(did, name, version).first();
      if (!held?.version) throw new Refused(404, 'NotFound', 'There is no such memory version');
      const earlier = history ? (await db.prepare(`SELECT version, written_by AS writtenBy, created_at AS "when", replaced_at AS replacedAt
        FROM cortex_memory_versions WHERE did = ?1 AND name = ?2 ORDER BY seq DESC`).bind(did, name).all()).results : undefined;
      return { memory: JSON.parse(held.memory), version: held.version, ...(history ? { earlier } : {}) };
    },

    async write(did, given, { replaces = null, writtenBy = did, now = new Date() } = {}) {
      let memory;
      try { memory = cleanMemory(given); } catch (problem) {
        if (problem instanceof InvalidMemory) throw new Refused(400, 'InvalidMemory', problem.message);
        throw problem;
      }
      const held = await current(did, memory.name);
      // These two fields are service-owned, even when a client sends a complete earlier read.
      memory.writtenBy = writtenBy;
      memory.seen = held?.version ? JSON.parse(held.memory).seen : { count: 0, last: null };
      if (memory.notes) {
        for (const id of memory.notes) {
          if (!await db.prepare('SELECT id FROM cortex_notes WHERE did = ?1 AND id = ?2').bind(did, id).first()) throw new Refused(400, 'InvalidMemory', 'A source note must belong to this member');
        }
      }
      const content = await memoryVersion(memory);
      if (held?.version && await memoryVersion(JSON.parse(held.memory)) === content) return { name: memory.name, version: held.version, unchanged: true };
      if (held?.version && replaces === null) throw new Refused(409, 'NameTaken', 'A memory already has this name; read it and name its version to replace it', { name: memory.name, current: held.version });
      if ((held?.version ?? null) !== replaces) throw changed(memory.name, held);
      // A restore is a new revision, not a return to an old concurrency token.
      const version = await cortexVersion({ content, after: held?.seq ?? 0 });
      const saved = await db.prepare(`INSERT INTO cortex_memories (did, name, version, description, kind, memory, written_by, seq, created_at, updated_at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ${next}, ?8, ?8 WHERE ?9 IS NULL OR EXISTS (SELECT 1 FROM cortex_memories WHERE did = ?1 AND name = ?2)
        ON CONFLICT (did, name) DO UPDATE SET version = excluded.version, description = excluded.description, kind = excluded.kind,
          memory = excluded.memory, written_by = excluded.written_by, seq = excluded.seq, updated_at = excluded.updated_at
        WHERE cortex_memories.version IS ?9 RETURNING seq`)
        .bind(did, memory.name, version, memory.description, memory.kind, JSON.stringify(memory), writtenBy, now.toISOString(), replaces).first();
      if (!saved) {
        const latest = await current(did, memory.name);
        if (latest?.version === version) return { name: memory.name, version, unchanged: true };
        throw changed(memory.name, latest);
      }
      return { name: memory.name, version };
    },

    async remove(did, name, { replaces = null, now = new Date() } = {}) {
      const held = await current(did, known(name));
      if (!held?.version) return { name, removed: true, unchanged: true };
      if (held.version !== replaces) throw changed(name, held);
      const gone = await db.prepare(`UPDATE cortex_memories SET version = NULL, memory = NULL, seq = ${next}, updated_at = ?3
        WHERE did = ?1 AND name = ?2 AND version IS ?4 RETURNING seq`).bind(did, name, now.toISOString(), replaces).first();
      if (!gone) {
        const latest = await current(did, name);
        if (!latest?.version) return { name, removed: true, unchanged: true };
        throw changed(name, latest);
      }
      return { name, removed: true };
    },

    async all(did) {
      const { results } = await db.prepare('SELECT memory, version FROM cortex_memories WHERE did = ?1 AND version IS NOT NULL ORDER BY name').bind(did).all();
      return results.map(row => ({ memory: JSON.parse(row.memory), version: row.version }));
    },

    async search(did, { q, limit = 10 } = {}) {
      if (typeof q !== 'string' || !q.trim() || q.length > 2000) throw new Refused(400, 'InvalidRequest', 'q is one or more words, at most 2,000 characters');
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Refused(400, 'InvalidRequest', 'limit is a whole number from 1 to 50');
      const words = [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 12);
      const scored = [];
      for (const { memory } of await store.all(did)) {
        const count = (text, word) => text.toLowerCase().split(word).length - 1;
        const scores = words.map(word => 5 * count(memory.description, word) + count(memory.body, word) + count(memory.name, word));
        if (scores.every(Boolean)) scored.push({ memory, score: scores.reduce((sum, each) => sum + each, 0) });
      }
      scored.sort((a, b) => b.score - a.score || a.memory.name.localeCompare(b.memory.name));
      return { memories: scored.slice(0, limit).map(({ memory }) => {
        const { name, description, kind, body } = memory;
        const at = Math.min(...words.map(word => body.toLowerCase().indexOf(word)).filter(index => index >= 0), body.length);
        const from = Math.max(0, at - 80);
        return { name, description, kind, passage: `${from ? '…' : ''}${body.slice(from, at + 160).replace(/\s+/g, ' ').trim()}${at + 160 < body.length ? '…' : ''}` };
      }) };
    },
  };
  return store;
}
