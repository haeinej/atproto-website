// Every post is one of a fixed set of forms. The form says what kind of object the post is, and it
// is read off the post's own format, so nobody has to name it. The list is closed: tools accept
// only the forms written here. A post's label and sublabel are the author's own words for where
// the post sits on their site, and are not restricted.

const ANY = ['image', 'video', 'audio', 'file'];
const NONE = [];

// title: required | optional | none.   words: may the body have prose of its own.
// media: attachment kinds allowed.     count: [fewest, most] attachments.
// needs: something the body must contain.
export const FORMS = {
  writing: { title: 'required', words: true, media: ANY },
  note: { title: 'none', words: true, media: ANY },
  image: { title: 'optional', words: false, media: ['image'], count: [1, 1] },
  gallery: { title: 'optional', words: false, media: ['image'], count: [2, Infinity] },
  video: { title: 'optional', words: false, media: ['video'], count: [1, Infinity] },
  audio: { title: 'optional', words: false, media: ['audio'], count: [1, Infinity] },
  file: { title: 'optional', words: false, media: ['file'], count: [1, Infinity] },
  media: { title: 'optional', words: false, media: ANY, count: [1, Infinity] },
  link: { title: 'optional', words: true, media: NONE, needs: 'link' },
  embed: { title: 'optional', words: true, media: NONE, needs: 'player' },
  quote: { title: 'none', words: true, media: NONE, needs: 'quote' },
  list: { title: 'optional', words: true, media: NONE, needs: 'list' },
  code: { title: 'optional', words: false, media: NONE, needs: 'code' },
};

// Sites whose links play something. A post that is a link to one of these is an embed.
const PLAYERS = [
  'youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'tiktok.com', 'soundcloud.com', 'bandcamp.com',
  'open.spotify.com', 'music.apple.com', 'podcasts.apple.com',
];

export function isPlayer(href) {
  if (typeof href !== 'string' || !URL.canParse(href)) return false;
  const host = new URL(href).hostname.replace(/^www\./, '');
  return PLAYERS.some(player => host === player || host.endsWith(`.${player}`));
}

export const isForm = value => typeof value === 'string' && Object.hasOwn(FORMS, value);

// A label or sublabel as the author wrote it, trimmed.
export function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

// The form, read off the post. `facts` describes the body and `kinds` lists its attachments.
//   only attachments   -> image (one), gallery (several images), video, audio, file, or media (a mix)
//   only code blocks   -> code
//   only a list        -> list
//   untitled, a quoted passage and a link to its source -> quote
//   untitled, a link on a line of its own -> embed when it plays something, otherwise link
//   anything else      -> writing when it has a title, note when it does not
export function identifyForm({ title, facts, kinds }) {
  const types = [...new Set(kinds)];
  if (!facts.text && !facts.code && types.length) {
    if (types.length > 1) return 'media';
    return types[0] === 'image' && kinds.length > 1 ? 'gallery' : types[0];
  }
  if (!types.length) {
    if (facts.code && !facts.text) return 'code';
    if (facts.onlyList) return 'list';
    if (!title && facts.quote && facts.links.length) return 'quote';
    if (!title && facts.bareLink) return isPlayer(facts.bareLink) ? 'embed' : 'link';
  }
  return title ? 'writing' : 'note';
}

const has = {
  link: facts => facts.links.length > 0,
  player: facts => facts.links.some(isPlayer),
  quote: facts => facts.quote && facts.links.length > 0,
  list: facts => facts.onlyList,
  code: facts => facts.code && !facts.text,
};
const missing = {
  link: 'A link needs a link in the body',
  player: 'An embed needs a link to something that plays, such as a YouTube or SoundCloud page',
  quote: 'A quote needs a quoted passage and a link to its source',
  list: 'A list has nothing in its body but a list',
  code: 'A code post has nothing in its body but code blocks',
};

// Why a post does not fit its form, as sentences to show the author. Empty when it fits.
export function formProblems(name, { title, facts, kinds }) {
  if (!isForm(name)) return [`Set the form to one of: ${Object.keys(FORMS).join(', ')}`];
  const form = FORMS[name];
  const problems = [];
  if (form.title === 'required' && !title) problems.push(`A ${name} needs a title`);
  if (form.title === 'none' && title) problems.push(`A ${name} has no title; a titled post is a writing`);
  if (!form.words && (facts.text || (name !== 'code' && facts.code))) {
    problems.push(`The ${name} form has no words of its own; describe an attachment in its alt text, or use the note or writing form`);
  }
  for (const kind of new Set(kinds)) {
    if (!form.media.includes(kind)) problems.push(`The ${name} form cannot hold ${kind}`);
  }
  const [fewest, most] = form.count ?? [0, Infinity];
  if (kinds.length < fewest) problems.push(`The ${name} form needs at least ${fewest} ${form.media.join(' or ')} attachment${fewest > 1 ? 's' : ''}`);
  if (kinds.length > most) problems.push(`The ${name} form holds ${most} attachment; several images are a gallery`);
  if (form.needs && !has[form.needs](facts)) problems.push(missing[form.needs]);
  return problems;
}
