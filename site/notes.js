const notesStatus = document.getElementById('notes-status');
const notesList = document.getElementById('notes-list');
const dateLabel = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

function sourceLink(url, label) {
  if (typeof url !== 'string' || !URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  const link = document.createElement('a');
  link.href = parsed.href;
  link.textContent = label;
  return link;
}

async function loadNotes() {
  notesStatus.textContent = 'Loading posts…';
  try {
    const response = await fetch('/notes.json', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Feed unavailable');
    const { notes } = await response.json();
    if (!Array.isArray(notes)) throw new Error('Invalid feed');

    const items = document.createDocumentFragment();
    for (const note of notes) {
      if (typeof note?.text !== 'string' || !Number.isFinite(Date.parse(note.createdAt))) continue;

      const item = document.createElement('li');
      const permalink = typeof note.permalink === 'string' && note.permalink.startsWith('/posts/') ? note.permalink : '';
      if (note.title && permalink) {
        const title = document.createElement('h2');
        const link = document.createElement('a');
        link.href = permalink;
        link.textContent = note.title;
        title.append(link);
        item.append(title);
      }
      const meta = document.createElement('div');
      meta.className = 'note-meta';
      const time = document.createElement('time');
      time.dateTime = note.createdAt;
      time.textContent = dateLabel.format(new Date(note.createdAt));
      if (permalink && !note.title) {
        const link = document.createElement('a');
        link.href = permalink;
        link.setAttribute('aria-label', `Post from ${time.textContent}`);
        link.append(time);
        meta.append(link);
      } else {
        meta.append(time);
      }
      const original = sourceLink(note.sourceUrl, 'Original post');
      if (original) meta.append(original);

      if (typeof note.postUrl === 'string' && note.postUrl.startsWith('https://bsky.app/profile/')) {
        const source = document.createElement('a');
        source.href = note.postUrl;
        source.textContent = 'View on Bluesky';
        source.setAttribute('aria-label', `View on Bluesky, ${time.textContent}`);
        meta.append(source);
      }

      item.append(meta);
      if (typeof note.bodyHtml === 'string') {
        const body = document.createElement('div');
        body.className = 'post-body';
        // The same-origin Worker renders CommonMark with raw HTML disabled.
        body.innerHTML = note.bodyHtml;
        item.append(body);
      } else if (note.text) {
        const text = document.createElement('p');
        text.className = 'note-text';
        text.textContent = note.text;
        item.append(text);
      }
      if (Array.isArray(note.images) && note.images.length) {
        const gallery = document.createElement('div');
        gallery.className = 'note-images';
        for (const image of note.images) {
          const img = document.createElement('img');
          img.src = image.url;
          img.alt = image.alt;
          img.loading = 'lazy';
          img.decoding = 'async';
          gallery.append(img);
        }
        item.append(gallery);
      }
      if (typeof note.video === 'string') {
        const video = document.createElement('video');
        video.src = note.video;
        video.preload = 'none';
        video.controls = true;
        item.append(video);
      }
      items.append(item);
    }
    notesList.replaceChildren(items);
    notesStatus.textContent = notesList.childElementCount ? '' : 'No posts yet.';
  } catch {
    notesStatus.textContent = 'Posts are temporarily unavailable.';
  }
}

void loadNotes();
