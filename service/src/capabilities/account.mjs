// Account: the ohm account that is signed in, and the AT Protocol account it works in.
import { Refused } from '../store.mjs';

export default {
  name: 'Account',
  about: 'For a member signed in to ohm: who they are, and which AT Protocol account their vault is. One ohm account works in one AT Protocol account, and the other way round. These ride on the ohm session only; a token from a PDS does not reach them.',
  requests: {
    'com.ohmmmm.account.get': {
      verb: 'GET', asks: 'ohm', changes: false,
      about: 'Who is signed in, the AT Protocol account they connected if they have, and whether what it had published has been brought in.',
      takes: {},
      gives: '`user` (name), `did`, `mirrored`, and `service`: who a PDS has to address its token to when the member connects',
      run: async ({ user, linked, env }) => {
        const link = await linked.of(user.id);
        return { user: { name: user.name }, did: link?.did ?? null, mirrored: link?.mirrored ?? false, service: env.SERVICE_DID ?? null };
      },
    },
    'com.ohmmmm.account.connect': {
      verb: 'POST', asks: 'ohm', changes: true,
      // The person's own PDS says, in a token it signs for this one request, that the AT Protocol
      // account is theirs. That is checked exactly as any member's token is, and only then is the
      // account tied to the ohm account that is signed in.
      about: 'Ties an AT Protocol account to the ohm account. `token` is one the account\'s PDS issued for this request and nothing else.',
      takes: { token: 'a token from the account\'s PDS, issued for this request' },
      gives: '`did`, and `already` when it was connected before',
      run: async ({ request, name, body, user, linked, identify }) => {
        const { token } = await body();
        if (typeof token !== 'string') throw new Refused(400, 'InvalidRequest', 'Send the token your PDS issued');
        const did = await identify(new Request(request.url, { headers: { Authorization: `Bearer ${token}` } }), name);
        return linked.connect(user.id, did);
      },
    },
    'com.ohmmmm.account.disconnect': {
      verb: 'POST', asks: 'ohm', changes: true,
      about: 'Unties the AT Protocol account. The vault is kept, and opens again when the account is connected.',
      takes: {},
      gives: '`did`, now empty',
      run: async ({ user, linked }) => {
        await linked.disconnect(user.id);
        return { did: null };
      },
    },
  },
};
