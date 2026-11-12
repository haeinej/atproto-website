---
name: vault
description: How to work in a person's vault with the ohm-vault tools - reading, searching, saving and editing their notes, and changing who can see one. Use whenever someone asks what they have written about something, wants a note saved or changed, or wants a note made public, shared with friends, or made private.
---

# Working in a vault

A vault is everything a person has written and made, in one structure: labels (the sections of their site), sublabels inside them (a series, an album), and notes inside those. The `ohm-vault` tools read and write it on the person's own machine, with their own credentials.

## Who can see a note

| Visibility | Who reads it |
| --- | --- |
| `public` | Everyone. It is on their website |
| `friends` | The people they follow who follow them back. There is no network for friends yet, so for now only the person |
| `private` | Only the person |

The note is the same note at every visibility. Changing visibility moves it; it does not rewrite it.

## The rules

1. **Private notes are the person's alone.** You can read them, and they are often the best guide to what the person is thinking. Never put anything from a private note into something other people can see, such as a public note, a message, or a commit, unless the person tells you to use that passage.
2. **New notes are private.** `vault_save` always creates a private note. Showing it to anyone is a separate step the person asks for.
3. **Two calls for anything other people would notice.** `vault_set_visibility`, `vault_delete`, and `vault_save` on a note that is not private first answer with what would happen and a `confirm` value. Show the person that answer in plain words: which note, who will be able to read it, and its address. Call again with `confirm` only when they say yes. Do not ask for a general go-ahead in advance.
4. **Read before you change.** `vault_read` gives a note's version, and `vault_save` needs it to change the note. If the save is refused because the note changed, read it again and redo the change on the new text; do not retry with the old text.
5. **Use the person's own labels.** Look at `vault_tree` before filing a new note, and file it under a label they already use. Ask before inventing a new label.
6. **Never choose a form.** What kind of thing a note is, is identified from its content.

## Common requests

| The person says | Do |
| --- | --- |
| "What have I written about X?" | `vault_search`, then `vault_read` the notes that matter. Say which are private |
| "Save this" | `vault_tree` for the labels, then `vault_save` with a short slug. Tell them it is private |
| "Change that note" | `vault_read`, then `vault_save` with the version and only the fields that change |
| "Publish it" / "make it public" | `vault_set_visibility` to `public`: show what it answers, then confirm |
| "Take that down" | `vault_set_visibility` to `private`. Tell them copies others already made stay where they are |

## Setting up

The tools use the same site configuration as the commands, found in the folder you are working in (`ohm-content-layer.jsonc`). Making a note public needs `ATPROTO_APP_PASSWORD` set. Private and friends-only notes need the site's own store set up; if a tool says there is none, see "Keep a post private" in the project's `README.md`.
