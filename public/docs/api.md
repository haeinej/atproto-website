# Service API

The vault and cortex service registers 38 requests in 15 capabilities. This reference includes authenticated placeholders and is generated from the tables the service runs on.

<a id="conventions"></a>

## Conventions

The vault and cortex service speaks XRPC, the request convention of the AT Protocol. Every request has a namespaced name and is sent to `/xrpc/` followed by that name. Cortex requests are private; a registered request can still be an authenticated `NotBuiltYet` placeholder.

| | |
| --- | --- |
| Base addresses | `https://vault.ohmmmm.com`, and `https://app.ohmmmm.com/vault` for the workspace, where the ohm session cookie is in scope |
| Reads | `GET`, with parameters in the query string |
| Changes | `POST`, with parameters as a JSON body |
| Responses | JSON, sent with `Cache-Control: private, no-store`. `getAttachment` answers with the file itself |
| Idempotency | Versioned writes name the version replaced; identical retries are safe. Notes reuse client-made IDs and retain settlement receipts. A multi-request tool can partially complete, so reread state before retrying after a failure |
| Authentication | A service token from the member's PDS in `Authorization: Bearer`, or an ohm session. [Identity and access](https://docs.ohmmmm.com/identity.md) |

The access level of each request is one of four.

| Access | Credential |
| --- | --- |
| Public | None. The response contains only public information |
| Any authenticated account | A service token from any PDS, issued for this request |
| Member | A service token from the member's own PDS, or an ohm session connected to that account |
| Member, with an ohm session | An ohm session only. A change must also originate from ohm's own pages |

<a id="posts"></a>

## Posts

Read and change the posts in a vault, one at a time. Every change names the version it replaces, so two edits never overwrite each other unseen.

### `com.ohmmmm.vault.listPosts`

Every post with the version it is at. With `since`, a point an earlier list returned, only what changed after it, removals included.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `since`: optional: the `cursor` of an earlier list |
| Returns | `posts` (id, version, slug, label, sublabel, visibility, title), `cursor`, and `more` when there is another page |

### `com.ohmmmm.vault.getPost`

One post in full, and its version.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `id`: the post's ID |
| Returns | `post`, `version` |

### `com.ohmmmm.vault.putPost`

Saves one post. `replaces` is the version being replaced and is left out for a new post. Sent twice, it ends the same as sent once. Whatever the post says about who may see it, only this copy changes.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `post`: the whole post<br>`replaces`: optional: the version it replaces |
| Returns | `id`, `version`, and `unchanged` when nothing differed |

### `com.ohmmmm.vault.deletePost`

Removes one post, for good.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `id`: the post's ID<br>`replaces`: the version being removed |
| Returns | `id`, `removed` |

<a id="structure"></a>

## Structure

The shape of a vault: its labels, the sublabels inside them, and a line for each post. Enough to draw it or decide where something belongs, without reading any post in full.

### `com.ohmmmm.vault.getTree`

Labels, sublabels, and each post with who may see it, what kind of thing it is, the platform it first appeared on if that was somewhere else, and why it cannot be published, if it cannot.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | None |
| Returns | `posts`, `public`, `friends`, `private` (counts), and `labels`, each with its `posts` and `sublabels` |

<a id="search"></a>

## Search

Find posts by the words in them, at every visibility. A title counts for more than a label, and a label for more than the body.

### `com.ohmmmm.vault.searchPosts`

The posts that mention every word of `q`, best first, each with a passage that shows where.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `q`: the words to look for<br>`visibility`: optional: only posts at this visibility<br>`limit`: optional: how many, 10 unless said, 50 at most |
| Returns | `found`, and `posts` (id, slug, title, label, sublabel, visibility, date, passage) |

<a id="mirror"></a>

## Mirror

Bring what the member has already published on their PDS into the vault. It only reads the PDS, and it never changes a post the member has since changed in the vault.

### `com.ohmmmm.vault.importPublished`

Reads the member's repository and says what it holds as posts: how many, which would differ from what is published, and what could not be kept. With `apply`, saves them. Without it, changes nothing.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `apply`: optional: save the posts<br>`site`: optional: the member's website, when it is not the one their handle names<br>`from`: optional: one older post type to read, when it should not be found<br>`expectedSummary`: optional: the preview summary to require before saving; changed counts or caveats refuse the whole apply |
| Returns | `site`, `types`, `records`, `posts`, `sameAsPublished`, `differs`, `lost`, `cannotBePublishedYet`, `skipped`, `summary`, `applied`; and with `apply`, `saved`, `unchanged`, `changedThere`, `refused` |

<a id="publish"></a>

## Publish

Work out what would have to change in the member's own repository for what is published to match their vault. The service changes nothing there and holds no permission to: the member, signed in at their own PDS, makes the changes from the list. Only the shared post type is touched, and a record the vault knows nothing about is never removed.

### `com.ohmmmm.vault.getPublishPlan`

What publishing would do: the posts it would publish for the first time, replace and take down, the ones that cannot be published and why, and the published records the vault knows nothing about. With `prepare`, also the changes themselves, ready to be made.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `prepare`: optional: `1` to include `writes`, the changes to make |
| Returns | `repository`, `pds`, `collection`, `create`, `replace`, `remove`, `unchanged`, `cannot`, `notInVault`, `changes` (how many); and with `prepare`, `writes` and `plan`, a name for exactly these changes |

### `com.ohmmmm.vault.getAttachment`

One file that one of the member's posts places, fetched from where the post says it is. It answers with the file itself, not JSON. It is for publishing, which sends a copy of each such file to the member's PDS.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `id`: the post's ID<br>`attachment`: the name the post's record places the file under |
| Returns | The file, with its type |

<a id="export"></a>

## Export

The whole vault written out as files a person can keep: each post as Markdown, where it sits in a folder. The same files open in Obsidian, and read back as the same posts.

### `com.ohmmmm.vault.exportFiles`

Every post as a file: its path in a folder, and its text.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | None |
| Returns | `files` (path, text) |

<a id="account"></a>

## Account

For a member signed in to ohm: who they are, and which AT Protocol account their vault is. One ohm account works in one AT Protocol account, and the other way round. These ride on the ohm session only; a token from a PDS does not reach them.

### `com.ohmmmm.account.get`

Who is signed in, the AT Protocol account they connected if they have, and whether what it had published has been brought in.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member, with an ohm session |
| Parameters | None |
| Returns | `user` (name), `did`, `mirrored`, and `service`: who a PDS has to address its token to when the member connects |

### `com.ohmmmm.account.connect`

Ties an AT Protocol account to the ohm account. `token` is one the account's PDS issued for this request and nothing else.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member, with an ohm session |
| Parameters | `token`: a token from the account's PDS, issued for this request |
| Returns | `did`, and `already` when it was connected before |

### `com.ohmmmm.account.disconnect`

Unties the AT Protocol account. The vault is kept, and opens again when the account is connected.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member, with an ohm session |
| Parameters | None |
| Returns | `did`, now empty |

<a id="identity"></a>

## Identity

The first steps of signing in: finding an account from its handle, and saying who a token from a PDS names. Neither touches a vault.

### `com.ohmmmm.identity.findAccount`

Finds an account from what a person types to sign in: their handle, or their DID. Needs no sign-in, and answers only with what is public.

| | |
| --- | --- |
| Method | `GET` |
| Access | Public |
| Parameters | `account`: a handle, such as example.com, or a DID |
| Returns | `did`, `handle`, `pds`, and `service`: this service's own DID |

### `com.ohmmmm.identity.whoAmI`

Says who a token from a PDS names. The token has to be issued for this request and nothing else, so only its holder can ask.

| | |
| --- | --- |
| Method | `GET` |
| Access | Any authenticated account |
| Parameters | None |
| Returns | `did`, and `handle` when the handle points back to the account |

<a id="context"></a>

## Context

The private cortex at session start: always memories in full, an index of the rest, approved skills, enabled tools and work waiting to be settled.

### `com.ohmmmm.cortex.getContext`

Get the three initial memories without inventing identity or preferences. The vault-map entry includes a current, service-derived vault structure beside its editable memory. The version changes with the context.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | None |
| Returns | `always` ({memory, version}, with current `vault` on vault-map), `memories` (name, description, kind), `skills`, `tools`, `notes`, `turns` (waiting count), `version` |

### `com.ohmmmm.cortex.recall`

Not built yet. Prompt recall will use project isolation and a character budget.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `q`: the prompt<br>`project`: optional: the repository<br>`budget`: optional: 1,500 characters unless said |
| Returns | `memories` (name, description, passage), `skills` (name, description), within the budget |

<a id="memory"></a>

## Memory

Private memories for the authenticated member. Every rewrite names the version it replaces and preserves that earlier version.

### `com.ohmmmm.cortex.listMemories`

List memory descriptions and versions, with a stable cursor. With since, include changes and removals.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `since`: optional: an earlier cursor<br>`kind`: optional: person, preference, project or reference |
| Returns | `memories` (name, version, description, kind, writtenBy, when), `cursor`, and optionally `more` |

### `com.ohmmmm.cortex.getMemory`

Read a memory in full. An optional version reads a preserved earlier version; putMemory can restore it with the current replaces value.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `name`: the memory name<br>`version`: optional: a preserved earlier version<br>`history`: optional: 1 to list earlier versions and their authors and times |
| Returns | `memory`, `version`, and with history=1, `earlier` (version, writtenBy, when, replacedAt) |

### `com.ohmmmm.cortex.putMemory`

Save the whole memory, naming the version it replaces. The service sets writtenBy from the authenticated principal and retains its own seen counters. Repeated writes are safe.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `memory`: the whole memory<br>`replaces`: optional: the version it replaces |
| Returns | `name`, `version`, and `unchanged` when nothing differed |

### `com.ohmmmm.cortex.deleteMemory`

Remove a memory, naming its current version. Earlier text remains private in history; the removal is included in the next incremental list.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `name`: the memory name<br>`replaces`: the version being removed |
| Returns | `name`, `removed` |

### `com.ohmmmm.cortex.searchMemories`

Find memories mentioning every word of q. A description counts more than the body. Ties are ordered by name.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `q`: words to find<br>`limit`: optional: 10 unless said, at most 50 |
| Returns | `memories` (name, description, kind, passage), best first |

<a id="notes"></a>

## Notes

Private observations with client-made IDs and immutable explicit settlement receipts. The member’s agent judges; the service makes no model calls.

### `com.ohmmmm.cortex.addNote`

Record one observation without changing memory. The service records the authenticated author and time. Retrying the same ID and content is safe; reusing an ID for different content is refused.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `id`: a client-made ID, at most 200 characters<br>`note`: one nonempty line, at most 500 characters<br>`session`: the originating session, at most 200 characters<br>`project`: optional: repository, at most 2,000 characters |
| Returns | `id` |

### `com.ohmmmm.cortex.listNotes`

List unsettled observations, oldest first. With settled=1, include immutable receipts and kept observations to compare across sessions.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `settled`: optional: 1 or true to include settled notes |
| Returns | `notes` (id, text, session, project, writtenBy, when, and if settled, settledAt and outcome) |

### `com.ohmmmm.cortex.settleNotes`

Atomically record from 1 to 100 explicit outcomes: kept, dropped or a memory name with its current version. Each note is settled once. Memory evidence counts distinct originating sessions and preserves earlier memory versions; retries do not count twice.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `notes`: 1–100 distinct {id, outcome, version?}; a memory outcome requires the current memory version |
| Returns | `settled` (the note IDs acknowledged) |

<a id="turns"></a>

## Turns

Private cortex turns. Not built yet.

### `com.ohmmmm.cortex.addTurns`

This cortex request is not built yet.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `turns`: up to 50 client-identified turns |
| Returns | `kept` |

### `com.ohmmmm.cortex.listTurns`

This cortex request is not built yet.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `limit`: optional: 40 unless said |
| Returns | `turns`, `waiting` |

### `com.ohmmmm.cortex.settleTurns`

This cortex request is not built yet.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `turns`: each turn ID and its outcome |
| Returns | `settled` |

<a id="skills"></a>

## Skills

Private skills with member approval tied to the exact saved version. Supporting files stay inside the skill.

### `com.ohmmmm.cortex.listSkills`

List descriptions and approval state; this index never exposes supporting files or skill instructions.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | None |
| Returns | `skills` (name, version, description, writtenBy, approved) |

### `com.ohmmmm.cortex.getSkill`

Read SKILL.md and supporting text files. A token cannot read an unapproved skill; the linked member can review it in ohm.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | `name`: the skill name |
| Returns | `skill` ({text, files: [{path, text}]}), `version` |

### `com.ohmmmm.cortex.putSkill`

Save SKILL.md with name and description in YAML and optional supporting files. Token-authored changes lose approval; identical retries preserve the current approval.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `skill`: {text, files: [{path, text}]}; name and description are read from SKILL.md<br>`replaces`: optional: the version being replaced |
| Returns | `name`, `version`, `approved`, optionally `unchanged` |

### `com.ohmmmm.cortex.approveSkill`

Approve exactly the named current version from the linked member’s ohm session. A later edit needs new approval.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member, with an ohm session |
| Parameters | `name`: the skill name<br>`version`: exactly the current version to approve |
| Returns | `name`, `approved` |

### `com.ohmmmm.cortex.deleteSkill`

Remove a skill from the linked member’s ohm session, naming its current version. Repeating a completed removal is safe.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member, with an ohm session |
| Parameters | `name`: the skill name<br>`replaces`: the current version |
| Returns | `name`, `removed` |

<a id="tools"></a>

## Tools

The member’s private tool settings and inert proposals. Only an ohm session changes tool settings. Server addresses are metadata; this capability never connects to a server or keeps credentials.

### `com.ohmmmm.cortex.listTools`

List tool settings with versions, and proposals marked proposed and off. Context exposes only enabled tools that are not proposals.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | None |
| Returns | `tools` (name, description, on, address when given, version, proposed, writtenBy; inputs and outputs on proposals) |

### `com.ohmmmm.cortex.putTool`

Save or switch a tool from the linked member’s ohm session, naming the version replaced. A proposal cannot be switched on. No credentials or executable configuration is accepted.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member, with an ohm session |
| Parameters | `tool`: {name, description, on, address?}; optional address is credential-free HTTPS metadata only<br>`replaces`: optional: the version being replaced |
| Returns | `name`, `version`, optionally `unchanged` |

### `com.ohmmmm.cortex.deleteTool`

Remove a tool setting or proposal from the linked member’s ohm session, naming its current version. Repeating a completed removal is safe.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member, with an ohm session |
| Parameters | `name`: the tool name<br>`replaces`: the current version |
| Returns | `name`, `removed` |

### `com.ohmmmm.cortex.proposeTool`

Record a tool to be built, with its inputs and outputs. It is always off and proposed, cannot overwrite a tool, and identical retries keep one proposal.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `tool`: {name, description, inputs, outputs}; inputs and outputs are text |
| Returns | `name`, `proposed`, optionally `unchanged` |

<a id="cortex-export"></a>

## Cortex Export

Private cortex cortex export. Not built yet.

### `com.ohmmmm.cortex.exportFiles`

This cortex request is not built yet.

| | |
| --- | --- |
| Method | `GET` |
| Access | Member |
| Parameters | None |
| Returns | `files` (path, text) |

<a id="errors"></a>

## Errors

A refusal is JSON with an `error` code from the table below and a `message` written to be shown to a person as it is.

| Error | Status | Cause |
| --- | --- | --- |
| `SignInRequired` | 401 | The request rides on an ohm session, and there is none |
| `AccountChanged` | 409 | The authenticated DID differs from X-Ohm-Did, the member displayed by the editor. Reopen before reading or changing content |
| `AuthRequired` | 401 | The token is missing, cannot be read, was issued for another request or service, has run out, or its signature does not match |
| `NotAMember` | 403 | The account has not been let in yet |
| `WrongOrigin` | 403 | A request that changes something came with a session but not from ohm's own pages |
| `NotConnected` | 409 | The ohm account has no AT Protocol account connected yet |
| `AlreadyConnected` | 409 | The ohm account already works in another AT Protocol account |
| `ConnectedElsewhere` | 409 | The AT Protocol account is already connected to another ohm account |
| `SignInUnavailable` | 503 | ohm's sign-in could not be reached to check a session |
| `MethodNotFound` | 404 | There is no such request |
| `WrongMethod` | 405 | The request is the other of GET and POST |
| `InvalidRequest` | 400 | The request is not JSON, or something it says is not what that request takes |
| `InvalidPost` | 400 | The post is not one the vault can hold. The message lists every reason |
| `InvalidMemory` | 400 | The memory is not one the cortex can hold, or its source notes do not belong to this member. The message says why |
| `InvalidSkill` | 400 | The skill or its supporting text files do not fit the cortex rules. The message says why |
| `SkillNotApproved` | 403 | An agent asked for skill instructions whose current version the member has not approved |
| `InvalidTool` | 400 | The tool setting or proposal is not valid. Credentials and executable configuration stay outside the cortex |
| `InvalidCursor` | 400 | `since` is not a value an earlier list returned |
| `NotFound` | 404 | There is no such post, cortex item or saved version |
| `Changed` | 409 | The post or cortex item has changed since the version the request names. The answer carries the current version |
| `SlugTaken` | 409 | Another post in the vault already has that slug |
| `NameTaken` | 409 | A cortex item already has that name; read it and name its version to replace it. A tool proposal cannot replace an existing tool |
| `NotBuiltYet` | 501 | The cortex request is registered and authenticated, but its implementation has not been built yet |
| `TooLarge` | 413 | The post is more than 600 KB of text, or a file it places is empty or larger than 25 MB |
| `FileUnreachable` | 502 | A file a post places could not be fetched from where the post says it is |
| `AccountNotFound` | 404 | No AT Protocol account answers to that handle or DID |
| `NoRepository` | 400 | The account's DID document does not say where its repository is kept |
| `RepositoryUnreachable` | 502 | The account's PDS would not answer |
| `InternalError` | 500 | Something went wrong in the service itself |

<a id="agent-tools"></a>

## Agent tools

An agent's tools are compositions of the requests above and add no capability of their own. Each runs on the member's machine and authenticates as the member, with a service token per request.

| Tool | Effect | Requests used |
| --- | --- | --- |
| `cortex_start` | Read | `com.ohmmmm.cortex.getContext` |
| `cortex_note` | Change | `com.ohmmmm.cortex.addNote` |
| `cortex_settle` | Change | `com.ohmmmm.cortex.listNotes`, `com.ohmmmm.cortex.getMemory`, `com.ohmmmm.cortex.putMemory`, `com.ohmmmm.cortex.settleNotes` |
| `cortex_recall` | Read | `com.ohmmmm.cortex.searchMemories`, `com.ohmmmm.cortex.getMemory` |
| `cortex_remember` | Change | `com.ohmmmm.cortex.getMemory`, `com.ohmmmm.cortex.putMemory` |
| `cortex_forget` | Change | `com.ohmmmm.cortex.getMemory`, `com.ohmmmm.cortex.deleteMemory` |
| `cortex_skill` | Read | `com.ohmmmm.cortex.getSkill` |
| `cortex_propose_skill` | Change | `com.ohmmmm.cortex.getSkill`, `com.ohmmmm.cortex.putSkill` |
| `cortex_propose_tool` | Change | `com.ohmmmm.cortex.proposeTool` |
| `vault_tree` | Read | `getTree` |
| `vault_list` | Read | `getTree` |
| `vault_read` | Read | `getTree`, `getPost` |
| `vault_search` | Read | `searchPosts` |
| `vault_save` | Change | `getTree`, `getPost`, `putPost` |
| `vault_set_visibility` | Change | `getTree`, `getPost`, `putPost` |
| `vault_status` | Read | `getPublishPlan` |
| `vault_publish` | Change | `getPublishPlan`, `getAttachment` |
| `vault_mirror` | Change | `importPublished` |
| `vault_delete` | Change | `getTree`, `getPost`, `deletePost` |

The server that offers these tools is described in [Agent integration](https://docs.ohmmmm.com/mcp.md). Vault tools follow these rules.

1. **A new post is private.** Marking it for anyone else is a separate, confirmed step.
2. **Changes that others can see take two calls.** The first returns what would happen and a `confirm` value bound to exactly that outcome. Only a second call carrying the value proceeds.
3. **A post is changed from the version that was read.** If it has changed since, nothing is saved.

Cortex memory and note writes need no approval queue. Forgetting uses its own single-use confirmation. Agents can propose skills and tools, but approval and tool settings require the linked member's ohm session.

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
