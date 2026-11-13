# ohmmmm.com search setup

Configured and deployed November 10, 2026 (Asia/Seoul).

## Production

- Canonical origin: https://ohmmmm.com
- Cloudflare Worker: `ohm-web`
- Recorded deployed version: `e0a76368-153d-42ce-9d5b-de0b2b836b87` (November 10, 2026: font preload, cache headers, web app manifest and offline service worker; `check:seo` passed)
- Homepage search title: `ohm — An agentic social network`
- Six public HTML pages (`/`, `/about`, `/support`, `/privacy`, `/terms`, `/delete-account`) have unique titles/descriptions, canonical links and social metadata. The homepage has `WebSite` and `Organization` JSON-LD reflecting its published copy and contact details.
- Social image: `/assets/og-image.png`, 1200 × 630, using the site's existing Coconat typeface and colours.
- HTTP, www and known HTML/trailing-slash page aliases permanently redirect to canonical HTTPS URLs. Missing pages, including direct requests for the error template, return a real 404 with `noindex`.
- Existing `robots.txt` allows crawling; `/sitemap.xml` lists all six public canonical pages. The deployment and Search Console observations below are dated evidence, not verification of the current checkout or live version.

## Google Search Console

- Property: https://ohmmmm.com/ (URL-prefix property covering the canonical public website).
- Verified owner: Haein's existing Google account, using the HTML meta tag. Keep `google-site-verification` in the homepage head; it is a public verification token, not a secret.
- Sitemap submitted: https://ohmmmm.com/sitemap.xml.
- Google reported **Success**, last read November 10, 2026, **5 discovered pages**.
- Homepage live URL test: November 10, 2026, 10:23 AM KST. Google reported **URL is available to Google** and **Page can be indexed**.
- The index report initially said the homepage was unknown to Google. Successful sitemap discovery and a passing live test do not mean the page is already indexed.
- Homepage indexing requested successfully. Google confirmed **Indexing requested** and that the URL was added to a priority crawl queue.

Dashboard: https://search.google.com/search-console?resource_id=https%3A%2F%2Fohmmmm.com%2F

## Validation and maintenance

Run `npm run home:check` before publication. After publication, run `npm run home:seo` to verify the actual deployed pages, canonical links, unique metadata, sitemap coverage, linked resources, permanent redirects and 404 bodies. Both passed on November 10, 2026.

When adding a real public page, give it original useful content, a descriptive title, a unique description, an absolute canonical URL and a normal link from an existing page. Add its canonical URL to the sitemap and update the audit's expected page list. Do not add keyword pages or fabricated reviews. Keep private account/mail content outside this public website.

Use Search Console's Pages and Performance reports to check indexing and actual search queries once Google processes the new property. Indexing timing and rankings are controlled by Google.

References: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [site name structured data](https://developers.google.com/search/docs/appearance/site-names), [organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization).
