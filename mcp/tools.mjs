// What an agent can do in a person's vault. Each tool is one thing an agent would decide to do,
// and each is a thin call onto the vault service (service/CAPABILITIES.md): nothing a tool does
// lives only here, so a post saved by an agent is exactly a post saved in the editor.
//
// Reading is free. Anything that changes a post other people are meant to see, or removes one,
// takes two calls: the first says exactly what would happen and returns a `confirm` value, and
// only a second call carrying that value does it. The person sees the first answer before the
// second is made.
import { createHash } from 'node:crypto';
import { VISIBILITIES, VaultProblem } from '../vault/core.mjs';
import { newPostId } from '../vault/file.mjs';

const refuse = message => { throw new VaultProblem(message); };
const text = { type: 'string' };
const which = { type: 'string', description: "The post's slug, or its ID." };

// Each tool, with the requests of the vault service it is made of.
export const TOOLS = [
  {
    name: 'vault_tree',
    description: "The structure of the person's vault: its labels, the sublabels inside them, and each post with who can see it. Start here to learn what the vault holds.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    requests: ['getTree'],
  },
  {
    name: 'vault_list',
    description: 'List posts, newest first, optionally only those under a label or sublabel, at one visibility, or from one platform.',
    inputSchema: { type: 'object', properties: {
      label: text, sublabel: text, visibility: { type: 'string', enum: VISIBILITIES },
      platform: { type: 'string', description: 'Where a post first appeared, such as bluesky. "own" for posts that first appeared nowhere else.' },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    } },
    annotations: { readOnlyHint: true },
    requests: ['getTree'],
  },
  {
    name: 'vault_read',
    description: 'Read one post in full, with its version. The version is needed to save changes to it.',
    inputSchema: { type: 'object', properties: { key: which }, required: ['key'] },
    annotations: { readOnlyHint: true },
    requests: ['getTree', 'getPost'],
  },
  {
    name: 'vault_search',
    description: "Search the person's own posts at every visibility, private ones included. Returns the best matches with a passage from each.",
    inputSchema: { type: 'object', properties: {
      query: text, visibility: { type: 'string', enum: VISIBILITIES }, limit: { type: 'integer', minimum: 1, maximum: 50 },
    }, required: ['query'] },
    annotations: { readOnlyHint: true },
    requests: ['searchPosts'],
  },
  {
    name: 'vault_save',
    description: 'Create a post, or change one that was read. A new post is always private; use vault_set_visibility to mark it for anyone else. To change a post, pass the version vault_read gave; fields left out stay as they are. Changing a post that is not private needs the two calls described in the answer.',
    inputSchema: { type: 'object', properties: {
      key: { type: 'string', description: "The post's slug: lowercase letters and digits joined by hyphens. It is the last part of its address. To change a post, its slug or its ID." },
      body: { type: 'string', description: 'Markdown. A picture or file is placed by its address: ![description](https://…).' },
      title: { type: 'string', description: 'Leave out for a post with no title. Pass an empty string to remove one.' },
      subtitle: text,
      label: { type: 'string', description: "The section of the person's site the post belongs to, in their own words." },
      sublabel: { type: 'string', description: 'A group inside the label, such as a series.' },
      slug: { type: 'string', description: 'A new slug for a post that exists. Changing it changes the post\'s address; it is still the same post.' },
      date: { type: 'string', description: 'When it was published, as a date. Now, if left out for a new post.' },
      connect: { type: 'array', items: text, description: 'What this post branches from: slugs of other posts, AT URIs, or web addresses.' },
      version: { type: 'string', description: 'The version being replaced. Required to change an existing post.' },
      confirm: text,
    }, required: ['key'] },
    requests: ['getTree', 'getPost', 'putPost'],
  },
  {
    name: 'vault_set_visibility',
    description: 'Change who a post is for: public (everyone), friends, or private (only the person). The post itself does not change. Always takes two calls.',
    inputSchema: { type: 'object', properties: { key: which, to: { type: 'string', enum: VISIBILITIES }, confirm: text }, required: ['key', 'to'] },
    requests: ['getTree', 'getPost', 'putPost'],
  },
  {
    name: 'vault_mirror',
    description: "Bring what the person has already published on their PDS into the vault. Always takes two calls: the first only looks, and says what is there, what would differ from what is published, and what could not be kept; the second, with the confirm value, brings the posts in. It only reads the PDS, never publishes, and never changes a post the person has since changed in the vault. Posts that come with no label land under \"other\" and want filing.",
    inputSchema: { type: 'object', properties: { confirm: text } },
    requests: ['importPublished'],
  },
  {
    name: 'vault_delete',
    description: 'Remove a post for good. Always takes two calls.',
    inputSchema: { type: 'object', properties: { key: which, confirm: text }, required: ['key'] },
    annotations: { destructiveHint: true },
    requests: ['getTree', 'getPost', 'deletePost'],
  },
];

// The tools as an agent is told of them: everything above but the requests behind each.
export const OFFERED = TOOLS.map(({ requests, ...tool }) => tool);

// Who a post is for at each visibility. Nothing leaves the vault by being saved: a post marked
// for everyone is published only when the person publishes, which is a step of its own.
const audience = {
  public: 'It is marked for everyone. Saving does not publish it: it reaches the website and other applications only when the person publishes.',
  friends: 'It is marked for the people the person follows who follow them back. There is no network for friends to read through yet, so for now only the person sees it.',
  private: 'Only the person can read it.',
};

// `vault` reaches the vault service as the person: tree, search, get, put, remove
// (scripts/vault-client.mjs).
export function createTools({ vault }) {
  // Every post's line in the tree, each knowing its label and sublabel.
  const lines = async () => (await vault.tree()).labels.flatMap(folder => [
    ...folder.posts.map(post => ({ ...post, label: folder.label, sublabel: '' })),
    ...folder.sublabels.flatMap(group => group.posts.map(post => ({ ...post, label: folder.label, sublabel: group.sublabel }))),
  ]);
  const summary = (line, version) => ({
    id: line.id, slug: line.slug, visibility: line.visibility,
    ...(line.title ? { title: line.title } : {}),
    label: line.label, ...(line.sublabel ? { sublabel: line.sublabel } : {}),
    ...(line.form ? { form: line.form } : {}), ...(line.date ? { date: line.date } : {}),
    ...(line.platform ? { platform: line.platform } : {}),
    ...(line.problems?.length ? { cannotBePublishedYet: line.problems } : {}),
    ...(version ? { version } : {}),
  });
  // A post by its slug or its ID, in full, with its line in the tree.
  async function find(key) {
    const line = (await lines()).find(each => each.slug === key || each.id === key);
    if (!line) return null;
    const { post, version } = await vault.get(line.id);
    return { line, post, version };
  }
  const there = async key => await find(key) ?? refuse(`No post uses "${key}".`);
  const saved = async id => {
    const line = (await lines()).find(each => each.id === id);
    const { version } = await vault.get(id);
    return summary(line, version);
  };
  // What the vault service refuses is said to the agent in the service's own words.
  const asking = async act => {
    try {
      return await act();
    } catch (problem) {
      if (problem instanceof VaultProblem || !problem?.code) throw problem;
      if (problem.code === 'Changed') refuse('The post has changed since it was read. Read it again before saving.');
      refuse(problem.message);
    }
  };

  // The value a second call must carry: a name for exactly this request against exactly this post.
  const token = plan => `c${createHash('sha256').update(JSON.stringify(plan)).digest('hex').slice(0, 16)}`;
  async function twoSteps(args, plan, willHappen, act) {
    const expected = token(plan);
    if (args.confirm === undefined) return { done: false, willHappen, confirm: expected, next: 'Show this to the person. If they agree, call again with the same values and this confirm value.' };
    if (args.confirm !== expected) refuse('The post or the request has changed since it was shown. Call again without confirm to see what would happen now.');
    return { done: true, ...await act() };
  }

  const calls = {
    async vault_tree() {
      const tree = await vault.tree();
      return { posts: tree.posts, public: tree.public, friends: tree.friends, private: tree.private, labels: tree.labels };
    },

    async vault_list({ label, sublabel, visibility, platform, limit = 50 }) {
      const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
      const found = (await lines()).filter(line => (!visibility || line.visibility === visibility)
        && (!label || same(line.label, label)) && (!sublabel || same(line.sublabel, sublabel))
        && (!platform || same(line.platform ?? 'own', platform)))
        .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || a.slug.localeCompare(b.slug));
      return { found: found.length, posts: found.slice(0, limit).map(line => summary(line)) };
    },

    async vault_read({ key }) {
      const { line, post, version } = await there(key);
      return {
        ...summary(line, version),
        ...(post.subtitle ? { subtitle: post.subtitle } : {}),
        body: post.body,
        ...(post.address ? { address: post.address } : {}),
        ...(post.connect?.length ? { connect: post.connect } : {}),
        ...(post.source ? { source: post.source } : {}),
        ...(post.site ? { site: post.site } : {}),
        ...(Object.keys(post.properties ?? {}).length ? { properties: post.properties } : {}),
      };
    },

    async vault_search({ query, visibility, limit = 10 }) {
      if (!String(query ?? '').trim()) refuse('Give at least one word to search for');
      const answered = await asking(() => vault.search({ q: String(query), ...(visibility ? { visibility } : {}), limit: String(limit) }));
      return { found: answered.found, posts: answered.posts };
    },

    async vault_save(args) {
      const { key } = args;
      const existing = await find(key);
      const given = name => args[name] !== undefined;
      if (!existing) {
        if (given('version')) refuse(`"${key}" is no longer there to change.`);
        if (typeof args.body !== 'string') refuse('A new post needs a body');
        const post = {
          id: newPostId(), slug: key, label: args.label ?? '', sublabel: args.sublabel ?? '', visibility: 'private',
          ...(args.title ? { title: args.title } : {}), ...(args.subtitle ? { subtitle: args.subtitle } : {}),
          date: args.date ?? new Date().toISOString(),
          ...(args.connect?.length ? { connect: args.connect } : {}),
          body: args.body.trim(), properties: {},
        };
        await asking(() => vault.put(post));
        return { done: true, created: true, ...await saved(post.id), note: 'It is private. Use vault_set_visibility to mark it for friends or everyone.' };
      }

      const { line, post: before, version } = existing;
      if (!given('version')) refuse(`A ${before.visibility} post already uses "${key}". Read it with vault_read and pass its version to change it.`);
      if (args.version !== version) refuse(`"${key}" has changed since it was read. Read it again before saving.`);
      // Fields left out stay as they are; an empty title or subtitle removes it.
      const post = { ...before };
      for (const name of ['body', 'label', 'sublabel', 'slug', 'date', 'connect']) if (given(name)) post[name] = name === 'body' ? String(args.body).trim() : args[name];
      for (const name of ['title', 'subtitle']) {
        if (!given(name)) continue;
        if (args[name]) post[name] = args[name]; else delete post[name];
      }
      const changed = ['title', 'subtitle', 'body', 'label', 'sublabel', 'slug', 'date', 'connect'].filter(name => JSON.stringify(post[name]) !== JSON.stringify(before[name]));
      if (!changed.length) return { done: true, unchanged: true, ...summary(line, version) };
      const write = async () => {
        await asking(() => vault.put(post, version));
        return saved(post.id);
      };
      if (before.visibility === 'private') return { done: true, ...await write() };
      return twoSteps(args, { tool: 'vault_save', id: post.id, from: version, to: post }, {
        post: before.title ?? before.slug, visibility: before.visibility, audience: audience[before.visibility], changes: changed,
      }, write);
    },

    async vault_set_visibility(args) {
      const { key, to } = args;
      if (!VISIBILITIES.includes(to)) refuse(`Visibility is one of: ${VISIBILITIES.join(', ')}`);
      const { line, post, version } = await there(key);
      if (post.visibility === to) return { done: true, unchanged: true, ...summary(line, version) };
      return twoSteps(args, { tool: 'vault_set_visibility', id: post.id, from: version, to }, {
        post: post.title ?? post.slug, from: post.visibility, to, audience: audience[to],
        ...(line.problems?.length && to === 'public' ? { cannotBePublishedYet: line.problems } : {}),
      }, async () => {
        await asking(() => vault.put({ ...post, visibility: to }, version));
        return saved(post.id);
      });
    },

    async vault_mirror(args) {
      // Looking changes nothing. What it finds is what the confirm value stands for, so if the
      // person's PDS has changed by the second call, the first is shown again.
      const looked = await asking(() => vault.mirror());
      const found = {
        from: looked.site, types: looked.types, records: looked.records, posts: looked.posts,
        ...(looked.differs.length ? { wouldDifferFromWhatIsPublished: looked.differs } : {}),
        ...(looked.lost.length ? { couldNotBeKept: looked.lost } : {}),
        ...(looked.cannotBePublishedYet.length ? { cannotBePublishedYet: looked.cannotBePublishedYet } : {}),
        ...(looked.skipped.length ? { skipped: looked.skipped } : {}),
      };
      return twoSteps(args, { tool: 'vault_mirror', found }, {
        ...found,
        note: 'Posts already in the vault and unchanged are left as they are. A post the person has changed in the vault since is never overwritten. Nothing is published.',
      }, async () => {
        const report = await asking(() => vault.mirror({ apply: true }));
        return {
          broughtIn: report.saved, alreadyThere: report.unchanged.length,
          ...(report.changedThere.length ? { leftAloneBecauseChangedInTheVault: report.changedThere } : {}),
          ...(report.refused.length ? { refused: report.refused } : {}),
          ...(report.lost.length ? { couldNotBeKept: report.lost } : {}),
          next: 'Look at vault_tree. Posts that came with no label are under "other": ask the person where each belongs before filing it.',
        };
      });
    },

    async vault_delete(args) {
      const { line, post, version } = await there(args.key);
      return twoSteps(args, { tool: 'vault_delete', id: post.id, from: version }, {
        post: post.title ?? post.slug, visibility: post.visibility,
        warning: 'The post is removed from the vault for good and cannot be brought back from here.',
      }, async () => {
        await asking(() => vault.remove(post.id, version));
        return { removed: summary(line) };
      });
    },
  };

  return {
    list: OFFERED,
    async call(name, args = {}) {
      if (!Object.hasOwn(calls, name)) refuse(`There is no tool named ${name}`);
      return calls[name](args);
    },
  };
}
