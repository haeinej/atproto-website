#!/usr/bin/env node
// The vault's tools for a coding agent, run on the person's own machine. It reads and writes their
// PDS and their own store with their own credentials; nothing passes through anyone else's service.
//
//   node mcp/server.mjs [--config PATH]
//
// The site configuration is the one the commands use: named with --config or OHM_CONTENT_LAYER_CONFIG,
// or found in the folder the agent is working in. Making a note public needs ATPROTO_APP_PASSWORD.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pdsConfig, webUrl } from '../feed/pds.mjs';
import { configPath } from '../scripts/config.mjs';
import { imageSize } from '../scripts/image-size.mjs';
import { wranglerKv } from '../scripts/kv.mjs';
import { signIn } from '../scripts/rpc.mjs';
import { VaultProblem } from '../vault/core.mjs';
import { ownStores, pdsStore } from '../vault/stores.mjs';
import { createVault } from '../vault/vault.mjs';
import { createServer, serve } from './protocol.mjs';
import { createTools, TOOLS } from './tools.mjs';

// A site that has not set up a store of its own has nothing in it, and nowhere to put a note that
// is not public. Saying so is better than seeming to save one.
function noStore() {
  const refuse = () => {
    throw new VaultProblem("This site has no store of its own yet, so it cannot keep private or friends-only notes. Set one up first: see \"Keep a post private\" in the project's README.");
  };
  return { get: async () => null, list: async () => [], getBlob: async () => null, put: refuse, remove: refuse, putBlob: refuse };
}

async function localTools(given) {
  const configFile = configPath(given);
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  const { did, origin, collection } = pdsConfig(config.vars ?? {});
  const site = webUrl(config.vars?.SITE_ORIGIN);
  if (!site) throw new Error(`Set SITE_ORIGIN in ${configFile}`);
  const hasOwnStore = (config.kv_namespaces ?? []).some(space => space.binding === 'NOTES' && space.id);
  let token;
  const vault = createVault({ stores: {
    public: pdsStore({ did, origin, collection, token: async () => (token ??= await signIn(origin, did)) }),
    ...(hasOwnStore ? ownStores(wranglerKv(configFile)) : { friends: noStore(), private: noStore() }),
  } });
  return createTools({
    vault, did, site, collection, imageSize,
    files: async path => ({ bytes: new Uint8Array(await readFile(path)) }),
  });
}

const { values } = parseArgs({ options: { config: { type: 'string' } } });
process.stdin.setEncoding('utf8');
await serve(createServer({ list: TOOLS, tools: () => localTools(values.config ?? process.env.OHM_CONTENT_LAYER_CONFIG) }), process.stdin, process.stdout);
