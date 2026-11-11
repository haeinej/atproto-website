// Show an identity and the repository it owns. Reads only.
//   npm run --silent identity                 the account in your site config
//   npm run --silent identity -- example.com  any handle or DID
import { resolveIdentity } from '../feed/identity.mjs';
import { siteVars } from './config.mjs';
import { rpc } from './rpc.mjs';

try {
  const asked = process.argv[2] ?? (await siteVars()).ATPROTO_DID;
  const identity = await resolveIdentity(asked);
  // The repository is the container: every record the account has published sits in it, by type.
  const repository = identity.pds
    ? (await rpc(identity.pds, 'com.atproto.repo.describeRepo', { query: { repo: identity.did } })).data : {};
  console.log(JSON.stringify({
    ...identity,
    repository: {
      uri: `at://${identity.did}`,
      collections: Array.isArray(repository.collections) ? repository.collections : [],
    },
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
