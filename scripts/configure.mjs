import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pdsConfig, postCollection, webUrl } from '../feed/pds.mjs';

try {
  const { values } = parseArgs({
    options: {
      site: { type: 'string' }, pds: { type: 'string' }, did: { type: 'string' },
      zone: { type: 'string' }, mode: { type: 'string', default: 'attach' },
      name: { type: 'string' }, kv: { type: 'string' }, collection: { type: 'string' },
      'access-team': { type: 'string' }, 'access-aud': { type: 'string' },
    },
  });
  const siteUrl = webUrl(values.site);
  const site = siteUrl && new URL(siteUrl);
  if (!site || site.protocol !== 'https:' || site.href !== `${site.origin}/` || site.port) {
    throw new Error('Set --site to your website’s HTTPS origin');
  }
  const pds = pdsConfig({ ATPROTO_DID: values.did, ATPROTO_PDS_ORIGIN: values.pds });
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
  config.vars.ATPROTO_POST_COLLECTION = postCollection(values.collection ?? zone.split('.').reverse().join('.') + '.post');
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
