# Where your things live

Public posts live in your AT Protocol repository. ohm keeps your working vault and private cortex. Post sync can keep a copy with you; cortex export is still planned.

<a id="places"></a>

## The places

| | What is there | Whose it is |
| --- | --- | --- |
| Your account on the open network | Your public posts, and your identity | Yours. It is hosted by Bluesky or on a server you run, and it can be moved |
| Your ohm account | Who you are when you sign in to ohm | Made with Google, Microsoft or Bluesky. It holds no posts |
| Your folder, once synced | Your posts as Markdown files | Yours, on your machine or in locally synced storage |
| Your vault on ohm | A working copy of every post | ohm holds it for you |
| Your cortex on ohm | Memories, history, observations, skills and tool settings | Private to your connected DID; not included in post sync or export |

<a id="by-visibility"></a>

## By who can see the post

| | The original | ohm's working copy | Who ohm shows it to |
| --- | --- | --- | --- |
| Public | Your account, in the open | Yes | The vault API serves only you; published records are public at your PDS |
| Friends | Your folder, once connected | Yes | Only you for now; friends-only delivery is planned |
| Private | Your folder, once connected | Yes | Only you |

<a id="reads"></a>

## What ohm can read

Everything in your workspace, private posts included. An editor and an agent need the whole of your work to be useful, so ohm holds all of it.

- ohm shows your private posts to nobody.
- ohm does not use your private posts to match you with other people.
- A private post is never written to your account on the open network. Everything there can be read by anyone.

The promise is not that ohm cannot read your posts. It is that nothing depends on ohm keeping them.

<a id="folder"></a>

## With and without a folder

With an up-to-date synced folder, you have a copy of your posts. Until you sync or export, ohm may hold the only copy of private and friends-only posts. [Sync with a folder](https://docs.ohmmmm.com/sync.md)

Your cortex is separate. Post files do not back it up, and removing a memory from Context preserves its history. A complete cortex export and folder adapter remain planned. [Your cortex](https://docs.ohmmmm.com/cortex.md)

<a id="identity"></a>

## Your identity

Your identity is your own. It is an AT Protocol account, and its name can be your domain. Your follows are kept there too. [Sign in](https://docs.ohmmmm.com/sign-in.md#identity)

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
