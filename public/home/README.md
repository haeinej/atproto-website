# ohmmmm.com — site structure

Static site served by Worker `ohm-web` (`src/worker.js`, config `wrangler.jsonc`). Everything in `public/` is public. This file is the map: read it before adding or moving any information.

Run locally from the repository root: `npm run home:dev` (loopback port 8790). Follow the [source-checkout setup](../../README.md#work-on-this-repository) first; no private launcher configuration is needed. This folder is `public/home` in ohm-content-layer; paths below are relative to it.

## 1. Information hierarchy

Every piece of information has exactly one home. Put it there and link to it from elsewhere; do not copy it.

```
ohm (organisation)                          sidebar, top of the left column — every page
│   the green dot (assets/favicon.svg), alt "ohm", links home
│
├── Home   /                                landing: one statement on a WebGL field (landing.js), one button
├── About  /about                           in the sidebar: the full ohm explanation
│     The problem · What ohm is · What ohm does · More than keeping in touch
├── Docs   https://docs.ohmmmm.com/         its own site, in the sidebar on every page.
│     Source: `../docs` (Worker ohm-docs). /docs here redirects to it
│
└── Company footer                          the landing page (/) only: ohm · Legal · Contact columns
      Contact  mailto:support@collisions.co no page; opens a mail to support
      Support  /support                     help using the app (FAQ)
        └── Delete your account  /delete-account   (store-required; child of Support)
      Terms    /terms                       terms of service
      Privacy  /privacy                     privacy policy (Google/Microsoft disclosures)
```

| Information | Home | Not here |
| --- | --- | --- |
| Mission, product description, story | `/about` sections; one statement on `/` | legal pages |
| Contact address | `support@collisions.co`, linked as Contact in the directory | do not add a contact page or other addresses without updating this table |
| How-to and troubleshooting for the app | `/support` (one `<section>` per question) | `/terms`, `/privacy` |
| Account deletion steps | `/delete-account` | duplicated text in `/support` (link instead) |
| What users may and may not do, liability | `/terms` | |
| What data ohm keeps, uses, shares, deletes | `/privacy` | |
| Security contact for researchers | `/.well-known/security.txt` | |

### Adding things

- **A new fact about ohm** → a `<section>` on `/about`, or a new primary page if it is a whole topic. The landing page (`/`) stays one statement.
- **A new primary page** (e.g. Company, Journal, Careers) → create `public/<slug>.html` from the template below, then add it to the sidebar's list after About and Docs on *every* page (`<nav class="site-sections" aria-label="Site">`). The bottom directory is only for Contact, Support, Terms, Privacy, and only on the landing page.
- **Section navigation** (a list of this page's headings) lives on the docs site, as its "On this page" reader. The pages here do not have it.
- **A new support answer** → a `<section>` in `/support` whose `<h2>` is the question.
- **A new legal or utility page** → under an existing directory item (like `/delete-account` under Support), linked from its parent. Only add to the directory list if it is a company-level destination.
- After any new page: add it to `public/sitemap.xml`, to `PRECACHE` in `public/sw.js` (and bump `VERSION`), and to the Website paths table in `ENDPOINTS.md` (in the app repository, haeinej/ohm). Store/provider URLs listed there must keep working (use `REDIRECTS` in `src/worker.js` when moving one).

## 2. Page template

Every page has the same three regions, in this source order:

```html
<body>
  <a class="skip" href="#content">Skip to content</a>

  <header class="site-header">              <!-- sidebar: the dot, then About and Docs -->
    <a class="site-mark" href="/"><img src="/assets/favicon.svg?v=2" alt="ohm" width="20" height="20"></a>
  </header>

  <main id="content">                       <!-- right column -->
    <article aria-labelledby="title">
      <header>
        <h1 id="title">Page name</h1>
        <p class="introduction">One or two sentences.</p>   <!-- same size as body; only h1 is large -->
        <p class="updated">Last updated Month D, YYYY</p>   <!-- legal pages only -->
      </header>
      <section aria-labelledby="section-id">
        <h2 id="section-id">Section heading</h2>
        <p>…</p>                            <!-- <h3> for sub-parts, <ul> for lists -->
      </section>
    </article>
  </main>

  <footer class="site-footer">              <!-- landing page only -->
    <nav aria-label="Company">
      <ul>
        <li><a href="mailto:support@collisions.co">Contact</a></li>
        <li><a href="/support">Support</a></li>
        <li><a href="/terms">Terms</a></li>
        <li><a href="/privacy">Privacy</a></li>
      </ul>
    </nav>
  </footer>
</body>
```

Rules:

- The sidebar (and, on `/`, the footer) is copied into each page (there are no includes: the CSP runs only the site's own script files, and the one script, `/sw-register.js`, only starts the service worker). The homepage's JSON-LD is an inert structured-data block. When you change the sidebar, change it on every page in `public/*.html`. The draft beside this folder (`../home-draft`) is built by `../docs/build.py`, which writes the sidebar there.
- In the directory, mark the current page with `aria-current="page"` (for screen readers; it is not styled).
- `<head>` keeps: `charset`, `viewport`, `theme-color #fafaf9`, `description`, `canonical` (`https://ohmmmm.com/<slug>`), both favicon links (`/favicon.ico?v=2`, then `/assets/favicon.svg?v=2`), apple-touch-icon, the manifest (`/manifest.webmanifest`), the Coconat font preload (`<link rel="preload" … as="font" type="font/woff2" crossorigin>`: without `crossorigin` the browser downloads the font twice), `/styles.css`, `<script src="/sw-register.js" defer>`, `<title>Page · ohm</title>`.
- Brand is always lowercase `ohm`.

### Search and sharing

- The homepage title is `ohm — Your home on the web, connected`; other pages use `Page · ohm`. The share card carries the same line, so a new title needs a new `assets/og-home-v2.png`.
- Every indexable page has a unique description, an absolute canonical URL, Open Graph metadata and a large-image share card. The shared card is `assets/og-home-v2.png` (1200 × 630).
- Homepage JSON-LD identifies `WebSite` and `Organization`. Keep it consistent with visible copy and published contact details; do not add ratings, prices or unavailable features.
- Keep the homepage's `google-site-verification` meta tag: it maintains the owner's verified Search Console property.
- `robots.txt` allows crawling and points to the sitemap. Include only canonical, public, successful pages in `sitemap.xml`; do not add invented modification dates.
- The Worker permanently redirects HTTP, www and known page aliases to their canonical HTTPS URLs. Missing pages return 404 and `X-Robots-Tag: noindex`.
- Run `npm run home:check` before deployment and `npm run home:seo` after deployment. The latter performs a read-only production crawl; pass an alternate origin with `npm run home:seo -- https://staging.example.com`.
- Google setup and deployment evidence are recorded in `docs/seo.md`.

## 3. Look

- One stylesheet, `public/styles.css`. All values are custom properties at the top; rules use only those.
- One ink: Fatale forest green `--ohm-forest` #013220 on editorial paper #fafaf9. Only "Last updated" uses the quiet tone #4c6e61. No other colours, no borders or dividers (DESIGN.md §5.6).
- The page title (`<h1>`, one per page) is large Coconat 400 (`assets/fonts/coconat-regular.woff2`, SIL OFL), 40–60px.
- Everything else is one size (16px / 1.65), rail and page alike: introduction, section headings, body, lists, dates. Section headings are set apart by weight (600) and space, never by size. Do not add other sizes.
- Desktop (> 760px): the sidebar on the left (the dot, then About and Docs, the current page marked with a bar) stays in view; the page is on the right. Narrow: a bar with the dot and Menu; Menu opens Home, About and Docs full screen (a checkbox holds it open; no script). On the landing page the opening section fills the first screen.
- Phones: pages draw edge to edge (`viewport-fit=cover`) and the page padding keeps clear of the notch, corners and home indicator (`--ohm-pad-*` in `styles.css`, from `env(safe-area-inset-*)`). Every page carries the install tags for iPhone (`apple-mobile-web-app-capable`, `-title`, `-status-bar-style` default, so the clock stays dark on the paper).
- The landing page's field is WebGL, drawn by `public/landing.js` (the site's second script). It is mostly paper, fades out with no edge, bends toward the pointer, pauses off screen, draws one still frame with reduced motion, and falls back to a still CSS field without WebGL.
- Install (PWA): `public/manifest.webmanifest` names the site `ohm` and uses `assets/icon-192.png`, `assets/icon-512.png` (the favicon circle on paper) and `assets/icon-maskable-512.png` (smaller circle, inside the maskable safe zone). `public/sw.js` keeps the site readable offline: everything is saved when it installs; pages come from the network first, started while the worker wakes (navigation preload), with the saved copy only when offline or after 4 s; `styles.css`, the scripts, the manifest and images from the cache with a background refresh; the font from the cache. Offline, a page that was never saved shows `/`. **When you add, rename or remove a page or asset, update `PRECACHE` in `sw.js` and bump its `VERSION`.** Ordinary edits need no bump. The worker gets its own CSP (`connect-src 'self'`) and `Cache-Control: no-cache` in `src/worker.js`.
- Caching (`src/worker.js`): pages, `styles.css` and the manifest revalidate on every load. `assets/fonts/*` is cached for a year as immutable, so **a changed font file needs a new file name**, updated in `styles.css` and every page's preload link. Other `assets/*` images are cached for a day.
- Favicon and rail mark: a full-bleed forest circle (`assets/favicon.svg`, r 15 of 32; `favicon.ico`, the same circle at 16, 32 and 48px, for browsers that do not use an SVG icon or that ask for `/favicon.ico` directly; `assets/apple-touch-icon.png`, 180px, the same circle on paper). Browsers keep favicons for a long time, so the icon URLs carry `?v=2` in every page (both icon links, the apple-touch-icon and the rail mark) and in `PRECACHE` in `sw.js`. **When an icon changes, raise that number everywhere and bump `VERSION` in `sw.js`.**
