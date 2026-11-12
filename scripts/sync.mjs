// Sync your own folder with ohm's working copy of your vault, in both directions. Without --apply
// this looks at both and says what a sync would do, and changes nothing. Syncing never publishes.
//
//   sync --folder PATH [--vault URL --vault-did DID] [--config PATH] [--take ID=folder|ohm|remove]... [--apply]
//
// --take settles something sync will not decide alone: which version stands for a post changed in
// both places, or that a post removed on one side should be removed on the other.
// Needs ATPROTO_APP_PASSWORD, to ask your PDS for tokens that prove to the vault who you are.
import { parseArgs } from 'node:util';
import { pdsConfig, webUrl } from '../feed/pds.mjs';
import { syncFolder } from '../vault/sync.mjs';
import { siteVars } from './config.mjs';
import { localFolder } from './folder.mjs';
import { signIn } from './rpc.mjs';
import { vaultClient } from './vault-client.mjs';

try {
  const { values } = parseArgs({
    options: {
      folder: { type: 'string' }, config: { type: 'string' }, vault: { type: 'string' }, 'vault-did': { type: 'string' },
      take: { type: 'string', multiple: true, default: [] }, apply: { type: 'boolean' },
    },
  });
  const vars = await siteVars(values.config);
  const pds = pdsConfig(vars);
  const path = values.folder ?? vars.OHM_VAULT_FOLDER;
  if (!path) throw new Error('Say which folder with --folder PATH');
  const vault = webUrl(values.vault ?? vars.OHM_VAULT_URL);
  const audience = values['vault-did'] ?? vars.OHM_VAULT_DID;
  if (!vault || !audience) throw new Error('Say which vault with --vault URL and --vault-did DID');
  const take = Object.fromEntries(values.take.map(spec => {
    const [, id, choice] = /^([a-z2-7]{13})=(folder|ohm|remove)$/.exec(spec) ?? [];
    if (!id) throw new Error('Use --take ID=folder, --take ID=ohm, or --take ID=remove');
    return [id, choice];
  }));
  const report = await syncFolder({
    folder: localFolder(path), take, apply: Boolean(values.apply),
    vault: vaultClient({ pds, session: await signIn(pds.origin, pds.did), vault, audience }),
  });
  console.log(JSON.stringify({ ...report, ...(values.apply ? {} : { note: 'Nothing was changed. Add --apply to sync.' }) }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
