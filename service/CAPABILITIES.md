# What the vault can do

<!-- Written by scripts/capabilities.mjs from service/src/capabilities/ and mcp/tools.mjs. Change those, then run `node scripts/capabilities.mjs --write`. -->

The vault service does a small number of things, and each is kept apart from the others. A **capability** is one of those things: a few requests that belong together, in one file. A **request** is one question or one change. A **tool** is something an agent can decide to do, and every tool is made of requests and nothing else.

This page is the whole list. It is written from the same tables the service and the tools run on, so it cannot say anything they do not do.

## The capabilities

| Capability | What it is for | Requests | Where |
| --- | --- | --- | --- |
| **Posts** | Read and change the posts in a vault, one at a time. Every change names the version it replaces, so two edits never overwrite each other unseen. | `listPosts`, `getPost`, `putPost`, `deletePost` | [posts.mjs](src/capabilities/posts.mjs) |
| **Structure** | The shape of a vault: its labels, the sublabels inside them, and a line for each post. Enough to draw it or decide where something belongs, without reading any post in full. | `getTree` | [structure.mjs](src/capabilities/structure.mjs) |
| **Search** | Find posts by the words in them, at every visibility. A title counts for more than a label, and a label for more than the body. | `searchPosts` | [search.mjs](src/capabilities/search.mjs) |
| **Mirror** | Bring what the member has already published on their PDS into the vault. It only reads the PDS, and it never changes a post the member has since changed in the vault. | `importPublished` | [mirror.mjs](src/capabilities/mirror.mjs) |
| **Export** | The whole vault written out as files a person can keep: each post as Markdown, where it sits in a folder. The same files open in Obsidian, and read back as the same posts. | `exportFiles` | [export.mjs](src/capabilities/export.mjs) |
| **Account** | For a member signed in to ohm: who they are, and which AT Protocol account their vault is. One ohm account works in one AT Protocol account, and the other way round. These ride on the ohm session only; a token from a PDS does not reach them. | `get`, `connect`, `disconnect` | [account.mjs](src/capabilities/account.mjs) |
| **Identity** | The first steps of signing in: finding an account from its handle, and saying who a token from a PDS names. Neither touches a vault. | `findAccount`, `whoAmI` | [identity.mjs](src/capabilities/identity.mjs) |

Nothing here publishes. Saving a post, whatever it says about who may see it, changes only the vault's own copy.

## Asking

A request is sent to `/xrpc/` and its full name, such as `/xrpc/com.ohmmmm.vault.getTree`, at the service's own address or under `/vault` on the app's. One that only reads is a `GET` with what it takes in the address. One that changes something is a `POST` with what it takes as JSON. Every answer is JSON.

Who may ask is one of four things, and each request says which:

| Who | How they are known |
| --- | --- |
| Anyone | Nothing is checked. Everything such a request answers with is already public |
| Whoever holds a token from a PDS | A token the PDS issued for this one request and no other, signed with the key the account's own DID document names |
| The member | Such a token from their own PDS, as the command line and an agent's tools send; or their ohm session, as the editor sends, which is worth exactly the one account it was connected to |
| The member, signed in to ohm | Their ohm session only. A request that changes something must also come from ohm's own pages |

A member's posts are served to that member and nobody else. Who is asking is settled before anything about a vault is looked at.

## Posts

Read and change the posts in a vault, one at a time. Every change names the version it replaces, so two edits never overwrite each other unseen.

### `com.ohmmmm.vault.listPosts`

Every post with the version it is at. With `since`, a point an earlier list returned, only what changed after it, removals included.

| | |
| --- | --- |
| Reads or changes | Reads only (`GET`) |
| Who may ask | The member |
| Takes | `since`: optional: the `cursor` of an earlier list |
| Gives | `posts` (id, version, slug, label, sublabel, visibility, title), `cursor`, and `more` when there is another page |

### `com.ohmmmm.vault.getPost`

One post in full, and its version.

| | |
| --- | --- |
| Reads or changes | Reads only (`GET`) |
| Who may ask | The member |
| Takes | `id`: the post's ID |
| Gives | `post`, `version` |

### `com.ohmmmm.vault.putPost`

Saves one post. `replaces` is the version being replaced and is left out for a new post. Sent twice, it ends the same as sent once. Whatever the post says about who may see it, only this copy changes.

| | |
| --- | --- |
| Reads or changes | Changes (`POST`) |
| Who may ask | The member |
| Takes | `post`: the whole post<br>`replaces`: optional: the version it replaces |
| Gives | `id`, `version`, and `unchanged` when nothing differed |

### `com.ohmmmm.vault.deletePost`

Removes one post, for good.

| | |
| --- | --- |
| Reads or changes | Changes (`POST`) |
| Who may ask | The member |
| Takes | `id`: the post's ID<br>`replaces`: the version being removed |
| Gives | `id`, `removed` |

## Structure

The shape of a vault: its labels, the sublabels inside them, and a line for each post. Enough to draw it or decide where something belongs, without reading any post in full.

### `com.ohmmmm.vault.getTree`

Labels, sublabels, and each post with who may see it, what kind of thing it is, the platform it first appeared on if that was somewhere else, and why it cannot be published, if it cannot.

| | |
| --- | --- |
| Reads or changes | Reads only (`GET`) |
| Who may ask | The member |
| Takes | Nothing |
| Gives | `posts`, `public`, `friends`, `private` (counts), and `labels`, each with its `posts` and `sublabels` |

## Search

Find posts by the words in them, at every visibility. A title counts for more than a label, and a label for more than the body.

### `com.ohmmmm.vault.searchPosts`

The posts that mention every word of `q`, best first, each with a passage that shows where.

| | |
| --- | --- |
| Reads or changes | Reads only (`GET`) |
| Who may ask | The member |
| Takes | `q`: the words to look for<br>`visibility`: optional: only posts at this visibility<br>`limit`: optional: how many, 10 unless said, 50 at most |
| Gives | `found`, and `posts` (id, slug, title, label, sublabel, visibility, date, passage) |

## Mirror

Bring what the member has already published on their PDS into the vault. It only reads the PDS, and it never changes a post the member has since changed in the vault.

### `com.ohmmmm.vault.importPublished`

Reads the member's repository and says what it holds as posts: how many, which would differ from what is published, and what could not be kept. With `apply`, saves them. Without it, changes nothing.

| | |
| --- | --- |
| Reads or changes | Changes (`POST`) |
| Who may ask | The member |
| Takes | `apply`: optional: save the posts<br>`site`: optional: the member's website, when it is not the one their handle names<br>`from`: optional: one older post type to read, when it should not be found |
| Gives | `site`, `types`, `records`, `posts`, `sameAsPublished`, `differs`, `lost`, `cannotBePublishedYet`, `skipped`, `applied`; and with `apply`, `saved`, `unchanged`, `changedThere`, `refused` |

## Export

The whole vault written out as files a person can keep: each post as Markdown, where it sits in a folder. The same files open in Obsidian, and read back as the same posts.

### `com.ohmmmm.vault.exportFiles`

Every post as a file: its path in a folder, and its text.

| | |
| --- | --- |
| Reads or changes | Reads only (`GET`) |
| Who may ask | The member |
| Takes | Nothing |
| Gives | `files` (path, text) |

## Account

For a member signed in to ohm: who they are, and which AT Protocol account their vault is. One ohm account works in one AT Protocol account, and the other way round. These ride on the ohm session only; a token from a PDS does not reach them.

### `com.ohmmmm.account.get`

Who is signed in, the AT Protocol account they connected if they have, and whether what it had published has been brought in.

| | |
| --- | --- |
| Reads or changes | Reads only (`GET`) |
| Who may ask | The member, signed in to ohm |
| Takes | Nothing |
| Gives | `user` (name), `did`, `mirrored`, and `service`: who a PDS has to address its token to when the member connects |

### `com.ohmmmm.account.connect`

Ties an AT Protocol account to the ohm account. `token` is one the account's PDS issued for this request and nothing else.

| | |
| --- | --- |
| Reads or changes | Changes (`POST`) |
| Who may ask | The member, signed in to ohm |
| Takes | `token`: a token from the account's PDS, issued for this request |
| Gives | `did`, and `already` when it was connected before |

### `com.ohmmmm.account.disconnect`

Unties the AT Protocol account. The vault is kept, and opens again when the account is connected.

| | |
| --- | --- |
| Reads or changes | Changes (`POST`) |
| Who may ask | The member, signed in to ohm |
| Takes | Nothing |
| Gives | `did`, now empty |

## Identity

The first steps of signing in: finding an account from its handle, and saying who a token from a PDS names. Neither touches a vault.

### `com.ohmmmm.identity.findAccount`

Finds an account from what a person types to sign in: their handle, or their DID. Needs no sign-in, and answers only with what is public.

| | |
| --- | --- |
| Reads or changes | Reads only (`GET`) |
| Who may ask | Anyone |
| Takes | `account`: a handle, such as example.com, or a DID |
| Gives | `did`, `handle`, `pds`, and `service`: this service's own DID |

### `com.ohmmmm.identity.whoAmI`

Says who a token from a PDS names. The token has to be issued for this request and nothing else, so only its holder can ask.

| | |
| --- | --- |
| Reads or changes | Reads only (`GET`) |
| Who may ask | Whoever holds a token from a PDS |
| Takes | Nothing |
| Gives | `did`, and `handle` when the handle points back to the account |

## When the answer is no

A refusal is JSON with an `error`, which is one of the names below, and a `message` in plain words. The message is written to be shown to a person as it is.

| Error | Status | When |
| --- | --- | --- |
| `SignInRequired` | 401 | The request rides on an ohm session, and there is none |
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
| `InvalidCursor` | 400 | `since` is not a value an earlier list returned |
| `NotFound` | 404 | There is no such post |
| `Changed` | 409 | The post has changed since the version the request names. The answer carries the current version |
| `SlugTaken` | 409 | Another post in the vault already has that slug |
| `TooLarge` | 413 | The post is more than 600 KB of text |
| `AccountNotFound` | 404 | No AT Protocol account answers to that handle or DID |
| `NoRepository` | 400 | The account's DID document does not say where its repository is kept |
| `RepositoryUnreachable` | 502 | The account's PDS would not answer |
| `InternalError` | 500 | Something went wrong in the service itself |

## The tools an agent has

The tools are in [../mcp/tools.mjs](../mcp/tools.mjs), and reach the service as the person, with a token from the person's own PDS for each request ([../scripts/vault-client.mjs](../scripts/vault-client.mjs)). A tool adds no ability of its own: it is a way of asking for the requests beside it.

| Tool | Reads or changes | Made of | What it does |
| --- | --- | --- | --- |
| `vault_tree` | Reads only | `getTree` | The structure of the person's vault: its labels, the sublabels inside them, and each post with who can see it. Start here to learn what the vault holds. |
| `vault_list` | Reads only | `getTree` | List posts, newest first, optionally only those under a label or sublabel, at one visibility, or from one platform. |
| `vault_read` | Reads only | `getTree`, `getPost` | Read one post in full, with its version. The version is needed to save changes to it. |
| `vault_search` | Reads only | `searchPosts` | Search the person's own posts at every visibility, private ones included. Returns the best matches with a passage from each. |
| `vault_save` | Changes | `getTree`, `getPost`, `putPost` | Create a post, or change one that was read. A new post is always private; use vault_set_visibility to mark it for anyone else. To change a post, pass the version vault_read gave; fields left out stay as they are. Changing a post that is not private needs the two calls described in the answer. |
| `vault_set_visibility` | Changes | `getTree`, `getPost`, `putPost` | Change who a post is for: public (everyone), friends, or private (only the person). The post itself does not change. Always takes two calls. |
| `vault_mirror` | Changes | `importPublished` | Bring what the person has already published on their PDS into the vault. Always takes two calls: the first only looks, and says what is there, what would differ from what is published, and what could not be kept; the second, with the confirm value, brings the posts in. It only reads the PDS, never publishes, and never changes a post the person has since changed in the vault. Posts that come with no label land under "other" and want filing. |
| `vault_delete` | Changes | `getTree`, `getPost`, `deletePost` | Remove a post for good. Always takes two calls. |

Three rules hold for every tool that changes something:

1. A new post is always private.
2. Changing a post that is not private, changing who a post is for, bringing posts in from the PDS, and removing a post each take two calls. The first answers with what would happen and a `confirm` value; only a second call carrying that value does it.
3. A post is changed from the version that was read. If it has changed since, the tool says so and nothing is saved.

### Requests with no tool

An agent cannot ask for these. They are for the editor, for the command line, or for signing in.

| Request | Capability | Why it has no tool |
| --- | --- | --- |
| `listPosts` | Posts | It is for keeping a copy in step: every post's version, and what changed since. The tools read the structure instead |
| `exportFiles` | Export | The command line and the editor write the vault out. An agent reads posts one at a time |
| `get` | Account | It rides on an ohm session, which an agent does not have |
| `connect` | Account | It rides on an ohm session, which an agent does not have |
| `disconnect` | Account | It rides on an ohm session, which an agent does not have |
| `findAccount` | Identity | It is part of signing in |
| `whoAmI` | Identity | It is part of signing in |

## Not here yet

Publishing from the vault, attachments held by the vault, earlier versions of a post and bringing a removed one back, and a key a person can give an agent and take away again. Until there is such a key, an agent signs in with an app password from the person's PDS.
