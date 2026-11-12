# Build plan

Written 12 November 2026, revised the same day. Phase one is the owner's side only: an editor for your own repository, an MCP for the vault, and a publish that updates your website. The network (feed, friends' notes, needs, notifications) is phase two and is not designed further here. Background is in [the architecture plan](network-architecture.md).

## What phase one is

One person, their own content, three ways to work on it, one result.

```
   editor (in the browser)      your agent (through the MCP)      commands
            │                            │                           │
            └──────────────┬─────────────┴───────────────────────────┘
                           ▼
                     the vault core
        one set of rules for reading, saving, moving, validating
                           │
          ┌────────────────┼─────────────────┐
          ▼                ▼                 ▼
       public           friends           private
   records on the    your own store,   your own store
     your PDS        marked friends
          │
          ▼
     your website
```

- **The editor** shows the structure of your repository the way Obsidian shows a folder of notes, lets you edit a note, and lets you choose who sees it.
- **The MCP** gives your agent the same abilities, plus rendering a note into your website's own pages.
- **Publish** makes a note public, and the page on your website changes.

## Where we are

| Piece | State |
| --- | --- |
| Post schema `com.ohmmmm.post` | Built and pushed |
| Publish, profile, render and migrate commands | Built. They are scripts that run on your machine |
| Public posts on the PDS, private posts in your own store | Built |
| The posts page on your site | Built, read-only: a list with folders by label, platform or visibility. Signing in adds your private posts |
| Rebuilding your own pages from records | Built as a command you run. Nothing runs it when a post changes |
| Editing in the browser | Not started |
| A `friends` visibility | Not started |
| MCP server | Not started |

## The structure of a vault

This is what the editor shows and what every save has to respect.

```
your repository
├── profile
└── posts
    ├── writings                      label
    │   ├── collisions                sublabel
    │   │   ├── trap-of-independency  a note: its key is its slug
    │   │   └── …
    │   └── why-i-started-ohm
    ├── photographs
    │   └── lisboa
    └── other                         notes with no label
```

Each note carries: body, title, dates, form, label, sublabel, connections, attachments, source, and your site's own fields.

**Visibility is where a note is stored, not a field inside it.**

| Visibility | Stored | Seen by |
| --- | --- | --- |
| Public | A record on your PDS | Everyone; it is on your website |
| Friends | Your own store, marked friends | Only you, until the network exists. Then the people you follow who follow you back |
| Private | Your own store | Only you |

Rules for a note to "land correctly", enforced in one place:

1. **It is valid against the schema before it is written**, whichever front it came from.
2. **Its form is identified from its content**, never typed in.
3. **Its address comes from its label, sublabel and slug**, and is the same at every visibility.
4. **Changing visibility moves the note between stores without changing it.** Its attachments move with it.
5. **A slug is unique across all three visibilities.**
6. **Anything the fixed schema has no place for goes in your site's own layer**, and only once your site's schema declares it.

## The four things to build

### 1. The vault core

One module with the rules above and nothing about how it is called. Today these rules live inside the publish script, which only runs on your machine. The editor runs in your site's Worker, so the rules have to be shared or the two will drift.

- Pure functions: build a record from a note, identify its form, validate it, work out its address.
- Two stores behind one interface: the PDS, and your own store. Each has a version for your machine and one for the Worker.
- Operations: list, read, save, move between visibilities, delete, attach a file.
- Safe concurrent edits: a save says which version it started from and is refused if the note changed underneath, so the editor and your agent cannot silently overwrite each other.

### 2. The vault MCP

A local server in the plugin, started by your agent. It uses your own credentials and talks to your PDS and your own store directly.

| Tool | Does | Changes what others can see |
| --- | --- | --- |
| `vault_tree` | The structure: labels, sublabels, counts, by visibility | No |
| `vault_list`, `vault_read` | List and read notes at any visibility | No |
| `vault_search` | Search across all of them | No |
| `vault_save` | Create or edit a note. New notes are private | No |
| `vault_move` | Refile a note under another label or sublabel | Only if it is public |
| `vault_set_visibility` | Move a note between private, friends and public | Yes |
| `vault_delete` | Remove a note | Only if it is public |
| `site_adopt` | Cut a template out of one of your existing pages | No |
| `site_render` | Fill a template from a note and show the page | No |
| `site_publish` | Put the rendered page on your website | Yes |

Every tool that changes what others can see works in two steps: the first returns exactly what would change, the second does it and must be given what the first returned. The publish command already works this way.

### 3. The editor

It is the posts page your site already has, grown into something you can work in. It runs in your own site's Worker, on your own domain, behind the sign-in you already use for private posts.

- **Left: the tree.** Labels and sublabels as folders, notes inside, a mark for each note's visibility. Switchable to platform or visibility, as now.
- **Middle: the note.** Rendered, and editable as Markdown. Attachments can be added.
- **Right: its properties.** Title, label, sublabel, slug, visibility, connections, your site's own fields. Form and address are shown and not editable, because they are derived.
- **Publish.** One button. It shows what will become public and where it will appear, then writes it.

Why it runs on your own Worker and not on a service of ours: it has to read your private notes, and our service does not read the private notes of anyone who has their own store. For people who join with an AT Protocol account and no Cloudflare site, the same code is hosted by us, and we hold their private notes (see "People with no website yet" in [the architecture plan](network-architecture.md)).

To write, the Worker needs a token for your PDS, kept as a secret in your own Cloudflare account. The mirror already works this way.

### 4. The connection to your website

When a note becomes public or a public note changes, your website has to show it.

- **Pages your site's Worker renders** (the posts list and each post's page) update at once: the Worker refreshes what it has read from the PDS.
- **Pages of your own design** are the real work. Today a command rebuilds one of them from a record on your machine, and you deploy the result. For Publish in the editor to update them, the Worker has to do the filling itself:
  1. `site_adopt` cuts a template out of an existing page, as the render command does now, and stores the template and its rules in your own store.
  2. The Worker serves that page by filling the template from the current record.
  3. Publish writes the record, and the next request for the page shows the new content. Nothing is rebuilt or deployed.

The rule that a rebuilt page must match the original exactly stays: a template is only accepted if filling it from the record reproduces the page it was cut from.

## Milestones

### 1. Vault core, and the structure made right

- Move the rules out of the publish script into the shared module; the commands call it.
- Add the `friends` visibility to your own store.
- Versioned saves.
- Migrate haeinjung.com's records to `com.ohmmmm.post`, then deploy the site Worker. Records first.

**Done when:** the existing tests pass on the shared module; a test moves one note private → friends → public → private and the note is identical at every step; and your live site runs on the new schema.

**State, 12 November 2026.** The code part is written and uncommitted: `vault/` holds the rules, the operations and the stores; the publish command builds and writes through it and takes `--friends`; the owner's posts list shows friends-only notes. All 44 tests pass, including the move through every visibility with the note identical at each step, a stale save being refused, and the publish command run against a PDS on this machine. Not done: the live records are not migrated and nothing is deployed. Not verified: the store adapter for your machine was run against a local throwaway store, not your real Cloudflare store.

### 2. Vault MCP

- The local server and the vault tools above.
- A local index so search does not fetch every note each time.
- A skill telling the agent how to work in a vault: save privately by default, never change visibility without the two steps.

**Done when:** in your agent, "what have I written about X", "save this as a private note under writings", and "make that one public" all work against your real vault, and the last one shows you what will change before it does.

### 3. Editor, reading

- The three-part layout on top of the current posts page.
- All three visibilities in one tree when you are signed in.

**Done when:** you can browse your whole vault in the browser, public and private together, and open any note.

### 4. Editor, writing

- Edit a note's text and properties; add attachments.
- Change visibility.
- Publish, with the confirmation step.

**Done when:** you write a note in the browser, save it privately, publish it, and it appears on your posts page without touching a terminal.

### 5. Your own pages follow

- Templates and rules stored in your own store; the Worker fills them on request.
- `site_adopt`, `site_render`, `site_publish` in the MCP.

**Done when:** you change a published essay in the editor, press Publish, and the essay's page on haeinjung.com, in its own design, shows the change. A comparison against the page before the change shows only the edited text differs.

## Decisions to make

1. **Where the editor runs.** Decided: on your own site's Worker.
2. **Friends before the network.** This plan stores friends-only notes in your own store, visible only to you for now. When the network exists they are also given to the service so friends can read them.
3. **How much of your site the Worker serves.** Milestone 5 means the pages of your own design are answered by the Worker, not by static files. The design does not change, but the way the site is served does.
4. **The editor's look.** It is your side of the site, so it should probably follow your site's design. A mock-up before milestone 3 would settle it.

## What to check before relying on it

| Assumption | Why it matters | When |
| --- | --- | --- |
| The page-filling code runs inside a Worker | Milestone 5 depends on it. It runs on your machine today | A spike at the start of milestone 5 |
| Your own store handles a whole vault | It is a key-value store: fine for hundreds of notes, slow to list and search thousands | Measure in milestone 2; a database in your account is the fallback |
| Reading your own store from your machine is fast enough for the MCP | Search depends on it | Milestone 2; the local index is the answer if not |
| The PDS refuses a save made from a stale version | Safe concurrent edits depend on it | Milestone 1 |

## Phase two, later

The network: a service that indexes members' public records, follows and friends, the feed, needs and matching, introductions by email, notifications. The design is in the architecture plan. Phase one leaves two hooks for it: the `friends` visibility already exists in the vault, and the MCP is already the place network tools are added.
