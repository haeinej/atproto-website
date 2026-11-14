// Sync between a member's own folder and ohm's working copy of their vault. The folder is theirs
// and holds their originals; the working copy is what the editor and their agent work in. Sync
// brings the two into line, in both directions, and never publishes anything.
//
// What it will not do on its own: overwrite a post that changed on both sides, remove a post
// because its file went missing, or remove a file because its post was removed in ohm. Each of
// those is reported and left for the member to decide.
//
//   folder: list() -> [{ path, text }], write(path, text), remove(path), state() -> {}, keep(state)
//   vault:  list() -> [{ id, version } | { id, removed: true }], get(id) -> { post, version },
//           put(post, replaces) -> { version }, remove(id, replaces)
import { VaultProblem } from './core.mjs';
import { filePost, isPostId, newPostId, postFile, postProblems, postVersion, setProperty } from './file.mjs';

// take: what the member decided for a post that sync would not decide alone, by its ID:
//   'folder' or 'ohm' for a post changed on both sides, 'remove' for one removed on one side.
export async function syncFolder({ folder, vault, apply = false, take = {}, now = () => Date.now() }) {
  const report = { toOhm: [], toFolder: [], same: 0, conflicts: [], ask: [], problems: [], applied: apply };
  const state = (await folder.state()) ?? {};
  const next = {};
  const settledIds = new Set();

  // The folder: every file that is a post, by the ID it carries. A file with none is new.
  const files = new Map();
  const fresh = [];
  const beside = [];
  const listed = await folder.list();
  const occupied = new Map(listed.map(file => [file.path, file.text]));
  const reserved = new Map();
  const blockedIds = new Set();
  const blockedPaths = new Set();
  for (const { path, text } of listed) {
    if (path.endsWith('.from-ohm')) beside.push(path);
    const read = filePost(path, text);
    if (!read) continue;
    const { post, problems } = read;
    if (problems.length) {
      report.problems.push({ path, problems });
      blockedPaths.add(path);
      if (post.id) blockedIds.add(post.id);
      continue;
    }
    if (!post.id) fresh.push({ path, text, post });
    else if (files.has(post.id)) {
      report.problems.push({ path, problems: [`It carries the same id as ${files.get(post.id).path}. A copied file needs its id property removed, to become a post of its own.`] });
      blockedIds.add(post.id);
      blockedPaths.add(path);
      blockedPaths.add(files.get(post.id).path);
    }
    else files.set(post.id, { path, text, post, version: await postVersion(post) });
  }
  for (const [id, last] of Object.entries(state)) if (blockedPaths.has(last.path)) blockedIds.add(id);
  // The working copy, removals included: a post removed in ohm is told apart from one ohm never had.
  const held = new Map((await vault.list()).map(each => [each.id, each]));

  const toOhm = async (id, file, replaces) => {
    report.toOhm.push({ id, path: file.path, slug: file.post.slug, ...(replaces ? {} : { new: true }) });
    if (!apply) return (next[id] = state[id]);
    try {
      const { version } = await vault.put(file.post, replaces);
      next[id] = { version, path: file.path };
      settledIds.add(id);
    } catch (problem) {
      report.toOhm.pop();
      report.problems.push({ path: file.path, problems: [problem.message] });
      next[id] = state[id];
    }
  };
  const toFolder = async (id, file) => {
    const { post, version } = await vault.get(id);
    const made = postFile(post);
    if ((occupied.has(made.path) && file?.path !== made.path) || (reserved.has(made.path) && reserved.get(made.path) !== id)) {
      report.problems.push({ path: made.path, problems: ['The destination is occupied by another file or post. Nothing there was replaced; resolve the path collision and sync again.'] });
      next[id] = state[id];
      return;
    }
    reserved.set(made.path, id);
    report.toFolder.push({ id, path: made.path, slug: post.slug, ...(file ? (file.path !== made.path ? { from: file.path } : {}) : { new: true }) });
    if (!apply) return (next[id] = state[id]);
    await folder.write(made.path, made.text);
    if (file && file.path !== made.path) await folder.remove(file.path);
    next[id] = { version, path: made.path };
    settledIds.add(id);
  };

  for (const id of new Set([...files.keys(), ...held.keys(), ...Object.keys(state)])) {
    if (blockedIds.has(id)) { next[id] = state[id]; continue; }
    const file = files.get(id);
    const there = held.get(id);
    const post = there && !there.removed ? there : null;
    const last = state[id];
    const changedHere = file && file.version !== last?.version;
    const changedThere = post && post.version !== last?.version;

    if (file && post) {
      if (file.version === post.version) {
        // The same post in both places, however its file is laid out. Nothing to do.
        report.same++;
        next[id] = { version: post.version, path: file.path };
        settledIds.add(id);
      } else if (changedHere && !changedThere) await toOhm(id, file, post.version);
      else if (changedThere && !changedHere) await toFolder(id, file);
      else if (take[id] === 'folder') await toOhm(id, file, post.version);
      else if (take[id] === 'ohm') await toFolder(id, file);
      else {
        // Changed in both places. Neither is overwritten; ohm's version is put beside the file so
        // the two can be compared, and the member says which stands.
        report.conflicts.push({ id, path: file.path, slug: file.post.slug, beside: `${file.path}.from-ohm` });
        if (apply) await folder.write(`${file.path}.from-ohm`, postFile((await vault.get(id)).post).text);
        next[id] = last;
      }
    } else if (file) {
      if (there?.removed && !changedHere && take[id] !== 'folder') {
        // Removed in ohm, and the file is as it was. The file is the member's, so it is asked about.
        if (take[id] === 'remove') {
          report.toFolder.push({ id, path: file.path, slug: file.post.slug, removed: true });
          if (apply) { await folder.remove(file.path); settledIds.add(id); }
        } else {
          report.ask.push({ id, path: file.path, slug: file.post.slug, question: 'This post was removed in ohm. Remove its file too?' });
          next[id] = last;
        }
      } else {
        // Ohm does not have it: it is new, or it was changed here after being removed there, or
        // ohm's copy is gone. The folder holds the original, so it goes back in.
        await toOhm(id, file, null);
      }
    } else if (post) {
      if (last && !changedThere && take[id] !== 'ohm') {
        // Its file is gone and the post is as it was. A missing file is never taken as an instruction.
        if (take[id] === 'remove') {
          report.toOhm.push({ id, path: last.path, removed: true });
          if (apply) { await vault.remove(id, post.version); settledIds.add(id); }
        } else {
          report.ask.push({ id, path: last.path, slug: post.slug, question: 'This post\'s file is gone from your folder. Remove the post from ohm too?' });
          next[id] = last;
        }
      } else {
        await toFolder(id, null);
      }
    }
    // Gone from both: nothing to keep.
  }

  // New files are given their ID in the file first, and only then sent, so a sync that stops
  // half-way and is run again finds the same post and does not make a second one.
  for (const { path, text, post } of fresh) {
    const id = newPostId(now());
    const made = { ...post, id };
    const problems = postProblems(made);
    if (problems.length) {
      report.problems.push({ path, problems });
      continue;
    }
    if (apply) await folder.write(path, setProperty(text, 'id', id));
    await toOhm(id, { path, post: made }, null);
  }

  if (apply) {
    // Absence from the conflict report is not a resolution: a pull or save may have refused.
    // Remove only recognized comparison copies for a post that actually settled this run.
    const open = new Set(report.conflicts.map(each => each.beside));
    for (const path of beside) {
      const original = path.slice(0, -'.from-ohm'.length);
      const read = filePost(original, occupied.get(path));
      if (!open.has(path) && !blockedPaths.has(original) && read && !read.problems.length && settledIds.has(read.post.id)) await folder.remove(path);
    }
    await folder.keep(Object.fromEntries(Object.entries(next).filter(([, value]) => value)));
  }
  return report;
}

export { VaultProblem, isPostId };
