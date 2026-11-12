# Service API

The vault service exposes fifteen requests in eight capabilities. This reference is generated from the same tables the service runs on.

## Conventions

The vault service speaks XRPC, the request convention of the AT Protocol. Every request has a namespaced name and is sent to `/xrpc/` followed by that name.

| | |
| --- | --- |
| Base addresses | `https://vault.ohmmmm.com`, and `https://app.ohmmmm.com/vault` for the workspace, where the ohm session cookie is in scope |
| Reads | `GET`, with parameters in the query string |
| Changes | `POST`, with parameters as a JSON body |
| Responses | JSON, sent with `Cache-Control: private, no-store`. `getAttachment` answers with the file itself |
| Idempotency | Every request can be repeated safely. A change names the version it replaces, and a repeat of a change already made reports `unchanged` |
| Authentication | A service token from the member's PDS in `Authorization: Bearer`, or an ohm session. [Identity and access](https://docs.ohmmmm.com/identity.md) |

The access level of each request is one of four.

| Access | Credential |
| --- | --- |
| Public | None. The response contains only public information |
| Any authenticated account | A service token from any PDS, issued for this request |
| Member | A service token from the member's own PDS, or an ohm session connected to that account |
| Member, with an ohm session | An ohm session only. A change must also originate from ohm's own pages |

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

## Mirror

Bring what the member has already published on their PDS into the vault. It only reads the PDS, and it never changes a post the member has since changed in the vault.

### `com.ohmmmm.vault.importPublished`

Reads the member's repository and says what it holds as posts: how many, which would differ from what is published, and what could not be kept. With `apply`, saves them. Without it, changes nothing.

| | |
| --- | --- |
| Method | `POST` |
| Access | Member |
| Parameters | `apply`: optional: save the posts<br>`site`: optional: the member's website, when it is not the one their handle names<br>`from`: optional: one older post type to read, when it should not be found |
| Returns | `site`, `types`, `records`, `posts`, `sameAsPublished`, `differs`, `lost`, `cannotBePublishedYet`, `skipped`, `applied`; and with `apply`, `saved`, `unchanged`, `changedThere`, `refused` |

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

## Errors

A refusal is JSON with an `error` code from the table below and a `message` written to be shown to a person as it is.

| Error | Status | Cause |
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
| `TooLarge` | 413 | The post is more than 600 KB of text, or a file it places is empty or larger than 25 MB |
| `FileUnreachable` | 502 | A file a post places could not be fetched from where the post says it is |
| `AccountNotFound` | 404 | No AT Protocol account answers to that handle or DID |
| `NoRepository` | 400 | The account's DID document does not say where its repository is kept |
| `RepositoryUnreachable` | 502 | The account's PDS would not answer |
| `InternalError` | 500 | Something went wrong in the service itself |

## Agent tools

An agent's tools are compositions of the requests above and add no capability of their own. Each runs on the member's machine and authenticates as the member, with a service token per request.

| Tool | Effect | Requests used |
| --- | --- | --- |
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

The server that offers these tools is described in [Agent integration](https://docs.ohmmmm.com/mcp.md). Three rules hold for every tool that changes something.

1. **A new post is private.** Marking it for anyone else is a separate, confirmed step.
2. **Changes that others can see take two calls.** The first returns what would happen and a `confirm` value bound to exactly that outcome. Only a second call carrying the value proceeds.
3. **A post is changed from the version that was read.** If it has changed since, nothing is saved.

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
