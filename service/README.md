# The vault service

A member's vault: their posts, reached with four requests. Every request proves who is asking with a token from the member's own PDS, and a member's posts are served to that member and nobody else. Nothing here publishes anything.

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

`/` is a page for working in a vault and trying the path end to end: sign in, see the tree, make and edit a post, change who can see it, bring in what is published, and write the vault out. Its files are in [public/](public/).

**Signing in feels like signing in anywhere.** The member types their handle. The service finds the account (`GET /xrpc/com.ohmmmm.identity.findAccount?account=`, which needs no sign-in and answers only with what is public), and the page sends them to their own PDS to approve, with a passkey if they have one. They come back signed in, and the page never sees a password. This is AT Protocol's own sign-in for applications, so it works with any PDS that offers it: Cirrus, and Bluesky's. [public/client-metadata.json](public/client-metadata.json) is what a PDS reads to learn who is asking; its addresses have to be the ones the service is served at.

**The sign-in is kept on the device.** It is tied to a key made in that browser that cannot be copied out of it, so the next visit is already signed in and what is kept is of no use anywhere else. Signing out tells the PDS the sign-in is over and forgets it.

An app password is still offered, behind "Use an app password instead", for a PDS that cannot sign someone in through the browser. It is sent to the PDS only and is not kept.

The page asks the PDS for a token before each request to the vault, whichever way the member signed in.

## A post as a file

The service never deals in files, folders or paths. A connector for a local folder, Obsidian or a cloud turns a post into a file and back with `postFile` and `filePost` in [../vault/file.mjs](../vault/file.mjs): the label is the folder, the sublabel the subfolder, the slug the file name, and the post's fields, its ID among them, are properties at the top. The mapping is exact, and because the file carries the ID, a file that was renamed or moved is still known to be the same post.

## Who is asking

The `Authorization` header carries an AT Protocol service token: issued by the member's PDS (`com.atproto.server.getServiceAuth`), for this service's DID as its audience and for the one request being made as its `lxm`, and valid for at most an hour. The signature is checked against the key the member's DID document names. `MEMBERS` lists the DIDs let in and is checked before any document is fetched; `*` lets anyone in.

## Where things are

| Path | What it is |
| --- | --- |
| [src/store.mjs](src/store.mjs) | The posts: list, read, write, remove, and the tree. The database makes the version check in the statement that makes the change |
| [src/identity.mjs](src/identity.mjs) | Reading and checking a token |
| [src/worker.mjs](src/worker.mjs) | The requests |
| [schema.sql](schema.sql) | The database's table |

Tests are in [../test/service.test.mjs](../test/service.test.mjs) and [../test/identity.test.mjs](../test/identity.test.mjs), and run against the SQLite built into Node, which is what Cloudflare D1 is.

## Deploying

[wrangler.jsonc](wrangler.jsonc) is a template. Copy it, and in the copy set the account, the database's ID, the address the service is served at, `SERVICE_DID`, and `MEMBERS`. Create the database, load [schema.sql](schema.sql) into it, and deploy with the copy. [public/.well-known/did.json](public/.well-known/did.json) names the service's own DID and has to match `SERVICE_DID`.

## Not here yet

Attachments and their cached copies, publishing, the endpoints for public and friends-only posts, earlier versions of a post, and holding a removed post so it can be brought back.
