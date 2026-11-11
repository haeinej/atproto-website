# AT Protocol Website

Host your posts and media on your own domain with Cloudflare and AT Protocol. Attach a posts page to an existing Cloudflare site, or run this project's starter site on a new hostname. Write posts in Markdown or bring over your X archive. The website reads public records from your Personal Data Server (PDS), and the files stay with those records.

[Build a block](docs/build-a-block.md) with text, links, media, and labels you choose.

| Component | Purpose |
| --- | --- |
| [Cirrus](cirrus/) | A Cloudflare Worker that runs your PDS. A Durable Object holds the repository and R2 holds its media. |
| [Website and feed](site/) | A posts page, individual post URLs, and a JSON feed backed by Workers KV. |
| [Post Lexicon](lexicons/com/haeinjung/post.json) | A shared post format with Markdown, ordered media, publication date, and optional source information. |
| [X archive importer](importer/) | A Java CLI that previews an export and publishes selected posts and media to your PDS. |

## Set up your site

Use Node.js 22 or newer and pnpm. You'll need a Cloudflare account and a domain in an active Cloudflare zone. Java 21 and Maven are only needed for the X importer.

```sh
npm ci
pnpm --dir cirrus install --frozen-lockfile
pnpm --dir cirrus exec wrangler login
```

If you already have a PDS, use its HTTPS origin and your account DID. To start a new one, run `pnpm --dir cirrus pds init` and set up a hostname such as `pds.example.com`. Follow the Cirrus instructions to back up your signing key, verify your handle, and deploy the Worker. [Cirrus quick start](https://cirrus.earth/start/quick-start/)

Generate the website configuration from the repository root. Replace the example URLs and DID with yours.

```sh
npm run --silent configure -- \
  --site https://example.com \
  --pds https://pds.example.com \
  --did did:web:pds.example.com \
  --mode attach > feed/wrangler.site.jsonc
```

- **Attach to a site.** Use `--mode attach` when the hostname already serves a Cloudflare Pages or Workers site. The Worker mounts `/notes/`, `/notes.json`, and `/posts/<slug>`. Choose a host where these paths are available. For a subdomain such as `www.example.com`, pass `--zone example.com`. [Cloudflare Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- **Start a site.** Use `--mode standalone` with an available hostname such as `journal.example.com`. Cloudflare attaches it as a Custom Domain and serves the posts page at the root. [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

The generated configuration uses a separate Worker name derived from the website hostname. Pass `--name` to select a specific Worker and `--kv` to use an existing KV namespace. Wrangler can create the KV namespace on deploy. [Wrangler provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning)

### Preview and deploy

Start Wrangler, then trigger a refresh in another terminal. Use the port Wrangler prints if it differs from `8787`.

```sh
pnpm --dir cirrus exec wrangler dev --config ../feed/wrangler.site.jsonc --test-scheduled
```

```sh
curl -fsS http://localhost:8787/cdn-cgi/local/scheduled
curl -fsS http://localhost:8787/notes.json
```

Open [the local posts page](http://localhost:8787/notes/). Edit [the page](site/index.html) and [its stylesheet](site/notes.css) to match your site.

```sh
pnpm --dir cirrus exec wrangler deploy --config ../feed/wrangler.site.jsonc
```

The feed refreshes every six hours and shows the latest 20 posts by publication date. Individual post URLs read the record directly, so they work as soon as the record is public. To populate the feed immediately after deploying, use the `NOTES` binding written to the generated config or regenerate with `--kv` and your namespace ID.

```sh
snapshot_file="$(mktemp)"
npm run --silent snapshot > "$snapshot_file" &&
  pnpm --dir cirrus exec wrangler kv key put latest \
    --config ../feed/wrangler.site.jsonc --binding NOTES --remote \
    --path "$snapshot_file" --ttl 172800
rm -f "$snapshot_file"
```

The Worker has a budget of 48 listing requests per refresh. Very large repositories may exceed that budget. The previous snapshot remains available for up to 48 hours after a temporary upstream failure.

## Publish a Markdown post

Create an app password for your PDS account and expose it to the command as `ATPROTO_APP_PASSWORD`. The CLI uses the account and website from the generated feed config. Omitting `--publish` previews the draft offline. [Cirrus app passwords](https://cirrus.earth/guides/create-app-password/)

```sh
npm run publish:post -- --file ./hello.md --slug hello --title 'Hello' --label 'Thoughts' --publish
```

Your post is available at `https://example.com/posts/hello` once published. Repeat `--label` to add more labels. To include a file in a specific part of the post, use an attachment reference such as `![A short clip](media:clip)` in the Markdown and add `--media clip=./clip.mp4` to the command. Repeat `--media` for additional files. The post can mix images, video, audio, links, and text. [Block guide](docs/build-a-block.md) · [Mixed-media example](examples/image-text-image-video.json)

## Import an X archive

Extract your X export and keep `data/tweets.js`, any `tweets-partN.js` files, and `data/tweets_media/` together. Build the importer and run an offline preview from the repository root. Use `--id YOUR_X_POST_ID` to preview a single post. [X archive instructions](https://help.x.com/en/managing-your-account/how-to-download-your-x-archive)

```sh
mvn -f importer/pom.xml package
java -jar importer/target/x-archive-importer.jar \
  --archive /path/to/extracted-archive \
  --site https://example.com
```

Publish a reviewed selection to Cirrus. The importer prompts for an app password in a terminal and also accepts `ATPROTO_APP_PASSWORD` for scripted runs.

```sh
java -jar importer/target/x-archive-importer.jar \
  --archive /path/to/extracted-archive \
  --id YOUR_X_POST_ID \
  --publish \
  --pds https://pds.example.com \
  --handle example.com \
  --did did:web:pds.example.com \
  --site https://example.com
```

Repeat `--id` to select multiple posts or omit it to import all eligible posts. Add `--label 'Tweets'` or any other labels you choose for the selection. Publishing writes public records and preserves the original date and URL. A rerun skips records with matching content. The preview reports replies, reposts, quote posts, and entries with missing or unsupported media.

Add `--also-bluesky` to publish compatible text and images on Bluesky too. The preview's `fitsBluesky` field shows which posts qualify. To sign in with a Cirrus account in the Bluesky app, choose a custom hosting provider and enter the PDS hostname. [Cirrus sign-in guide](https://cirrus.earth/guides/sign-in-to-bluesky/)

## Post format and compatibility

Every archive post uses the shared `com.haeinjung.post` collection in the author's own repository. Each record has a Markdown body, a publication date, and a canonical URL. It can include a title, summary, author labels in `tags`, attachments, and the original publishing platform and URL. Attachment order follows the references in the body. [Lexicon](lexicons/com/haeinjung/post.json) · [AT Protocol blob spec](https://atproto.com/specs/blob)

The starter configuration reads archive posts. To also list native Bluesky posts from the same account, set `INCLUDE_BLUESKY_POSTS=true` in the Worker config. The combined feed can show both records when you publish a Bluesky copy. Set `INCLUDE_LEGACY_NOTES=true` to include older `com.haeinjung.note` entries. The [haeinjung.com example](examples/haeinjung.com/notes-index.html) shows how the page can inherit an existing site's navigation.
