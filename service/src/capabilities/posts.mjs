// Posts: the member's posts, one at a time. List, read, write, remove, and nothing else.
export default {
  name: 'Posts',
  about: 'Read and change the posts in a vault, one at a time. Every change names the version it replaces, so two edits never overwrite each other unseen.',
  requests: {
    'com.ohmmmm.vault.listPosts': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'Every post with the version it is at. With `since`, a point an earlier list returned, only what changed after it, removals included.',
      takes: { since: 'optional: the `cursor` of an earlier list' },
      gives: '`posts` (id, version, slug, label, sublabel, visibility, title), `cursor`, and `more` when there is another page',
      run: ({ url, posts, did }) => posts.list(did, { since: url.searchParams.get('since') ?? undefined }),
    },
    'com.ohmmmm.vault.getPost': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'One post in full, and its version.',
      takes: { id: 'the post\'s ID' },
      gives: '`post`, `version`',
      run: ({ url, posts, did }) => posts.read(did, url.searchParams.get('id')),
    },
    'com.ohmmmm.vault.putPost': {
      verb: 'POST', asks: 'member', changes: true,
      about: 'Saves one post. `replaces` is the version being replaced and is left out for a new post. Sent twice, it ends the same as sent once. Whatever the post says about who may see it, only this copy changes.',
      takes: { post: 'the whole post', replaces: 'optional: the version it replaces' },
      gives: '`id`, `version`, and `unchanged` when nothing differed',
      run: async ({ body, posts, did }) => {
        const { post, replaces = null } = await body();
        return posts.write(did, post, { replaces });
      },
    },
    'com.ohmmmm.vault.deletePost': {
      verb: 'POST', asks: 'member', changes: true,
      about: 'Removes one post, for good.',
      takes: { id: 'the post\'s ID', replaces: 'the version being removed' },
      gives: '`id`, `removed`',
      run: async ({ body, posts, did }) => {
        const { id, replaces = null } = await body();
        return posts.remove(did, id, { replaces });
      },
    },
  },
};
