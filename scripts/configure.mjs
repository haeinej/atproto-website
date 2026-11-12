import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolveIdentity } from '../feed/identity.mjs';
import { ownNamespace, pdsConfig, webUrl } from '../feed/pds.mjs';

try {
  const { values } = parseArgs({
    options: {
      site: { type: 'string' }, pds: { type: 'string' }, did: { type: 'string' }, handle: { type: 'string' },
      zone: { type: 'string' }, mode: { type: 'string', default: 'attach' },
      name: { type: 'string' }, kv: { type: 'string' }, namespace: { type: 'string' }, collection: { type: 'string' },
      'access-team': { type: 'string' }, 'access-aud': { type: 'string' },
    },
  });
  if (values.collection !== undefined) {
    throw new Error('Every post is com.ohmmmm.post, so there is no post type to choose. For your own optional schemas, set --namespace to your domain written backwards, such as com.example');
  }
  const siteUrl = webUrl(values.site);
  const site = siteUrl && new URL(siteUrl);
  if (!site || site.protocol !== 'https:' || site.href !== `${site.origin}/` || site.port) {
    throw new Error('Set --site to your website’s HTTPS origin');
  }
  // The identity is the root. Given a DID or a handle, the PDS is read from the DID's own document,
  // so the site cannot be pointed at a repository the identity does not own. Passing both --did and
  // --pds skips the lookup, for a PDS that is not reachable yet.
  let account = { did: values.did, pds: values.pds };
  if (!values.did || !values.pds) {
    if (!values.did && !values.handle) throw new Error('Set --did to your account DID, or --handle to your handle');
    const identity = await resolveIdentity(values.did ?? values.handle);
    if (!identity.pds) throw new Error(`${identity.did} does not name a PDS in its DID document`);
    if (values.pds && new URL(values.pds).origin !== identity.pds) {
      throw new Error(`${identity.did} is hosted at ${identity.pds}, not ${values.pds}`);
    }
    account = identity;
  }
  const pds = pdsConfig({ ATPROTO_DID: account.did, ATPROTO_PDS_ORIGIN: account.pds });
  const standalone = values.mode === 'standalone';
  if (!standalone && values.mode !== 'attach') throw new Error('--mode must be attach or standalone');
  const zone = values.zone ?? site.hostname;
  if (site.hostname !== zone && !site.hostname.endsWith(`.${zone}`)) {
    throw new Error('--zone must be the Cloudflare DNS zone that contains the website hostname');
  }
  if (values.kv && !/^[a-f0-9]{32}$/.test(values.kv)) throw new Error('--kv must be a Workers KV namespace ID');

  const config = JSON.parse(await readFile(new URL('../feed/wrangler.jsonc', import.meta.url), 'utf8'));
  const name = values.name ?? `${site.hostname.replaceAll('.', '-')}-posts`;
  if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(name)) throw new Error('Set --name to a valid Worker name');
  config.name = name;
  config.vars.SITE_ORIGIN = site.origin;
  config.vars.ATPROTO_DID = pds.did;
  config.vars.ATPROTO_PDS_ORIGIN = pds.origin;
  // Where the person's own optional schemas are declared: their domain written backwards.
  config.vars.ATPROTO_SITE_NAMESPACE = ownNamespace(values.namespace ?? zone.split('.').reverse().join('.'));
  if (standalone) {
    config.routes = [{ pattern: site.hostname, custom_domain: true }];
    config.vars.STANDALONE_SITE = 'true';
  } else {
    config.routes = config.routes.map(route => ({
      pattern: route.pattern.replace(/^example\.com/, site.hostname),
      zone_name: zone,
    }));
  }
  if (values['access-team'] || values['access-aud']) {
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(values['access-team'] ?? '') || !/^[a-f0-9]{32,128}$/.test(values['access-aud'] ?? '')) {
      throw new Error('For private posts, set --access-team to your-team.cloudflareaccess.com and --access-aud to the Access application audience tag');
    }
    config.vars.ACCESS_TEAM_DOMAIN = values['access-team'];
    config.vars.ACCESS_AUD = values['access-aud'];
  }
  if (values.kv) config.kv_namespaces[0].id = values.kv;
  console.log(JSON.stringify(config, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
