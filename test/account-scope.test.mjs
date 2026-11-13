import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountScope } from '../service/public/vault/account-scope.js';

const alice = 'did:web:alice.test', bob = 'did:web:bob.test';
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const refused = code => Object.assign(new Error(code), { code });

test('initial sign-in is unbound; authenticated reads and writes carry the displayed DID', async () => {
  let member = '';
  const scope = createAccountScope({ member: () => member, changed: () => assert.fail('Unexpected account change') });
  await assert.rejects(scope.run(async headers => {
    assert.deepEqual(headers, {});
    throw refused('SignInRequired');
  }), { code: 'SignInRequired' });
  member = alice;
  for (const body of [undefined, { memory: 'Alice draft' }]) {
    assert.deepEqual(await scope.run(async headers => {
      assert.deepEqual(headers, { 'X-Ohm-Did': alice });
      return { body };
    }), { body });
  }
});

test('account refusal invalidates concurrent reads and blocks any further draft submission', async () => {
  for (const code of ['AccountChanged', 'SignInRequired', 'AuthRequired', 'NotConnected']) {
    const held = deferred();
    let changes = 0;
    const scope = createAccountScope({ member: () => alice, changed: () => { changes++; } });
    const read = scope.run(() => held.promise);
    await assert.rejects(scope.run(async () => { throw refused(code); }), { code });
    assert.equal(changes, 1);
    await assert.rejects(scope.run(() => assert.fail('Must not send stale draft')), { code: 'AccountChanged' });
    held.resolve({ private: 'Alice response' });
    await assert.rejects(read, { code: 'AccountChanged' });
    assert.equal(changes, 1);
  }
});

test('reset rejects delayed reads and writes even when the same member signs in again', async () => {
  let member = alice;
  const scope = createAccountScope({ member: () => member, changed: () => assert.fail('Reset already cleared the editor') });
  const read = deferred(), write = deferred();
  const reading = scope.run(() => read.promise), writing = scope.run(() => write.promise);
  scope.reset();
  member = bob;
  assert.equal(await scope.run(async headers => headers['X-Ohm-Did']), bob);
  scope.reset();
  member = alice;
  read.resolve({ body: 'Old Alice result' });
  write.resolve({ version: 'Old saved version' });
  await assert.rejects(reading, { code: 'AccountChanged' });
  await assert.rejects(writing, { code: 'AccountChanged' });
  assert.equal(await scope.run(async headers => headers['X-Ohm-Did']), alice);
});

test('a late refusal from a previous account cannot invalidate the new account', async () => {
  let member = alice;
  const held = deferred();
  const scope = createAccountScope({ member: () => member, changed: () => assert.fail('Old refusal must not sign out Bob') });
  const reading = scope.run(async () => { await held.promise; throw refused('SignInRequired'); });
  scope.reset();
  member = bob;
  held.resolve();
  await assert.rejects(reading, { code: 'AccountChanged' });
  assert.equal(await scope.run(async headers => headers['X-Ohm-Did']), bob);
});

test('offline, conflict, and server refusals preserve the current account for draft retries', async () => {
  const scope = createAccountScope({ member: () => alice, changed: () => assert.fail('Keep current drafts') });
  for (const problem of [new TypeError('Failed to fetch'), refused('Conflict'), refused('InternalError')]) {
    await assert.rejects(scope.run(async () => { throw problem; }), error => error === problem);
    assert.equal(await scope.run(async headers => headers['X-Ohm-Did']), alice);
  }
});
