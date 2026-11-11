# AT Protocol Website

Build your own home on AT Protocol from the website you already have: your own PDS, and your own schemas shaped from your site, readable by other AT Protocol applications. You keep what you publish in a content layer you own, and your website decides how it looks. [Cirrus](https://github.com/ascorbic/cirrus) runs your AT Protocol Personal Data Server (PDS) on Cloudflare. This starter adds a post schema under your domain, tools to publish and import posts and media, and a Worker that serves a posts list, post pages, and JSON feeds.

You can start from a website you already have, from an export of your posts on another platform, or from nothing. [Set up with your coding agent](docs/set-up-with-an-agent.md) · [Build a block](docs/build-a-block.md) · [Forms, labels, and sublabels](docs/labels.md) · [Identity](docs/identity.md) · [The fixed schema and your own fields](docs/schema-layers.md) · [Group and connect blocks](docs/group-and-connect.md)

## Use it without cloning

The commands run from any folder with `npx`, so you can work inside your own website's folder.

```sh
npx github:haeinej/atproto-website
```

That lists the commands. Each one previews by default and changes nothing until you pass `--publish`.

```sh
npx github:haeinej/atproto-website identity example.com
npx github:haeinej/atproto-website configure --site https://example.com --handle example.com > atproto-website.jsonc
npx github:haeinej/atproto-website publish --file ./hello.md --slug hello --title 'Hello' --label Writing
```

The commands look for a site configuration named `atproto-website.jsonc` in the folder you run them from, or take one with `--config`. Running your PDS and deploying the site Worker still need a clone of this repository, as described under [Set up your site](#set-up-your-site). The rest of this page writes the commands as `npm run …`, which is how they are run inside a clone; `npm run publish:post` is `publish` here.

## Use it with your coding agent

This repository is also a Claude Code plugin. Installing it gives your agent four skills: `start`, which tells it what this project is for and its rules; `suggest-labels`, for deciding your site's sections with you; `migrate-site`, for moving a website and social posts in without loss; and `build-renderer`, for making your site's own pages build from records.

```
/plugin install atproto-website --marketplace haeinej/atproto-website
```

On Claude Code older than 2.1.275, add the marketplace first with `/plugin marketplace add haeinej/atproto-website`, then run `/plugin install atproto-website@atproto-website`. Other coding agents can read [AGENTS.md](AGENTS.md) and the files under [skills/](skills/) directly. [Set up with your coding agent](docs/set-up-with-an-agent.md)

## Identity comes first

Everything hangs off your DID, your permanent identifier on AT Protocol. Your DID's document names your handle and the PDS that hosts your repository, and the repository is the container for every post and for your profile. This is the same identity Bluesky uses, so any AT Protocol software can resolve it and read what you publish. The site is a view of that repository. [Identity](docs/identity.md)

```sh
npm run --silent identity -- example.com
```

## How a post is described

Everything is one kind of record: a post with a Markdown body, a date, and a public URL. An essay, a photograph, a project write-up, and an imported social post are all posts. Five things say what a post is and where it belongs.

| | What it is | Who sets it | Example |
| --- | --- | --- | --- |
| Label | The section of your site the post sits in | You, in your own words | `Writings` |
| Sublabel | A group inside that section | You, in your own words | `Collisions` |
| Form | What kind of object the post is | Identified from its format | `writing` |
| Platform | Where the post was first published | From its source | `website`, `x`, `substack` |
| Visibility | Who can see it | You, when publishing | `public`, `private` |

Labels are where you start building: they are the names in your site's header, and each becomes a section. The form is the part that is the same on every site, so other software can tell an essay from a photo set whatever you call your sections. There are thirteen forms (writing, note, image, gallery, video, audio, file, media, link, embed, quote, list, code). You never type one, and it is not shown on your site. [Forms, labels, and sublabels](docs/labels.md)

These fields are the fixed schema: the same on every site, so other software can read your posts. Anything only your site needs goes in your own optional layer, declared in a schema under your domain and saved under the post's `site` field. It is unlisted: your own site shows it, and applications it does not apply to, such as Bluesky, never see it. When something means the same as a fixed field, fill the fixed field. [The fixed schema and your own fields](docs/schema-layers.md)

If you are not sure what your labels should be, a coding agent can help you work it out by asking you. It starts from `Writing`, `Photos`, and `Projects` and changes whatever you tell it to. [The suggest-labels skill](skills/suggest-labels/SKILL.md)

## The posts list

The posts page lists every post by name, with its platform, label, and date. A post without a title is named by its first line. One with no words either, such as a photograph, is named by its folder and a number: `Lisboa 12`. A switch above the list arranges the same posts four ways.

| Arrangement | Folders |
| --- | --- |
| All | None. A plain list, newest first. |
| Labels | One per label, with a folder inside for each sublabel. |
| Platforms | One per platform. |
| Visibility | `private` and `public`. Offered only to you, once you are signed in. |

Each post has its own page with its text, date, platform, and label. Your identity sits above the list.

Addresses follow the same folders, and every post also has an AT URI.

| Address | What it is |
| --- | --- |
| `/posts/` | Every post |
| `/posts/writings/` | One label |
| `/posts/writings/collisions/` | One sublabel |
| `/posts/writings/collisions/trap-of-independency` | A post |
| `at://did:web:pds.example.com/com.example.post/trap-of-independency` | The same post's record |

The address comes from the label and sublabel, so every post has a label; one published without a label is filed under `other`. A post's address always ends in its own key. If you file a post under a different label later, its old address and the short `/posts/trap-of-independency` both redirect to the new one.

## What is in this repository

| Component | Purpose |
| --- | --- |
| [Cirrus](cirrus/) | A Cloudflare Worker that runs your PDS. A Durable Object holds the repository and R2 holds its media. |
| [Website and feed](feed/) | A Worker that serves the [posts page](site/), post pages, private posts, and JSON feeds backed by Workers KV. |
| [Post Lexicon template](lexicons/com/haeinjung/post.json) | The fixed post schema. Generate it under your domain and leave its fields as they are. |
| [Optional schema template](lexicons/com/haeinjung/postSite.json) | Where your site declares its own fields. They are saved under a post's `site` field. |
| [Forms](feed/forms.mjs) | The thirteen forms, how each is identified, and what each may hold. |
| [Identity](feed/identity.mjs) | Resolves a handle or DID the AT Protocol way, and checks the site reads the repository that DID owns. |
| [Publish command](scripts/publish.mjs) | Previews and publishes a Markdown post with its attachments, publicly or privately. |
| [Profile](scripts/profile.mjs) | Sets your name, description, pronouns, pictures, and links, in the same shape as a Bluesky profile. |
| [X archive importer](importer/) | A Java CLI that previews an export and publishes selected posts and media to your PDS. |
| [AGENTS.md](AGENTS.md) | What this project is for and the rules a coding agent follows in it. |
| [Plugin manifest](.claude-plugin/plugin.json) | Makes this repository installable as a Claude Code plugin that carries the skills. |
| [Command entry point](bin/atproto-website.mjs) | Runs every command through `npx`, from any folder. |
| [start skill](skills/start/SKILL.md) | What an agent reads first: the purpose, the rules, and how to run the commands. |
| [Renderer](scripts/render-engine.mjs) | Rebuilds your site's own pages from records, keeping each page's design byte for byte. |
| [build-renderer skill](skills/build-renderer/SKILL.md) | How an agent replaces a site's content layer, and what it must check. |
| [migrate-site skill](skills/migrate-site/SKILL.md) | Instructions for a coding agent to move a site and social posts in without loss, touching only the content side. |
| [suggest-labels skill](skills/suggest-labels/SKILL.md) | Instructions for a coding agent to settle your site's labels with you. |

## Set up your site

Use Node.js 22 or newer and pnpm. You'll need a Cloudflare account and a domain in an active Cloudflare zone. Java 21 and Maven are only needed for the X importer.

```sh
npm ci
pnpm --dir cirrus install --frozen-lockfile
pnpm --dir cirrus exec wrangler login
```

If you already have a PDS, use its HTTPS origin and your account DID. To start a new one, run `pnpm --dir cirrus pds init` and set up a hostname such as `pds.example.com`. Follow the Cirrus instructions to back up your signing key, verify your handle, and deploy the Worker. [Cirrus quick start](https://cirrus.earth/start/quick-start/)

Generate the website configuration from the repository root. Replace the example URLs and DID with yours. You can pass `--handle example.com` in place of `--pds` and `--did`: the PDS is then read from your DID's document.

```sh
npm run --silent configure -- \
  --site https://example.com \
  --pds https://pds.example.com \
  --did did:web:pds.example.com \
  --mode attach > feed/wrangler.site.jsonc
```

- **Attach to a site.** Use `--mode attach` when the hostname already serves a Cloudflare Pages or Workers site. The Worker mounts `/notes/`, `/notes.json`, and everything under `/posts/`. Choose a host where these paths are available. For a subdomain such as `www.example.com`, pass `--zone example.com`. [Cloudflare Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- **Start a site.** Use `--mode standalone` with an available hostname such as `journal.example.com`. Cloudflare attaches it as a Custom Domain and serves the posts page at the root. [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

The generated configuration uses a separate Worker name derived from the website hostname. Pass `--name` to select a specific Worker and `--kv` to use an existing KV namespace. Wrangler can create the KV namespace on deploy. [Wrangler provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning)

The configuration derives the post collection from your zone, such as `com.example.post` for `example.com`. Pass `--collection` to choose a different name under a domain you control, or to preserve the collection you already use. Generate the matching Lexicon once and commit it to your site source:

```sh
mkdir -p lexicons/com/example
npm run --silent lexicon > lexicons/com/example/post.json
```

Use the path that matches your collection. Do not edit the generated post schema; your own fields go in an optional schema beside it. [Own the schema and its addresses](docs/set-up-with-an-agent.md#own-the-schema-and-its-addresses).

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

The feed refreshes every six hours. `/notes.json` has the latest 20 posts in full, by publication date. `/notes/graph.json` has every post's name, date, platform, form, label, and sublabel, and is what the posts list reads. Individual post URLs read the record directly, so they work as soon as the record is public. To populate the feed immediately after deploying, use the `NOTES` binding written to the generated config or regenerate with `--kv` and your namespace ID.

```sh
snapshot_file="$(mktemp)"
npm run --silent snapshot > "$snapshot_file" &&
  pnpm --dir cirrus exec wrangler kv key put latest \
    --config ../feed/wrangler.site.jsonc --binding NOTES --remote \
    --path "$snapshot_file" --ttl 172800
rm -f "$snapshot_file"
```

The Worker has a budget of 48 listing requests per refresh. Very large repositories may exceed that budget. The previous snapshot remains available for up to 48 hours after a temporary upstream failure.

## Publish a post

Create an app password for your PDS account and expose it to the command as `ATPROTO_APP_PASSWORD`. The CLI uses the account and website from the generated feed config. Omitting `--publish` previews the draft without publishing anything. [Cirrus app passwords](https://cirrus.earth/guides/create-app-password/)

```sh
npm run publish:post -- --file ./hello.md --slug hello --title 'Hello' --label 'Writings' --publish
```

Your post is available at `https://example.com/posts/writings/hello` once published. A post's address follows its label and sublabel, and `https://example.com/posts/hello` leads to the same place. `--label` is the section of your site the post belongs to and `--sublabel` is a group inside it, both in your own words. A post with no `--label` is filed under `other`. `--subtitle` adds a line under the title. The form is identified from the content and saved in the record: this post has a title, so it is a writing. The command refuses a post that does not fit its form, such as a writing with no title. [Forms, labels, and sublabels](docs/labels.md)

The body is Markdown. Footnotes are written `[^1]` in the text and `[^1]: the note` on a line of its own.

To include a file in a specific part of the post, use an attachment reference such as `![A short clip](media:clip)` in the Markdown and add `--media clip=./clip.mp4` to the command. Repeat `--media` for additional files. An attachment can be an image, video, audio, or a file such as a PDF, and `--media clip=https://example.org/clip.mp4` takes one in from the web and keeps the address as its source. A post that is nothing but a link to such a file is taken in the same way, so a link to an image becomes an image. A post that links to a page keeps the page's title, description, and preview image. A writing or a note can mix attachments with links and text. [Block guide](docs/build-a-block.md) · [Mixed-media example](examples/image-text-image-video.json)

To say what a post came from, add `--connect` with the slug of an earlier post or a web URL. The connection is kept in the record and in `/notes/graph.json`. Nothing on the site draws it yet. [Connect a block](docs/group-and-connect.md#connect-a-block)

Each post shows its platform. A post published this way is `website`. When bringing content from another site, pass `--date` for the original date, `--source-platform` (such as `substack`) and `--source-url` for where it appeared, and optionally `--source-id` for its original identifier.

## Rebuild your own pages from records

The shared posts page is one view of your repository. Your own website is another, and it can build its existing pages from the same records without its design changing. A page is split into three parts: the record holds the content, a template holds the page's own markup with the content cut out, and a rules file says where content sits on each kind of page.

```sh
npm run render -- adopt --page writing/essay.html --slug essay --rules render-rules.json --kind essay \
  --template templates/essay.html
npm run render -- build --slug essay --rules render-rules.json --kind essay \
  --template templates/essay.html --out built/writing/essay.html --against writing/essay.html
```

`adopt` cuts the template out of the page you already have, and refuses unless every piece it cuts is exactly what the record would put back. `build` fills the template from the record, and with `--against` fails unless the result is identical to the page. It runs when your site is built, so the site stays plain HTML. It handles paragraphs, emphasis, links, rules, images, attached files, headings, lists, rows of links, footnotes, and video, on pages that hold one post or several hundred, and stops on anything else instead of dropping it. [The build-renderer skill](skills/build-renderer/SKILL.md) has the method and what to check.

## Say who you are

Your profile is a record too: your name, description, pronouns, a picture, a banner, and up to ten links. It has the same fields as a Bluesky profile, so the two can be copied either way unchanged.

```sh
npm run profile -- --name 'Your Name' --pronouns 'she/her' \
  --description 'A line or two about you.' --avatar ./me.jpg \
  --link 'Newsletter=https://example.substack.com' --link https://github.com/example --publish
```

Without `--publish` the command prints the record and changes nothing. Setting one field leaves the others as they are, and giving any `--link` replaces the list. `--from-bluesky` starts from the profile you already have on Bluesky. If you set no profile here, the site shows your Bluesky profile when the account has one.

The shared posts page shows your picture, name, pronouns, verified handle, description, and links, and `/notes/profile.json` has them for your own pages. A section Bluesky has no field for goes in your profile's optional layer with `--site`, and appears on your own site only. Generate the two schemas beside your post schema with `npm run --silent lexicon -- --kind profile` and `--kind profileLink`.

## Keep a post private

Every record on a PDS is public, so a private post is not sent there. It is saved in your site's KV namespace and shown only after you sign in through Cloudflare Access.

1. In Cloudflare Zero Trust, add a self-hosted Access application for `example.com/notes/private` with a policy that allows only you. Note your team domain and the application's audience (AUD) tag. [Cloudflare Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
2. Regenerate the site configuration with `--access-team your-team.cloudflareaccess.com --access-aud YOUR_AUD_TAG`, then deploy. Private posts stay unavailable until both are set.
3. Publish with `--private`. This uses your Wrangler login and needs no app password.

```sh
npm run publish:post -- --file ./draft.md --slug a-draft --private --publish
```

Open `https://example.com/notes/private/` to sign in. The posts list then includes your private posts and offers a Visibility arrangement with `private` and `public` folders. Visitors see neither. Publishing the same slug with `--private` again replaces the post. A private post takes `--label`, `--sublabel`, `--connect`, and `--media` like any other; each attachment can be up to 25 MB.

## Import an X archive

Extract your X export and keep `data/tweets.js`, any `tweets-partN.js` files, and `data/tweets_media/` together. Build the importer and run an offline preview from the repository root. Use `--id YOUR_X_POST_ID` to preview a single post. [X archive instructions](https://help.x.com/en/managing-your-account/how-to-download-your-x-archive)

```sh
mvn -f importer/pom.xml package
java -jar importer/target/x-archive-importer.jar \
  --archive /path/to/extracted-archive \
  --collection com.example.post \
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
  --collection com.example.post \
  --site https://example.com
```

Use the collection set in `ATPROTO_POST_COLLECTION` in your feed configuration. Repeat `--id` to select multiple posts or omit it to import all eligible posts. Imported posts are notes. Add `--label 'Tweets'` or any other name to file the selection under it. Publishing writes public records and preserves the original date and URL. A rerun skips records with matching content. The preview reports replies, reposts, quote posts, and entries with missing or unsupported media.

Add `--also-bluesky` to publish compatible text and images on Bluesky too. The preview's `fitsBluesky` field shows which posts qualify. To sign in with a Cirrus account in the Bluesky app, choose a custom hosting provider and enter the PDS hostname. [Cirrus sign-in guide](https://cirrus.earth/guides/sign-in-to-bluesky/)

## Post format and compatibility

Each site uses its own post collection in the author's repository. The starter tools share a small contract: a Markdown body, a publication date, and a canonical URL. A record also carries its `form`, and can include a title and subtitle, summary, a `label` and `sublabel`, connections in `connect`, attachments, and the original publishing platform and URL. Attachment order follows the references in the body. For existing haeinjung.com installations, keep `com.haeinjung.post` to preserve existing record addresses. [Reference Lexicon](lexicons/com/haeinjung/post.json) · [AT Protocol blob spec](https://atproto.com/specs/blob)

The starter configuration reads archive posts. To also list native Bluesky posts from the same account, set `INCLUDE_BLUESKY_POSTS=true` in the Worker config. The combined feed can show both records when you publish a Bluesky copy. Set `INCLUDE_LEGACY_NOTES=true` to include older `com.haeinjung.note` entries. The [haeinjung.com example](examples/haeinjung.com/notes-index.html) shows how the page can inherit an existing site's navigation.

## Status

`npm test` covers identity resolution, the site renderer, the feed, post pages, the posts graph, the profile, the fixed schema, form identification and checks, taking in files and link previews from the web, and access to private posts.

- **Not yet run against Cloudflare.** Private posts are tested with a stand-in for Cloudflare Access and for KV. The step that writes a private post with Wrangler has only been previewed.
- **X importer not rebuilt.** It now saves each post's form and a single label. That change has not been compiled or run.
- **The profile command has only been previewed.** Saving a profile, its pictures, and its links to a PDS has not been run.
- **The site renderer does not handle quotations, code, or captions yet.** It stops on them, so a page that uses one is reported as not done.
- **No command to change a published post.** There is no way yet to change a post's label, move a private post to public, or delete a private post, other than by hand.
- **Embeds do not play.** An embed keeps its page's title, description, and preview image and is shown as a card that links out, not as a player.
- **Connections are stored, not shown.** `connect` and links between posts are in the record and in `/notes/graph.json`. There is no graph view.
- **One look per form is a start.** A writing has an article column and a gallery has a grid. The other forms use the default page.
