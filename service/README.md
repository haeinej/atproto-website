# The vault service

A member's vault: their posts, reached with a handful of requests. Every request proves who is asking, either with the member's ohm sign-in or with a token from the member's own PDS, and a member's posts are served to that member and nobody else. Nothing here publishes anything.

## A post

| Field | |
| --- | --- |
| `id` | Given once, when the post is made, and never changed. Whoever makes the post makes its ID (`newPostId` in [../vault/file.mjs](../vault/file.mjs)), so a request to create it can be sent twice and still make one post |
| `slug` | The end of the post's address. An ordinary field: change it and the post is still the same post. Used once in a vault |
| `label`, `sublabel` | Where it is filed, in the author's own words |
| `visibility` | `public`, `friends` or `private` |
| `title`, `subtitle`, `date`, `connect` | Optional |
| `address` | Optional. The post's address on the author's website, when that is a page of their own design and not the address its label and slug give it |
| `source` | Optional. Where the post first appeared, when that was somewhere else: the platform's name, the post's address there, and the platform's own ID for it |
| `site` | Optional. The site's own layer for the post: named fields of the author's own, which may have parts of their own |
| `body` | Markdown, as the author wrote it |
| `properties` | Anything else the author gave it. Kept, and never published |

## The requests

| Request | Does |
| --- | --- |
| `GET /xrpc/com.ohmmmm.vault.listPosts` | Every post with the version it is at. With `?since=` a point an earlier list returned, only what changed, removals included |
| `GET /xrpc/com.ohmmmm.vault.getPost?id=` | One post and its version |
| `POST /xrpc/com.ohmmmm.vault.putPost` | Saves one post. The body is `{ "post": …, "replaces": version }`, with `replaces` left out for a new post. Answers 409 with the current version when the post has changed, and 409 when another post has its slug |
| `POST /xrpc/com.ohmmmm.vault.deletePost` | Removes one post: `{ "id": …, "replaces": version }` |
| `GET /xrpc/com.ohmmmm.vault.getTree` | The vault's structure: labels, sublabels, and each post with who may see it, what kind of thing it is, and why it cannot be published, if it cannot |

| `POST /xrpc/com.ohmmmm.vault.importPublished` | Brings in what the member has already published, read from the PDS their own DID document names: `{ "site": "https://example.com", "from": "com.example.post", "apply": true }`. Without `apply` it only reports |
| `GET /xrpc/com.ohmmmm.vault.exportFiles` | The whole vault as files: each post's path in a folder, and its text |

A request sent twice ends the same as sent once. Saving a post, whatever it says about who may see it, changes only this copy.

## The page

`/vault/` is the page for working in a vault and trying the path end to end. It is served on the app's own address (`app.ohmmmm.com/vault/`), because that is where an ohm sign-in lives. Its files are in [public/vault/](public/vault/).

**Before the vault opens, one panel in the middle of the page.** It sits in the website's shell (the dot at the top of the rail, the company links at its foot) and signs a member in or up one of two ways:

- *With the AT Protocol account the posts belong to*: a PDS of your own, which is the filled button, or Bluesky. The member types their handle, the service finds the account (`GET /xrpc/com.ohmmmm.identity.findAccount?account=`, which needs no sign-in and answers only with what is public, and with this service's own DID), and the page sends them to the server that holds the account to approve, with a passkey there if they have one. This is AT Protocol's own sign-in for applications, so it works with any PDS that offers it. No account is made here: the sign-in is kept in the browser, tied to a key that cannot be copied out of it, and the PDS issues a token for each request the page makes. Someone with no PDS yet is pointed to Cirrus to set one up.
- *With an ohm account*: Google or Microsoft, the same buttons as the app's own sign-in screen. ohm's own sign-in (Better Auth, in the `ohm` repository, at `/api/auth/` on the same address) does the work; the page only calls it, and holds nothing but the session cookie the browser keeps. The first time, the member connects their AT Protocol account, by the step above: its PDS issues one token for exactly this, the service ties the two accounts together, and the page lets the PDS sign-in go.

[public/vault/client-metadata.json](public/vault/client-metadata.json) is what a PDS reads to learn who is asking; its addresses have to be the ones the page is served at.

**Once it is open, the app's screen.** A rail of icons (the vault, import and export, and you at the foot), a side panel that lists, and the main screen, laid out as the app lays out its own. The side panel is the vault's structure: labels, sublabels and posts, each with an icon for who can see it. The main screen is one post. On a phone the side panel is the screen, the rail is a bar at its foot, and opening a post makes the post the screen.

The page's colours, sizes and radii all come from [public/vault/assets/tokens.css](public/vault/assets/tokens.css), a copy of the design system's token file. Its icons are Lucide's, the set the app uses.

## A post as a file

The service never deals in files, folders or paths. A connector for a local folder, Obsidian or a cloud turns a post into a file and back with `postFile` and `filePost` in [../vault/file.mjs](../vault/file.mjs): the label is the folder, the sublabel the subfolder, the slug the file name, and the post's fields, its ID among them, are properties at the top. The mapping is exact, and because the file carries the ID, a file that was renamed or moved is still known to be the same post.

## Who is asking

There are two ways to say, and the service takes whichever a request carries.

**An ohm sign-in**, which is what the page uses for a member who signed in with Google or Microsoft. A request with no `Authorization` header is checked against ohm's sign-in: the service asks it whose session the request's cookie is (`/api/auth/get-session`, through the `AUTH` binding), and looks up the AT Protocol account that member connected. A request that changes anything must also come from the page's own address (`OHM_APP_ORIGIN`). Three requests manage the connection:

| Request | Does |
| --- | --- |
| `GET /xrpc/com.ohmmmm.account.get` | Who is signed in, and the AT Protocol account they connected, if they have |
| `POST /xrpc/com.ohmmmm.account.connect` | Ties an AT Protocol account to the ohm account: `{ "token": … }`, a token from that account's PDS issued for this request and nothing else |
| `POST /xrpc/com.ohmmmm.account.disconnect` | Unties it. The vault is kept |

One ohm account works in one AT Protocol account, and one AT Protocol account belongs to one ohm account.

**A token from the member's PDS**, which is what the command line and an agent use, and the page too for a member who signed in with their own PDS or Bluesky. The `Authorization` header carries an AT Protocol service token: issued by the member's PDS (`com.atproto.server.getServiceAuth`), for this service's DID as its audience and for the one request being made as its `lxm`, and valid for at most an hour. The signature is checked against the key the member's DID document names.

Either way, `MEMBERS` lists the DIDs let in and is checked before any document is fetched; `*` lets anyone in.

## Where things are

| Path | What it is |
| --- | --- |
| [src/store.mjs](src/store.mjs) | The posts: list, read, write, remove, and the tree. The database makes the version check in the statement that makes the change |
| [src/identity.mjs](src/identity.mjs) | Reading and checking a token |
| [src/ohm.mjs](src/ohm.mjs) | Asking ohm's sign-in who a session belongs to, and the table of which AT Protocol account each ohm account connected |
| [src/worker.mjs](src/worker.mjs) | The requests |
| [schema.sql](schema.sql) | The database's tables |

Tests are in [../test/service.test.mjs](../test/service.test.mjs) and [../test/identity.test.mjs](../test/identity.test.mjs), and run against the SQLite built into Node, which is what Cloudflare D1 is.

## Deploying

[wrangler.jsonc](wrangler.jsonc) is a template. Copy it, and in the copy set the account, the database's ID, the addresses the service is served at, `SERVICE_DID`, `MEMBERS`, `OHM_APP_ORIGIN`, and the Worker that `AUTH` reaches. Create the database, load [schema.sql](schema.sql) into it, and deploy with the copy. [public/.well-known/did.json](public/.well-known/did.json) names the service's own DID and has to match `SERVICE_DID`.

The service is served at two addresses: its own, which is what its DID names and what tokens are issued for, and `/vault` on the app's address, where the page is.

## Not here yet

Attachments and their cached copies, publishing, the endpoints for public and friends-only posts, earlier versions of a post, and holding a removed post so it can be brought back.
