// A member's own folder on their machine, as sync sees it: the files that could be posts, and
// what sync remembers between runs, kept in the folder itself under .ohm/.
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export function localFolder(root) {
  root = resolve(root);
  const inside = path => {
    const full = resolve(root, path);
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`${path} is outside the folder`);
    return full;
  };
  async function walk(folder, found) {
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      // An editor's own settings, version control, and anything else kept aside are not posts.
      if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'node_modules') continue;
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path, found);
      else if (entry.isFile() && /\.md$|\.from-ohm$/i.test(entry.name)) found.push({ path, text: await readFile(join(root, path), 'utf8') });
    }
    return found;
  }
  return {
    root,
    list: () => walk('', []),
    // Written whole or not at all, so a file is never left half-written.
    async write(path, text) {
      const full = inside(path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(`${full}.writing`, text);
      await rename(`${full}.writing`, full);
    },
    remove: path => rm(inside(path), { force: true }),
    state: () => readFile(join(root, '.ohm', 'sync.json'), 'utf8').then(JSON.parse, () => null),
    async keep(state) {
      await mkdir(join(root, '.ohm'), { recursive: true });
      await writeFile(join(root, '.ohm', 'sync.json'), `${JSON.stringify(state, null, 2)}\n`);
    },
  };
}
