// The platforms a mirror can follow. Each reads what a platform publishes and returns the same
// plain shape, newest first: { id, url, title, html, text, publishedAt, images, connect }.
import { decode } from './html-to-markdown.mjs';

const options = () => ({ redirect: 'follow', signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; content-mirror)', Accept: '*/*' } });
const date = value => (Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null);

// One element's text from a piece of XML, with CDATA and entities undone.
function field(xml, name) {
  const found = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml)?.[1];
  if (found === undefined) return '';
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(found);
  return cdata ? cdata[1] : decode(found.trim());
}

// Anything that publishes a feed: a website, a newsletter, a blog. JSON Feed, RSS, and Atom.
export async function readFeed(source, get = fetch) {
  const response = await get(source.feed, options());
  if (!response.ok) throw new Error(`${source.feed} answered HTTP ${response.status}`);
  const body = await response.text();
  if (body.trimStart().startsWith('{')) {
    return (JSON.parse(body).items ?? []).map(item => ({
      id: String(item.id ?? item.url), url: item.url ?? item.external_url, title: item.title ?? '',
      html: item.content_html ?? '', text: item.content_text ?? '', publishedAt: date(item.date_published),
    }));
  }
  const atom = /<feed\b/i.test(body);
  return [...body.matchAll(atom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].map(([xml]) => {
    const link = atom
      ? decode((/<link\b(?![^>]*\brel="(?!alternate)[^"]*")[^>]*\bhref="([^"]*)"/i.exec(xml) ?? [])[1] ?? '')
      : field(xml, 'link');
    return {
      id: field(xml, atom ? 'id' : 'guid') || link, url: link, title: field(xml, 'title'),
      html: field(xml, 'content:encoded') || field(xml, 'content') || field(xml, 'description') || field(xml, 'summary'),
      text: '', publishedAt: date(field(xml, atom ? 'published' : 'pubDate') || field(xml, 'updated')),
    };
  });
}

// X, through its API. This needs a token from an X developer account with read access to the
// account's own posts; it has not been run against X. An archive is the way to bring in history.
export async function readX(source, get = fetch, token) {
  if (!token) throw new Error('X needs X_BEARER_TOKEN set as a secret');
  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(source.userId)}/tweets`);
  url.search = new URLSearchParams({
    max_results: '50', exclude: 'retweets', 'tweet.fields': 'created_at,referenced_tweets,entities,note_tweet',
    expansions: 'attachments.media_keys', 'media.fields': 'url,type,alt_text',
  });
  const response = await get(url, { ...options(), headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`X answered HTTP ${response.status}`);
  const data = await response.json();
  const media = new Map((data.includes?.media ?? []).map(item => [item.media_key, item]));
  return (data.data ?? []).map(post => {
    let text = post.note_tweet?.text ?? post.text ?? '';
    // X shortens every link; put the real addresses back, and drop the ones that stand for media.
    for (const link of post.entities?.urls ?? []) text = text.replaceAll(link.url, link.media_key ? '' : link.expanded_url ?? link.url);
    return {
      id: post.id, url: `https://x.com/i/web/status/${post.id}`, title: '', html: '', text: text.trim(),
      publishedAt: date(post.created_at),
      images: (post.attachments?.media_keys ?? []).map(key => media.get(key)).filter(item => item?.type === 'photo' && item.url)
        .map((item, index) => ({ id: `image-${index + 1}`, url: item.url, alt: item.alt_text ?? '' })),
      // A reply or a quote is a post connected to the one it answers.
      connect: (post.referenced_tweets ?? []).filter(other => ['replied_to', 'quoted'].includes(other.type))
        .map(other => `https://x.com/i/web/status/${other.id}`),
    };
  });
}

export function reader(source) {
  if (source.platform === 'x' && source.userId) return readX;
  if (source.feed) return readFeed;
  throw new Error(`The source "${source.platform}" needs a feed address`);
}
