# Status and limits

The implementation status of each part of ohm, what cannot be undone, and what ohm is not.

## Implementation status

| Area | Status | Notes |
| --- | --- | --- |
| Sign-in with Google, Microsoft or Bluesky | Implemented | In production. Sign-in with Bluesky is not yet verified end to end |
| Connecting a self-hosted PDS | Implemented | In production |
| Connecting a Bluesky account | Implemented | Not yet verified end to end |
| Accounts hosted by ohm | Planned | |
| Access | Restricted | An allow list of accounts during testing |
| Workspace | Implemented | Repository tree, three views, filter, editor |
| Mirror | Implemented | Runs automatically when an account is first connected |
| Publishing public posts | Implemented | Verified against a test PDS. Not yet run against a live account |
| Friends-only delivery | Planned | |
| Attachments stored by ohm | Planned | A post references files by address, and a copy is made at publish |
| Agent tools | Implemented | Not yet verified with a live sign-in |
| Folder sync | Implemented | Command line, local folders |
| Sync from the workspace, and with cloud storage | Planned | |
| Deleting ohm's copy | Manual | Carried out on request |
| Agent keys | Planned | Until then an agent signs in with an app password from the member's PDS |
| Finding people | Planned | |

## Anything you publish is public for good

A public post on the AT Protocol is copied by other services the moment it is written. Taking a post down removes it from your website, not from every copy.

## Your agent reads your private posts

That is how it knows what you are working on. Whichever company runs the model your agent uses sees what it reads.

## ohm can read your private posts

Your workspace includes them, and ohm holds your workspace. ohm shows private posts to nobody. Connect a folder and nothing depends on ohm keeping them.

## What ohm is not

- **Not a place to build an audience.** There is no count of followers to grow and no feed built to keep you scrolling.
- **Not a replacement for talking to people.** The agent's job ends at the introduction.
- **Not only an editor.** The editor is what you see. The working copy under it, and your say over where each post goes, are the point.
- **Not a vault we cannot read.** The working copy includes your private posts, and we can read it.
- **Not a Bluesky competitor.** Your account, your follows and your public posts are part of the same network.

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
