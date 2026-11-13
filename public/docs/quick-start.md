# Quick start

Keep your drafts, published work and agent knowledge connected, while choosing what becomes public. Start by saving one private post; add publishing and an agent when you need them.

## Why the pieces are separate

An idea can become a draft, then a public post. You need somewhere to work on it before it is ready, and a way to publish it without making every draft public. Your vault is that working space. Your own account on the open network holds what you publish.

Your agent also learns how you work. That knowledge belongs in a private cortex beside your posts, so a preference about editing does not become part of your website. [Your cortex](https://docs.ohmmmm.com/cortex.md)

## What you need, and why

An AT Protocol account is your identity on the open network. A Personal Data Server, or PDS, is the server that holds that account's public records. Bluesky hosts accounts too; you can connect one instead of running a server yourself.

| You need | Why | Who sets it up |
| --- | --- | --- |
| An ohm sign-in | Lets the workspace recognize you when you return | You sign in with a supported provider |
| A connected AT Protocol account | Proves which vault and cortex are yours and identifies where public posts belong | You connect your existing account; if you have none, create one first |
| A website | Gives public records a page with your own design | Optional for saving private work; connecting its content is separate work |
| A coding agent | Uses your work as context and carries learning between sessions | Optional; the browser editor works without one |
| A local folder | Gives you a separate copy of your posts | Optional; export or command-line sync when you want one |

Access is restricted while ohm is being tested. These steps describe the implemented workspace; check [Status and limits](https://docs.ohmmmm.com/limits.md) for what remains unverified or unavailable.

## 1. Sign in

Open the workspace and sign in with Google, Microsoft or Bluesky. This identifies you to ohm; it does not share a draft or publish anything. [Sign in](https://docs.ohmmmm.com/sign-in.md)

## 2. Say where your posts live

Connect the account whose posts you want to work on. This connection lets ohm keep the right private workspace behind your sign-in.

- **You have a server of your own.** Enter your handle and an app password from it.
- **You have a website, and no server yet.** ohm shows you how to set one up beside your site, then you come back with your handle.
- **You use Bluesky.** Enter your Bluesky handle. If you signed in with Bluesky, this step is already done.

Supported posts you have already published are brought into your workspace. They stay public; connecting an account does not make a new private post public.

## 3. Look around your workspace

The workspace has three parts.

- **A narrow rail on the left,** with you at the foot of it.
- **Your repository beside it:** your labels as folders, with your posts inside them. Labels are the sections of your work, in your own words: Writings, Photographs, Things I make.
- **The post you have open,** filling the rest.

[More about the workspace](https://docs.ohmmmm.com/workspace.md)

## 4. Write a post

Start a new post and write. A post is Markdown, and it can be one sentence.

Give it a label so you can find it again, and choose Save. You can add a title when it helps; a short thought is enough.

To add a picture, paste the address of one that is already on the web.

A new post is private. Open another post, then return to your draft: seeing your saved words again is the first useful result. You can stop here and keep working privately. [More about posts](https://docs.ohmmmm.com/posts.md)

## 5. Decide who sees it

Every post is one of three things.

- **Private.** Only you.
- **Friends.** Reserved for people you follow who follow you back. Delivery to friends is not implemented yet.
- **Public.** Everyone, on your website and anywhere else your published layer is read.

Changing this does not share anything yet. It marks the post, and a mark on the Publish button shows that something is waiting. [More about who sees a post](https://docs.ohmmmm.com/visibility.md)

## 6. Publish when you want to share

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
