# Sync with a folder

Connect a folder of your own and your posts live there as Markdown files. Sync brings the folder and your workspace into line, in both directions.

## Why connect a folder

Your workspace is a working copy. With a folder connected, the originals of your private and friends-only posts are files you hold, on your own machine or in the cloud storage you already use.

- You can open and edit them in any Markdown editor, such as Obsidian.
- Deleting ohm's copy loses nothing: syncing from the folder brings every post back.

Until you connect a folder, ohm holds the only copy of your private and friends-only posts, and the workspace says so.

## Connect one

Choose a folder, connect it, and press Sync. The first sync writes every post into it, filed in folders named for your labels. [How posts look as files](https://docs.ohmmmm.com/files.md)

The folder can be on your computer, or in any cloud storage that keeps a folder in sync.

## What Sync does

Sync compares each post in your workspace with its file, and with what was there at the last sync.

| In your folder | In your workspace | Sync does |
| --- | --- | --- |
| A new or changed file | Unchanged since the last sync | Updates your workspace |
| Unchanged since the last sync | A new or changed post | Writes it to your folder |
| Changed | Changed differently | Overwrites neither. See below |
| A file removed | The post is still there | Asks you before removing the post |

## When both sides changed

If you edited a post in your folder and in your workspace since the last sync, neither version is overwritten. Sync puts ohm's version beside your file under a name that says so, reports it, and you choose which one stands.

## Sync never publishes

An edit you make to a public post's file arrives in your workspace as a change that is not published yet. Readers see it after you publish.

Writing `visibility: public` in a file only marks the post. It becomes public when you press Publish.

## What you do in the folder, and what Sync makes of it

| In your folder | Sync reads it as |
| --- | --- |
| A new file | A new post. Its slug is the file name, and it is private unless the file says otherwise |
| A file moved to another folder | The post refiled under another label. For a published post this changes its address, which Publish shows first |
| A file renamed | The same post with a new slug. For a published post, the old address sends readers on |
| A file deleted | A post to ask you about |
| `[[another note]]` and `![[image.png]]` | A link to that post, and a picture. They are kept in the file as you wrote them |
| Properties edited in Obsidian's own panel | The post's properties |

## What Sync leaves alone

- **Files that are not posts.** Your editor's own settings and anything else in the folder stay yours and are not sent.
- **How you formatted a file.** Sync compares posts, not characters. A file you laid out differently is the same post, and it is rewritten only when the post itself changed in your workspace.
- **A file that cannot be read as a post.** It is reported to you by name, and nothing is sent.

## If a sync is interrupted

Run it again. A sync can be repeated safely, and it picks up where things stand.

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
