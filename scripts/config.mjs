// Find the site configuration a command should use: the one named with --config, or the first of
// the usual places in the folder the command is run from.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const PLACES = ['feed/wrangler.site.jsonc', 'wrangler.site.jsonc', 'atproto-website.jsonc'];

export function configPath(given) {
  if (given) return given;
  const found = PLACES.find(place => existsSync(place));
  if (!found) {
    throw new Error('No site configuration here. Create one with:\n' +
      '  npx github:haeinej/atproto-website configure --site https://example.com --handle example.com > atproto-website.jsonc\n' +
      'or name one with --config PATH');
  }
  return found;
}

export async function siteVars(given) {
  const path = configPath(given);
  try {
    return JSON.parse(await readFile(path, 'utf8')).vars;
  } catch {
    throw new Error(`The site configuration at ${path} could not be read as JSON`);
  }
}
