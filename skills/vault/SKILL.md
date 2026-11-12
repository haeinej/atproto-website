---
name: vault
description: How to work in a person's vault with the ohm-vault tools - reading, searching, saving and editing their posts, and changing who one is for. Use whenever someone asks what they have written about something, wants a post saved or changed, or wants a post made public, shared with friends, or made private.
---

# Working in a vault

A vault is everything a person has written and made, in one structure: labels (the sections of their site), sublabels inside them (a series, an album), and posts inside those. The `ohm-vault` tools work in ohm's working copy of the person's vault, the same one the editor shows, as the person: each request carries a token from their own PDS.

## Who a post is for

| Visibility | Who it is for |
| --- | --- |
| `public` | Everyone |
| `friends` | The people they follow who follow them back. There is no network for friends yet, so for now only the person |
| `private` | Only the person |

The post is the same post at every visibility. Changing visibility marks it; it does not rewrite it.

**Saving never publishes.** A post marked `public` is in the vault, meant for everyone. It reaches the person's website and other applications only when they publish, which is a step of its own and not one of these tools. Do not tell the person something is live because it is marked public.

## The rules

1. **Private posts are the person's alone.** You can read them, and they are often the best guide to what the person is thinking. Never put anything from a private post into something other people can see, such as a public post, a message, or a commit, unless the person tells you to use that passage.
2. **New posts are private.** `vault_save` always creates a private post. Marking it for anyone else is a separate step the person asks for.
3. **Two calls for anything other people are meant to see.** `vault_set_visibility`, `vault_delete`, and `vault_save` on a post that is not private first answer with what would happen and a `confirm` value. Show the person that answer in plain words: which post, and who it is for. Call again with the `confirm` value only when they agree.
4. **Read before you change.** `vault_read` gives a post's version, and `vault_save` needs it to change the post. If the save is refused because the post changed, read it again and redo the change on the new text; do not retry with the old text.
5. **Use the person's own labels.** Look at `vault_tree` before filing a new post, and file it under a label they already use. Ask before inventing a new label.
6. **Never choose a form.** What kind of thing a post is, is identified from its content.

## A post

A post is named by its slug, which is the last part of its address, or by its ID. The ID never changes; the slug is an ordinary field, and `vault_save` with `slug` gives a post a new one. A picture or a file is placed in the body by its address, `![description](https://…)`: the vault holds no files of its own.

A post that first appeared somewhere else says where, as its `platform`. `vault_list` with `platform` lists those, and with `platform: "own"` the ones that first appeared nowhere else.

## Common requests

| The person says | Do |
| --- | --- |
| "What have I written about X?" | `vault_search`, then `vault_read` the posts that matter. Say which are private |
| "Save this" | `vault_tree` for the labels, then `vault_save` with a short slug. Tell them it is private |
| "Change that post" | `vault_read`, then `vault_save` with the version and only the fields that change |
| "File this under Y" | `vault_read`, then `vault_save` with the version and the new `label` or `sublabel` |
| "Make it public" | `vault_set_visibility` to `public`: show what it answers, then confirm. Say that it is marked for everyone and not yet published |
| "Take that down" | `vault_set_visibility` to `private` |

## Setting up

The tools use the same site configuration as the commands, found in the folder you are working in (`ohm-content-layer.jsonc`), and need `ATPROTO_APP_PASSWORD` set, to sign in to the person's PDS. What each tool asks the vault service for is listed in `service/CAPABILITIES.md`.
