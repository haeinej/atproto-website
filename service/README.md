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

## What it can do

The service groups requests into capabilities under [src/capabilities/](src/capabilities/): posts, structure, search, mirror, publish, export, account, identity and the private Cortex. **[CAPABILITIES.md](CAPABILITIES.md) is the reference**: every request, what it takes and gives, who may ask it, every way the service says no, and which requests each of an agent's tools is made of. That page is written from the same tables the service runs on (`npm run capabilities`), and a test fails if the two differ.

A request sent twice ends the same as sent once. Saving a post, whatever it says about who may see it, changes only this copy.

**Publishing is worked out here and done by the member.** The Publish capability says what would have to change in the member's own repository for what is published to match their vault, and writes nothing: the service holds no permission to write to anyone's repository. The member, signed in at their own PDS, makes the changes from that list. [public/vault/publish.js](public/vault/publish.js) is the code that does, and it is the same code in the editor and in an agent's tools. The rules that keep it safe beside other software writing to the same repository are in [../vault/publish.mjs](../vault/publish.mjs).

## The page

`/vault/` is the page for working in a vault and trying the path end to end. It is served on the app's own address (`app.ohmmmm.com/vault/`), because that is where an ohm sign-in lives. Its files are in [public/vault/](public/vault/).

**Before the vault opens, one panel in the middle of the page.** It sits in the website's shell (the dot at the top of the rail, the company links at its foot) and takes someone through onboarding in two steps.

1. *Who you are*: an ohm account, made with Google, Microsoft or Bluesky. For Google and Microsoft, ohm's own sign-in (Better Auth, in the `ohm` repository, at `/api/auth/` on the same address) does the work, and the page only calls it. For Bluesky, the member types their handle and approves at Bluesky; Bluesky issues a token naming them, the page hands it to ohm's sign-in, and ohm's sign-in asks this service who it names (`com.ohmmmm.identity.whoAmI`, below) and signs them in, making their ohm account the first time.
2. *Where your posts live*, asked once, on one screen: the member types the handle of their AT Protocol account, which is a PDS of their own or Bluesky, and an app password. The service finds the account (`GET /xrpc/com.ohmmmm.identity.findAccount?account=`, which needs no sign-in and answers only with what is public, and with this service's own DID), and the server that holds the account says it is theirs. That server issues one token for exactly this, the service ties the AT Protocol account to the ohm account, and ohm's sign-in is told too, so signing in with that account later is the same ohm account. Someone with no PDS yet is shown how to set one up with Cirrus. Someone who signed in with Bluesky has answered already and skips this step.

**Signing in at the PDS happens on ohm's own panel.** The member types their handle and an app password: one they make at their PDS for apps, and can take away again. The page sends it straight to the member's own PDS (`com.atproto.server.createSession`) and to nobody else, not to ohm. The sign-in it gives lives in the page's memory for that visit only, and is ended as soon as ohm has signed the member in; neither it nor the password is kept. The other way, offered under the form, is to approve at the PDS itself, which is where a passkey works: AT Protocol's own sign-in for applications. What the PDS shows of ohm on that screen (its name, mark and links) comes from [public/vault/client-metadata.json](public/vault/client-metadata.json); the screen itself is the PDS's.

Either way the page then lets the sign-in at the PDS go: the ohm session, a cookie the browser keeps, is what stays. Both ways work with any PDS: Cirrus, and Bluesky's. The addresses in the client metadata have to be the ones the page is served at.

Where ohm's sign-in does not take AT Protocol accounts yet (`/api/account/config` says whether it does), a Bluesky sign-in is kept in the browser instead, tied to a key that cannot be copied out of it, and the PDS issues a token for each request the page makes.

**Once it is open, the app's screen.** A rail of icons (the vault, and you at the foot), a side panel that lists, and the main screen, laid out as the app lays out its own. The side panel is the repository, and is always its content, drawn as folders that open and close with the posts under them, each with an icon for who can see it. Pills at its top choose what the folders are: the member's labels, the platforms the posts first appeared on, or who can see them. The filter beside them leaves out any label, platform or audience. The main screen is one post.

**Publish is a button above the tree.** A mark on it says something is waiting. Pressing it shows what would be published for the first time, replaced and taken down, and nothing changes until the member approves at their own PDS: with an app password typed on the page, or a passkey at the PDS's own screen. The sign-in made for it is let go when it is done.

**Unsaved writing stays in the form.** Opening another post, making a new one, going back, opening Publish, switching pages or signing out asks before discarding a changed post. Cancelling keeps both the writing and its saved version. Save keeps any text typed while it was waiting; that newer text still needs another save. A failed save leaves the draft available to retry. Unsaved text lives only in this page, so save before closing it; the browser is asked to warn before leaving a changed post.

Attachment downloads use the same sign-in and displayed-account check as other vault requests. A changed account stops pending bytes before upload. A sign-in that finishes refreshing after logout or replacement cannot restore the old session, including after logout in another tab. Older stored OAuth sign-ins without the new ownership marker need signing in again; posts are unaffected.

**A new account's vault fills itself.** The first time a connected account's vault opens, the page asks the service to mirror what the account has published on its PDS, and the posts appear in the side panel. The service remembers that it has been done (`mirrored` in `com.ohmmmm.account.get`). The arrows in the side panel's heading bring in whatever is new since. Taking the vault away as files is in the menu under your picture. On a phone the side panel is the screen, the rail is a bar at its foot, and opening a post makes the post the screen.

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

`GET /xrpc/com.ohmmmm.identity.whoAmI`, sent with such a token issued for that request, answers with the DID the token names, and with the account's handle when the handle points back to it. ohm's sign-in asks it, over a binding, to sign a member in with their AT Protocol account; it gives nothing away, since only the holder of a token can ask whom it names.

Either way, `MEMBERS` lists the DIDs let in; `*` lets anyone in. Private vault/Cortex data and keyboard mutations require membership. Account discovery, connection and disconnection remain available for onboarding or recovery after membership is removed; connecting still verifies the new account's PDS token. Each request pins the connected DID before checking `X-Ohm-Did`, so a concurrent reconnect cannot retarget that request to the new account.

Repository reads require a complete, valid listing. Failed pages, repeated cursors, duplicate/foreign record keys and a cursor remaining after the page limit refuse the operation rather than treating a partial listing as the repository. The first-mirror completion flag belongs to the original ohm user and DID; reconnecting during import cannot mark the new DID complete.

An agent's `vault_mirror` approval covers the displayed counts and conversion caveats, not an exact body snapshot. `importPublished` previews return `summary`; an apply may pass `expectedSummary` to require the same counts/caveats against the posts already read for that apply, before any saves. The MCP tool sends it automatically. A changed summary refuses with `Changed`; preview and confirm again. Clean body or record-key changes with the same displayed summary remain allowed. Callers that omit the optional field retain the direct apply behavior used for first onboarding.

## Where things are

| Path | What it is |
| --- | --- |
| [src/store.mjs](src/store.mjs) | The posts: list, read, write, remove, and the tree. The database makes the version check in the statement that makes the change |
| [src/identity.mjs](src/identity.mjs) | Reading and checking a token |
| [src/ohm.mjs](src/ohm.mjs) | Asking ohm's sign-in who a session belongs to, and the table of which AT Protocol account each ohm account connected |
| [src/capabilities/](src/capabilities/) | What the service can do, one capability to a file. Each request says what it is called, whether it reads or changes, who may ask, and how it is answered |
| [src/worker.mjs](src/worker.mjs) | The router: settles who is asking, in the way the request says, and hands over to it |
| [CAPABILITIES.md](CAPABILITIES.md) | The reference, written from those tables |
| [schema.sql](schema.sql) | The database's tables |

Tests are in [../test/service.test.mjs](../test/service.test.mjs), [../test/identity.test.mjs](../test/identity.test.mjs) and, for the page's app-password sign-in, [../test/signin.test.mjs](../test/signin.test.mjs), and run against the SQLite built into Node, which is what Cloudflare D1 is.

Account/reconnect regressions are in [../test/workspace-service.test.mjs](../test/workspace-service.test.mjs), complete listing checks in [../test/member.test.mjs](../test/member.test.mjs), and shell tests of the page's actual handlers with DOM/network doubles in [../test/vault-browser.test.mjs](../test/vault-browser.test.mjs). These test state and transport, not browser layout or a live PDS. [../test/mcp.test.mjs](../test/mcp.test.mjs) also checks mirror approval interleavings and malformed-request recovery on the ordered stdio queue.

## Deploying

[wrangler.jsonc](wrangler.jsonc) is a template. Copy it, and in the copy set the account, the database's ID, the addresses the service is served at, `SERVICE_DID`, `MEMBERS`, `OHM_APP_ORIGIN`, and the Worker that `AUTH` reaches. Create the database, load [schema.sql](schema.sql) into it, and deploy with the copy. [public/.well-known/did.json](public/.well-known/did.json) names the service's own DID and has to match `SERVICE_DID`.

The service is served at two addresses: its own, which is what its DID names and what tokens are issued for, and `/vault` on the app's address, where the page is.

## Not here yet

Attachments and their cached copies, the endpoints for public and friends-only posts, serving a friends-only post to friends, earlier versions of a post, and holding a removed post so it can be brought back.
