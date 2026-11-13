# ohm content layer

Build your own home on AT Protocol from the website you already have. Your posts and profile live in a repository on a Personal Data Server (PDS) you run. Every post is one shared record type, `com.ohmmmm.post`, so other AT Protocol applications can find and read it, and anything only your site needs is described by schemas under your own domain. Your website stays yours and becomes a view of that repository.

You can start from an existing website, from an export of your posts on another platform, or from nothing.

## What you get

- **An identity you own.** Everything hangs off your DID, the same kind of identity Bluesky uses. [Cirrus](https://github.com/ascorbic/cirrus) runs your PDS on Cloudflare.
- **One kind of record for everything you publish.** An essay, a photograph, a project write-up, and an imported social post are all posts, in one schema with one name on every site, so other software can find and read them.
- **A posts page.** A Cloudflare Worker serves a list of every post, a page for each, and JSON feeds.
- **Your own site, unchanged.** A renderer rebuilds your existing pages from the records, byte for byte, so only where the content comes from changes.

## Start

### With your coding agent

This repository is a Claude Code plugin. Its bundled skills are:

| Skill | What it helps with |
| --- | --- |
| [start](skills/start/SKILL.md) | The project's purpose and rules |
| [vault](skills/vault/SKILL.md) | Working in your notes with the vault's tools |
| [cortex](skills/cortex/SKILL.md) | Private memory, observations and learning between sessions |
| [suggest-labels](skills/suggest-labels/SKILL.md) | Deciding your site's sections with you |
| [migrate-site](skills/migrate-site/SKILL.md) | Moving a website and social posts in without loss |
| [build-renderer](skills/build-renderer/SKILL.md) | Making your site's pages build from records |
| [document-work](skills/document-work/SKILL.md) | Turning each completed outcome into distinct agent and human guides |

[How documentation follows your work](skills/document-work/README.md) explains what to expect from the last skill and how to use it. Its instructions, writing guides and contract live together in [skills/document-work/](skills/document-work/).

```
/plugin install ohm --marketplace haeinej/ohm-content-layer
```

On Claude Code older than 2.1.275, run `/plugin marketplace add haeinej/ohm-content-layer`, then `/plugin install ohm@ohm`. Other agents can read [AGENTS.md](AGENTS.md) and the files under [skills/](skills/) directly. [Set up with your coding agent](docs/set-up-with-an-agent.md)

### From the command line

The commands run from any folder, so you can work inside your own website's folder. Nothing needs cloning.

```sh
npx github:haeinej/ohm-content-layer
```

That lists the commands. Public publishing commands preview until you pass `--publish`; show the preview to the owner and get approval first. Private imports use `--save`, folder sync uses `--apply`, and renderer commands write local output. Those writes do not publish anything.

```sh
npx github:haeinej/ohm-content-layer identity example.com
npx github:haeinej/ohm-content-layer configure --site https://example.com --handle example.com > ohm.jsonc
npx github:haeinej/ohm-content-layer publish --file ./hello.md --slug hello --title 'Hello' --label Writing
```

Commands read a site configuration named `ohm.jsonc` from the folder you run them in, or take one with `--config`. The examples below shorten `npx github:haeinej/ohm-content-layer` to `ohm`. Inside a clone of this repository the same commands are `npm run identity`, `npm run publish:post`, and so on.

## How it is put together

### Identity is the root

Your DID is your permanent identifier. Its document names your handle and the PDS that hosts your repository, and the repository is the container for every post and for your profile. A handle is shown only when it points to your DID and your DID claims it back. On every refresh the site checks that it is reading the repository your DID names, and stops if it is not. [Identity](docs/identity.md)

### What describes a post

A post has a Markdown body, a date, and an address. Five things say what it is and where it belongs.

| | What it is | Who sets it | Example |
| --- | --- | --- | --- |
| Label | The section of your site the post sits in | You, in your own words | `Writings` |
| Sublabel | A group inside that section | You, in your own words | `Collisions` |
| Form | What kind of object the post is | Identified from its format | `writing` |
| Platform | Where the post was first published | From its source | `website`, `x`, `substack` |
| Visibility | Who can see it | You, when publishing | `public`, `private` |

Labels are where you start: they are the names in your site's header. The form is the part that is the same on every site, so other software can tell an essay from a photo set whatever you call your sections. There are fourteen forms (writing, note, image, gallery, video, audio, file, media, link, embed, quote, list, code, and other for anything else). You never type one, and it is not shown on your site. The list can grow, and software reads a form it does not know as `other`. [Forms, labels, and sublabels](docs/labels.md)

### A fixed schema, and a layer of your own

The post schema is fixed and identical on every site, and it has one name everywhere: `com.ohmmmm.post`. That is what lets other software find your posts and read them. Your profile uses Bluesky's own fields. Anything only your site needs goes in an optional layer: you declare it in a schema under your domain, and it is saved under the record's `site` field. That layer is unlisted, meaning your own site shows it and applications it does not apply to never see it. When something means the same as a fixed field, fill the fixed field. [The fixed schema and your own fields](docs/schema-layers.md)

### Addresses follow labels

| Address | What it is |
| --- | --- |
| `/posts/` | Every post |
| `/posts/writings/` | One label |
| `/posts/writings/collisions/` | One sublabel |
| `/posts/writings/collisions/trap-of-independency` | A post |
| `at://did:web:pds.example.com/com.ohmmmm.post/trap-of-independency` | The same post's record |

Because the address comes from the label, every post has one; a post published without a label is filed under `other`. An address always ends in the post's slug. The slug can be changed, and the post's record stays the same record, kept under an ID that never changes. The short `/posts/trap-of-independency`, the address a post had before it was refiled, and `/posts/` followed by the record's own key all redirect to the current address. A post published before posts had IDs is kept under its slug, and works as before.

### The posts page

The page lists every post by name, with its platform, label, and date. A post without a title is named by its first line. One with no words either, such as a photograph, is named by its folder and a number: `Lisboa 12`. A switch arranges the same posts four ways.

| Arrangement | Folders |
| --- | --- |
| All | None. A plain list, newest first |
| Labels | One per label, with a folder inside for each sublabel |
| Platforms | One per platform |
| Visibility | `private` and `public`. Offered only to you, once you are signed in |

Your picture, name, pronouns, verified handle, description, and links sit above the list.

## Commands

| Command | What it does |
| --- | --- |
| `identity` | Shows an identity and the record types in its repository. Takes a handle or DID |
| `configure` | Prints a site configuration from `--site` and `--handle` or `--did` |
| `import` | Previews or brings the posts you have published into your vault, each compared with the record it came from |
| `sync` | Says what syncing your own folder with your vault would do, in both directions. With `--apply`, does it. Never publishes |
| `lexicon` | Prints a schema: `--kind post` for the shared post schema, or `postSite`, `profile`, `profileLink`, `profileSite` for your own, under your domain |
| `migrate` | Previews or copies posts from an older post type, such as `com.example.post`, to `com.ohmmmm.post` |
| `mcp` | Serves the vault's tools to a coding agent |
| `publish` | Previews or publishes a post |
| `profile` | Previews or saves your profile |
| `posts` | Lists every public post with its form, label, and opening lines |
| `render` | Rebuilds one of your site's own pages from a post |
| `snapshot` | Prints the feed snapshot the site Worker would store |

## Publish a post

Create an app password for your PDS account and give it to the command as `ATPROTO_APP_PASSWORD`. Without `--publish` the command prints the record and publishes nothing. [Cirrus app passwords](https://cirrus.earth/guides/create-app-password/)

```sh
ohm publish --file ./hello.md --slug hello --title 'Hello' --label Writings --publish
```

The post is then at `https://example.com/posts/writings/hello`.

| Option | Meaning |
| --- | --- |
| `--label`, `--sublabel` | The section of your site the post belongs to, and a group inside it, in your own words |
| `--title`, `--subtitle` | A title, and a line under it |
| `--media ID=PATH` | A file placed in the body where you write `![A short clip](media:ID)`. Repeat for more. `ID=URL` takes a file in from the web and keeps the address as its source |
| `--date` | The original date, for something first published earlier |
| `--source-platform`, `--source-url`, `--source-id` | Where it first appeared. Without these the platform is `website` |
| `--connect` | The key of an earlier post, or a web address, that this post came from |
| `--site key=value` | A field of your own optional layer, which your optional schema must declare |
| `--private` | Keep it off your PDS. See below |

- **The form is identified for you.** A titled post is a writing, an untitled one a note, a post of only images an image or gallery, and so on. The command refuses a post that does not fit its form, such as a writing with no title.
- **Attachments** can be images, video, audio, or files such as a PDF.
- **A link to a file is the file.** A post that is nothing but a link to an image, video, audio file, or PDF is taken in as that object, with the link kept as its source. A post that links to a page keeps the page's title, description, and preview image.
- **Footnotes** are written `[^1]` in the text and `[^1]: the note` on a line of its own.

[Build a block](docs/build-a-block.md) · [Group and connect blocks](docs/group-and-connect.md)

## Mirror your platforms

If you would rather keep publishing where you already do, the mirror copies it into your repository: your website, a newsletter, or anything else with a feed, and X through its API. It runs on a schedule and from one **Mirror now** button, writes only what changed, and never writes back to a platform. [Mirror](docs/mirror.md)

## Say who you are

Your profile is a record with the same fields as a Bluesky profile: name, description, pronouns, a picture, a banner, and up to ten links.

```sh
ohm profile --name 'Your Name' --pronouns 'she/her' \
  --description 'A line or two about you.' --avatar ./me.jpg \
  --link 'Newsletter=https://example.substack.com' --link https://github.com/example --publish
```

Setting one field leaves the others as they are, and giving any `--link` replaces the list. `--from-bluesky` starts from the profile you already have on Bluesky; if you set none here, the site shows your Bluesky profile when the account has one. A section Bluesky has no field for goes in your profile's optional layer with `--site`.

## Keep a post private

Every record on a PDS is public, so a private post is not sent there. It is saved in your site's storage on Cloudflare and shown only after you sign in through Cloudflare Access.

1. In Cloudflare Zero Trust, add a self-hosted Access application for `example.com/notes/private` with a policy that allows only you. Note your team domain and the application's audience (AUD) tag. [Cloudflare Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
2. Generate the site configuration again with `--access-team your-team.cloudflareaccess.com --access-aud YOUR_AUD_TAG`, then deploy. Private posts stay unavailable until both are set.
3. Publish with `--private`. This uses your Wrangler login and needs no app password.

Open `https://example.com/notes/private/` to sign in. The posts list then includes your private posts and offers the Visibility arrangement. Visitors see neither. Publishing the same key with `--private` again replaces the post. Each attachment can be up to 25 MB.

A private post's record holds the address it would have if it were public, such as `https://example.com/posts/writings/hello`. It is served from the private area because of where it is stored, not because of anything written in it.

### For friends

Publish with `--friends` for a post meant for the people you follow who follow you back. It is stored like a private post, in your own storage and off the PDS. There is no network for friends to read through yet, so for now only you see it: it is listed beside your private posts, marked `friends`.

### One vault

A post is public, for friends, or private, and that is decided by where it is stored. Its record is the same in all three places, so changing who can see it moves it without rewriting it. A slug is used once across all three: publishing a slug that is already in use at another visibility is refused. The rules for this are in [vault/](vault/), and the commands, and later the editor and the agent's tools, all write through them.

## Work in your vault

ohm keeps a working copy of your vault: every post you have, at all three visibilities, in one structure of labels, sublabels and posts. It is where the editor and your agent's tools work. Your published posts stay records in your own repository; the working copy is a second copy to work in, and nothing in it is published by being saved.

**The editor** is at [app.ohmmmm.com/vault](https://app.ohmmmm.com/vault/).

1. **Sign in or sign up** with Google, Microsoft or Bluesky.
2. **Say where your posts live**, once: the handle of your AT Protocol account, which is a PDS of your own or Bluesky, and an app password. The password goes from the page to your own PDS and nowhere else. A passkey works at your PDS's own screen instead. Signing in with Bluesky answers this already.
3. **Your published posts are brought in on their own** the first time. Nothing has to be named: the service finds your website from your handle and reads the shared post type and any type of your own whose records read as posts.

The side panel is your repository, as folders that open and close. Pills choose what the folders are: your labels, the platforms posts first appeared on, or who can see them, and a filter leaves out what you do not want. The main screen is one post.

What the service can do, request by request, is in [service/CAPABILITIES.md](service/CAPABILITIES.md), and how it is built and deployed in [service/README.md](service/README.md).

Three things to know:

- **Saving never publishes.** A post marked for everyone is in the vault, meant for everyone. It reaches your PDS when you press Publish, which first shows exactly what would change: what would be published, replaced and taken down.
- **You publish; ohm does not.** The service works out the changes and holds no permission to write to your repository. They are made from your browser, or by your agent, signed in at your own PDS for as long as it takes: with an app password typed on ohm's page, or a passkey at your PDS's own screen.
- **Publish only touches posts.** It writes and removes records of the shared post type only, and never removes a record the vault knows nothing about.
- **This is not the private area on your own site.** "Keep a post private", above, stores a post in your own site's storage. The vault is ohm's working copy. Nothing moves between the two yet.
- **The vault at ohmmmm.com is not open to everyone yet.** An account that has not been let in is told so when it connects.

## Give your agent the vault

The plugin starts a small server on your own machine, `ohm-vault`, that gives your coding agent tools for your posts. The tools work in ohm's working copy of your vault, the same one the editor shows, so a post your agent saves is there when you open it. Each request carries a token your own PDS issues for it.

| Tool | Does |
| --- | --- |
| `vault_tree` | The structure: labels, sublabels, and each post with who can see it |
| `vault_list`, `vault_read` | List posts, and read one in full |
| `vault_search` | Search your posts at every visibility |
| `vault_save` | Create a post, always private, or change one that was read |
| `vault_set_visibility` | Mark a post as public, for friends, or private |
| `vault_status` | What publishing would change, without changing anything |
| `vault_publish` | Publish: make what is published in your repository match your vault. It shows what would change first |
| `vault_mirror` | Bring what you have already published on your PDS into the vault. It looks first and says what it found |
| `vault_delete` | Remove a post |

Reading is free. Changing a post that is not private, changing who a post is for, publishing, bringing posts in, and removing one each take two calls: the first answers with exactly what would happen, and only a second call carrying the value it returned does it. So your agent shows you which post and who it is for before anything changes. Saving never publishes: publishing is a step of its own, and it is public the moment it is done.

A tool adds no ability of its own. Each is made of requests to the vault service and nothing else, and [service/CAPABILITIES.md](service/CAPABILITIES.md) lists which.

The server uses the same site configuration as the commands, found in the folder your agent is working in, and needs `ATPROTO_APP_PASSWORD` to sign in to your PDS. The vault is ohm's unless the configuration names another with `OHM_VAULT_URL` and `OHM_VAULT_DID`. An agent that does not load the plugin can start the server itself:

```sh
npx github:haeinej/ohm-content-layer mcp
```

## Keep your vault in a folder of your own

Your vault can live as a folder of Markdown files on your machine, or in a folder that a cloud keeps in sync. A label is a folder, a sublabel a folder inside it, a post a file, and the post's title, date and who may see it are properties at the top of the file. The same folder opens in Obsidian.

```sh
ohm sync --folder ~/Vault --vault https://vault.example.com --vault-did did:web:vault.example.com
```

That looks at the folder and at ohm's working copy and says what a sync would do. Add `--apply` to do it. It needs `ATPROTO_APP_PASSWORD`, to ask your PDS for tokens that prove to the vault who you are.

- **It goes both ways.** A post edited in the folder reaches the working copy, and one edited there reaches the folder.
- **It never publishes.** Writing `visibility: public` in a file marks the post; nothing is public until you publish.
- **It will not decide three things for you.** A post changed in both places is left as it is on both sides, with the other version put beside your file as `name.md.from-ohm`; settle it with `--take ID=folder` or `--take ID=ohm`. A file that has gone missing does not remove its post, and a post removed in ohm does not remove your file; say so with `--take ID=remove`.
- **A file laid out your own way is left alone.** Reordered properties, your own comments and blank lines are the same post, and nothing is rewritten.
- **A file you move or rename is still the same post,** known by the `id` property sync writes into it the first time.
- **The folder is enough to bring everything back.** If ohm's copy is gone, syncing from the folder restores every post.

What sync remembers between runs is kept in the folder, under `.ohm/`.

## Rebuild your own pages from records

Your own website can build its existing pages from the same records without its design changing. The site's source is the specification: the result must be the same bytes as before, with only the source of the content swapped.

A page is split into three parts. The record holds the content. A template holds the page's own markup with the content cut out. A rules file says where content sits on each kind of page.

```sh
ohm render adopt --page writing/essay.html --slug essay --rules render-rules.json --kind essay \
  --template templates/essay.html
ohm render build --slug essay --rules render-rules.json --kind essay \
  --template templates/essay.html --out built/writing/essay.html --against writing/essay.html
```

- **`adopt`** cuts the template out of the page you already have. It compares every piece it cuts with what the record would put back, and writes nothing unless each one matches, naming the block that does not.
- **`build`** fills the template from the record. With `--against` it fails unless the result is identical to the page.

It runs when your site is built, so the site stays plain HTML. It handles pages that hold one post or several hundred, and stops on markup it does not handle instead of dropping it. [The build-renderer skill](skills/build-renderer/SKILL.md) has the method and what to check.

## Move to the shared post schema

Sites set up before the post schema was shared keep their posts under a type of their own, such as `com.example.post`. The `migrate` command copies them to `com.ohmmmm.post`. Each post keeps its key, so its address on your site does not change, and the older records are left where they are.

```sh
ohm migrate --from com.example.post
ohm migrate --from com.example.post --key hello
ohm migrate --from com.example.post --publish
```

The first prints a count of what would be copied and changes nothing. `--key` prints one post's new record in full. `--publish` writes, and needs `ATPROTO_APP_PASSWORD`. A site configuration that still has `ATPROTO_POST_COLLECTION` gives `--from` its default.

| In the older record | In the new one |
| --- | --- |
| The type `com.example.post`, on the record and on each attachment | `com.ohmmmm.post` |
| An attachment's `original` | `file` |
| A link's `site` | `siteName` |
| `tags`, from before labels | The first is the label and the second the sublabel |
| Links and connections to your own posts under the older type | The same posts under `com.ohmmmm.post` |
| A private post's private address in `canonicalUrl` | The address it would have if it were public |
| A field the shared schema has no place for, such as `summary` | Kept in your own layer, under `site`. Declare it in your `postSite` schema |
| `source.author`, and an image's `credit` and `extractedText` | Not kept. The preview lists them under `leftBehind` |

Do it in this order, because the site reads only `com.ohmmmm.post` from this version on:

1. Add `"ATPROTO_SITE_NAMESPACE": "com.example"` to your site configuration, with your own domain written backwards. Your profile and your optional schemas are found under it. A configuration that still has `ATPROTO_POST_COLLECTION` works without this.
2. Preview, read what would be moved and left behind, and declare the moved fields in your `postSite` schema.
3. Run it with `--publish`.
4. Deploy the site Worker. Deploying before step 3 leaves the site with no posts to show.

Private posts need no migration. One saved before this change is read as the shared schema has it, and publishing it again with `--private` saves it in the new shape. A mirror writes each post again under the shared type on its next runs.

## Import an X archive

Extract your X export and keep `data/tweets.js`, any `tweets-partN.js` files, and `data/tweets_media/` together. The importer is a Java program in this repository, so this part needs a clone, Java 21, and Maven. [X archive instructions](https://help.x.com/en/managing-your-account/how-to-download-your-x-archive)

```sh
mvn -f importer/pom.xml package
java -jar importer/target/x-archive-importer.jar --help
java -jar importer/target/x-archive-importer.jar \
  --archive /path/to/extracted-archive --site https://example.com
```

That previews offline. To publish a reviewed selection, add `--publish --pds https://pds.example.com --handle example.com --did did:web:pds.example.com`, and `--id YOUR_X_POST_ID` once for each post, or leave `--id` out to import everything eligible. Imported posts are notes; `--label 'Tweets'` files them under a name. The preview reports the replies, reposts, quote posts, and entries with missing media that it leaves out. `--also-bluesky` also posts compatible text and images to Bluesky.

## Run your own PDS and site

This part needs a clone of the repository, Node.js 22 or newer, pnpm, a Cloudflare account, and a domain in an active Cloudflare zone.

```sh
npm ci
pnpm --dir cirrus install --frozen-lockfile
pnpm --dir cirrus exec wrangler login
```

**1. The PDS.** If you already have one, use it. To start one, run `pnpm --dir cirrus pds init`, set up a hostname such as `pds.example.com`, and follow the Cirrus instructions to back up your signing key, verify your handle, and deploy. [Cirrus quick start](https://cirrus.earth/start/quick-start/)

**2. The site configuration.**

```sh
npm run --silent configure -- --site https://example.com --handle example.com --mode attach > feed/wrangler.site.jsonc
```

- `--mode attach` is for a hostname that already serves a Cloudflare Pages or Workers site. The Worker mounts `/notes/`, `/notes.json`, and everything under `/posts/`. For a subdomain such as `www.example.com`, pass `--zone example.com`. [Cloudflare Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- `--mode standalone` is for a free hostname such as `journal.example.com`, which serves the posts page at its root. [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- `--name` picks the Worker's name and `--kv` an existing KV namespace. `--namespace` sets where your own optional schemas are declared, when it is not your domain written backwards (`com.example` for `example.com`). It is saved as `ATPROTO_SITE_NAMESPACE`. There is no post type to choose: every post is `com.ohmmmm.post`.

**3. Your schemas.** The post schema is shared and is in this repository at [lexicons/com/ohmmmm/post.json](lexicons/com/ohmmmm/post.json); you do not generate or edit it. Your own fields go in an optional schema under your domain. Generate it once and keep it with your site's source.

```sh
mkdir -p lexicons/com/example
npm run --silent lexicon -- --kind postSite > lexicons/com/example/postSite.json
```

**4. Preview and deploy.**

```sh
pnpm --dir cirrus exec wrangler dev --config ../feed/wrangler.site.jsonc --test-scheduled
curl -fsS http://localhost:8787/cdn-cgi/local/scheduled
pnpm --dir cirrus exec wrangler deploy --config ../feed/wrangler.site.jsonc
```

The first command serves the site locally; the second, run in another terminal, refreshes it. Edit [the page](site/index.html) and [its stylesheet](site/notes.css) to match your site.

### Feeds

| Address | Holds |
| --- | --- |
| `/notes.json` | The latest 20 posts in full |
| `/notes/graph.json` | Every post's name, date, platform, form, label, and sublabel. The posts page reads this |
| `/notes/profile.json` | Your profile |
| `/notes/identity.json` | Your DID, verified handle, and repository address |

The feed refreshes every six hours, with a budget of 48 listing requests, so a very large repository may exceed it. The last snapshot stays available for up to 48 hours after a failure. A post's own page reads its record directly and works as soon as the record is public. To fill the feed straight after deploying, store a snapshot yourself:

```sh
snapshot_file="$(mktemp)"
npm run --silent snapshot > "$snapshot_file" &&
  pnpm --dir cirrus exec wrangler kv key put latest \
    --config ../feed/wrangler.site.jsonc --binding NOTES --remote \
    --path "$snapshot_file" --ttl 172800
rm -f "$snapshot_file"
```

Set `INCLUDE_BLUESKY_POSTS=true` in the Worker's configuration to list native Bluesky posts from the same account, and `INCLUDE_LEGACY_NOTES=true` for older `com.haeinjung.note` entries.

## Work on this repository

For a source checkout, use Node.js 22 or newer and install both locked dependency sets from the repository root:

```sh
npm ci
npm --prefix service ci
npm test
```

The root dependencies run the CLI, renderer, public-site tooling and tests. The separate service package supplies the pinned signature-verification library used by the vault service and integration tests; root `npm ci` does not install it. If tests cannot find `service/node_modules/@noble/curves`, run the service install above rather than changing imports or fetching packages from a test. Neither tests nor package installation automatically installs service dependencies.

This contributor setup is not required to use the packaged CLI in your own site's folder. [Run your own PDS and site](#run-your-own-pds-and-site) has the separate Cirrus prerequisites. [Public sites](public/README.md) lists local preview commands; the [agent working guide](https://docs.ohmmmm.com/agent-guide#verify) gives verification and recovery contracts.

## In this repository

| Path | What it is |
| --- | --- |
| [cirrus/](cirrus/) | The PDS: a Cloudflare Worker with a Durable Object for the repository and R2 for its media |
| [feed/](feed/) | The site Worker: identity, forms, the feeds, post pages, and private posts |
| [vault/](vault/) | The rules every post follows at any visibility; a post as a file; bringing published posts in; syncing a folder; and the stores a site of your own keeps posts in |
| [service/](service/) | The vault service: ohm's working copy of a vault, one capability to a file, the editor's page, and [the reference](service/CAPABILITIES.md) for every request |
| [mcp/](mcp/) | The vault's tools for a coding agent, each made of requests to the vault service, and the server that offers them |
| [plans/](plans/) | What is being built and why: [the build plan](plans/build-plan.md), and the design behind it |
| [site/](site/) | The posts page and its stylesheet |
| [scripts/](scripts/) and [bin/](bin/) | The commands |
| [lexicons/](lexicons/) | The shared post schema, [com/ohmmmm/post.json](lexicons/com/ohmmmm/post.json), and under [com/haeinjung/](lexicons/com/haeinjung/) the templates for a site's own schemas: the profile and the optional ones |
| [importer/](importer/) | The X archive importer |
| [skills/](skills/) and [AGENTS.md](AGENTS.md) | What a coding agent reads: the purpose, the rules, and the five skills |
| [docs/](docs/) | The guides linked above |
| [test/](test/) | Tests. Run them with `npm test` |

## Status

`npm test` covers identity resolution, the site renderer, the feed, post pages, the posts graph, the profile, the fixed schema, form identification, taking in files and link previews from the web, and access to private posts. It also covers the vault service and each of its capabilities, who may ask what, bringing published posts in, a post as a file, syncing a folder, the agent's tools against the service itself, and that [the reference](service/CAPABILITIES.md) says what the code does.

Tried for real:

- **Publishing** has been run against a local Cirrus PDS, with 484 posts including images, video, and PDFs.
- **The renderer** has rebuilt a real site's 13 pages from those 484 posts, each page the same bytes as the original.
- **The vault service** is deployed, and one account has signed in, connected its own PDS and opened the editor.
- **Bringing published posts in** has been run, reading only, against a real PDS: 2 records became 2 posts, each identical to what is published.

Not yet:

- **Publishing from the vault has not been run against a real PDS.** It is tested against the service's own code and a stand-in repository, in the editor and through the agent's tools.
- **Friends-only posts are not shown to friends.** Marking a post for friends changes only the working copy.
- **The agent's tools have not been run with a real sign-in.** They are tested against the service's own code, and start and ask for an app password against a real site's settings.
- **The vault holds no files.** A picture or file is placed in a post by its address, and a copy is sent to your PDS when the post is published.
- **Syncing a folder has not been run against the deployed service.**
- **Private posts and the profile command have not been run against Cloudflare.** Private posts are tested with stand-ins for Cloudflare Access and its storage.
- **The X importer has not published to a live PDS.** Its Java 21 Maven build, packaged `--help` command and synthetic offline preview have been verified locally.
- **The migrate command has only been previewed.** It has read a live repository and its converted records pass the schema, but it has not written to a PDS.
- **There is no command to change a published post.** Changing a label, moving a private post to public, or deleting one is done by hand.
- **The site renderer stops on quotations, code, and captions.** A page that uses one is reported as not done.
- **Embeds do not play.** An embed is shown as a card that links out.
- **Connections are stored, not shown.** They are in the record and in `/notes/graph.json`. There is no graph view.
- **Only two forms have a look of their own** on the shared post page: a writing has an article column and a gallery a grid.
