import assert from 'node:assert/strict';
import test from 'node:test';
import { p256 } from '../service/node_modules/@noble/curves/p256.js';
import { secp256k1 } from '../service/node_modules/@noble/curves/secp256k1.js';
import { createIdentity, documentAddress, findAccount, signingKey } from '../service/src/identity.mjs';

const audience = 'did:web:vault.ohmmmm.test';
const method = 'com.ohmmmm.vault.listFiles';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let text = '';
  for (; value > 0n; value /= 58n) text = ALPHABET[Number(value % 58n)] + text;
  return text;
}
const encode = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

// An account: a key, the DID document that names it, and tokens signed with it.
function account(did, curve, alg, prefix) {
  const secret = curve.utils.randomPrivateKey();
  const key = `z${base58(Uint8Array.from([...prefix, ...curve.getPublicKey(secret, true)]))}`;
  const document = { id: did, verificationMethod: [{ id: `${did}#atproto`, type: 'Multikey', controller: did, publicKeyMultibase: key }] };
  const token = async (claims = {}, { lowS = true, header = {} } = {}) => {
    const signed = `${encode({ typ: 'JWT', alg, ...header })}.${encode({
      iss: did, aud: audience, lxm: method, exp: Math.floor(Date.now() / 1000) + 60, ...claims,
    })}`;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signed)));
    let signature = curve.sign(digest, secret, { lowS: true });
    // The other form of the same signature, which the protocol does not accept.
    if (!lowS) signature = new curve.Signature(signature.r, curve.CURVE.n - signature.s);
    return `${signed}.${Buffer.from(signature.toCompactRawBytes()).toString('base64url')}`;
  };
  return { did, document, token };
}
const haein = account('did:web:pds.haein.test', secp256k1, 'ES256K', [0xe7, 0x01]);
const jun = account('did:plc:abcdefghijklmnopqrstuvwx', p256, 'ES256', [0x80, 0x24]);
const stranger = account('did:web:pds.stranger.test', secp256k1, 'ES256K', [0xe7, 0x01]);

function service(members = `${haein.did}, ${jun.did}`, documents = { [haein.did]: haein.document, [jun.did]: jun.document, [stranger.did]: stranger.document }) {
  const fetched = [];
  const whoIs = createIdentity({
    audience, members, directory: 'https://plc.test',
    get: async (url, options) => {
      // The service runs on Cloudflare, whose fetch refuses any other way of handling a redirect.
      assert.ok(['follow', 'manual'].includes(options.redirect), `redirect: ${options.redirect}`);
      fetched.push(String(url));
      const did = Object.keys(documents).find(each => documentAddress(each, 'https://plc.test') === String(url));
      return did ? Response.json(documents[did]) : new Response('Not found', { status: 404 });
    },
  });
  const ask = (token, asked = method) => whoIs(new Request('https://vault.ohmmmm.test/x', { headers: token ? { Authorization: `Bearer ${token}` } : {} }), asked);
  return { ask, fetched };
}
const refused = (code, words) => problem => problem.code === code && (!words || words.test(problem.message));

test('non-object JWT headers and claims are authentication refusals before any DID fetch', async () => {
  const { ask, fetched } = service();
  for (const shape of [null, [], 'text', 1, true]) {
    for (const [header, claims] of [[shape, { iss: haein.did }], [{ alg: 'ES256K' }, shape]]) {
      const token = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${Buffer.alloc(64).toString('base64url')}`;
      await assert.rejects(ask(token), refused('AuthRequired'));
    }
  }
  assert.deepEqual(fetched, []);
});

test('a token from a member\'s own PDS says who is asking, for either kind of key', async () => {
  const { ask, fetched } = service();
  assert.equal(await ask(await haein.token()), haein.did);
  assert.equal(await ask(await jun.token()), jun.did);
  // The DID document is read once and remembered for a while.
  await ask(await haein.token());
  assert.deepEqual(fetched, ['https://pds.haein.test/.well-known/did.json', `https://plc.test/${jun.did}`]);
});

test('a token is refused unless it is for this service, this request, and now', async () => {
  const { ask } = service();
  const now = Math.floor(Date.now() / 1000);
  for (const [token, words] of [
    [undefined, /needs a token/],
    ['not.a.token', /could not be read/],
    [await haein.token({ aud: 'did:web:another.test' }), /another service/],
    [await haein.token({ lxm: 'com.ohmmmm.vault.deleteFile' }), /another request/],
    [await haein.token({ lxm: undefined }), /another request/],
    [await haein.token({ exp: now - 1 }), /expired/],
    [await haein.token({ exp: now + 7200 }), /longer than an hour/],
    [await haein.token({ iat: now + 600 }), /dated in the future/],
    [await haein.token({ iss: 'haein.test' }), /does not say who it is from/],
  ]) {
    await assert.rejects(ask(token), refused('AuthRequired', words));
  }
  // A token for one request does not open another.
  await assert.rejects(ask(await haein.token(), 'com.ohmmmm.vault.deleteFile'), refused('AuthRequired', /another request/));
});

test('only the key the account\'s own DID document names is accepted', async () => {
  const { ask } = service();
  // Signed by someone else's key, but claiming to be Haein.
  await assert.rejects(ask(await stranger.token({ iss: haein.did })), refused('AuthRequired', /signature does not match/));
  // A changed claim breaks the signature.
  const [head, , signature] = (await haein.token()).split('.');
  const forged = `${head}.${encode({ iss: haein.did, aud: audience, lxm: method, exp: Math.floor(Date.now() / 1000) + 3000 })}.${signature}`;
  await assert.rejects(ask(forged), refused('AuthRequired', /signature does not match/));
  // The other form of a valid signature, and an algorithm the account does not use.
  await assert.rejects(ask(await haein.token({}, { lowS: false })), refused('AuthRequired', /signature does not match/));
  await assert.rejects(ask(await haein.token({}, { header: { alg: 'ES256' } })), refused('AuthRequired', /way this account does not use/));
  await assert.rejects(ask(await haein.token({}, { header: { alg: 'none' } })), refused('AuthRequired'));

  // A document that is for another DID, or names no key, gives no key.
  const wrong = service(`${haein.did}`, { [haein.did]: { ...haein.document, id: stranger.did } });
  await assert.rejects(wrong.ask(await haein.token()), refused('AuthRequired', /signing key for this account could not be found/));
  assert.equal(signingKey({ id: haein.did, verificationMethod: [] }, haein.did), null);
  assert.equal(signingKey({ id: haein.did, verificationMethod: [{ id: '#atproto', publicKeyMultibase: 'zNotAKey0' }] }, haein.did), null);
});

test('someone who has not been let in is turned away before anything is fetched', async () => {
  const { ask, fetched } = service();
  await assert.rejects(ask(await stranger.token()), refused('NotAMember'));
  assert.deepEqual(fetched, []);
  // With the door open, the same token is good.
  assert.equal(await service('*').ask(await stranger.token()), stranger.did);
  // With no list at all, nobody is let in.
  await assert.rejects(service('').ask(await haein.token()), refused('NotAMember'));
});

test('a DID\'s document is looked for where the DID says', () => {
  assert.equal(documentAddress('did:web:pds.example.com'), 'https://pds.example.com/.well-known/did.json');
  assert.equal(documentAddress('did:web:example.com:users:haein'), 'https://example.com/users/haein/did.json');
  assert.equal(documentAddress('did:web:localhost%3A8787'), 'https://localhost:8787/.well-known/did.json');
  assert.equal(documentAddress('did:plc:abcdefghijklmnopqrstuvwx'), 'https://plc.directory/did:plc:abcdefghijklmnopqrstuvwx');
});

test('an account is found from the handle a person types, and a handle is believed only if the account names it back', async () => {
  const did = 'did:web:pds.haein.test';
  const document = { id: did, alsoKnownAs: ['at://haein.test'], service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.haein.test' }] };
  const asked = [];
  const world = routes => async (url, options) => {
    assert.ok(['follow', 'manual'].includes(options.redirect), `redirect: ${options.redirect}`);
    asked.push(String(url));
    const found = routes[String(url).split('?')[0]] ?? routes[String(url)];
    return found === undefined ? new Response('Not found', { status: 404 }) : typeof found === 'string' ? new Response(found) : Response.json(found);
  };
  const dns = 'https://cloudflare-dns.com/dns-query';
  const docs = { 'https://pds.haein.test/.well-known/did.json': document };

  // By the DNS record, which is how a handle on a site of its own is usually set.
  const byDns = world({ [dns]: { Answer: [{ data: '"did=did:web:pds.haein.test"' }] }, ...docs });
  assert.deepEqual(await findAccount(' @Haein.Test ', { get: byDns }), { did, handle: 'haein.test', pds: 'https://pds.haein.test' });
  assert.match(asked[0], /name=_atproto\.haein\.test&type=TXT/);
  // By the file on the domain, when there is no record.
  const byFile = world({ [dns]: { Answer: [] }, 'https://haein.test/.well-known/atproto-did': 'did:web:pds.haein.test\n', ...docs });
  assert.equal((await findAccount('haein.test', { get: byFile })).did, did);
  // By the DID itself.
  assert.deepEqual(await findAccount(did, { get: world(docs) }), { did, handle: 'haein.test', pds: 'https://pds.haein.test' });

  const refused = words => problem => problem.code === 'AccountNotFound' && words.test(problem.message);
  // Someone else's domain pointing at this account is not this account's handle.
  const squatter = world({ [dns]: { Answer: [{ data: 'did=did:web:pds.haein.test' }] }, ...docs });
  await assert.rejects(findAccount('not-haein.test', { get: squatter }), refused(/does not name not-haein\.test as its handle/));
  await assert.rejects(findAccount('nobody.test', { get: world({ [dns]: { Answer: [] } }) }), refused(/No AT Protocol account was found/));
  await assert.rejects(findAccount(did, { get: world({ 'https://pds.haein.test/.well-known/did.json': { id: did } }) }), refused(/does not say where its repository is kept/));
  for (const typed of ['', 'localhost', 'haein', '10.0.0.1', 'https://haein.test', 'a b.test', 'x'.repeat(260) + '.test']) {
    await assert.rejects(findAccount(typed, { get: world({}) }), refused(/A handle is a domain name/), typed);
  }
});
