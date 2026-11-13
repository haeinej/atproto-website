# Build plan

Written 12 November 2026 and reworked several times the same day. The states under "Where we are" and each milestone were last brought up to date on 13 November, after Publish was built. In this version ohm is an editor with agents: it keeps a complete working copy of each member's vault so they and their agent can work from anywhere, and the member's originals live with them. The decisions behind each rework were made by Haein, some in side conversations and passed on from there. They are listed under "What changed" so they can be checked. Background is in [the architecture plan](network-architecture.md), parts of which this version now contradicts; see "Wording that now needs changing".

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
| One cortex is shared by every coding agent a member uses. Claude Code and Codex each get an adapter on their own hooks, which fetches the memories that fit before each prompt and hands the turn off after it, and any other agent gets the MCP server ("i want to share one memory service backend across coding agents. an mcp fallback, and native adapter for both codex and claudecode") | A cortex reached only through tools the model has to choose to call |
| Memory is written without asking the member. The agent notes what it sees while it works, and each time the cortex is opened again it rewrites memory from those notes, deciding itself whether an earlier memory still stands ("dont review with me, just write onto memory and let agent identify ... whether previous memory decision should be overwrite or not"; "everytime reopen rewrite memory") | A step where the member looked over what the agent had written, proposed an hour earlier and never built |
| Every cortex starts with the same three memories: who the member is, a map of their vault, and how they want work done ("memory should include indexing of the vault and a summary of the identity (whether it is a company or personal) and interactively agent should compose the style of the workflow") | A cortex that starts empty |
| What an agent knows and can do is kept apart from what the member made, as the cortex: memory, skills and tools ("we could maybe group (memory, skill, tools) and vault (content)"; "cortex is good") | One store, the vault, holding only posts. What an agent learned about a member was kept nowhere, or in that agent's own files on one machine |
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
| The editor | Built and live at `app.ohmmmm.com/vault`: the repository as folders, viewed by labels, platforms or visibility, with a filter; one post in the main screen; who it is for; removing; writing the vault out; a mark on Publish when something is waiting, and Publish itself |
| The agent's tools | Built: ten tools, each made of requests to the vault service, signed in with an app password from the member's PDS. Tested against the service's own code. Not run with a real sign-in |
| Folder sync | Built, for a folder on the member's machine. Not run against the deployed service |
| Publish | Built, for public posts. The service works out what would change in the member's repository and writes nothing; the member makes the changes, signed in at their own PDS, from the editor or through their agent. Tested against the service's own code and a stand-in repository. Not run against a real PDS. Friends-only posts are not served to anyone yet |
| Attachments held by the vault | Not started |
| A PDS that ohm hosts | Not started |
| haeinjung.com's own records | Still under the old post type, `com.haeinjung.post`. The mirror reads them as they are. Not migrated |
| The approval screen of haeinjung.com's own PDS | Restyled in ohm's design and deployed. Its source is in a folder that is not in any repository |
| The cortex: an agent's memory, skills and tools | Designed, under "The cortex". Not started |

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

## The cortex

Designed 13 November 2026. Nothing in this section is built.

A member has two things on ohm, kept apart. The **vault** is what they made: posts, under labels. The **cortex** is what an agent working for them knows and can do: memory, skills and tools. The name is the part of the brain where long-term memory is kept, where a practised skill is laid down, and which moves the hands.

```
a member
├── vault/                       what they made
│   └── label / sublabel / post
└── cortex/                      what their agent knows and can do
    ├── memory/                  what it has learned about them, one thing to a file
    │   ├── MEMORY.md            the index: one line for each memory. Made by the service, never written
    │   ├── about-me.md
    │   ├── prefers-short-titles.md
    │   └── collisions-is-a-series.md
    ├── skills/                  how to do something they do again and again
    │   ├── publish-an-essay/
    │   │   └── SKILL.md
    │   └── file-a-photograph/
    │       └── SKILL.md
    └── tools/                   what the agent is able to do
        ├── vault.json           ohm's own tools, each on or off
        └── calendar.json        a server of someone else's that the member connected
```

| | The vault | The cortex |
| --- | --- | --- |
| Holds | Posts | Memories, skills, tools |
| Written by | The member | Mostly the agent, and the member can change all of it |
| Who may see it | Public, friends or private, post by post | The member only, always |
| Published | Public posts, to the member's PDS | Never. Publish does not read it |
| Found by | Label, sublabel, search | A name and one line saying what it is for |
| Read | When asked for | The index at the start of every session, the rest when it is needed |
| Kept | For good, under a permanent ID | Until it is corrected, joined with another, or forgotten |

### What is in it

**A memory** is one thing the agent has learned, in a file of its own.

```markdown
---
name: prefers-short-titles
description: Titles are a few plain words, never a question or a pun
kind: preference
from: 3kabc2defgh4j
written by: claude
---

Haein rewrote three suggested titles to shorter ones on 12 November. Offer the plain one first.
See [[collisions-is-a-series]].
```

| Field | What it is |
| --- | --- |
| `name` | Its name, and what it is kept under. Lowercase words joined with hyphens, used once in a cortex |
| `description` | One line, 200 characters at most. It is all an agent reads until it decides it needs the rest |
| `kind` | `person` (who the member is), `preference` (how they want things done), `project` (what is going on), or `reference` (where something is) |
| `always` | Optional. A memory marked so is given in full at the start of every session. It is how standing instructions are kept, such as `about-me` |
| `stated` | Whether the member said it in so many words, or the agent worked it out from what they did. Set when it is written |
| `seen` | How many times it has been seen, and when last. Kept by the service as notes are settled |
| `from` | Optional. The ID of the post it was learned from, or an address |
| `project` | Optional. The repository it was learned in and is about. A memory with none is about the member, whatever they are working on |
| `written by` | The member, or the name of the agent that wrote it. Set by the service from who asked, never by the request |
| The body | Markdown, 8 KB at most. `[[another-memory]]` links to one |

**A skill** is how to do one thing, in the form coding agents already read: a folder with a `SKILL.md` whose properties are `name` and `description`, and any text files it needs beside it. A skill written out of the cortex works as it is in an agent that reads that form, and one written for such an agent can be brought in.

**A tool** is one thing the agent can do. The cortex keeps the list: ohm's own tools, each switched on or off, and servers of someone else's the member has connected, each with a name, an address and a line saying what it is for. No password or key is kept here (see the decisions).

### What every cortex starts with

Three memories, each marked `always`, so an agent has them in full at the start of every session.

| Memory | What it holds | How it is written |
| --- | --- | --- |
| `identity` | Whether this is a person or a company, what they do, and how they sound | Composed by the agent with the member in the first session, from what they say and what their vault and profile already show. Rewritten as it learns more |
| `vault-map` | The labels and sublabels, a line on what each one is, how much is in it, and what is recent | The structure and the counts are made by the service from the vault, so they are never out of date. The line on what each label is, the agent writes |
| `working-style` | How the member wants work done: whether to show the working or only the answer, tables or prose, which language to explain in, what to ask before doing | Built up by the agent across sessions, from what the member says and what they correct |

### How memory is written

The member is not asked to look anything over. There are two ways in, by how the thing was learned.

| | The member said it | The agent worked it out |
| --- | --- | --- |
| Example | "Always explain the steps to me" | They asked "why was that one rejected?" three sessions running |
| When it is written | At once, as a memory, with `stated` set | As a note, while working. It becomes memory the next time the cortex is opened |
| With | `cortex_remember` | `cortex_note`, then the rewrite below |

**A note** is one line saying what was seen, when, and in which session. Writing one decides nothing and changes no memory, so an agent writes them freely.

**Each time the cortex is opened, memory is rewritten from the notes.** `cortex_start` answers with the notes not yet settled. Before anything else, the agent settles each of them against the memories there are, and says what it did with each:

| The note | What the agent does |
| --- | --- |
| Says something no memory covers | Leaves it as a note until it has been seen again. One sighting is not a memory |
| Has now been seen in more than one session | Writes a new memory, with `stated` not set |
| Agrees with a memory | Counts it on that memory's `seen`. The memory is not rewritten |
| Sharpens a memory, or adds a case to it | Rewrites that memory to say both |
| Goes against a memory the agent worked out | Rewrites the memory to what is now seen, if the new way has been seen more than once |
| Goes against a memory the member stated | Keeps the memory. What the member said stands until they say otherwise, or until they have done the other thing often enough that it is plainly no longer true, and then the rewrite says so |
| Is about one session only | Drops it |

Whether an earlier memory still stands is the agent's judgement. The table is how it is told to judge, in a skill that comes with every cortex and cannot be changed by an agent. The service checks only what can be checked: that every note was settled one way or another, and that each rewrite names the version it replaces.

**Every rewrite keeps what it replaced.** With nobody looking a rewrite over, a wrong one is found late, when the agent does something the member did not want. So the earlier version of a memory is kept, the member can read what it said and put it back, and a memory records which notes it was rewritten from.

### What becomes a skill, and what becomes a tool

The rewrite is also where a memory is moved up.

| It is | When | From the actuator selector |
| --- | --- | --- |
| A note | Seen once | "Asked why AS210 was rejected" |
| A memory | Said by the member, or seen in more than one session. About the member, and true whatever the task | "Wants the working shown, not only the answer" |
| A skill | About one kind of task. It has steps, or an order. It has been done the same way at least three times, or the member said "always do it like this" | "Selecting an actuator: the margin, the four torque points, the combinations that failed and why, then the price" |
| A tool | A step inside a skill that must give the same answer every time: arithmetic, looking something up, or reaching another system | The torque and price calculation |

Three questions settle which, asked in this order:

1. **Would a wrong answer be unacceptable, or is it a number, a lookup or another system?** It is a tool. An agent cannot make one. It writes down what the tool would take and give, and that waits for someone to build it.
2. **Is it about one kind of task, with more than one step?** It is a skill. It is read only when that task comes up, so it can be long.
3. **Otherwise** it is a memory: one or two lines, about the member, read by its description in every session.

A skill is not written from one session. What was done once is a note, and a skill made from one occasion fixes in place whatever happened to be done that day.

### The rules

Enforced in one place, as the vault's are.

1. **Everything in the cortex is for the member only.** There is no visibility to set, and Publish, the mirror and the public endpoints never read it.
2. **The cortex and the vault are separate stores.** A memory can point at a post by its ID. A post never points at a memory.
3. **Every memory and skill has a name and a one-line description,** and the description is what is read first.
4. **The index is made by the service** from the descriptions, so it cannot disagree with them.
5. **A save names the version it replaces,** as a post's does.
6. **Every save records who made it:** the member, or which agent.
7. **The member can see, change and remove everything in it,** in the editor and as files.
8. **An agent cannot give itself a tool,** or switch one on. Only the member changes the list.
9. **A skill written by an agent is not used until the member has said yes.** A skill changes what the agent does in every later session, so something it read in a post or on a web page must not be able to turn itself into one.
10. **Nothing in the cortex is used for matching or shown to anyone,** as with private posts. Held to "no" until decided.
11. **Memory is written without asking the member.** They can read and change all of it (rule 7), and nothing waits for them.
12. **What the member said outranks what the agent worked out.** Every memory says which it is.
13. **Every rewrite of a memory keeps what it replaced,** and says which notes it came from.

### The requests

One capability to a file, beside the vault's, under `/xrpc/com.ohmmmm.cortex.`. Reading is a `GET`, changing is a `POST`, every answer is JSON, and a refusal is one of the vault's own errors, with `InvalidMemory`, `InvalidSkill` and `NameTaken` added.

| Capability | What it is for | Requests |
| --- | --- | --- |
| **Context** | What an agent needs at the start of a session, in one answer small enough to read every time, and the few memories that fit one prompt | `getContext`, `recall` |
| **Memory** | Read and change what the agent has learned, one memory at a time | `listMemories`, `getMemory`, `putMemory`, `deleteMemory`, `searchMemories` |
| **Skills** | Read and change the skills | `listSkills`, `getSkill`, `putSkill`, `deleteSkill`, `approveSkill` |
| **Notes** | What an agent saw while working, kept until memory is rewritten from it | `addNote`, `listNotes`, `settleNotes` |
| **Turns** | What was said in a turn, handed off by an adapter and kept only until it has been read | `addTurns`, `listTurns`, `settleTurns` |
| **Tools** | The list of what the agent can do, and what it has asked to have built | `listTools`, `putTool`, `deleteTool`, `proposeTool` |
| **Export** | The whole cortex as files, in the structure above | `exportFiles` |

| Request | Reads or changes | Who may ask | Takes | Gives |
| --- | --- | --- | --- | --- |
| `getContext` | Reads | The member, or their agent | Nothing | `always` (the memories marked so, in full), `memories` (name, description, kind), `skills` (name, description), `tools` (name, description), `notes` (the ones not yet settled), `turns` (how many are waiting), and `version`, which changes when any of them does |
| `recall` | Reads | The member, or their agent | `q`: the prompt<br>`project`: optional<br>`budget`: optional, how many characters, 1,500 unless said | `memories` (name, description, passage) and `skills` (name, description) that fit, best first, within the budget. Nothing when nothing fits. An adapter asks this of its own copy first, and of the service only to bring that copy up to date |
| `listMemories` | Reads | The member, or their agent | `since`: optional, the `cursor` of an earlier list<br>`kind`: optional | `memories` (name, version, description, kind, written by, when), `cursor`, and removals when `since` is given |
| `getMemory` | Reads | The member, or their agent | `name` | `memory`, `version` |
| `searchMemories` | Reads | The member, or their agent | `q`, and `limit`: optional, 10 unless said | `memories` (name, description, kind, passage), best first. A description counts for more than the body |
| `putMemory` | Changes | The member, or their agent | `memory`: the whole memory<br>`replaces`: optional, the version it replaces | `name`, `version`, and `unchanged` when nothing differed. Sent twice, it ends the same as sent once |
| `deleteMemory` | Changes | The member, or their agent | `name`, `replaces` | `name`, `removed` |
| `addNote` | Changes | The member, or their agent | `note`: one line, 500 characters at most<br>`session`: a name for the session it was seen in | `id`. Sent twice with the same `id`, it is kept once |
| `listNotes` | Reads | The member, or their agent | `settled`: optional, to read the ones already settled too | `notes` (id, text, when, session, written by, and what became of it if settled) |
| `settleNotes` | Changes | The member, or their agent | `notes`: each note's `id` with what became of it: `kept`, `dropped`, or the `name` of the memory it went into | `settled`. A note is settled once. Naming a memory that does not exist is refused |
| `addTurns` | Changes | The member, or their agent | `turns`: up to 50, each with an `id` made where it happened, the `session`, the `agent`, the `project` if there is one, the `prompt` and the `answer`, 2,000 characters each at most | `kept`: the IDs it now has. One sent twice is kept once |
| `listTurns` | Reads | The member, or their agent | `limit`: optional, 40 unless said | `turns` not yet settled, oldest first, and `waiting`: how many there are |
| `settleTurns` | Changes | The member, or their agent | `turns`: each turn's `id` with what became of it: `dropped`, or the `id` of the note or `name` of the memory it went into | `settled`. A settled turn is removed |
| `listSkills` | Reads | The member, or their agent | Nothing | `skills` (name, version, description, written by, approved) |
| `getSkill` | Reads | The member, or their agent | `name` | `skill` (the text of `SKILL.md`, and `files` beside it as path and text), `version`. A skill not yet approved is refused to an agent |
| `putSkill` | Changes | The member, or their agent | `skill`, and `replaces`: optional | `name`, `version`, `approved`. Saved by an agent, it waits for the member |
| `approveSkill` | Changes | The member, signed in to ohm | `name`, `version` | `name`, `approved`. It approves that version and no later one |
| `deleteSkill` | Changes | The member | `name`, `replaces` | `name`, `removed` |
| `listTools` | Reads | The member, or their agent | Nothing | `tools` (name, description, on, and for a server of someone else's its address) |
| `putTool` | Changes | The member, signed in to ohm | `tool`, and `replaces`: optional | `name`, `version` |
| `deleteTool` | Changes | The member, signed in to ohm | `name`, `replaces` | `name`, `removed` |
| `proposeTool` | Changes | The member, or their agent | `tool`: a name, a line on what it is for, what it would take and what it would give | `name`, `proposed`. It does nothing and cannot be switched on until it has been built |
| `exportFiles` | Reads | The member | Nothing | `files` (path, text) |

"Their agent" is the agent's own key, limited to what the member allowed: reading the vault, changing it, reading the cortex, changing it. Until that key exists (it is under "Decisions to make" already), an agent asks as the member, with a token from their PDS, and the requests marked "signed in to ohm" are what it still cannot reach.

### The tools an agent gets

Each is made of the requests beside it and nothing else, as the vault's tools are.

| Tool | Reads or changes | Made of | What it does |
| --- | --- | --- | --- |
| `cortex_start` | Reads | `getContext` | Call first, in every session. Who the person is, a map of their vault and how they want things done, a line for each other memory, a line for each skill, what the agent is able to do, and the notes not yet settled. If there are any, memory is rewritten from them before anything else |
| `cortex_note` | Changes | `addNote` | Write down, in one line, something seen about the person while working. It changes no memory |
| `cortex_settle` | Changes | `listNotes`, `getMemory`, `putMemory`, `settleNotes` | Rewrite memory from the notes, and say what became of each note |
| `cortex_recall` | Reads | `searchMemories`, `getMemory` | Read a memory in full by its name, or find the ones that mention some words |
| `cortex_remember` | Changes | `getMemory`, `putMemory` | Save something learned about the person, or correct a memory that was read. One call: a memory is private and can be changed back |
| `cortex_forget` | Changes | `getMemory`, `deleteMemory` | Remove a memory. Two calls, as removing a post is |
| `cortex_skill` | Reads | `getSkill` | Load one skill in full, when its description fits what is being asked |
| `cortex_propose_skill` | Changes | `getSkill`, `putSkill` | Write a skill down, or change one. It waits for the person's yes in the editor and is not used before |
| `cortex_propose_tool` | Changes | `proposeTool` | Write down a tool that ought to exist: what it is for, what it would take and give. It waits to be built |

There is no tool for the list of tools: an agent reads it in `cortex_start` and cannot change it.

### A session, from the agent's side

1. **It starts with `cortex_start`.** It now knows who it is working for, what their vault holds, how they want work done, what else it has learned before by name, which skills there are, and which tools it has.
2. **If notes are waiting, it rewrites memory from them first** (`cortex_settle`), so this session works from what the last one learned.
3. **It reads more only when the work calls for it:** a memory whose description fits (`cortex_recall`), a skill whose description fits (`cortex_skill`), and the vault itself through the vault's tools.
4. **What the person says about how they want things, it writes as a memory at once** (`cortex_remember`). **What it only notices, it notes** (`cortex_note`) and carries on.
5. **Nobody is asked to look anything over.** The editor shows the cortex beside the vault, with who wrote each thing, what it replaced and which notes it came from, for when the person wants to read or change it.

A session that ends without warning loses nothing: what was said is already memory, and what was noticed is already a note, waiting for the next time the cortex is opened.

### One cortex for every coding agent

Designed 13 November 2026. Not built. One service holds the cortex, and every coding agent a member uses reaches the same one. There are three ways in, and they differ only in what happens without the model choosing to do it.

```
                         ┌────────────────────────────────────────────┐
                         │  the cortex service                        │
                         │  /xrpc/com.ohmmmm.cortex.*                 │
                         └───────▲───────────────▲──────────────▲─────┘
                                 │               │              │
              ┌──────────────────┴───┐   ┌───────┴────────┐   ┌─┴───────────────────┐
              │ the adapter           │   │ the MCP server │   │ a client of ours     │
              │ `ohm cortex hook …`   │   │ the cortex's   │   │ that speaks ACP      │
              │ one program, run by   │   │ own tools      │   │ and drives the agent │
              │ each agent's hooks    │   │                │   │                      │
              └───▲──────────────▲────┘   └───────▲────────┘   └──────────▲───────────┘
                  │              │                │                       │
            Claude Code        Codex         any agent that          later, if at all
                                              speaks MCP
```

| Way in | Before each prompt | After each turn | Who decides it happens |
| --- | --- | --- | --- |
| **The adapter,** on an agent's own lifecycle hooks | The memories that fit the prompt are put in front of the model | What happened in the turn is handed off | The hooks. The model is not asked |
| **The MCP server,** for any agent | Nothing, unless the model calls `cortex_start` or `cortex_recall` | Nothing, unless the model calls `cortex_note` or `cortex_remember` | The model, told to by the server's instructions and a skill |
| **A client of ours,** speaking the Agent Client Protocol | The same as the adapter, for every agent the client can drive | The same | Our client. It sees every prompt and every answer because it carries them |

The adapter and the MCP server are installed together. Where an agent has hooks, the adapter does the fetching and the handing off and the tools are for everything else: reading a memory in full, saving what the member said, loading a skill. Where it has none, the tools are all there is.

#### The adapter

One program, `ohm cortex hook <moment>`, the same for both agents. An agent's hook runs it with a JSON object on standard input, and Claude Code's and Codex's objects are close enough that one program reads both.

| Moment | Claude Code | Codex | What the adapter does |
| --- | --- | --- | --- |
| A session starts | `SessionStart` | `SessionStart` | Answers with the memories marked `always` and a line for each other memory and skill, from its own copy. Then, without being waited for, brings that copy up to date and sends anything still waiting to be sent |
| The member sends a prompt | `UserPromptSubmit` | `UserPromptSubmit` | Finds the few memories that fit the prompt and answers with them, 1,500 characters at most, as `additionalContext`. With nothing that fits it answers with nothing |
| A turn ends | `Stop` | `Stop` | Writes one line to a file on the member's machine: the session, the turn, the folder, the prompt and the last thing the agent said. It reaches no network, and returns at once |
| A session ends | `SessionEnd` | `SessionEnd`: observed on CLI 0.168.0 at normal exit in the probe below; on the earlier Mac builds, desktop only | Sends what is waiting. Nothing depends on this running |

Four rules keep it from getting in the way of the work:

1. **Nothing on the way to the model waits on the network.** The adapter answers from a copy of the cortex it keeps on the member's machine. With the service slow, down, or the machine offline, the member gets what the copy held, and the prompt is not held up.
2. **Handing off a turn is one line written to a file.** A separate step sends the lines later: at the next session's start, at a session's end where that exists, and whenever the adapter next runs. A line is removed only once the service has said it has it.
3. **Every line has an ID made on the member's machine,** from the session and the turn, so one sent twice is kept once.
4. **A hook that fails says nothing and lets the work go on.** It never stops a prompt, and never makes a turn run again.

What Codex's hooks give was checked on Haein's own machine on 13 November 2026 (`codex` 0.142.4, and the desktop app's 0.167.0-alpha.3.2): both builds ran `SessionStart` and `UserPromptSubmit` and took their output in as context; `SessionEnd` ran on the desktop build only. At that point Claude Code's were from documentation only. A later Linux probe of Claude Code 2.1.323 and Codex CLI 0.168.0 is recorded under "Agent 0 probe" below; it does not verify delivery of context to a model or normal `Stop`. A hook is handed a path to the transcript, not the transcript, and Codex says its file is not a format to rely on, so the adapter takes only what the hook's own object holds.

#### From a turn to a memory

A turn that was handed off is not a note and not a memory. It is the prompt and the answer, cut to 2,000 characters each, waiting to be read.

- **Turns are settled as notes are, by the member's own agent,** under the same table in "How memory is written". Most turns say nothing about the member and are dropped. One where they corrected the agent, or said how they want something done, becomes a note or a memory.
- **They are settled apart from the work,** by the adapter running the member's agent on its own with no window (`claude -p`, `codex exec`) when a session has ended, forty turns at a time at most. Where that cannot be done, they wait for the next `cortex_start`, which answers with how many there are and settles a few.
- **ohm reads no turn with a model of its own.** It holds them until they are settled, and then removes them.

#### What a coding agent needs that a writing agent did not

- **A memory can be about one project.** An optional `project` on a memory, a note and a turn names the repository it was learned in: the address of its remote, or the folder's name when it has none. Fetching for a prompt gives that project's memories and the ones about the member, and never another project's.
- **What is put in front of the model is said to be what was learned before, and not an instruction.** It arrives where an agent's own instructions do, so a wrong memory there does more harm than one the model went and read.
- **A turn can hold what should never leave the machine.** The adapter sends the prompt and the last answer only: no tool's output, no file, no diff. A project can be switched off, by a file in it or in the adapter's own settings, and then nothing from it is handed off or fetched.

#### The MCP server, and what goes in the plugin

- **The server is the one in `mcp/`,** with the cortex's tools beside the vault's. It runs on the member's machine, over standard input and output, as now. One that ohm hosts, reached at an address, needs the agent's own key first.
- **Its instructions, given when an agent connects, say in their first 512 characters** to call `cortex_start` before anything else, to note what is noticed and to remember what is said. For an agent with no hooks, that paragraph and the skill are the whole of how memory gets used.
- **The plugin holds what is the same for every agent:** the MCP server's settings and the skills, laid out as the [Agent Plugins standard](https://agent-plugins.org/specification) says. Hooks are not in the standard, so each agent gets its own small file of them beside it, both running the same program.
- **In Codex, a plugin with hooks cannot go in the public directory,** has to be installed by hand, and its hooks run only once the member has looked them over and trusted them. Codex's own memory cannot be replaced by another, so it and the cortex run side by side.

#### A client of ours

Hooks cover Claude Code and Codex, and not every moment of either: a session that is killed hands off nothing for its last turn, and an agent with no hooks hands off nothing at all. If "your agent remembers every turn, in whichever agent" is what members are promised, hooks do not keep that promise. A client of ours that speaks the Agent Client Protocol does, for the agents it can drive, because every prompt and answer passes through it. It is a product of its own, and it means members work in our window in place of the agent's. Not planned. It is here so that the promise is not made before it is.

### What holding a cortex commits us to

- **It is a description of a person, written by software.** That is more sensitive than a private post, and nothing in it was written by the member. They are told it exists, shown all of it, and can remove any of it.
- **A wrong memory keeps being acted on.** So every memory says who wrote it and where it came from, and correcting one is as easy as editing a post.
- **Nobody checks a memory before it is used.** That was chosen. What stands in for the check is that what the member said is never overwritten by a guess, that every rewrite keeps what it replaced, and that the member can read all of it.
- **It is a way in for instructions the member never gave.** Text in a post or a web page can ask an agent to remember something or write a skill. Rules 8 and 9 are the answer for tools and skills. For memory, the answer is that `written by` and `from` are always kept and the member can see every one.
- **Turns from a coding agent hold code, and sometimes a key or a password someone pasted.** ohm holds them until they are settled. So they are cut short, sent without any tool's output, removed once read, and a project can be kept out altogether.
- **Leaving covers it too.** Export writes the cortex out with the vault, and deletion on request removes it.

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

- Status, and the two-step publish. Built: the service's Publish capability says what would be published for the first time, replaced and taken down, which posts cannot be published and why, and which published records the vault knows nothing about.
- Writing to the member's PDS. Built the second way of the two under "Decisions to make": the member's own device does the writing, signed in at their PDS for as long as publishing takes, so ohm holds no standing permission to anyone's repository. The same code carries a plan out in the editor and in the agent's tools.
- Three rules keep it safe beside other software that writes to the same repository: only the shared post type is touched; a record is removed only when it is known to be a post of this vault; and a post that cannot be published leaves what is published of it as it is.
- A picture a post places is sent to the PDS when the post is published. One the PDS already holds is named, not sent again.

### 4. The editor

One web page, hosted by us, laid out as the app is: a rail of icons, a side panel that is the repository, and the main screen with one post. Built, except the status line and Publish. Sync appears beside Publish once a folder is connected.

### 5. The agent's tools

Built as a client of the vault service: each tool is made of the service's requests and nothing else, and reads and writes posts with the member's own token. There are ten: tree, list, read, search, save, set visibility, status, publish, mirror, delete. Marking a post for everyone still takes its own confirmation, and so does `vault_publish`; whether the first should go, now that nothing is public until the second, is not decided. A key a member can hand to an agent and take away, in place of an app password, is not built. Because the service holds the vault, a remote version that needs nothing installed becomes possible later.

### 6. Sync with a folder

- A connector for a local folder: read each file as a post, compare with ours, copy what differs in either direction, and keep the other version beside ours when both changed.
- Reading Obsidian's own link and embed syntax, and keeping it as written.
- Old addresses of renamed published notes sending readers on.
- Reaching the folder, in the order to build: the member's machine, through a command or the agent's tools; a local folder opened from the browser (Chrome and Edge only); an S3-style connector (R2, S3, Google Cloud Storage, Backblaze, self-hosted); Google Drive and Dropbox only if asked for.

### 7. Your own pages follow

When a public note changes, the page of the member's own design that shows it changes too. The public endpoints make this possible for a site on any host. Designed after the rest.

### 8. The cortex

Designed under "The cortex". In the order to build:

- **Storage and the access check,** in the vault service, in tables of their own. A cortex is the same member's as the vault beside it.
- **Memory and Context** first: the five memory requests and `getContext`, then `cortex_start`, `cortex_recall`, `cortex_remember` and `cortex_forget`, and the three memories every cortex starts with. This is the part an agent cannot work well without.
- **Notes, and rewriting memory from them:** the three note requests, `cortex_note` and `cortex_settle`, the earlier version of a memory kept, and the skill that says how to judge.
- **The adapter,** for Claude Code first and then Codex: `recall`, the copy kept on the member's machine, the file of turns waiting to be sent, the three turn requests, and settling turns with the member's own agent. It needs the agent's own key, so that no password from a PDS sits in a hook's settings.
- **The cortex in the editor:** what the agent has written, newest first, with who wrote it, to change or remove.
- **Export and Sync:** the cortex written out as files, and kept in step with a folder as the vault is.
- **Skills,** with the member's yes before one an agent wrote is used, and moving a memory up to one.
- **Tools:** the list, switching ohm's own on and off, and an agent's requests for one to be built. Connecting a server of someone else's comes last.

#### The cortex, as work for agents

Planned 13 November 2026. Nothing has been handed out. The work is cut so that each agent has files of its own and no two write the same one. Three files are shared by everything, so one agent lays them down first and the others do not touch them: `service/schema.sql`, `service/src/capabilities/index.mjs`, and `mcp/tools.mjs`.

| Agent | What it builds | Its own files | Waits for | Done when |
| --- | --- | --- | --- | --- |
| **0. Probe** | Nothing. It runs the checks under "What to check before relying on it": Claude Code's hooks with a hook that only writes down what it was handed, Codex's `Stop`, an agent run with no window, and the Agent Plugins specification. It changes no file but this plan | None | Nothing. It can start now, beside agent 1 | Each of those rows says what was found, on which build |
| **1. Foundation** | Every cortex table. Every cortex capability named in the index, each answering "not built yet". The rules for a memory, as the vault's rules for a post are kept: its fields, its limits, its version. Then Memory and Context whole: the five memory requests, `getContext`, the three memories a cortex starts with, and the earlier version of a memory kept | `cortex/` (new, beside `vault/`), `service/src/capabilities/memory.mjs` and `context.mjs`, the three shared files, `test/cortex.test.mjs` | Nothing | Another member's token gets nothing from a cortex; a save naming a stale version is refused; a memory written as a file reads back the same; Publish, with a cortex full, lists no change |
| **2. Notes** | The three note requests, and the skill that says how to judge | `service/src/capabilities/notes.mjs`, `skills/cortex/`, `test/notes.test.mjs` | 1 | A note sent twice is kept once; every note is settled one way or another; settling into a memory that does not exist is refused |
| **3. Tools for the agent** | The nine `cortex_` tools in the MCP server, and the server's instructions | `mcp/cortex-tools.mjs` (new; agent 1 leaves the one line in `mcp/tools.mjs` that brings it in), `test/cortex-mcp.test.mjs` | 1, and 2 for `cortex_note` and `cortex_settle` | Milestone 8's checks that name a tool pass against the service's own code |
| **4. The agent's key** | A key ohm issues for an agent, limited to reading or changing the vault or the cortex, and taken away at will | `service/src/key.mjs` (new), `service/src/member.mjs`, `test/key.test.mjs` | Nothing in the cortex. It waits for the decision "What an agent signs in with" | A key for the cortex only reads no post; a key taken away is refused at once |
| **5. The adapter** | `ohm cortex hook`, the copy kept on the member's machine, the file of turns, `recall`, the three turn requests, the hooks file for Claude Code, then the one for Codex | `adapter/` (new), `service/src/capabilities/turns.mjs`, `hooks/`, `test/adapter.test.mjs` | 1, 4, and what 0 found | The first four checks of milestone 8 |
| **6. The cortex in the editor** | A panel beside the vault: what was written, by whom, what it replaced, to change or remove. A skill's yes | `service/public/vault/cortex.js` and `cortex.css` (new) | 1, and 2 to show notes | In a browser, a memory an agent wrote is read, changed and removed, and the agent no longer has it |
| **7. Out and back** | The cortex written out as files, and kept in step with a folder | `cortex/file.mjs`, `scripts/cortex-sync.mjs`, `service/src/capabilities/cortex-export.mjs`, `test/cortex-sync.test.mjs` | 1, and the decision on where the cortex's folder sits | With ohm's copy removed, a sync from the folder brings every memory and skill back |
| **8. Skills and the list of tools** | The skill requests with the member's yes, the tool requests, `proposeTool` | `service/src/capabilities/skills.mjs` and `tools.mjs` | 1 | A skill an agent wrote is refused to an agent until approved; an agent's request to switch a tool on is refused |

```
0 Probe ────────────────────────────────────┐
                                             ▼
1 Foundation ──┬── 2 Notes ──┬── 3 Tools for the agent
               │             └── 6 The editor
               ├── 7 Out and back
               ├── 8 Skills and the list of tools
               └──────────────────── 5 The adapter
4 The agent's key ───────────────────────────┘
```

- **At most four at once.** Agents 0, 1 and 4 can start together. Once 1 is in, agents 2, 7 and 8 can run side by side, and then 3 and 6.
- **Each agent works on a branch of its own** and is brought into `main` one at a time, in the order of the table, with every test passing first.
- **The reference is written from the code** (`node scripts/capabilities.mjs --write`), so no agent edits `service/CAPABILITIES.md` by hand. It is run once after each agent is brought in.
- **Nothing is deployed by an agent.** The live service changes when Haein says so.
- **Each agent is told the decisions it rests on.** Four are open and would change what is built: who reads a turn (5), whether a memory can be about one project (1 and 5), whether what nobody looked over is put in front of the model (5), and where the cortex's folder sits (7). Agents 1, 2, 3, 6 and 8 can be built whichever way those go, if agent 1 keeps `project` as a field that may be empty.

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

**State, 13 November 2026.** Built for public posts. In tests against the service's own code and a stand-in repository: Publish shows what would change; on a yes a public post's record appears under its ID with a copy of its picture; an edit stays unpublished until the next Publish; marking the post private and publishing again removes the record; a record something else published is never touched; and a yes given to one list does not publish another. The editor's Publish has been run in a browser both ways, with an app password and by approving at the PDS's own screen, against a stand-in PDS. Not run against a real PDS. Nothing is built for friends: a friends-only post is in the working copy and nowhere else.

**Done when:** Publish shows what would change, and on a yes a public post's record appears on a test PDS under its ID, with its files; marking it private and publishing again removes the record; and a friends-only post's shared version changes only on Publish.

### 5. Your agent works in the vault

Piece 5.

**State, 13 November 2026.** All but "sync" work in tests against the service's own code, "bring in my posts" and "what is not published yet" too. None has been run with a real sign-in: that needs an app password from the member's PDS. "sync" has no tool yet.

**Done when:** in your agent, "what have I written about X", "save this as a private note under writings", "make that one public", "sync" and "publish" all work, and the last one shows what will change before it does.

### 6. The editor

Piece 4.

**State, 13 November 2026.** Live at https://app.ohmmmm.com/vault. Signing in, browsing the tree, writing a post, saving it privately, marking it public, seeing that something is waiting and publishing all work without a terminal. Not built: telling a member with no folder connected that ohm holds the only copy of their private and friends-only posts.

**Done when:** signed in to ohm in a browser, you browse the tree, write a post, save it privately, mark it public, see the status, and publish, without a terminal. A member with no folder connected is told that ohm holds the only copy of their private and friends-only posts.

### 7. Other storage, and your own pages

### 8. Your agent remembers

Piece 8.

**State, 13 November 2026.** Designed. Not started.

**Done when:** something said to Claude Code about how the member wants work done is in front of Codex the next time a prompt it fits is sent, with neither model having called a tool; with the service unreachable, a prompt is answered as quickly as with it, from the copy, and the turns of that session arrive once it is back, each once; a memory about one project is never given in another; a project switched off hands off nothing; an agent in a new session, on another machine, calls `cortex_start` and knows who it is working for and what it learned before; it knows whether it is working for a person or a company, and what each label in their vault is for; told once how a title should read, it does not need telling again in the next session; something it only noticed, in two sessions, is a memory in the third, with nobody having been asked; a note that goes against what the member said does not overwrite it; a memory that was rewritten can be put back to what it said before; a session cut off part way loses no note; everything it wrote is listed in the editor with who wrote it, and removing a memory there means the agent no longer has it; a skill an agent wrote is not used until it has been approved; an agent's request to add a tool or switch one on is refused; another member's token gets nothing from a cortex; Publish, with a cortex full, lists no change; and the cortex written out as files reads back as the same cortex.

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
- **Where the cortex sits when a vault is synced to a folder.** A folder connected today is the vault itself, and "only posts are synced". Proposed: the cortex is a second folder beside it, `cortex/`, connected and synced on its own, so that a vault opened in Obsidian is still only the member's writing. The other way is a folder inside the vault that sync treats apart. Not decided. Until one is built, ohm holds the only copy of a cortex.
- **Whether every agent shares one cortex.** A member may use more than one agent. Proposed: one cortex, read by all of them, with each save saying which agent made it. The other way is a cortex to an agent, which keeps one agent's mistakes from another and means teaching each of them the same thing. Not decided.
- **Whether an agent may write to memory without asking.** Settled: yes, and nothing waits for the member ("dont review with me, just write onto memory"). What they said is written at once; what the agent noticed is noted, and becomes memory the next time the cortex is opened.
- **Whether a skill an agent wrote still waits for the member's yes.** It does in this design (rule 9), and "dont review with me" was said of memory. A skill changes what the agent does in every later session, and text in a post or a web page can ask for one to be written. The other way is that a skill is used as soon as it is written, as a memory is. Not decided.
- **How many times is enough.** The design says a thing noticed becomes a memory once it has been seen in more than one session, and a skill once it has been done the same way three times. Both numbers are guesses, to be changed once it has been used.
- **What happens to notes when the cortex is not opened again for a long time.** They wait. Whether ohm's own agent should settle them in the meantime is the same question as whether it reads the cortex at all, below.
- **Who reads a turn and decides what it says about the member.** Designed so that the member's own agent does, run with no window by the adapter when a session ends, and that ohm reads none with a model of its own. That spends the member's own usage on something they did not ask for and cannot see. The other ways are that ohm reads them, which costs ohm a model's time for every turn of every member and has ohm reading what was said over someone's code; or that turns are not kept at all and only what the agent chose to note is. Not decided.
- **Whether a memory can be about one project.** Designed so that it can, with `project`. It goes against "about the member, and true whatever the task" in the table of what becomes a memory, which was written for someone writing, not someone coding. The other way is that what is true of one repository stays in that repository's own files, such as `AGENTS.md`, and the cortex holds only what is true of the member. Not decided.
- **Where the fitting memories are found, on the machine or on the service.** Designed so that the adapter finds them in its own copy, by the words in the prompt, so that no prompt waits on the network. Finding them by meaning and not only by words is better and would have to be done on the service, with a time after which the adapter gives up and uses its copy. Not decided.
- **Whether a memory nobody looked over is put in front of the model unasked.** With hooks it is, before every prompt, where an agent's own instructions go. That is what makes memory work without the model choosing, and it is also the shortest way from a wrong or planted memory to something the agent does. The stricter way gives unasked only the memories the member stated, and leaves what the agent worked out to be read through a tool. Not decided.
- **Whether a client of ours is built.** Only if every turn, in every agent, is what members are promised. See "A client of ours".
- **Whether the cortex keeps the keys to servers of someone else's.** Designed so that it does not: it keeps the name and address, and the key stays in the agent's own settings on the member's machine. Keeping them would let a tool follow the member to any agent, and would make ohm a holder of keys to other services. Not decided.
- **Whether ohm's own agent reads the cortex.** The publicist in the private `ohm` repository works for the same member. Whether it reads and writes this cortex, or keeps what it knows apart, is not decided.
- **What happens to a memory that is removed.** For a memory that is rewritten, settled: the version before is kept. How many versions back, for how long, and whether something removed can be brought back, is the same question as for a post, under 0 below.

0. **What protects a member from a client that deletes or overwrites by mistake.** The interface leaves conflicts and deletions to the client. That is fine for clients we write, which ask first. It is not enough for an Obsidian plugin we did not write, which could remove or replace every file in one run. Proposed: the service keeps earlier versions of each file and holds removed files for a period, so anything a client does can be undone. Not yet decided.
00. **Whether a post has a name that never changes, apart from its slug.** Settled: it has an ID, given once when it is made, and the slug is an ordinary field. Whoever makes the post makes the ID, so a request to create it can be repeated safely, and a connector keeps it in the post's file as one more property. The record on the PDS is kept under the ID, not the slug (Haein, directly), so a renamed post keeps its record and everything that points at it.

    What this changes in what exists, none of it done yet:
    - **A post's address no longer ends in its record's key.** It ends in the slug. Built: the site's Worker builds each address from the slug, finds a post by its slug or its key, and sends the key's short address on to the full one. A newly renamed post is found at its new address once the site's list has been rebuilt, so Publish has to rebuild it.
    - **The record has to say what its slug is.** Settled and built: the schema has an optional `slug` field (Haein, directly). A record with none uses its own key, so posts published earlier work as they did.
    - **Records published before this are kept under their slugs.** The first Publish from the service moves each to a record under its ID and removes the old one. Anything outside that points at an old record's address in the repository stops resolving, once.
    - **Connections between posts** are written with IDs. Built: `postRecord` in `vault/file.mjs`.
000. **What a post's body holds.** As its author wrote it, Obsidian's own `[[links]]` included, with the published form worked out at Publish. Or already in the published form. The first keeps the mapping exact and a member's writing as they wrote it, and is what is built. The second would change `[[links]]` in a member's file the first time a post came back from us.
0000. **Where cached copies of attachments sit when a post is written out as files.** Beside the post, or together in one folder kept for them.
1. **How Publish writes to the member's PDS.** For our service to publish, it needs the member's standing permission to write to their repository, granted once through AT Protocol sign-in and kept by us. That makes us a holder of write access to people's repositories, to be stored and guarded accordingly. The alternative is that the member's own device does the writing, which needs no standing permission but only works where they are signed in. Built the second way, on 13 November, so that it can be tried: it commits ohm to nothing, and the first way can still be added, since what would change is worked out the same either way. Not yet confirmed by Haein. What it costs: a member approves at their PDS every time they publish, and nothing can be published on a schedule.
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
| A member's own sign-in at their PDS can make the changes Publish lists | Publish depends on it. Cirrus accepts a batch of changes and a file from a signed-in member; we have run it against a stand-in only | Before anyone relies on Publish |
| Sign-in from the browser works against Cirrus | The editor needs it | Done: Haein signed in and connected on the live service. Which of the two ways, an app password or the PDS's own screen, is not recorded |
| Signing in with a Bluesky account works end to end | It is one of the three ways in. Bluesky's server accepts the start of it; nobody has finished one | Before anyone outside is let in |
| The agent's tools work with a real sign-in | They are tested against the service's code only | Milestone 5 |
| What storing every member's notes and files costs | We now hold everything, not only what is published | Estimate in milestone 1 |
| Obsidian reads the folder as planned and leaves unknown properties alone | Milestone 3 | Milestone 3, with the real vault |
| Sync apps and two-way sync do not lose a note | A sync app resolves its own conflicts by making a second copy of a file. Ours has to notice such a copy and say so | Milestone 3 |
| Claude Code's hooks hand over what the adapter needs: the prompt at `UserPromptSubmit`, and the last answer at `Stop` | Partly executed on Linux, 13 November 2026, Claude Code 2.1.323: `SessionStart` and `UserPromptSubmit` recorded, with the exact synthetic `prompt` in the latter. Normal `Stop` and its last answer remain unverified: not logged in. The [hook reference](https://code.claude.com/docs/en/hooks) documents `last_assistant_message` at `Stop`, but no prompt there; keep the prompt from submission. See evidence below | Start/submission checked; authenticated `Stop` and context delivery still required before the adapter |
| A hook that answers from a file on the machine adds no wait a member notices | Unverified: this probe only recorded stdin and returned no output. It built no adapter and did not measure prompt latency or local context lookup | With the adapter's first version |
| Codex's `Stop` hook hands over the turn as documented | Unverified on Codex CLI 0.168.0: `codex exec` failed with HTTP 401 and emitted no `Stop` payload. The [hook reference](https://developers.openai.com/codex/hooks) documents `turn_id`, `stop_hook_active`, and nullable `last_assistant_message`, but no prompt in `Stop`. Capture the prompt at `UserPromptSubmit` and join by turn; do not parse the unstable transcript | Authenticated normal `Stop` still required before the Codex half; earlier 0.142.4 and desktop 0.167.0-alpha.3.2 were not rerun here |
| An agent run with no window can settle turns, and what that costs a member in usage | Modes executed on Claude Code 2.1.323 and Codex CLI 0.168.0; both exited 1 without authentication. Claude reported zero tokens and `total_cost_usd: 0`; Codex emitted `turn.failed` and no usage result. Successful synthetic work, real settlement, and charged usage remain unverified. [Claude headless reference](https://code.claude.com/docs/en/headless); [Codex non-interactive reference](https://developers.openai.com/codex/noninteractive) | Before turns are handed off at all; failure output is not a successful usage measurement |
| The Agent Plugins standard holds the MCP settings and skills in a form both agents read | Specification 1.0.0 read in full: root `plugin.json`, `skills/<name>/SKILL.md`, root `mcp.json`; hooks are outside the portable core. [Specification](https://agent-plugins.org/specification), sections 4–9. Codex documents this format; Claude's reference documents its native `.claude-plugin/plugin.json` and `.mcp.json`. The same package loading in both agents remains unverified | Documentation checked; verify both loaders before promising one package |

### Agent 0 probe, 13 November 2026

**Scope and builds.** The clean starting commit was `87da98ea4af81ff7ffab2283385e4ceda88e0f2b`. Neither CLI was available on the initial shell path, and no agent credentials were available. The official npm packages were installed only in an isolated directory outside this repository: `@anthropic-ai/claude-code@2.1.323` and `@openai/codex@0.168.0`. Their version commands returned `2.1.323 (Claude Code)` and `codex-cli 0.168.0`. The runtime was Linux x86-64 with Node v24.22.2. These are the builds actually probed here, not a rerun of the earlier Mac builds.

**Method.** Both commands ran in an empty synthetic folder, with isolated `HOME`, `CLAUDE_CONFIG_DIR`, and `CODEX_HOME`. The only hook program read stdin as bytes and wrote those same bytes to a uniquely named file outside the repository. It returned exit 0 with no stdout or stderr; it did not read the transcript, inject context, invoke an agent, or contact a service. `SessionStart`, `UserPromptSubmit`, `Stop`, and `SessionEnd` were configured. The same synthetic prompt was used for both: `Synthetic hook probe only. Reply with exactly PROBE_OK. Do not read files, use tools, write memory, or perform any other action.` No user turns were read or settled, and no product adapter was installed.

| Executed check | Actual evidence | Limit |
| --- | --- | --- |
| Claude authentication | `claude auth status --json` exited 1: `loggedIn: false`, `authMethod: "none"` | No authenticated model response was possible |
| Claude headless and hooks | `claude -p <synthetic prompt> --output-format json --model haiku --max-budget-usd 0.10 --tools "" --setting-sources "" --settings <isolated hook settings> --strict-mcp-config --mcp-config '{"mcpServers":{}}'` exited 1. Recorded one `SessionStart`, one `UserPromptSubmit`, and one `SessionEnd` | No `Stop` payload. `result` was `Not logged in · Please run /login`, `is_error: true`, `terminal_reason: "api_error"`. Its `subtype: "success"` alone must not be treated as success |
| Codex authentication | `codex login status` exited 1: `Not logged in` | No authenticated model response was possible |
| Codex headless and hooks | `codex exec --json --skip-git-repo-check --sandbox read-only --dangerously-bypass-hook-trust <synthetic prompt>` exited 1 with HTTP 401, `Missing bearer or basic authentication in header`, and `turn.failed`. Recorded one each of `SessionStart`, `UserPromptSubmit`, and `SessionEnd` | No `Stop` payload or `turn.completed` usage. The trust flag was used only for the inspected, record-only synthetic hook for this invocation; it is not an adapter installation instruction |

Codex loaded the isolated `[features].codex_hooks = true` setting but warned that it is deprecated in 0.168.0 in favour of `[features].hooks = true`. It also clamped the configured 5-second `SessionEnd` timeout to 3 seconds. `SessionEnd` therefore ran in this CLI build on the failed run's normal exit; the older desktop-only observation above is not a guarantee for current builds. No killed-session behaviour was tested.

**Recorded input.** There were six raw JSON stdin artifacts in total. Every payload had `session_id`, `transcript_path`, `cwd`, and `hook_event_name`. Both `SessionStart` objects had `source: "startup"`; Codex additionally had `model` and `permission_mode`. Claude's startup payload did not have `model` or `permission_mode` in this run. Both submission objects had the exact `prompt` and `permission_mode`; Claude additionally had `prompt_id`, while Codex had `turn_id` and `model`. These observed extra fields must not be assumed on older builds. Both `SessionEnd` objects had `reason: "other"`; Claude also had `prompt_id`. The transcript paths existed after exit, but the recorder did not read them. No normal answer or Stop input was observed.

**Hook input/output and loop rules, documentation only where not recorded.** The [Claude hook reference](https://code.claude.com/docs/en/hooks#stop) says `Stop` runs after a normal main-agent response, not on a user interrupt; an API error uses `StopFailure` instead. Its `last_assistant_message` avoids reading a transcript which may not yet contain the final response. The [Codex hook reference](https://developers.openai.com/codex/hooks) gives `Stop` a nullable `last_assistant_message` and explicitly says its transcript format is not stable. Neither documented `Stop` object supplies the submitted prompt. An adapter must retain that from `UserPromptSubmit`; the documented Codex `turn_id` can join the two events, while a reliable Claude correlation strategy still needs a successful, multi-turn probe.

For both agents, documented start/submission context uses `hookSpecificOutput: {hookEventName: <event>, additionalContext: <text>}`; plain stdout also adds context on these two events. That context delivery was not tested here because the recorder returned nothing and authentication failed. For a passive `Stop` recorder, exit 0 with no output allows completion. `decision: "block"` with a reason or exit 2 asks the agent to continue; this must not be used for capture. Check `stop_hook_active` before any continuation and suppress capture/recursive worker launch for the adapter's own settlement runs. Claude also documents that `Stop` `additionalContext` continues the conversation and an eight-consecutive-continuation cap, reset by tool use; Codex documents JSON-only non-empty Stop output. Loop avoidance and normal Stop completion remain documentation-only, not executed results.

**Observable usage.** Claude's failed JSON result had `duration_api_ms: 0`, all token counts zero, `modelUsage: {}`, and `total_cost_usd: 0`. This proves only what an unauthenticated failure reports. Its [headless reference](https://code.claude.com/docs/en/headless) describes usage and per-model cost output as client-side estimates; resumed runs include earlier conversation spend. Codex's [non-interactive reference](https://developers.openai.com/codex/noninteractive) documents token counts in `turn.completed.usage` with `--json`, not a billed currency amount. This run never emitted that event. No successful settlement, subscription allowance consumption, or actual bill was measured.

**Plugin specification, documentation only.** [Agent Plugins 1.0.0](https://agent-plugins.org/specification) requires root `plugin.json` with `$schema` and `name`, discovers skills only in immediate children of `skills/`, and discovers MCP servers at root `mcp.json` with the matching schema version. Standardized components are skills and MCP servers only. Hook configuration belongs to a client-defined reverse-domain extension; the standard gives it no portable execution semantics. MCP executable commands are a single token, bundled paths begin `./` and stay inside the plugin root, and `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` expand only in supported args, environment values and cwd. There is no portable OAuth or credential-reference field, and package headers/environment must not embed secrets.

The [Codex packaging guide](https://developers.openai.com/codex/plugins/build) documents the portable manifest, `mcp.json`, and `extensions.com.openai`. The [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference) instead documents its native `.claude-plugin/plugin.json` and `.mcp.json`; Claude is not listed on the standard's [compatible-clients page](https://agent-plugins.org/compatible-clients) as read for this probe. That is not an executed rejection of the portable format, but it leaves the assumption that one unchanged package works in both unproven. No plugin was installed or loaded in either agent. Retain the shared skills/MCP design, and verify the client packaging before laying it out.

## Later

The network: follows and friends reading each other's notes, the feed, needs and matching, introductions by email, notifications. The design is in the architecture plan.
