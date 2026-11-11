# Post Lexicon

`com.haeinjung.post` defines a platform-independent post on AT Protocol. A post can contain text, links, images, video, and audio. The same format works for posts you write directly and posts you import from elsewhere. [Lexicon](lexicons/com/haeinjung/post.json) · [Example post](examples/image-text-image-video.json)

## Post grammar

| Field | Meaning |
| --- | --- |
| `body` | Required CommonMark. Use `![Description](media:media-1)` to place an attachment between paragraphs. |
| `publishedAt` | Required publication date. The importer uses the original date. |
| `canonicalUrl` | Required primary public URL for the post. |
| `media` | Optional image, video, and audio attachments stored as blobs. Each attachment ID is unique within the post. Its position in the body determines where it appears. |
| `source` | Optional provenance for a post published elsewhere. It includes the platform and original URL, with room for the original ID, author, and date. |
| `title`, `summary`, `tags`, `updatedAt` | Optional metadata for the post. |

The example shows a photo, a paragraph, another photo, then a video. Cirrus stores the media files and the post references them by content ID. [AT Protocol blob spec](https://atproto.com/specs/blob)

| Path | What it does |
| --- | --- |
| [`importer/`](importer/) | Java CLI for previewing and importing an archive |
| [`lexicons/com/haeinjung/post.json`](lexicons/com/haeinjung/post.json) | AT Protocol schema for a post |
| [`cirrus/`](cirrus/) | Cloudflare Worker project for the Cirrus PDS |
| [`feed/`](feed/) and [`site/`](site/) | Scheduled post feed and the static page that reads it |
| [`examples/`](examples/) | A post with text and media, and the website template for haeinjung.com |

## Bluesky quick guide

1. In the Bluesky app or on [bsky.app](https://bsky.app/), choose **Sign in → Hosting provider → Custom**. Enter your Cirrus hostname, then sign in with the handle and password for that account. [Cirrus sign-in guide](https://cirrus.earth/guides/sign-in-to-bluesky/)
2. To share an imported post on Bluesky, add `--also-bluesky` to the [publish command](#publish-to-cirrus). The importer creates a Bluesky copy for compatible text and images. The preview's `fitsBluesky` field shows which posts qualify.
3. Check your Bluesky profile for the copy. The website feed can also display it after its next refresh if it reads the same account.

## Import an X archive

The Java CLI currently reads X exports and converts eligible entries into `com.haeinjung.post` records.

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

With Wrangler running, trigger a local refresh and open the posts page. Use the port printed by Wrangler if it differs from `8787`. [Cloudflare cron testing](https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally)

```sh
curl -fsS http://localhost:8787/cdn-cgi/local/scheduled
curl -fsS http://localhost:8787/notes.json
```

Open [the local posts page](http://localhost:8787/notes/). In production, the Worker refreshes the latest 20 entries every six hours and caches the result in Workers KV. It reads standard Bluesky posts and can include legacy `com.haeinjung.note` records with `INCLUDE_LEGACY_NOTES=true`.

Direct rendering of `com.haeinjung.post` and its ordered media is pending. The website currently displays the optional Bluesky copies. Cirrus holds the original imported posts.

## Deploy on Cloudflare

For a new PDS, initialize the project in `cirrus/` with `pnpm pds init` after installing dependencies, then follow the Cirrus deployment guide for your hostname, handle, and signing key. Run `pnpm --dir cirrus run deploy` from the repository root once configured. If you already have a Cirrus account, use its existing origin and DID for the importer and feed. [Cirrus deployment guide](https://cirrus.earth/start/quick-start/#deploy)

For the feed Worker, create a KV namespace and put its ID into the `NOTES` binding. Set `SITE_ORIGIN` and replace the example routes in `feed/wrangler.jsonc` with your domain. Those routes mount the posts page and feed on an existing website. [Cloudflare Workers KV setup](https://developers.cloudflare.com/kv/get-started/)

```sh
pnpm --dir cirrus exec wrangler deploy --config ../feed/wrangler.jsonc
```
