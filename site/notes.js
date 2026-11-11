const notesStatus = document.getElementById('notes-status');
const notesList = document.getElementById('notes-list');
const dateLabel = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

async function loadNotes() {
  notesStatus.textContent = 'Loading notes…';
  try {
    const response = await fetch('/notes.json', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Feed unavailable');
    const { notes } = await response.json();
    if (!Array.isArray(notes)) throw new Error('Invalid feed');

    const items = document.createDocumentFragment();
    for (const note of notes) {
      if (typeof note?.text !== 'string' || !Number.isFinite(Date.parse(note.createdAt))) continue;

      const item = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'note-meta';
      const time = document.createElement('time');
      time.dateTime = note.createdAt;
      time.textContent = dateLabel.format(new Date(note.createdAt));
      meta.append(time);

      if (typeof note.sourceUrl === 'string' && /^https:\/\/x\.com\/i\/web\/status\/\d{1,19}$/.test(note.sourceUrl)) {
        const source = document.createElement('a');
        source.href = note.sourceUrl;
        source.textContent = 'Original on X';
        source.setAttribute('aria-label', `Original on X, ${time.textContent}`);
        meta.append(source);
      }

      if (typeof note.postUrl === 'string' && note.postUrl.startsWith('https://bsky.app/profile/')) {
        const source = document.createElement('a');
        source.href = note.postUrl;
        source.textContent = 'View on Bluesky';
        source.setAttribute('aria-label', `View on Bluesky, ${time.textContent}`);
        meta.append(source);
      }

      item.append(meta);
      if (note.text) {
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
    notesStatus.textContent = notesList.childElementCount ? '' : 'No notes yet.';
  } catch {
    notesStatus.textContent = 'Notes are temporarily unavailable.';
  }
}

void loadNotes();
