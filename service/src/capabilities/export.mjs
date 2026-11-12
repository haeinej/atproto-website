// Export: the vault as files, to take away.
import { postFile } from '../../../vault/file.mjs';

export default {
  name: 'Export',
  about: 'The whole vault written out as files a person can keep: each post as Markdown, where it sits in a folder. The same files open in Obsidian, and read back as the same posts.',
  requests: {
    'com.ohmmmm.vault.exportFiles': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'Every post as a file: its path in a folder, and its text.',
      takes: {},
      gives: '`files` (path, text)',
      run: async ({ posts, did }) => ({ files: (await posts.all(did)).map(postFile) }),
    },
  },
};
