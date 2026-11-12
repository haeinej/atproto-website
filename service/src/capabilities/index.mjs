// Everything the vault service can do, one capability to a file. A capability is a small group of
// requests that belong together; each request says what it is called, whether it reads or changes,
// who may ask, and how it is answered. The router (../worker.mjs) knows nothing else about them,
// and the written reference (../../CAPABILITIES.md) is made from these same tables.
//
// Who may ask a request:
//   nobody  no sign-in at all
//   token   a token from a PDS, issued for this one request
//   member  a member, proved either by such a token or by their ohm session
//   ohm     an ohm session only
import account from './account.mjs';
import exporting from './export.mjs';
import identity from './identity.mjs';
import mirror from './mirror.mjs';
import posts from './posts.mjs';
import publish from './publish.mjs';
import search from './search.mjs';
import structure from './structure.mjs';

export const CAPABILITIES = [posts, structure, search, mirror, publish, exporting, account, identity];

// Every request by its name, with the capability it belongs to.
export const REQUESTS = Object.fromEntries(CAPABILITIES.flatMap(capability =>
  Object.entries(capability.requests).map(([name, request]) => [name, { ...request, name, capability: capability.name }])));
