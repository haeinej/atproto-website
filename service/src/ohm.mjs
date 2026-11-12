// Signing in with an ohm account. The page a member works in is served beside ohm's own sign-in,
// so their browser sends the same session cookie here. This asks the service that issued the
// cookie whose it is, and never reads or keeps the cookie itself beyond that question.
//
// An ohm account says who is at the keyboard. Which AT Protocol account they work in is a
// separate fact, proved once by their PDS and kept as a link.
import { Refused } from './store.mjs';

const asked = new Map();

// The ohm account a request's cookie belongs to, or nothing. An answer is remembered for a
// minute, so a page making many requests asks the sign-in service once.
export async function ohmUser(request, env, get = fetch) {
  const cookie = request.headers.get('Cookie');
  if (!cookie || !env.OHM_APP_ORIGIN) return null;
  const held = asked.get(cookie);
  if (held && held.until > Date.now()) return held.user;
  const address = new URL('/api/auth/get-session', env.OHM_APP_ORIGIN);
  const options = {
    headers: { Cookie: cookie, Accept: 'application/json', ...(request.headers.get('CF-Connecting-IP') ? { 'CF-Connecting-IP': request.headers.get('CF-Connecting-IP') } : {}) },
    redirect: 'manual', signal: AbortSignal.timeout(10_000),
  };
  let data = null;
  try {
    // The sign-in service is reached directly when the two are bound together, otherwise at its address.
    const response = env.AUTH ? await env.AUTH.fetch(new Request(address, options)) : await get(address, options);
    data = response.ok ? await response.json() : null;
  } catch {
    throw new Refused(503, 'SignInUnavailable', 'ohm sign-in could not be reached. Try again in a moment.');
  }
  const user = typeof data?.user?.id === 'string' && data.user.id ? { id: data.user.id, name: typeof data.user.name === 'string' ? data.user.name : '' } : null;
  if (asked.size > 500) asked.clear();
  asked.set(cookie, { user, until: Date.now() + 60_000 });
  return user;
}
export const forget = request => asked.delete(request.headers.get('Cookie'));

// A request that rides on a cookie has to come from ohm's own pages. A browser sends the cookie
// along with a request any page makes, so anything that changes something is refused unless the
// browser says the page that made it is ours.
export function fromOurPages(request, env) {
  if (['GET', 'HEAD'].includes(request.method)) return;
  if (request.headers.get('Origin') !== new URL(env.OHM_APP_ORIGIN).origin) throw new Refused(403, 'WrongOrigin', 'Please try again from ohm');
}

export function links(db) {
  return {
    didOf: async user => (await db.prepare('SELECT did FROM links WHERE user_id = ?1').bind(user).first())?.did ?? null,
    // The account an ohm account works in, and whether what it had published has been brought in.
    of: async user => {
      const row = await db.prepare('SELECT did, mirrored_at FROM links WHERE user_id = ?1').bind(user).first();
      return row ? { did: row.did, mirrored: Boolean(row.mirrored_at) } : null;
    },
    mirrored: (user, now = new Date()) => db.prepare('UPDATE links SET mirrored_at = ?2 WHERE user_id = ?1 AND mirrored_at IS NULL').bind(user, now.toISOString()).run(),
    // One ohm account works in one AT Protocol account, and the other way round.
    async connect(user, did, now = new Date()) {
      const taken = await db.prepare('SELECT user_id, did FROM links WHERE user_id = ?1 OR did = ?2').bind(user, did).all();
      for (const row of taken.results) {
        if (row.user_id === user && row.did === did) return { did, already: true };
        if (row.user_id === user) throw new Refused(409, 'AlreadyConnected', 'This ohm account already works in another AT Protocol account. Disconnect that one first.');
        throw new Refused(409, 'ConnectedElsewhere', 'That AT Protocol account is already connected to another ohm account.');
      }
      await db.prepare('INSERT INTO links (user_id, did, linked_at) VALUES (?1, ?2, ?3)').bind(user, did, now.toISOString()).run();
      return { did };
    },
    disconnect: user => db.prepare('DELETE FROM links WHERE user_id = ?1').bind(user).run(),
  };
}
