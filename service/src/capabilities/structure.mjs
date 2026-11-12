// Structure: what the vault holds, without the posts' text.
export default {
  name: 'Structure',
  about: 'The shape of a vault: its labels, the sublabels inside them, and a line for each post. Enough to draw it or decide where something belongs, without reading any post in full.',
  requests: {
    'com.ohmmmm.vault.getTree': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'Labels, sublabels, and each post with who may see it, what kind of thing it is, the platform it first appeared on if that was somewhere else, and why it cannot be published, if it cannot.',
      takes: {},
      gives: '`posts`, `public`, `friends`, `private` (counts), and `labels`, each with its `posts` and `sublabels`',
      run: ({ posts, did }) => posts.tree(did),
    },
  },
};
