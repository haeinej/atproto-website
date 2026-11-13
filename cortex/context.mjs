import { cortexVersion } from './core.mjs';
import { memoryStore } from './store.mjs';

export async function getContext({ env, did, posts }) {
  const db = env.DB;
  const store = memoryStore(db);
  await store.seed(did);
  const memories = await store.all(did);
  const vault = await posts.tree(did);
  const { results: recent } = await db.prepare(`SELECT id, slug, title, label, sublabel, updated_at AS "when" FROM posts
    WHERE did = ?1 AND version IS NOT NULL ORDER BY updated_at DESC, id LIMIT 10`).bind(did).all();
  const structure = {
    posts: vault.posts, public: vault.public, friends: vault.friends, private: vault.private,
    labels: vault.labels.map(label => ({
      label: label.label,
      posts: label.posts.length + label.sublabels.reduce((sum, sublabel) => sum + sublabel.posts.length, 0),
      sublabels: label.sublabels.map(sublabel => ({ sublabel: sublabel.sublabel, posts: sublabel.posts.length })),
    })), recent,
  };
  const { results: skills } = await db.prepare('SELECT name, description, version, approved_version FROM cortex_skills WHERE did = ?1 AND version IS NOT NULL ORDER BY name').bind(did).all();
  const { results: tools } = await db.prepare('SELECT name, description, version, enabled, proposed FROM cortex_tools WHERE did = ?1 AND version IS NOT NULL ORDER BY name').bind(did).all();
  const { results: notes } = await db.prepare('SELECT id, text, session, project, written_by AS writtenBy, created_at AS "when" FROM cortex_notes WHERE did = ?1 AND settled_at IS NULL ORDER BY created_at, id').bind(did).all();
  const { results: turns } = await db.prepare('SELECT * FROM cortex_turns WHERE did = ?1 ORDER BY created_at, id').bind(did).all();
  const answer = {
    always: memories.filter(({ memory }) => memory.always).map(item => item.memory.name === 'vault-map' ? { ...item, vault: structure } : item),
    memories: memories.filter(({ memory }) => !memory.always).map(({ memory: { name, description, kind } }) => ({ name, description, kind })),
    // Unapproved skills and proposed or disabled tools are never handed to an agent as usable.
    skills: skills.filter(skill => skill.approved_version === skill.version).map(({ name, description }) => ({ name, description })),
    tools: tools.filter(tool => tool.enabled && !tool.proposed).map(({ name, description }) => ({ name, description })),
    notes, turns: turns.length,
  };
  return { ...answer, version: await cortexVersion({ answer, memories, skills, tools, turns }) };
}
