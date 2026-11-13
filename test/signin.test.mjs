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
    opening.result = {
      createObjectStore() {},
      close() {},
      transaction() {
        let pending = 0, ended = false;
        const transaction = { abort() { ended = true; queueMicrotask(() => transaction.onabort?.()); } };
        const request = run => {
          const asked = {}; pending++;
          queueMicrotask(() => {
            if (ended) return;
            asked.result = run(); asked.onsuccess?.({ target: asked }); pending--;
            queueMicrotask(() => { if (!pending && !ended) { ended = true; transaction.oncomplete?.(); } });
          });
          return asked;
        };
        transaction.objectStore = () => ({
          get: name => request(() => stored.get(name)),
          put: (value, name) => request(() => { stored.set(name, value); }),
          delete: name => request(() => { stored.delete(name); }),
        });
        return transaction;
      },
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

const { askPds, beginWithPassword, finish, leave, restore, sendPds } = await import('../service/public/vault/signin.js');

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

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function oauth(id) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const keys = pair;
  const session = { id, account, keys, issuer: account.pds, tokenEndpoint: `${account.pds}/token`, accessToken: `access-${id}`, refreshToken: `refresh-${id}`, expiresAt: 0, purpose: 'sign-in' };
  stored.set('owner', id); stored.set('session', session);
  return session;
}

test('OAuth refresh cannot restore logout, cross-tab logout, or a replacement sign-in for the same DID', async () => {
  const otherTab = await import('../service/public/vault/signin.js?other-tab');
  for (const action of ['logout', 'cross-tab logout', 'same DID replacement']) {
    await leave();
    await oauth('old');
    const started = deferred(), released = deferred();
    let requests = 0;
    globalThis.fetch = async input => {
      assert.equal(String(input), `${account.pds}/token`);
      requests++; started.resolve();
      await released.promise;
      return Response.json({ sub: account.did, access_token: 'too-late', refresh_token: 'too-late-refresh', expires_in: 3600 });
    };
    const reading = askPds('com.atproto.repo.describeRepo', { repo: account.did });
    const refused = assert.rejects(reading, /sign-in changed/);
    await started.promise;
    if (action === 'same DID replacement') await oauth('new');
    else await (action === 'logout' ? leave() : otherTab.leave());
    released.resolve();
    await refused;
    assert.equal(requests, 1, 'An old refresh must not continue the protected request');
    if (action === 'same DID replacement') assert.equal(stored.get('session').accessToken, 'access-new');
    else { assert.equal(await restore(), null); assert.equal(stored.has('session'), false); }
  }
  await leave();
});

test('parallel OAuth requests share one refresh within the owning session', async () => {
  await oauth('shared');
  let refreshes = 0, requests = 0;
  globalThis.fetch = async input => {
    if (String(input) === `${account.pds}/token`) {
      refreshes++;
      return Response.json({ sub: account.did, access_token: 'current', refresh_token: 'current-refresh', expires_in: 3600 });
    }
    requests++;
    return Response.json({ ok: true });
  };
  await Promise.all([askPds('com.atproto.repo.describeRepo'), askPds('com.atproto.repo.describeRepo')]);
  assert.equal(refreshes, 1); assert.equal(requests, 2);
  assert.equal(stored.get('session').id, 'shared');
  await leave();
});

test('a late app-password response cannot restore a session after logout', async () => {
  const started = deferred(), release = deferred();
  network({ signIn: async () => { started.resolve(); await release.promise; return Response.json({ did: account.did, accessJwt: 'too-late' }); } });
  const signingIn = beginWithPassword('haein.test', password);
  const refused = assert.rejects(signingIn, /sign-in changed/);
  await started.promise; await leave(); release.resolve(); await refused;
  assert.equal(await restore(), null);
});

test('a stale OAuth callback cannot consume a newer pending sign-in or finish after logout', async () => {
  await leave();
  const session = await oauth('callback');
  stored.delete('session');
  stored.set('pending', { ...session, state: 'current-state' });
  globalThis.location = { search: `?state=old-state&code=synthetic&iss=${encodeURIComponent(account.pds)}`, hash: '' };
  globalThis.history = { replaceState() {} };
  await assert.rejects(finish(), /not started here/);
  assert.equal(stored.get('pending').state, 'current-state');
  location.search = location.search.replace('old-state', 'current-state');
  const started = deferred(), released = deferred();
  globalThis.fetch = async () => { started.resolve(); await released.promise; return Response.json({ sub: account.did, access_token: 'late', expires_in: 3600 }); };
  const finishing = finish(), refused = assert.rejects(finishing, /sign-in changed/);
  await started.promise; await leave(); released.resolve(); await refused;
  assert.equal(await restore(), null); assert.equal(stored.has('session'), false);
});

test('publish refuses a different PDS account before sending bytes or writes', async () => {
  const asked = network();
  await beginWithPassword('haein.test', password);
  const before = asked.length;
  await assert.rejects(sendPds('com.atproto.repo.uploadBlob', { bytes: new Uint8Array([1]), mime: 'image/png', expectedDid: 'did:web:other.test' }), /sign-in changed/);
  assert.equal(asked.length, before);
  await leave();
});
