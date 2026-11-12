// Identity: finding an AT Protocol account, and saying who a token names.
import { findAccount } from '../identity.mjs';

export default {
  name: 'Identity',
  about: 'The first steps of signing in: finding an account from its handle, and saying who a token from a PDS names. Neither touches a vault.',
  requests: {
    'com.ohmmmm.identity.findAccount': {
      verb: 'GET', asks: 'nobody', changes: false,
      // Everything it answers with is already public. It also names this service, which is who a
      // member's PDS has to issue their tokens for.
      about: 'Finds an account from what a person types to sign in: their handle, or their DID. Needs no sign-in, and answers only with what is public.',
      takes: { account: 'a handle, such as example.com, or a DID' },
      gives: '`did`, `handle`, `pds`, and `service`: this service\'s own DID',
      run: async ({ url, get, env }) => ({ ...await findAccount(url.searchParams.get('account'), { get }), service: env.SERVICE_DID ?? null }),
    },
    'com.ohmmmm.identity.whoAmI': {
      verb: 'GET', asks: 'token', changes: false,
      // ohm's own sign-in asks this to sign a member in with their AT Protocol account. The handle
      // is given only when the handle itself points back to the account.
      about: 'Says who a token from a PDS names. The token has to be issued for this request and nothing else, so only its holder can ask.',
      takes: {},
      gives: '`did`, and `handle` when the handle points back to the account',
      run: async ({ get, did }) => {
        const account = await findAccount(did, { get }).catch(() => null);
        const handle = account?.handle && (await findAccount(account.handle, { get }).catch(() => null))?.did === did ? account.handle : null;
        return { did, handle };
      },
    },
  },
};
