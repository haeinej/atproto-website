#!/usr/bin/env node
// The vault's tools for a coding agent, run on the person's own machine. They work in ohm's
// working copy of the person's vault, the same one the editor shows, by asking the vault service
// (service/CAPABILITIES.md). Each request carries a token the person's own PDS issues for it.
//
//   node mcp/server.mjs [--config PATH] [--vault URL --vault-did DID]
//
// The site configuration is the one the commands use: named with --config or OHM_CONTENT_LAYER_CONFIG,
// or found in the folder the agent is working in. It says which account is the person's. The vault
// is ohm's unless the configuration (OHM_VAULT_URL, OHM_VAULT_DID) or a flag names another.
// Needs ATPROTO_APP_PASSWORD, to sign in to the person's PDS.
import { parseArgs } from 'node:util';
import { pdsConfig, webUrl } from '../feed/pds.mjs';
import { siteVars } from '../scripts/config.mjs';
import { signIn } from '../scripts/rpc.mjs';
import { vaultClient } from '../scripts/vault-client.mjs';
import { createServer, serve } from './protocol.mjs';
import { createTools, OFFERED } from './tools.mjs';

const OHM = { url: 'https://vault.ohmmmm.com', did: 'did:web:vault.ohmmmm.com' };

async function localTools(values) {
  const vars = await siteVars(values.config ?? process.env.OHM_CONTENT_LAYER_CONFIG);
  const pds = pdsConfig(vars);
  const vault = webUrl(values.vault ?? vars.OHM_VAULT_URL ?? OHM.url);
  const audience = values['vault-did'] ?? vars.OHM_VAULT_DID ?? OHM.did;
  if (!vault) throw new Error('The vault is named by its address, such as https://vault.ohmmmm.com');
  const renew = () => signIn(pds.origin, pds.did);
  return createTools({ vault: vaultClient({ pds, session: await renew(), renew, vault, audience }) });
}

const { values } = parseArgs({ options: { config: { type: 'string' }, vault: { type: 'string' }, 'vault-did': { type: 'string' } } });
process.stdin.setEncoding('utf8');
await serve(createServer({ list: OFFERED, tools: () => localTools(values) }), process.stdin, process.stdout);
