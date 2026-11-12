import test from 'node:test';
import assert from 'node:assert/strict';

// The page's sign-in with an app password (service/public/vault/signin.js). It runs in a browser;
// here the three things it needs from one are stood in for: where the page is, the browser's own
// database, and the network.

const page = 'https://app.ohmmmm.test/vault/';
const account = { did: 'did:web:pds.haein.test', handle: 'haein.test', pds: 'https://pds.haein.test', service: 'did:web:vault.ohmmmm.test' };
// A value made up for this test. It is good nowhere.
const password = 'made-up-for-this-test';

globalThis.document = { baseURI: page };
// The browser's database, as much of it as the page uses: one store, read and written by name.
const stored = new Map();
globalThis.indexedDB = {
  open() {
    const opening = {};
    const request = (run) => { const asked = {}; queueMicrotask(() => { asked.result = run(); asked.onsuccess?.(); }); return asked; };
    opening.result = {
      createObjectStore() {},
      transaction: () => ({ objectStore: () => ({
        get: name => request(() => stored.get(name)),
        put: (value, name) => request(() => { stored.set(name, value); }),
        delete: name => request(() => { stored.delete(name); }),
      }) }),
    };
    queueMicrotask(() => opening.onsuccess?.());
    return opening;
  },
};

// The network: ohm's vault service, which finds the account, and the member's own PDS.
function network({ signIn = () => Response.json({ did: account.did, accessJwt: 'access-1', refreshJwt: 'refresh-1' }) } = {}) {
  const asked = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    asked.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ?? null });
    if (url.origin === new URL(page).origin && url.pathname.endsWith('/xrpc/com.ohmmmm.identity.findAccount')) return Response.json(account);
    if (url.origin === account.pds && url.pathname === '/xrpc/com.atproto.server.createSession') return signIn(JSON.parse(init.body));
    if (url.origin === account.pds && url.pathname === '/xrpc/com.atproto.server.getServiceAuth') {
      return init.headers.Authorization === 'Bearer access-1' ? Response.json({ token: `for ${url.searchParams.get('lxm')}` }) : Response.json({ error: 'InvalidToken' }, { status: 401 });
    }
    if (url.origin === account.pds && url.pathname === '/xrpc/com.atproto.server.deleteSession') return Response.json({});
    throw new Error(`Unexpected request in a test: ${url}`);
  };
  return asked;
}

const { askPds, beginWithPassword, leave, restore } = await import('../service/public/vault/signin.js');

test('an app password signs a member in at their own PDS, for this visit only, and nothing is kept', async () => {
  const asked = network();
  const signedIn = await beginWithPassword('haein.test', password, 'connect');
  assert.deepEqual(signedIn, { ...account, purpose: 'connect' });
  assert.deepEqual(await restore(), { ...account, purpose: 'connect' });

  // The password went to the member's own PDS, with the DID the account's own document named, and
  // to nobody else: not to ohm.
  const carrying = asked.filter(each => JSON.stringify([String(each.url), each.headers, each.body]).includes(password));
  assert.deepEqual(carrying.map(each => [each.url.origin, each.url.pathname, JSON.parse(each.body)]),
    [[account.pds, '/xrpc/com.atproto.server.createSession', { identifier: account.did, password }]]);

  // The PDS then vouches for the member, one request at a time.
  assert.deepEqual(await askPds('com.atproto.server.getServiceAuth', { aud: account.service, lxm: 'com.ohmmmm.identity.whoAmI' }), { token: 'for com.ohmmmm.identity.whoAmI' });

  // Letting go ends the sign-in at the PDS and here. Nothing was written to the browser's database.
  await leave();
  const ended = asked.at(-1);
  assert.deepEqual([ended.url.pathname, ended.method, ended.headers.Authorization], ['/xrpc/com.atproto.server.deleteSession', 'POST', 'Bearer refresh-1']);
  assert.equal(await restore(), null);
  await assert.rejects(askPds('com.atproto.server.getServiceAuth', {}), /not signed in/);
  assert.equal(stored.size, 0);
});

test('a password the PDS refuses signs nobody in, and says why', async () => {
  network({ signIn: () => Response.json({ error: 'AuthenticationRequired', message: 'Invalid identifier or password' }, { status: 401 }) });
  await assert.rejects(beginWithPassword('haein.test', 'wrong', 'sign-in'), /That password was not accepted/);
  assert.equal(await restore(), null);

  // An account that wants a code as well is pointed to an app password.
  network({ signIn: () => Response.json({ error: 'AuthFactorTokenRequired', message: 'A sign in code has been sent to your email address' }, { status: 401 }) });
  await assert.rejects(beginWithPassword('haein.test', password, 'sign-in'), /Make an app password/);

  // A PDS that signs in some other account than the one asked for is not believed.
  network({ signIn: () => Response.json({ did: 'did:web:pds.someone-else.test', accessJwt: 'access-1' }) });
  await assert.rejects(beginWithPassword('haein.test', password, 'sign-in'), /a different account/);
  assert.equal(await restore(), null);
});
