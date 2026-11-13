// The vault service: a member's posts, and what can be done with them. What it can do is laid out
// one capability to a file in ./capabilities/; this file only routes. For each request it settles
// who is asking, in the way that request says it must be settled, and hands over to the request.
//
// A member's posts are served to that member and nobody else. Nothing here publishes anything:
// saving a post, whatever it says about who may see it, changes only this copy.
import { REQUESTS } from './capabilities/index.mjs';
import { createIdentity } from './identity.mjs';
import { fromOurPages, links, ohmUser } from './ohm.mjs';
import { postStore, Refused } from './store.mjs';

const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });

async function sent(request) {
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {
    // Said below.
  }
  throw new Refused(400, 'InvalidRequest', 'Send the request as JSON');
}

// `whoIs` is given in tests; in the service it is made from the environment once and kept, so the
// DID documents it has read are remembered between requests.
let made;
export function createService({ whoIs, get = fetch } = {}) {
  return async function fetch(request, env) {
    try {
      const url = new URL(request.url);
      // The same requests are served at the service's own address and under /vault beside ohm's
      // sign-in, where a member's browser carries their ohm session.
      const name = /^(?:\/vault)?\/xrpc\/([A-Za-z0-9.]+)$/.exec(url.pathname)?.[1];
      const asked = name && Object.hasOwn(REQUESTS, name) ? REQUESTS[name] : null;
      if (!asked) throw new Refused(404, 'MethodNotFound', 'There is no such request');
      if (request.method !== asked.verb) throw new Refused(405, 'WrongMethod', `${name} is a ${asked.verb} request`);

      const identify = whoIs ?? (made ??= createIdentity({ audience: env.SERVICE_DID, members: env.MEMBERS }));
      const linked = links(env.DB);
      const session = async () => {
        const user = await ohmUser(request, env, get) ?? (() => { throw new Refused(401, 'SignInRequired', 'Sign in to ohm first'); })();
        // A request that rides on a cookie and changes something has to come from ohm's own pages.
        fromOurPages(request, env);
        return user;
      };

      // Who is asking comes first. Nothing about any vault is looked at until that is settled, and
      // a request is given that one account and no other.
      let did = null;
      let user = null;
      if (asked.asks === 'token') {
        did = await identify(request, name);
      } else if (asked.asks === 'ohm') {
        user = await session();
      } else if (asked.asks === 'member') {
        // A token from the member's own PDS, as the command line and an agent's tools send, or an
        // ohm session, as the page does. A session is worth exactly the one account it was connected to.
        if (request.headers.has('Authorization')) {
          did = await identify(request, name);
        } else {
          user = await session();
          did = await linked.didOf(user.id) ?? (() => { throw new Refused(409, 'NotConnected', 'Connect your AT Protocol account first'); })();
        }
      }

      // A browser may still display one member after its cookie changed in
      // another tab. This is a precondition, never a way to choose an account.
      // Check before the capability can read data or apply a stale draft.
      const expected = request.headers.get('X-Ohm-Did');
      if (expected !== null && asked.asks !== 'nobody') {
        const actual = did ?? (user ? await linked.didOf(user.id) : null);
        if (actual !== expected) throw new Refused(409, 'AccountChanged', 'The signed-in account changed; reopen the vault before continuing');
      }

      const answer = await asked.run({
        name, request, url, env, get, identify, linked, did, user,
        posts: postStore(env.DB),
        body: () => sent(request),
      });
      // Nearly every answer is JSON. A request that hands over a file answers with the file itself.
      return answer instanceof Response ? answer : json(answer);
    } catch (problem) {
      if (problem instanceof Refused) return json({ error: problem.code, message: problem.message, ...problem.extra }, problem.status);
      console.error(problem);
      return json({ error: 'InternalError', message: 'Something went wrong on our side' }, 500);
    }
  };
}

export default { fetch: createService() };
