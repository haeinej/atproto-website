import { memoryStore } from '../../../cortex/store.mjs';

async function memories({ env, did }) {
  const store = memoryStore(env.DB);
  await store.seed(did);
  return store;
}

export default {
  name: 'Memory',
  about: 'Private memories for the authenticated member. Every rewrite names the version it replaces and preserves that earlier version.',
  requests: {
    'com.ohmmmm.cortex.listMemories': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'List memory descriptions and versions, with a stable cursor. With since, include changes and removals.',
      takes: { since: 'optional: an earlier cursor', kind: 'optional: person, preference, project or reference' },
      gives: '`memories` (name, version, description, kind, writtenBy, when), `cursor`, and optionally `more`',
      run: async context => (await memories(context)).list(context.did, {
        since: context.url.searchParams.get('since') ?? undefined, kind: context.url.searchParams.get('kind') ?? undefined,
      }),
    },
    'com.ohmmmm.cortex.getMemory': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'Read a memory in full. An optional version reads a preserved earlier version; putMemory can restore it with the current replaces value.',
      takes: { name: 'the memory name', version: 'optional: a preserved earlier version', history: 'optional: 1 to list earlier versions and their authors and times' },
      gives: '`memory`, `version`, and with history=1, `earlier` (version, writtenBy, when, replacedAt)',
      run: async context => (await memories(context)).read(context.did, context.url.searchParams.get('name'), {
        version: context.url.searchParams.get('version') ?? undefined, history: context.url.searchParams.get('history') === '1',
      }),
    },
    'com.ohmmmm.cortex.putMemory': {
      verb: 'POST', asks: 'member', changes: true,
      about: 'Save the whole memory, naming the version it replaces. The service sets writtenBy from the authenticated principal and retains its own seen counters. Repeated writes are safe.',
      takes: { memory: 'the whole memory', replaces: 'optional: the version it replaces' },
      gives: '`name`, `version`, and `unchanged` when nothing differed',
      run: async context => {
        const { memory, replaces = null } = await context.body();
        return (await memories(context)).write(context.did, memory, { replaces, writtenBy: context.did });
      },
    },
    'com.ohmmmm.cortex.deleteMemory': {
      verb: 'POST', asks: 'member', changes: true,
      about: 'Remove a memory, naming its current version. Earlier text remains private in history; the removal is included in the next incremental list.',
      takes: { name: 'the memory name', replaces: 'the version being removed' },
      gives: '`name`, `removed`',
      run: async context => {
        const { name, replaces = null } = await context.body();
        return (await memories(context)).remove(context.did, name, { replaces });
      },
    },
    'com.ohmmmm.cortex.searchMemories': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'Find memories mentioning every word of q. A description counts more than the body. Ties are ordered by name.',
      takes: { q: 'words to find', limit: 'optional: 10 unless said, at most 50' },
      gives: '`memories` (name, description, kind, passage), best first',
      run: async context => (await memories(context)).search(context.did, {
        q: context.url.searchParams.get('q'), limit: context.url.searchParams.has('limit') ? Number(context.url.searchParams.get('limit')) : 10,
      }),
    },
  },
};
