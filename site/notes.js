const notesStatus = document.getElementById('notes-status');
const notesList = document.getElementById('notes-list');
const dateLabel = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function safeHref(value) {
  if (typeof value !== 'string' || !URL.canParse(value, location.href)) return null;
  const url = new URL(value, location.href);
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
}

// The ways to arrange the same posts. Each names the folder a post belongs to.
const views = {
  all: { name: 'All' },
  label: { name: 'Labels', folder: post => post.label },
  platform: { name: 'Platforms', folder: post => post.platform },
  visibility: { name: 'Visibility', folder: post => post.visibility },
};

// One line per post: its name, then its platform, label, and date. The open folder's own name is left out.
function row(post, by) {
  const line = element('span', 'note-row');
  const href = safeHref(post.href);
  const name = element(href ? 'a' : 'span', 'note-name', post.name);
  if (href) name.href = href;
  const meta = element('span', 'note-meta');
  if (by !== 'platform') meta.append(element('span', 'note-platform', post.platform));
  if (by !== 'visibility' && post.visibility === 'private') meta.append(element('span', 'note-label', 'private'));
  if (by !== 'label' && post.label) meta.append(element('span', 'note-label', post.label));
  const time = element('time', '', dateLabel.format(new Date(post.createdAt)));
  time.dateTime = post.createdAt;
  meta.append(time);
  line.append(name, meta);
  return line;
}

const newest = posts => posts.map(post => post.createdAt).sort().at(-1);
const byNewest = ([, a], [, b]) => newest(b).localeCompare(newest(a));

function sorted(posts, key) {
  const groups = new Map();
  for (const post of posts) groups.set(key(post), [...groups.get(key(post)) ?? [], post]);
  return groups;
}

// A flat list of posts. A sublabel reads in the order it was written; everything else is newest first.
function rows(posts, by, oldestFirst = false) {
  const order = oldestFirst ? 1 : -1;
  return posts.sort((a, b) => order * a.createdAt.localeCompare(b.createdAt)).map(post => {
    const item = element('li');
    item.append(row(post, by));
    return item;
  });
}

// A folder opens and closes; what it holds sits one level in.
function folder(name, count, children, address) {
  const item = element('li');
  const details = element('details');
  details.open = true;
  const summary = element('summary');
  const heading = element('span', 'note-row note-folder');
  const title = element(address ? 'a' : 'span', 'note-name', name);
  if (address) title.href = address;
  heading.append(title, element('span', 'note-meta', String(count)));
  summary.append(heading);
  const list = element('ul', 'note-tree');
  list.append(...children);
  details.append(summary, list);
  item.append(details);
  return item;
}

// The address of the folder a post sits in, `depth` steps under /posts/. A post's own address ends
// in its key, so its folders are the steps before that.
function folderOf(post, depth) {
  const steps = typeof post?.href === 'string' && post.href.startsWith('/posts/') ? post.href.split('/').slice(2, -1) : [];
  return steps.length >= depth ? `/posts/${steps.slice(0, depth).join('/')}/` : null;
}

function render(posts, by) {
  if (by === 'all') return rows([...posts], by);
  const groups = sorted(posts, post => views[by].folder(post) ?? '');
  const loose = groups.get('') ?? [];
  groups.delete('');
  // Folders with the newest activity come first. Posts that belong to none follow, outside any folder.
  const folders = [...groups].sort(byNewest).map(([name, members]) => {
    // Only a label has folders inside it: one per sublabel. Platforms and visibility stay flat.
    if (by !== 'label') return folder(name, members.length, rows(members, by));
    const series = sorted(members, post => post.sublabel ?? '');
    const single = series.get('') ?? [];
    series.delete('');
    // A label's folder and each sublabel's folder have addresses of their own.
    return folder(name, members.length, [
      ...[...series].sort(byNewest).map(([title, parts]) => folder(title, parts.length, rows(parts, by, true), folderOf(parts[0], 2))),
      ...rows(single, by),
    ], folderOf(members[0], 1));
  });
  return [...folders, ...rows(loose, by)];
}

// Who the author is, above the list. Only the identity is shown: picture, name, pronouns, and the
// handle the account's DID vouches for. A description and links are optional sections of the profile
// that a site shows on its own pages; this shared page leaves them unlisted.
async function showProfile() {
  try {
    const read = path => fetch(path, { signal: AbortSignal.timeout(10_000) }).then(response => response.ok ? response.json() : {}, () => ({}));
    const [profile, identity] = await Promise.all([read('/notes/profile.json'), read('/notes/identity.json')]);
    const words = (source, field) => typeof source[field] === 'string' ? source[field] : '';
    const handle = words(identity, 'handle');
    if (!words(profile, 'name') && !handle) return;
    const header = element('header', 'note-profile');
    const picture = safeHref(profile.avatar);
    if (picture) {
      const avatar = element('img');
      avatar.src = picture;
      avatar.alt = '';
      header.append(avatar);
    }
    const about = element('div');
    const name = element('p', 'note-profile-name', words(profile, 'name') || handle);
    if (words(profile, 'pronouns')) name.append(element('span', '', words(profile, 'pronouns')));
    about.append(name);
    if (handle && words(profile, 'name')) about.append(element('p', 'note-profile-handle', `@${handle}`));
    header.title = words(identity, 'did');
    header.append(about);
    notesStatus.closest('main').prepend(header);
  } catch {}
}

// The owner's private posts, if this browser is signed in. Visitors never ask for them: the request
// is only made after the owner has arrived from signing in at /notes/private/.
async function privatePosts() {
  const remember = value => {
    try {
      if (value) localStorage.setItem('notes-owner', '1');
      else localStorage.removeItem('notes-owner');
    } catch {}
  };
  let asked = new URLSearchParams(location.search).get('by') === 'visibility';
  try {
    asked ||= localStorage.getItem('notes-owner') === '1';
  } catch {}
  if (!asked) return {};
  try {
    const response = await fetch('/notes/private/graph.json', { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Signed out');
    const posts = await response.json();
    remember(true);
    return posts;
  } catch {
    remember(false);
    return {};
  }
}

async function loadNotes() {
  notesStatus.textContent = 'Loading posts…';
  try {
    const response = await fetch('/notes/graph.json', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Feed unavailable');
    const graph = {};
    const read = (uri, post, visibility) => {
      if (graph[uri] || typeof post?.name !== 'string' || !Number.isFinite(Date.parse(post.createdAt))) return;
      graph[uri] = {
        ...post,
        label: typeof post.label === 'string' && post.label ? post.label : undefined,
        sublabel: typeof post.sublabel === 'string' && post.sublabel ? post.sublabel : undefined,
        platform: typeof post.platform === 'string' && post.platform ? post.platform : 'website',
        visibility,
      };
    };
    for (const [uri, post] of Object.entries(await response.json())) read(uri, post, 'public');
    for (const [uri, post] of Object.entries(await privatePosts())) read(uri, post, 'private');
    // At a folder's address, such as /posts/writings/, only that folder's posts are listed.
    const here = location.pathname.startsWith('/posts/') ? location.pathname : '';
    const inFolder = here.split('/').length - 3;
    const posts = Object.values(graph).filter(post => !inFolder || (typeof post.href === 'string' && post.href.startsWith(here)));
    if (inFolder && posts.length) {
      const names = [posts[0].label, posts[0].sublabel].slice(0, inFolder).filter(Boolean);
      const heading = document.getElementById('notes-title');
      if (heading && names.length) heading.textContent = names.at(-1);
      document.title = names.join(' · ') || document.title;
    }
    // Visibility is only worth offering once something is private.
    const offered = Object.keys(views).filter(by =>
      by !== 'visibility' || posts.some(post => post.visibility === 'private'));
    const switcher = element('nav', 'note-views');
    switcher.setAttribute('aria-label', 'Arrange posts');
    function show(by) {
      for (const link of switcher.children) {
        if (link.dataset.by === by) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
      const items = render(posts, by);
      notesList.replaceChildren(...items);
      notesStatus.textContent = items.length ? '' : 'No posts yet.';
    }
    for (const by of offered) {
      const link = element('a', '', views[by].name);
      link.href = by === 'all' ? location.pathname : `?by=${by}`;
      // Inside a single sublabel there is nothing left to arrange.
      link.hidden = inFolder >= 2 && by !== 'all';
      link.dataset.by = by;
      link.addEventListener('click', event => {
        event.preventDefault();
        history.replaceState(null, '', link.href);
        show(by);
      });
      switcher.append(link);
    }
    notesList.classList.add('note-tree');
    notesList.before(switcher);
    const chosen = new URLSearchParams(location.search).get('by');
    show(offered.includes(chosen) ? chosen : 'all');
  } catch {
    notesStatus.textContent = 'Posts are temporarily unavailable.';
  }
}

void showProfile();
void loadNotes();
