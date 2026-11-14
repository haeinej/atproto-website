# Public sites: search, sharing and Cloudflare

[Human guide](../../public/home/docs/seo.md) · [Site inventory](../../public/README.md)

The public origins are `https://ohmmmm.com`, `https://docs.ohmmmm.com` and `https://design.ohmmmm.com`. `www` permanently redirects to the apex. Keep app, vault and API endpoints out of public sitemaps; never put member data into metadata or cards.

## Sources and deployment

- Home: `public/home/public/*.html`; Worker `ohm-web`, config `public/home/wrangler.jsonc`. Preserve the Google verification meta tag and the D1/rate-limit bindings. `npm run home:check`, then `npm run home:deploy`; `npm run home:seo` crawls production.
- Docs: author `public/docs/build.py`, regenerate with `npm run docs:build`, deploy `npm run docs:deploy`. The generator writes HTML, the sitemap and robots. Never patch generated HTML alone. `public/seo-worker.mjs` handles HTTP-to-HTTPS redirects and error-response noindex; ASSETS handles extension/slash normalization.
- Design: separate `ohm-ui` repository. `src/seo.ts` and route head functions provide prerendered metadata; `scripts/seo.mjs` validates the built HTML and generates the sitemap. `scripts/worker.mjs` handles HTTPS and errors. `/overview` redirects to `/`. Run `npm run typecheck`, `npm run check`, `npm run registry:build`, `npm run deploy:check`, then `npm run deploy`.

Each public page has a unique title and description, an absolute canonical URL, matching Open Graph/Twitter fields and an absolute PNG URL. Cards are 1200 × 630 with dimension, type and alt metadata. Version filenames when artwork changes: `og-home-v2.png`, `og-docs-v2.png`, `og-design-v1.png`. Keep previous images available for old shared links. The optional `public/home/scripts/build-share-cards.py [ohm-ui-path]` rebuilds cards using Pillow, fontTools and Brotli with the bundled Coconat font; normal deploys use committed PNGs.

## Cloudflare boundaries and recovery

Custom domains: apex/www → `ohm-web`, docs → `ohm-docs`, design → `ohm-design`, app → `ohm-app`, vault → `ohm-vault`, api → `ohm-api`. Existing app routes `/api/*` and `/vault` plus `/vault/*` remain owned by their current services. Do not reassign them for SEO. Keep workers.dev and preview URLs disabled. Public-site Workers enforce HTTPS themselves; the zone also has Always Use HTTPS enabled (301 before the Worker). The home audit accepts the bounded permanent redirect chain. Static HTML aliases are promoted from the ASSETS default 307 to permanent 308 responses.

The Google verification CNAME is DNS-only so its target is returned to Google. Public website Worker records remain proxied.

Use a signed-in Wrangler session with the account named in the configs. DNS and zone-settings operations require additional permission; a 403 from those APIs does not mean a record is wrong. Verify public resolution and current custom-domain bindings, and use authenticated DNS access before claiming a full DNS audit or changing records. Preserve MX/TXT/AT Protocol identity records.

Run `npm test` from this repository after code changes. Run `npm run sites:seo` to crawl all three public sites. Check live sitemap URLs, canonical/OG/Twitter equality, PNG content and dimensions, HTTP redirects, HTML aliases and true 404/noindex responses. A passing local build is not deployment evidence; a passing production crawl is not proof of search-engine indexing or a third-party messaging cache refresh. Roll back the affected Worker if production checks fail, without changing service or DNS ownership.
