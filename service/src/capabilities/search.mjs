// Search: finding posts by what they say.
import { Refused } from '../store.mjs';

const VISIBILITIES = ['public', 'friends', 'private'];

// The passage around the first place a post mentions any of the words.
function passage(body, words) {
  const lower = body.toLowerCase();
  const at = Math.min(...words.map(word => lower.indexOf(word)).filter(index => index >= 0), body.length);
  const from = Math.max(0, at - 80);
  return `${from ? '…' : ''}${body.slice(from, at + 160).replace(/\s+/g, ' ').trim()}${at + 160 < body.length ? '…' : ''}`;
}

export default {
  name: 'Search',
  about: 'Find posts by the words in them, at every visibility. A title counts for more than a label, and a label for more than the body.',
  requests: {
    'com.ohmmmm.vault.searchPosts': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'The posts that mention every word of `q`, best first, each with a passage that shows where.',
      takes: { q: 'the words to look for', visibility: 'optional: only posts at this visibility', limit: 'optional: how many, 10 unless said, 50 at most' },
      gives: '`found`, and `posts` (id, slug, title, label, sublabel, visibility, date, passage)',
      run: async ({ url, posts, did }) => {
        const words = [...new Set(String(url.searchParams.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 12);
        if (!words.length) throw new Refused(400, 'InvalidRequest', 'Give at least one word to search for, as q');
        const visibility = url.searchParams.get('visibility');
        if (visibility !== null && !VISIBILITIES.includes(visibility)) throw new Refused(400, 'InvalidRequest', `visibility is one of: ${VISIBILITIES.join(', ')}`);
        const asked = url.searchParams.get('limit');
        const limit = asked === null ? 10 : Number(asked);
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Refused(400, 'InvalidRequest', 'limit is a whole number from 1 to 50');
        const count = (field, word) => (field ? String(field).toLowerCase().split(word).length - 1 : 0);
        const scored = [];
        for (const post of await posts.all(did)) {
          if (visibility && post.visibility !== visibility) continue;
          const scores = words.map(word => 5 * count(post.title, word) + 3 * count(`${post.label} ${post.sublabel}`, word) + count(post.body, word));
          // Every word has to appear somewhere in the post.
          if (scores.every(Boolean)) scored.push({ score: scores.reduce((sum, each) => sum + each, 0), post });
        }
        scored.sort((a, b) => b.score - a.score || String(b.post.date ?? '').localeCompare(String(a.post.date ?? '')) || a.post.slug.localeCompare(b.post.slug));
        return {
          found: scored.length,
          posts: scored.slice(0, limit).map(({ post }) => ({
            id: post.id, slug: post.slug, ...(post.title ? { title: post.title } : {}), label: post.label, sublabel: post.sublabel, visibility: post.visibility,
            ...(post.date ? { date: post.date } : {}), passage: passage(post.body ?? '', words),
          })),
        };
      },
    },
  },
};
