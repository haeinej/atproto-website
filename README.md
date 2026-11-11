# AT Protocol Website

A personal archive for what you share across social platforms. Save posts as notes on your own AT Protocol server, with the original source and date alongside the content.

Think Apple Notes for things you've published online. A note can start with a photo, continue with a paragraph and another photo, then end with a video. The archive stores that order in the note's body and keeps the media files on Cirrus. A separate Cloudflare Worker serves a Notes page and JSON feed for your website. [Mixed-media note example](examples/image-text-image-video.json) · [AT Protocol blob spec](https://atproto.com/specs/blob)

| Path | What it does |
| --- | --- |
| [`importer/`](importer/) | Java CLI for previewing and importing an archive |
| [`lexicons/com/haeinjung/post.json`](lexicons/com/haeinjung/post.json) | Schema for the `com.haeinjung.post` archive record |
| [`cirrus/`](cirrus/) | Cloudflare Worker project for the Cirrus PDS |
| [`feed/`](feed/) and [`site/`](site/) | Scheduled Notes feed and the static page that reads it |
| [`examples/`](examples/) | A mixed-media archive record and the Notes template for haeinjung.com |

## How a note is stored

- `body` contains CommonMark. A reference such as `![Street after the rain](media:media-1)` places an attachment where it belongs in the note.
- `media` holds images, video, or audio. Each attachment has an ID and an `original` blob reference, plus details such as alt text or a source URL when available.
- `publishedAt` preserves the original date. `source` can identify the platform, post ID, and original URL. `canonicalUrl` records the intended website permalink.

## Bluesky quick guide

1. In the Bluesky app or on [bsky.app](https://bsky.app/), choose **Sign in → Hosting provider → Custom**. Enter your Cirrus hostname, then sign in with the handle and password for that account. [Cirrus sign-in guide](https://cirrus.earth/guides/sign-in-to-bluesky/)
2. To share an imported note on Bluesky, add `--also-bluesky` to the publish command below. The importer saves the archive note and creates a separate Bluesky post for compatible text and images. The preview's `fitsBluesky` field shows which entries qualify. Notes with video or longer text can still be saved to the archive.
3. Check your Bluesky profile for the copy. The website's Notes feed can also display it after its next refresh if the feed reads the same account.

## Import an X archive

The current CLI reads X exports. The note schema can store posts from any platform that supplies the same content and source fields.

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
