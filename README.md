# AT Protocol Website

Import posts from an X data export into a Cirrus Personal Data Server (PDS). The Java importer keeps the original post date and X URL with the text, photos, and videos. A separate Cloudflare Worker serves a Notes page and JSON feed for the website.

The archive format uses an Are.na-inspired layout. One post can place text and media in sequence, such as **image → text → image → video**. The importer writes that sequence as Markdown with `media:ID` references and stores the media files as AT Protocol blobs on Cirrus. The same record keeps the original X ID and URL alongside the intended URL on your website. [AT Protocol blob spec](https://atproto.com/specs/blob)

| Path | What it does |
| --- | --- |
| [`importer/`](importer/) | Java CLI for previewing and publishing an extracted X archive |
| [`lexicons/com/haeinjung/post.json`](lexicons/com/haeinjung/post.json) | Schema for the `com.haeinjung.post` archive record |
| [`cirrus/`](cirrus/) | Cloudflare Worker project for the Cirrus PDS |
| [`feed/`](feed/) and [`site/`](site/) | Scheduled Notes feed and the static page that reads it |
| [`examples/`](examples/) | A mixed-media archive record and the Notes template for haeinjung.com |

## Preview an archive

Use JDK 21 and Maven. Download your X data export, extract it, and keep `data/tweets.js`, any `tweets-partN.js` files, and `data/tweets_media/` together. [X archive instructions](https://help.x.com/en/managing-your-account/how-to-download-your-x-archive)

From the repository root, build the CLI and run an offline preview. Pass the extracted archive folder or its `data/` directory.

```sh
mvn -f importer/pom.xml package
java -jar importer/target/x-archive-importer.jar --archive /path/to/extracted-archive
```

The preview lists the records it would create and reports skipped entries, including replies, reposts, quote posts, and posts with missing or unsupported attachments. Use `--id YOUR_X_POST_ID` to preview a single post. Repeat `--id` to select several posts.

## Publish to Cirrus

Create an [app password](https://cirrus.earth/reference/pds-cli/#app-password) for your Cirrus account. Replace `YOUR_X_POST_ID` with the ID you previewed. The importer prompts for the password in a terminal and also accepts `ATPROTO_APP_PASSWORD` for scripted runs.

```sh
java -jar importer/target/x-archive-importer.jar \
  --archive /path/to/extracted-archive \
  --id YOUR_X_POST_ID \
  --publish \
  --pds https://pds.haeinjung.com \
  --handle haeinjung.com \
  --did did:web:pds.haeinjung.com \
  --site https://haeinjung.com
```

Publishing writes public records to the selected account. Leave out `--id` to import every eligible post. Rerunning the same selection skips records with matching content. If an existing record differs, the importer stops and reports its AT URI.

Add `--also-bluesky` to create a standard `app.bsky.feed.post` for each compatible entry. The current export supports text and compatible image attachments. Posts with video or text over the Bluesky limit are still saved in the archive format.

## How the post format works

- `body` contains CommonMark. A reference such as `![Street after the rain](media:media-1)` places an attachment where it belongs in the post.
- `media` contains typed attachments. Each attachment has an ID and an `original` blob reference, plus metadata such as alt text or the source URL when available. The schema supports images, video, and audio. The X importer reads photos and supported MP4 attachments from the export.
- `publishedAt` preserves the original date. `source` tracks the X ID and URL. `canonicalUrl` records the intended website permalink.

See the [image, text, image, video example](examples/image-text-image-video.json) for a full record. This format groups media within a single post. Reusable blocks and channel membership are outside the current schema.

## Run the website feed

Use Node.js and pnpm for the Cloudflare projects. Set `ATPROTO_DID` and `ATPROTO_PDS_ORIGIN` in [`feed/wrangler.jsonc`](feed/wrangler.jsonc) to the account and HTTPS PDS you want to read.

```sh
pnpm --dir cirrus install --frozen-lockfile
pnpm --dir cirrus exec wrangler dev --config ../feed/wrangler.jsonc --test-scheduled
```

With Wrangler running, trigger a local refresh and open the Notes page. Use the port printed by Wrangler if it differs from `8787`. [Cloudflare cron testing](https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally)

```sh
curl -fsS http://localhost:8787/cdn-cgi/local/scheduled
curl -fsS http://localhost:8787/notes.json
```

Open [the local Notes page](http://localhost:8787/notes/). In production, the Worker refreshes the latest 20 entries every six hours and caches the result in Workers KV. It reads standard Bluesky posts and can include legacy `com.haeinjung.note` records with `INCLUDE_LEGACY_NOTES=true`.

**Current website scope.** Direct rendering of `com.haeinjung.post` and its ordered media is pending. An import becomes visible on Notes today if it also creates a compatible Bluesky post in the account the feed reads. The archive record itself is available from Cirrus.

## Deploy on Cloudflare

For a new PDS, initialize the project in `cirrus/` with `pnpm pds init` after installing dependencies, then follow the Cirrus deployment guide for your hostname, handle, and signing key. Run `pnpm --dir cirrus run deploy` from the repository root once configured. If you already have a Cirrus account, use its existing origin and DID for the importer and feed. [Cirrus deployment guide](https://cirrus.earth/start/quick-start/#deploy)

For the feed Worker, create a KV namespace and put its ID into the `NOTES` binding. Set `SITE_ORIGIN` and replace the example routes in `feed/wrangler.jsonc` with your domain. Those routes mount Notes on an existing website. [Cloudflare Workers KV setup](https://developers.cloudflare.com/kv/get-started/)

```sh
pnpm --dir cirrus exec wrangler deploy --config ../feed/wrangler.jsonc
```
