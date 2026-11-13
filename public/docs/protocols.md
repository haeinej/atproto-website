# Mirror and publish

Two exchanges connect a vault to its member's repository. Mirror reads what is published into the vault. Publish makes what is published match the vault. The service reads the repository in both, and writes to it in neither.

## Mirror

Mirror brings what a member has already published into their vault. It needs no credential at the PDS, because a repository's records are public.

1. **Locate.** The service takes the PDS address from the member's DID document and the website from their handle.
2. **Discover.** It lists the repository's collections and keeps the shared type, `com.ohmmmm.post`, and any type of the member's own whose records read as posts: a body and a publication date. Protocol and Bluesky types are not examined.
3. **Read.** It reads every record of those types. Where a post exists in both an older type and the shared one, the shared one is kept.
4. **Report.** It returns what it found before saving anything: the number of posts, which would differ from what is published, what could not be carried over, and what was skipped.
5. **Apply.** On request, it saves the posts. Each save is conditional on the post's version, so a post the member has since changed in the vault is never overwritten.

Mirror runs once automatically when an account is first connected, and on demand afterwards. Mirrored posts are already public and remain public. Nothing new is shared.

## Publish

Publish is split between the service, which computes a plan, and the member's device, which carries it out.

Diagram: the sequence of a publish.
1. Member's device → Vault service: getPublishPlan
2. Vault service → Member's PDS: listRecords
3. Vault service → Member's device: Plan and its writes (response)
4. Member's device: The member approves
5. Member's device → Member's PDS: createSession
6. Member's device → Vault service: getAttachment
7. Member's device → Member's PDS: uploadBlob
8. Member's device → Member's PDS: applyWrites
9. Member's device → Member's PDS: deleteSession

1. **Plan.** The device requests `getPublishPlan` with `prepare`. The service compares every post in the vault with the records of the shared type in the repository.
2. **Read.** The service reads those records from the PDS with `listRecords`. This is its only contact with the PDS.
3. **Return.** The plan lists what would be created, replaced and removed, what cannot be published and why, and the writes themselves. It is named by a digest of those writes.
4. **Approve.** The member reviews the plan. Nothing has changed at this point.
5. **Sign in.** The device signs in at the member's PDS, with an app password or through OAuth.
6. **Fetch.** For each attachment the PDS does not hold, the device obtains the file through `getAttachment`.
7. **Upload.** The device stores each file in the repository with `uploadBlob`.
8. **Write.** The device applies the changes with `applyWrites`.
9. **Sign out.** The PDS session is ended.

The code that carries out a plan is the same in the workspace and in an agent's tools, so a post published from either is the same record.

## Plan rules

Three rules keep the plan safe in a repository that other software also writes to.

1. **Only the shared post type is touched.** A record of any other type is not examined.
2. **A record is removed only if it is known to be a post of this vault:** one that is no longer public, or one the member removed. A record the vault does not know is left in place and reported.
3. **A post that cannot be published is reported with the reason,** and whatever is published of it stays as it is.

| Category | Meaning |
| --- | --- |
| `create` | Public in the vault, absent from the repository |
| `replace` | Public in the vault, and different from the record. The plan names the fields that differ |
| `remove` | Published, and now private, friends-only or removed from the vault |
| `unchanged` | Identical to the record |
| `cannot` | Public in the vault, but not valid as a record. The reasons are listed |
| `notInVault` | Published under the shared type, and unknown to the vault |

## Attachments

A post in the vault references its files by address. Publishing gives the repository a copy of each.

- **A file the member's PDS already holds** is referenced by its content ID. The service confirms its type and size with a `HEAD` request and nothing is uploaded.
- **Any other file** is fetched for the device by the service, because a page in a browser cannot read a file from another site. The service fetches only addresses that one of the member's own posts places, over HTTPS, up to 25 MB.
- **The original address** is recorded with the copy as `sourceUrl`.

A file that cannot be fetched stops that post from publishing and is reported. Other posts are unaffected.

## Consistency and consent

- **Writes are atomic.** `applyWrites` applies a batch entirely or not at all. A plan is sent as one batch up to 200 changes.
- **Approval is bound to the plan.** The plan's name is a digest of its writes. An agent's confirmation carries that name, so approval of one plan cannot be used for another.
- **Publishing is repeatable.** A plan is computed from current state each time. Running it again after a partial failure produces only the changes still outstanding.
- **Records keep their keys.** A record is stored under the post's permanent ID. A record published before posts had IDs is moved to its ID in the same batch that removes the old one.

## Consequences

- ohm cannot publish, edit or remove anything in a member's repository on its own, including in response to a fault or a compromise of the service.
- Nothing is published in the background. Every publish begins with the member present and signed in at their PDS.
- A published post is public from the moment it is written. Removing it removes the record, not copies that other services have made.

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
