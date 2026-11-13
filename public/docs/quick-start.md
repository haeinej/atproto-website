# Quick start

Start with your posts, then open the private cortex your agent uses to remember your work. Publishing, folder sync and connecting an agent are separate steps.

## 1. Sign in

Sign in or sign up with Google, Microsoft or Bluesky. That makes your ohm account. [More about signing in](https://docs.ohmmmm.com/sign-in.md)

## 2. Say where your posts live

Your posts belong to an account on the open network, not to ohm. Once, you say which one.

- **You have a server of your own.** Enter your handle and an app password from it.
- **You have a website, and no server yet.** ohm shows you how to set one up beside your site, then you come back with your handle.
- **You use Bluesky.** Enter your Bluesky handle. If you signed in with Bluesky, this step is already done.

What you have already published there is brought into your workspace on its own.

## 3. Look around your workspace

The workspace has three parts.

- **A narrow rail on the left,** with you at the foot of it.
- **Your repository beside it:** your labels as folders, with your posts inside them. Labels are the sections of your work, in your own words: Writings, Photographs, Things I make.
- **The post you have open,** filling the rest.

[More about the workspace](https://docs.ohmmmm.com/workspace.md)

## 4. Write a post

Start a new post and write. A post is Markdown, and it can be one sentence.

You do not say what kind of thing it is. A post with a title is a writing, one without is a note, and one that only shows a photograph is an image. ohm reads that from the post.

To add a picture, paste the address of one that is already on the web.

A new post is private. Nobody else can see it. [More about posts](https://docs.ohmmmm.com/posts.md)

## 5. Decide who sees it

Every post is one of three things.

- **Private.** Only you.
- **Friends.** Reserved for people you follow who follow you back. Delivery to friends is not implemented yet.
- **Public.** Everyone, on your website and anywhere else your published layer is read.

Changing this does not share anything yet. It marks the post, and a mark on the Publish button shows that something is waiting. [More about who sees a post](https://docs.ohmmmm.com/visibility.md)

## 6. Publish

Press Publish. Before anything happens, you see exactly what will change: which posts will be published for the first time, replaced, or taken down. Then you approve at your own server, and it is done.

A public post is now part of your published layer. Anything published is public for good: other services copy it the moment it is written. Taking it down later removes it from your account, not from every copy. [More about publishing](https://docs.ohmmmm.com/publish.md)

## 7. Keep a copy of your posts

Export your vault, or use the command-line folder sync. Each post becomes a Markdown file, filed under its label. Browser folder sync and direct cloud-storage connections are planned.

Syncing never publishes. It currently covers posts, not your cortex; cortex export is still planned. [More about syncing](https://docs.ohmmmm.com/sync.md)

## 8. Bring in your agent

Connect the coding agent you already use, and it can read and write in your workspace. It reads your private posts too, which is how it knows what you are working on.

Ask it to start with your cortex. It reads standing memories and descriptions, then recalls the detail it needs. Automatic session hooks are not installed by connecting the MCP tools.

Anything that changes what other people see is shown to you first, publishing included. [More about your agent](https://docs.ohmmmm.com/agent.md)

## 9. See what your agent remembers

Open Cortex in the rail. Memories, Notes and Skills are separate from your posts. You can edit a memory, inspect its earlier versions, restore one, and review an agent's proposed skill before approving it.

Your cortex stays private. Publish does not read it. [Your cortex](https://docs.ohmmmm.com/cortex.md)

## Things to ask your agent first

- "What have I written about this before?"
- "Save this as a private note under Writings."
- "Look at my posts and suggest how to label them."
- "What is not published yet?"

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
