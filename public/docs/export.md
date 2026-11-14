# Export and leaving

You can export your vault posts as Markdown files. Cortex export is not built yet, so a vault export is not a backup of everything your agent remembers.

<a id="what"></a>

## What you get

Every post: private, friends-only and public. Attachments remain references to their addresses; ohm does not yet keep a file store to include in an export.

Memories, memory history, observations, skills and tool settings are separate cortex data and are not included. Keep that distinction in mind before deleting anything. [Your cortex](https://docs.ohmmmm.com/cortex.md)

<a id="format"></a>

## The format

The post contents use the same Markdown format as command-line Sync. A folder export opens directly in Obsidian or another Markdown editor. The single-file download is a JSON container of file paths and Markdown text, rather than a ZIP archive or one combined Markdown document. [Posts as files](https://docs.ohmmmm.com/files.md)

<a id="how"></a>

## How to export

From the menu under your picture, at the foot of the rail.

- **Into a folder,** on your computer. Chrome and Edge can do this. Choose it when you want readable Markdown files immediately.
- **As one file,** downloaded as `ohm-vault.json`. Choose it when your browser cannot write into a folder, or you want to keep the whole response in one file.

Open the chosen folder or download to check that your posts are present before deleting anything. Neither choice includes your cortex.

If you already sync, your folder is your export, as of the last sync.

<a id="deleting"></a>

## Deleting ohm's copy

You can ask for everything ohm holds for you to be deleted. This is a manual request, not a self-service delete-all operation.

| | After ohm's copy is deleted |
| --- | --- |
| Public posts | Still in your own account, and still on your website |
| Private and friends-only posts | In your folder, if you connected one or exported first. Otherwise gone |
| Cortex | Not covered by the post export. A complete cortex export is still planned |
| Your account and your handle | Unchanged. They were never ohm's |

Export first if you have not connected a folder. Until you do one or the other, ohm holds the only copy of your private and friends-only posts.

<a id="back"></a>

## Coming back

Use command-line Sync with your exported Markdown folder and connected account to bring posts back. Browser folder sync and an import wizard for the JSON download are not built. This restores posts, not cortex knowledge. [Sync with a folder](https://docs.ohmmmm.com/sync.md)

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
