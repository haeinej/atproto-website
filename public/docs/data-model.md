# Data model

The unit of ohm is the post. It exists in three forms that map onto each other exactly: a row in the vault, a `com.ohmmmm.post` record in the member's repository when it is public, and a Markdown file in the member's folder.

## A post in the vault

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | String, 13 characters | Permanent identifier, generated once by whichever client creates the post |
| `slug` | String | The last segment of the post's address. Mutable. Unique within a vault |
| `label`, `sublabel` | String | Where the post is filed, in the author's own words |
| `visibility` | `public`, `friends` or `private` | Who the post is for. A new post is `private` |
| `title`, `subtitle` | String, optional | |
| `date` | Timestamp, optional | When the post is from. A mirrored post keeps its original date |
| `body` | Markdown | As the author wrote it |
| `connect` | List, up to 32 | Other posts or web pages this post follows from |
| `address` | URL, optional | The post's address on the author's site, when it is not the one its label and slug give |
| `source` | Object, optional | Where the post first appeared, if elsewhere: platform, address, and the platform's own ID |
| `site` | Object, optional | Fields of the author's own site, outside the shared schema |
| `properties` | Object | Anything else the author gave it. Stored, and never published |

## Identifiers and versions

| | Form | Purpose |
| --- | --- | --- |
| Post ID | 13 characters that sort by creation time, in the form the AT Protocol uses for record keys | Identity. Renaming or refiling a post does not change it. It is also the record key when the post is published |
| Version | `v` followed by a SHA-256 digest of the post's content | Concurrency control. Every write names the version it replaces. A mismatch is refused with `Changed` and the current version |
| Sequence | A counter per vault, advanced by every change | Incremental sync. `listPosts` with `since` returns only what changed after a cursor, removals included |

A removed post keeps its row with no version, so a client that asks what changed is told that it went.

## The published record

A public post is one record of type `com.ohmmmm.post` in the member's repository, stored under the post's ID. The schema is fixed and the same on every site.

| Field | Type | Meaning |
| --- | --- | --- |
| `body` | String, required | CommonMark with footnotes. `media:ID` as an image destination places an attachment |
| `publishedAt` | Datetime, required | |
| `canonicalUrl` | URI, required | The post's address on the author's website |
| `title`, `subtitle` | String | |
| `updatedAt` | Datetime | When the post last changed after it was published |
| `slug` | String | The last segment of the address |
| `label`, `sublabel` | String | Free-form, as the author named them |
| `form` | String | The kind of object, derived from the content: `writing`, `note`, `image`, `gallery`, `video`, `audio`, `file`, `media`, `link`, `embed`, `quote`, `list`, `code` or `other` |
| `connect` | List of URIs | AT URIs or web addresses of what the post follows from |
| `link` | Object | For a link or embed: the page as it described itself |
| `source` | Object | Where the post first appeared, if not on the author's site |
| `media` | List | Attachments, each with an ID unique within the post |
| `site` | Object | Site-specific data, namespaced by its own `$type` |

`visibility` and `properties` are not part of the record. A post that is not public has no record.

## Attachments

An entry in `media` is an image, a video, an audio recording or a file. Each carries a `file`, which is a blob stored in the member's repository, and may carry `sourceUrl`, the address the original came from.

| Kind | Accepts | Additional fields |
| --- | --- | --- |
| `image` | `image/*` | `alt`, `caption`, `width`, `height` |
| `video` | `video/*` | `poster`, `caption`, `durationMs` |
| `audio` | `audio/*` | `caption`, `durationMs` |
| `file` | `application/*`, `text/*` | `caption` |

In the vault, a post references its attachments by address. The copy in the repository is made when the post is published. [Mirror and publish](https://docs.ohmmmm.com/protocols.md#attachments)

## From vault to record

| In the vault | In the record |
| --- | --- |
| `id` | The record key |
| `label`, `sublabel`, `slug` | The same fields, and `canonicalUrl`: `/posts/<label>/<sublabel>/<slug>` on the member's site, lowercased and hyphenated |
| `date` | `publishedAt`. A post with no date is dated when it is first published and keeps that date |
| The content of `body` | `form`, derived |
| A link to another post | An entry in `connect`, as that post's address. Only a public post can be linked from a published one |
| `visibility`, `properties` | Not published |

## Storage

The vault service stores two tables.

| Table | Key | Holds |
| --- | --- | --- |
| `posts` | Account DID and post ID | The post as JSON, its version and sequence, and indexed copies of the fields the repository tree is drawn from |
| `links` | ohm user ID, with the DID unique | Which AT Protocol account an ohm account works in, and when its published posts were first mirrored |

The database enforces two invariants itself: a slug is used once within a vault, and a write succeeds only against the version it names.

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
