# Build plan

Written 12 November 2026 and reworked several times the same day. The states under "Where we are" and each milestone were last brought up to date that evening, after the editor, sign-in, the automatic mirror and the agent's tools were built and deployed. In this version ohm is an editor with agents: it keeps a complete working copy of each member's vault so they and their agent can work from anywhere, and the member's originals live with them. The decisions behind each rework were made by Haein, some in side conversations and passed on from there. They are listed under "What changed" so they can be checked. Background is in [the architecture plan](network-architecture.md), parts of which this version now contradicts; see "Wording that now needs changing".

## What phase one is

One person and their own content, with ohm between where it lives and where it is read.

```
  THE MEMBER'S ORIGINALS              OHM: THE WORKING COPY                  WHAT IS READ
  public posts: records in            every post, at all three               public posts: records on the
  their own repository (PDS)          visibilities, in the label /           member's PDS, shown on their
                              ◄─ Sync ─►  sublabel / post structure     ── Publish ─►  website
  everything else: a folder
  of Markdown files, on their         the editor and the agent's             friends-only posts: served by
  machine or in any cloud             tools work here                        ohm to the owner, and later to
                                                                             mutual follows
```

**The promise to a member:** ohm is an editor with agents. It keeps a working copy of your vault so you and your agent can work from anywhere. Your posts live in your own repository and your own folder, and deleting ohm's copy loses nothing.

- **The originals are the member's.** Public posts are records in their own repository. Everything else is in a folder of their own, on their machine or in a cloud that keeps a folder in sync.
- **Ohm holds a complete working copy,** private posts included, because an editor and an agent need the whole vault to work in. We can read private posts. The promise is not that we cannot; it is that nothing depends on us keeping them.
- **Sync is pull and push** between the working copy and the member's folder. **Publish** sends what is marked public to their repository, and is confirmed.
- **The promise is only true once a folder is connected.** Until then ohm holds the only copy of a member's private and friends-only posts, and says so plainly.

The picture Haein gave for it is a coding agent in the middle of a session: the member's repository and folder are the repo and its remote, ohm's vault is the working session, Sync is pull and push, Publish is opening a pull request, and their agent through the MCP is the agent in the session.

**AT Protocol stays central.** It is the member's identity (their domain), where their public posts live (their own PDS), and the follow graph the relationship layer is built from.

## What changed, and what it replaces

Newest first.

| Decision | What it replaces |
| --- | --- |
| The API comes first, each capability kept apart, and the agent's tools are chosen from it ("i should buiild api first to expose capabilities and decide what tool we need in clean manner"; "isolate each capabilities and make it clean") | Tools that held abilities of their own, such as search, and worked in stores the editor never showed |
| Connecting a PDS mirrors what is published on it, on its own, and the side panel is always the repository ("in the pds log in screen should be auto mirror on inital setting"; "the side pane section ... is the repo section so it should expose what is done as content") | A form that asked for the website and the name of an older post type before bringing anything in |
| The repository can be viewed by labels, platforms or visibility, with a filter ("you can choose the view - platforms / labels / visbiility ... make like pills to choose and filter to filter out") | One tree, by label only |
| A PDS password is typed on ohm's own panel and handled behind the scenes ("when asked pds ask for password so we can handle them in back"). The page sends it straight to the member's own PDS, never to ohm | Being sent to the PDS's own screen for every sign-in. That screen stays, for a passkey |
| Onboarding is two steps: an ohm account made with Google, Microsoft or Bluesky, then where your posts live ("keep -> google /micro and blueksy sign in and build acc -> then choose if you already have your own pds / you have website but not on pds"), and Bluesky makes an ohm account ("we need to make bluesky to create own ohm acc") | "Every member has an AT Protocol identity, and there is no other kind of ohm login", and before that "No accounts of our own" |
| ohm accounts are ohm's own sign-in, Better Auth, the one the app already uses ("cant i just use better auth?"; "yes build it with better auth") | Signing in only through the member's PDS |
| Sign-in works like Bluesky's: a person gets an ohm account or connects their own PDS ("make sign in like bluesky - you cna get ohm acc or connect own pds") | The architecture plan's "we do not create an account or host a PDS for them", and a hosted PDS as something for later |
| Ohm keeps a complete working copy; the member's originals live with them, in their repository and their own folder ("more like editor + social layer with agents independent of the content"; "content lives outside us but we render and cache for editing and sync"; "we need a complete vault still") | "Our service is the main copy", and before that "our service never reads private notes". The service's storage does not change |
| Connecting a folder is part of setting up, so Sync moves earlier in the order of work | Sync as an optional extra, built last |
| Every post has a permanent ID, given once when it is made and never changed, and its slug is an ordinary field that can be edited (Haein, directly) | The slug as the only name a post has |
| The unit is the post, with its label and sublabel. "File" and "folder" are only how a post appears in a cloud's file structure ("it is still post, but it would be compatiable with clouds file structure") | "Files are the only unit" in the sync interface, passed on an hour earlier and built on |
| The sync interface exposes the vault as files, with four operations: list, read, write, delete ("the endpoint for sync should be very very clean") | A vault interface of notes, labels and visibility |
| A member can export all their data, and edits made to the files in Obsidian sync back ("allow users to export all their data via cloud or local editor and if they edit file via obsidian and sync - should work on both ways") | |
| Nothing in a member's old Cloudflare store is brought in ("prev junk ... not part of the system that we are building") | A one-time import of existing private posts |
| Our service holds private notes too, and is the main copy and the main editor ("it bring on our storage and brings a better view for all and we are the prime editor in between main copy") | The rule, held until now, that our service never reads a private note. And the folder as the original |
| Our service sits between the folder and what is published, with two actions, Sync and Publish ("we need two button - sync with cloud - publish and we sit in between") | Publish reading the folder and copying straight to the PDS |
| An attachment is a pointer to wherever the file is; we fetch it once and cache it ("cant it use like a endpoint from a cloud or local storage or website") | Attachments having to sit in the folder |
| Every post is a Markdown file; its form is read from its body; folders are labels in the author's own words ("this should be the form. and folder should be like manual labelling as before") | |
| A member can keep a vault as a folder that any cloud syncs; Cloudflare is a default, not a requirement | Cloudflare assumed throughout |
| Our AppView has endpoints for public and friends-only notes | Friends-only notes kept in the member's own store |
| Sign-in for anything served is AT Protocol | Cloudflare Access |
| One editor, hosted by us | The editor in the member's own site Worker. That was chosen only so our service would not hold private notes |

## What holding private notes commits us to

This is the largest change of the day, so its consequences are written down.

- **The access check guards private notes.** A bug in it shows someone's private writing to another person. It is the most tested code in the system, and nothing ships before it is.
- **A breach of our storage exposes private notes.** They are kept encrypted at rest, and who on our side can read them, and when, is decided and written down before the first outside member joins.
- **Members must be told plainly.** Anything that says or implies that we cannot read private notes is now wrong and has to change before this ships.
- **Leaving has to be real.** A member can take a full copy at any time, which the folder sync provides, and can have everything we hold deleted.
- **What we use private notes for is a separate decision.** Holding them is not permission to match on them. The architecture plan says, for members whose notes we already hold, that we show them to nobody and do not use them for matching. That stays until decided otherwise.

## Where we are

Everything below is on `main` and pushed unless it says otherwise.

| Piece | State |
| --- | --- |
| Post schema `com.ohmmmm.post` | Built |
| The vault's rules, and a post as a file | Built (`vault/`). A post has a permanent ID and an editable slug |
| The vault service | Built and deployed, at `vault.ohmmmm.com` and under `app.ohmmmm.com/vault`. Seven capabilities, one to a file: posts, structure, search, mirror, export, account, identity. Every request is in [the reference](../service/CAPABILITIES.md), which is written from the code. Let in: `did:web:pds.haeinjung.com` only. Attachments are not in it |
| ohm accounts | Built and deployed in the private `ohm` repository (`ohm-api`): Google, Microsoft, and an AT Protocol account (Bluesky or a PDS of one's own), which makes an ohm account the first time |
| Onboarding | Built and live: sign in or up, then, once, where your posts live |
| The mirror | Built and live. Runs on its own the first time a connected account's vault opens. Run reading only against haeinjung.com's PDS: 2 records, 2 posts, both identical to what is published |
| The editor | Built and live at `app.ohmmmm.com/vault`: the repository as folders, viewed by labels, platforms or visibility, with a filter; one post in the main screen; who it is for; removing; writing the vault out. No status and no Publish |
| The agent's tools | Built: eight tools, each made of requests to the vault service, signed in with an app password from the member's PDS. Tested against the service's own code. Not run with a real sign-in |
| Folder sync | Built, for a folder on the member's machine. Not run against the deployed service |
| Publish from the service | Not started |
| Attachments held by the vault | Not started |
| A PDS that ohm hosts | Not started |
| haeinjung.com's own records | Still under the old post type, `com.haeinjung.post`. The mirror reads them as they are. Not migrated |
| The approval screen of haeinjung.com's own PDS | Restyled in ohm's design and deployed. Its source is in a folder that is not in any repository |

A real person has been through it: on 12 November Haein signed in, connected `haeinjung.com`, and opened the editor on the live service.

## What a member needs

| | Before | Now |
| --- | --- | --- |
| An AT Protocol account with a PDS | Yes | Yes. Bluesky counts |
| An ohm account | No | Yes: made with Google, Microsoft or Bluesky |
| A Cloudflare store of their own for private posts | Yes | No |
| A website on Cloudflare | Assumed | No |
| A folder to sync with | | Optional |

## The vault on our service

Each member's vault is their notes in one structure: labels, sublabels inside them, notes inside those.

| Visibility | Held by us | Who we serve it to | Published to |
| --- | --- | --- | --- |
| Public | Yes | Everyone | The member's PDS, as a `com.ohmmmm.post` record |
| Friends | Yes | The owner. Later, the people they follow who follow them back | Nowhere else |
| Private | Yes | The owner only | Nowhere |

Rules, enforced in one place:

1. **A new note is private.**
2. **A note is checked against the schema before it is saved.**
3. **The form is identified from the content,** never chosen.
4. **Labels and sublabels are the author's own words.** Nothing derives or renames them.
5. **A note's address comes from its label, sublabel and slug,** and a slug is used once in a vault.
6. **A save names the version it replaces,** so the editor, the agent and a sync cannot silently overwrite each other.
7. **Every request proves who is asking.** A note that is not public is served only to its owner.

### Attachments

- **An attachment is ordinary Markdown pointing at an address:** a web address, or a file the member uploads or has in their folder.
- **We fetch the file once and cache it on our storage.** The note then places it by an ID and holds the cached copy plus the original address as its source. The post schema already works this way. After that, the note does not depend on the original address staying reachable.
- **An address we cannot fetch is reported by name** when the note is saved or synced: one that needs a sign-in, or a path on a machine we cannot see.
- **A file too large for the PDS** is kept whole by us; a reduced copy is published and the source address points to the full one.

## Sync and Publish

**Sync** brings our copy and the member's folder into line, in both directions. Each file is compared, by its content, with what was last synced.

| In the folder | On our service | Sync does |
| --- | --- | --- |
| A new or changed file | Unchanged since the last sync | Updates ours |
| Unchanged since the last sync | A new or changed note | Writes it to the folder |
| Changed | Changed differently | Keeps ours as the note, writes the folder's version beside it under a name that says so, and reports it |
| A file removed | The note | Our own sync asks before it sends the delete, and says so plainly when the note is published. See the decision on removed files |

**Syncing never publishes.** An edit made in Obsidian to a public note arrives in our copy as a change that is not yet published. Writing `visibility: public` in a file's properties only marks the note; it becomes public when the member presses Publish.

What people do in Obsidian, and what Sync makes of it:

| In Obsidian | Sync reads it as |
| --- | --- |
| A new file | A new note. Its slug is the file name, and it is private unless its properties say otherwise |
| A file moved to another folder | The note refiled under another label. For a published note this changes its address, which Publish shows before doing it |
| A file renamed | The same note with a new slug. For a published note, the old address sends readers on to the new one |
| A file deleted | A note to ask about, as above |
| `[[another note]]` and `![[image.png]]` | A link to that note, and an attachment. They are read, and kept in the file as they were written |
| Properties edited in Obsidian's own panel | The note's properties. They are plain YAML, so that panel can edit them |

**Publish** compares our copy with what is published and makes the published side match.

| Our copy says | Published now | Publish does |
| --- | --- | --- |
| public | nothing, or an older version | Creates or replaces the record on the PDS, with its files |
| friends | not yet shared, or an older version | Makes this version the one friends are served |
| private, or the note is gone | a public record or a shared friends version | Removes it |
| the same as what is published | | Nothing |

- **Editing shares nothing.** A note marked public is still only in our copy until Publish.
- **Status** shows what Publish would do, and, when a folder is connected, what Sync would do.
- **Publish takes two steps:** first exactly what will be created, replaced and removed, and who will be able to read each note; then, on a yes, the changes.
- **Removing a public record is not a recall.** Copies others already made stay where they are, and the confirmation says so.
- **A note can be previewed before it is published,** because our copy already holds it and its files.

## The sync interface

The same four requests for every client, on posts. The editor, the agent's tools, and a connector for a local folder, Obsidian, Google Drive or Dropbox all use them. They are the Posts capability in [the reference](../service/CAPABILITIES.md); what else the service can do sits beside them, each thing apart.

| Request | Does |
| --- | --- |
| List | Every post and the version it is at, or only what changed since a point the last list returned |
| Read | One post |
| Write | One post, stating the version it replaces, or none for a new post. Refused, with the current version, if the post changed in the meantime |
| Delete | One post, stating the version it removes |

1. **The unit is the post:** its ID, its slug, label, sublabel, who may see it, title, subtitle, date, what it connects to, its body, any other properties its author gave it, and its attachments. The service, the requests, the editor and the documents all speak of posts, labels and sublabels, never of files, folders or paths.
2. **Every write names what it replaces.**
3. **A request can be repeated safely,** so a sync that was interrupted can be run again.
4. **Nothing in a request belongs to one provider.**
5. **Sync never publishes.** Publish is a separate request, outside this interface.
6. **Two proofs of identity, and no third:** a token the member's own PDS issues for the one request, or the member's ohm session, which is worth exactly the AT Protocol account it was connected to.
7. **The server only accepts or refuses.** Deciding what to do about a conflict is the client's job.

### A post as a file

Each post has one representation as a file, and that mapping is the whole of the compatibility with clouds, folders and Obsidian. A connector converts between the two; the service never deals in paths.

| Post | File |
| --- | --- |
| Label | Folder |
| Sublabel | Subfolder |
| Slug | File name |
| ID, title, subtitle, date, who may see it, connections, other properties | Properties at the top, as plain YAML |
| Body | Markdown |
| Attachment | A file, or an address |

**The mapping is exact: a post written as a file and read back is the same post.** That is its test, and it passes: built in `vault/file.mjs`, with posts in several scripts and text that YAML would misread.

What follows from the post being the unit:

- **A connector compares posts, not bytes.** It reads a member's file as a post and compares that with ours. A file its author formatted differently, with comments or in another order, is the same post and is left alone. The file is rewritten only when the post itself changed on our side.
- **Only posts are synced.** Other things in a member's folder, such as Obsidian's own settings, are theirs and stay there.
- **A file that cannot be read as a post is reported by the connector** where the member can see it, and nothing is sent.

## Export

A member can take everything out at any time: every note at all three visibilities, and every cached file.

- **It is the same folder of Markdown files that Sync uses.** There is one format, not two, so an export opens in Obsidian and can be synced again later.
- **It goes to a connected folder, or downloads as one archive** from the editor.
- **Export is what makes leaving real.** Together with deletion on request, it is the answer to "what if I stop using this".

## The folder a member keeps

The same vault as files, for a member who wants one. It is what Export writes and what Sync keeps in line.

```
vault/
├── writings/
│   ├── collisions/
│   │   └── trap-of-independency.md
│   └── why-i-started-ohm.md
├── photographs/
│   └── lisboa/
│       └── lisboa-12.md
└── loose-thought.md              no folder: filed under `other`
```

```markdown
---
title: Trap of independency
date: 2026-03-01
visibility: public
---

The body, in Markdown.

![The author](https://haeinjung.com/writing/media/ep04-author.webp)
```

| In the file | In our copy |
| --- | --- |
| The folder | The label |
| The subfolder | The sublabel |
| The file name | The slug |
| `title`, `subtitle`, `date` | The same |
| `visibility` | The same. A file with none is private |
| An image or file placed by its address or path | An attachment |
| A link to another note | A connection |
| A property the site's own schema declares | The site's own layer |
| Any other property | Kept, and never published |

## The pieces to build

### 1. The vault service

A service of ours, on Cloudflare by default. It is built in this repository, under `service/`, and uses the vault rules beside it. Whether it should move to the private `ohm` repository is not decided.

- **Who is asking:** a member is known either by their ohm session, which the editor sends, or by a token their own PDS issues for one request, which the command line and an agent's tools send. An ohm account is tied to one AT Protocol account, once, by such a token.
- **Storage:** each member's posts. Attachments are not held yet.
- **The access check:** settled before anything about a vault is looked at.
- **Capabilities, each apart:** posts (list, read, write, delete), structure (the tree), search, mirror, export, account, identity. Built.
- **Public endpoints:** a list of a member's public posts and a single post, for a website on any host to build pages from. Not built.

### 2. Bringing a vault in, and taking it out

- In: every `com.ohmmmm.post` record on the member's PDS, and every record of a type of their own that reads as a post. Built, as the mirror: it finds those types itself, runs on its own when an account is first connected, and can be run again. It copies what is published and no more: it does not file a post that has no label, and it cannot see a page of a website that was never published to the PDS. That work is the agent's.
- The note file format: turning a note into a file and back. Both Export and Sync use it.
- Out: Export, as an archive first.

### 3. Publish

- Status, and the two-step publish.
- Writing to the member's PDS from our service, which needs their standing permission (see the decisions).

### 4. The editor

One web page, hosted by us, laid out as the app is: a rail of icons, a side panel that is the repository, and the main screen with one post. Built, except the status line and Publish. Sync appears beside Publish once a folder is connected.

### 5. The agent's tools

Built as a client of the vault service: each tool is made of the service's requests and nothing else, and reads and writes posts with the member's own token. There are eight: tree, list, read, search, save, set visibility, mirror, delete. Still to add: `vault_status` and `vault_publish`, which wait for Publish; the confirmation moves to `vault_publish` then. A key a member can hand to an agent and take away, in place of an app password, is not built. Because the service holds the vault, a remote version that needs nothing installed becomes possible later.

### 6. Sync with a folder

- A connector for a local folder: read each file as a post, compare with ours, copy what differs in either direction, and keep the other version beside ours when both changed.
- Reading Obsidian's own link and embed syntax, and keeping it as written.
- Old addresses of renamed published notes sending readers on.
- Reaching the folder, in the order to build: the member's machine, through a command or the agent's tools; a local folder opened from the browser (Chrome and Edge only); an S3-style connector (R2, S3, Google Cloud Storage, Backblaze, self-hosted); Google Drive and Dropbox only if asked for.

### 7. Your own pages follow

When a public note changes, the page of the member's own design that shows it changes too. The public endpoints make this possible for a site on any host. Designed after the rest.

## Milestones

Each ends in something that works and can be shown. Sync now comes straight after the service and bringing a vault in: "your originals live with you" is only true once a member has a folder connected, so it cannot be the last thing built.

### 1. The vault service

Piece 1.

**State, 12 November 2026.** Deployed at https://vault.ohmmmm.com and under https://app.ohmmmm.com/vault, on the ohmmmm.com Cloudflare account with a database of its own (`ohm-vault`), and let in: `did:web:pds.haeinjung.com` only. Its requests are laid out one capability to a file, and [the reference](../service/CAPABILITIES.md) is written from them. A real sign-in has been through it: Haein signed in, connected `haeinjung.com`, and opened the editor. A fault found by checking live and fixed on the way: the deployed service could not reach any other server, so until then no sign-in could have worked.

**Done when:** tests show a member's token lists, reads, writes and deletes only their own posts; a request with no token, a bad one, or another member's gets nothing that is not public; a write naming a stale version is refused and told the current one; the same write sent twice leaves one post; and a post is read back exactly as it was written. All of these pass.

### 2. Your vault is in it

Piece 2, bringing in.

**State, 12 November 2026.** Built and live, as the mirror. Run reading only against haeinjung.com's own PDS: it found the type `com.haeinjung.post` itself, read 2 records, made 2 posts, and found both identical to what is published. Two things it showed, which the mirror cannot settle: "Why I Started ohm." has no label and lands under `other`, and the author's name on that post's source has no place in the shared post. Haein's account is marked as not yet mirrored, so the two posts come in the next time the vault is opened. That has not been seen.

**Done when:** haeinjung.com's public records are in a running service, each compared against its source and found identical.

### 3. Sync with your own folder

Piece 6, starting with a folder on the member's machine, and Export, which is the same thing in one direction.

**State, 12 November 2026.** Built: the `sync` command, for a folder on the member's machine. Every case in "Done when" below is a passing test, including removing ohm's copy and getting every post back from the folder, and one test runs the command against a real folder on disk and the service over the network with real tokens. Syncing into an empty folder is Export; a single-file download is not built. A post changed in both places is left alone on both sides and the member chooses, which is the proposal under "Decisions to make", not yet confirmed. Attachments that are files in the folder are not sent anywhere yet. Not run against the deployed service or a real PDS.

**Done when:** the whole vault is written out to a folder that opens in Obsidian; a post edited in Obsidian reaches the working copy and one edited there reaches the folder; a post edited on both sides is never overwritten on either; a file moved, renamed or deleted in Obsidian is handled as the table above says; an edit to a public post's file stays unpublished until Publish; a post written with `[[links]]` comes back from a round trip exactly as it was written; and removing ohm's copy and syncing again from the folder brings every post that is not public back.

### 4. Publish

Piece 3.

**Done when:** Publish shows what would change, and on a yes a public post's record appears on a test PDS under its ID, with its files; marking it private and publishing again removes the record; and a friends-only post's shared version changes only on Publish.

### 5. Your agent works in the vault

Piece 5.

**State, 12 November 2026.** The first three work in tests against the service's own code, and "bring in my posts" does too. None has been run with a real sign-in: that needs an app password from the member's PDS. "sync" and "publish" have no tool yet.

**Done when:** in your agent, "what have I written about X", "save this as a private note under writings", "make that one public", "sync" and "publish" all work, and the last one shows what will change before it does.

### 6. The editor

Piece 4.

**State, 12 November 2026.** Live at https://app.ohmmmm.com/vault. Signing in, browsing the tree, writing a post, saving it privately and marking it public all work without a terminal. Not built: the status, Publish, and telling a member with no folder connected that ohm holds the only copy of their private and friends-only posts.

**Done when:** signed in to ohm in a browser, you browse the tree, write a post, save it privately, mark it public, see the status, and publish, without a terminal. A member with no folder connected is told that ohm holds the only copy of their private and friends-only posts.

### 7. Other storage, and your own pages

## Decisions to make

- **Which version stands when a post was changed in both places.** The plan said ours is the reference and the folder's version is kept beside it. With the member's copy as the original, that may be the wrong way round. Proposed: neither is treated as the reference. Both are kept, the working copy is left as it was, and the member chooses. Not yet decided. Built this way, so that it can be tried: sync leaves both as they are, puts ohm's version beside the member's file, and takes the member's choice.
- **How a member signs in.** Settled, and built: with an ohm account, made with Google, Microsoft or Bluesky. This replaces "there is no other kind of ohm login". Every member still has an AT Protocol identity, because every vault is one AT Protocol account's: a member who signs in with Google or Microsoft says, once, where their posts live, and one who signs in with Bluesky has said so already.
- **Whether everyone starts with a website.** Still no. But someone with neither a PDS nor a Bluesky account cannot get past "where do your posts live" today: they are shown how to set up a PDS of their own with Cirrus. A PDS that ohm hosts is what fills that gap.
- **What hosting accounts commits us to, and when.** The reading passed on with the decision, not yet confirmed by Haein: a PDS that ohm hosts becomes part of the first way in, not a later paid layer. That is a second service to run. Cirrus holds one account by design, so hosting many needs another implementation; Bluesky's own is the usual start. It makes ohm the host of those members' public records, with account recovery, verification email and abuse handling. Until it exists, the ways in are a PDS you already have, or Bluesky. Both are built.
- **Whether an existing Bluesky account can sign up.** Settled: yes ("you can also sign up with bluesky"). So there are three ways in, all AT Protocol identities: get an ohm account, connect your own PDS such as Cirrus, or sign up with an existing Bluesky account. The second and third are the same thing to the vault service, which is built: any PDS that issues a token for the member. Bluesky's own sign-in server accepts ohm's request to start a sign-in; nobody has yet signed in with a Bluesky account.


- **Who is let in.** Today one account. Opening the service means strangers can store private posts in it, with no limit on how much and no encryption at rest yet. Not decided.
- **What an agent signs in with.** Today an app password from the member's PDS, which can do far more than reach the vault. A key ohm issues for an agent, limited to the vault and taken away at will, is the proposal. Not decided.
- **What Google sign-up asks for.** It uses the mail app's settings, so it asks for permission to read and send mail. Someone who only wants the vault should not be asked. Not decided.
- **Whether the mirror keeps running.** It runs once on its own, and then when asked. A post published later, from elsewhere, is not seen until then. Not decided.
- **Which tools an agent gets next.** The API is laid out first so this can be chosen from it. [The reference](../service/CAPABILITIES.md) lists the requests that have no tool, and why.
- **Where the vault service's code lives.** It is in this public repository, with a copy of ohm's design tokens. The first plan put it in the private `ohm` repository. Not decided.

0. **What protects a member from a client that deletes or overwrites by mistake.** The interface leaves conflicts and deletions to the client. That is fine for clients we write, which ask first. It is not enough for an Obsidian plugin we did not write, which could remove or replace every file in one run. Proposed: the service keeps earlier versions of each file and holds removed files for a period, so anything a client does can be undone. Not yet decided.
00. **Whether a post has a name that never changes, apart from its slug.** Settled: it has an ID, given once when it is made, and the slug is an ordinary field. Whoever makes the post makes the ID, so a request to create it can be repeated safely, and a connector keeps it in the post's file as one more property. The record on the PDS is kept under the ID, not the slug (Haein, directly), so a renamed post keeps its record and everything that points at it.

    What this changes in what exists, none of it done yet:
    - **A post's address no longer ends in its record's key.** It ends in the slug. Built: the site's Worker builds each address from the slug, finds a post by its slug or its key, and sends the key's short address on to the full one. A newly renamed post is found at its new address once the site's list has been rebuilt, so Publish has to rebuild it.
    - **The record has to say what its slug is.** Settled and built: the schema has an optional `slug` field (Haein, directly). A record with none uses its own key, so posts published earlier work as they did.
    - **Records published before this are kept under their slugs.** The first Publish from the service moves each to a record under its ID and removes the old one. Anything outside that points at an old record's address in the repository stops resolving, once.
    - **Connections between posts** are written with IDs. Built: `postRecord` in `vault/file.mjs`.
000. **What a post's body holds.** As its author wrote it, Obsidian's own `[[links]]` included, with the published form worked out at Publish. Or already in the published form. The first keeps the mapping exact and a member's writing as they wrote it, and is what is built. The second would change `[[links]]` in a member's file the first time a post came back from us.
0000. **Where cached copies of attachments sit when a post is written out as files.** Beside the post, or together in one folder kept for them.
1. **How Publish writes to the member's PDS.** For our service to publish, it needs the member's standing permission to write to their repository, granted once through AT Protocol sign-in and kept by us. That makes us a holder of write access to people's repositories, to be stored and guarded accordingly. The alternative is that the member's own device does the writing, which needs no standing permission but only works where they are signed in.
2. **Who on our side can read private notes, and when.** To be written down before any outside member joins.
3. **Whether we may use private notes for matching.** Held to "no" until decided.
4. **Which link and image syntax the folder's files use.** Settled: both. Standard Markdown and Obsidian's own `[[note]]` and `![[image.png]]` are read, and each file keeps whichever it was written in.
5. **What happens to Mirror.** A member whose website is the original could be brought into the vault the same way an existing vault is, with the website read on a schedule.
6. **The old path for private posts.** The private area on a member's own site, the store behind it, and the adapter that reaches that store from a machine are not part of this design, and it does not have to stay compatible with them. Haein: what is in that store now is "prev junk ... not part of the system that we are building". Nothing there is brought in. Removing the code is a cleanup to agree on when the service replaces it; nothing has been deleted.

## Wording that now needs changing

Each says or implies that our service cannot read private notes, or that the member's own store is where they live.

| Where | What it says | State |
| --- | --- | --- |
| [The architecture plan](network-architecture.md), "People with no website yet" | That we do not create an account or host a PDS for them. ohm accounts exist now, and a hosted PDS is planned | A note at its top says so. The text is unchanged |
| [The architecture plan](network-architecture.md), the information layer | Private notes are in the person's own store and our service cannot read them | The same |
| [The architecture plan](network-architecture.md), the agent | The inner part that reads private notes is the member's own agent, and the service never sees them | The same |
| [The product document](product-understanding.md) | That people keep real thinking only where they own it and control who sees it, as the reason for the vault's design | A note at its top says so. The text is unchanged |
| This repository's `README.md` | Private posts are kept in your own storage, off anyone else's service | The README now has "Work in your vault", which says the vault is ohm's working copy and is not the private area on your own site. "Keep a post private" still describes the older path, which still exists |
| This repository's `AGENTS.md` | Nothing about the vault at all | Unchanged. It describes moving a site in, and does not mention the working copy |
| The live page at ohmmmm.com, "What ohm is" | "It belongs to you. It is not an account on our platform. It is kept on an open protocol, other applications can read it, and you can take it with you." With ohm accounts and a working copy that includes private posts, this needs rewording | Not changed |

## What to check before relying on it

| Assumption | Why it matters | When |
| --- | --- | --- |
| A Worker can verify a PDS's token | It is how a member proves their DID | Done: it does, on the deployed service, for Haein's own PDS |
| Our service can hold a member's permission to write to their PDS | Publish depends on it. Cirrus documents the sign-in that grants it; we have not run it | Before milestone 4 |
| Sign-in from the browser works against Cirrus | The editor needs it | Done: Haein signed in and connected on the live service. Which of the two ways, an app password or the PDS's own screen, is not recorded |
| Signing in with a Bluesky account works end to end | It is one of the three ways in. Bluesky's server accepts the start of it; nobody has finished one | Before anyone outside is let in |
| The agent's tools work with a real sign-in | They are tested against the service's code only | Milestone 5 |
| What storing every member's notes and files costs | We now hold everything, not only what is published | Estimate in milestone 1 |
| Obsidian reads the folder as planned and leaves unknown properties alone | Milestone 3 | Milestone 3, with the real vault |
| Sync apps and two-way sync do not lose a note | A sync app resolves its own conflicts by making a second copy of a file. Ours has to notice such a copy and say so | Milestone 3 |

## Later

The network: follows and friends reading each other's notes, the feed, needs and matching, introductions by email, notifications. The design is in the architecture plan.
