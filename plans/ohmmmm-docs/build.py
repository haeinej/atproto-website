"""Builds docs.ohmmmm.com, and puts the site header on every page of the ohmmmm.com draft.

    python3 plans/ohmmmm-docs/build.py

The docs' words are in this file: GROUPS sets the sidebar and the order of pages, and each doc()
call below is one page, written in a small Markdown (## headings with {#ids}, lists, tables,
code blocks, **bold**, `code`, [links](/docs/page#section)). Edit here, run, and commit what changes.

It writes, in this folder: index.html, one .html per page, 404.html, sitemap.xml and robots.txt.
It does not write styles.css, reader.js, _headers, wrangler.jsonc or assets/, which are edited by
hand. In ../ohmmmm-home it replaces each page's sidebar (the "Site shell" block: the dot, About, Docs)
and keeps the company directory on index.html only.

The live ohmmmm.com is built from another repository (ohm, website/public) and is not touched here.
Deploy the docs from this folder: npx wrangler deploy --profile ohm"""
import html
import re
from pathlib import Path

docs_site = Path(__file__).resolve().parent
site = docs_site.parent / "ohmmmm-home"
DOCS_ORIGIN = "https://docs.ohmmmm.com"
HOME_ORIGIN = "https://ohmmmm.com"

# ---------------------------------------------------------------- content

GROUPS = [
    ("Get started", ["quick-start", "sign-in"]),
    ("Your workspace", ["workspace", "posts", "labels"]),
    ("Sharing", ["visibility", "publish", "friends"]),
    ("Your folder", ["sync", "files", "export"]),
    ("Your agent", ["agent", "finding-people"]),
    ("Before you rely on it", ["where-things-live", "limits"]),
]

PAGES = {}


def doc(slug, title, intro, body, note=None, nav=None):
    PAGES[slug] = dict(title=title, nav=nav or title, intro=intro, note=note, body=body)


# On every page: ohm is still being made, and these pages say how it is meant to work.
ALERT = "ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product."

doc("quick-start", "Quick start",
    "Your first session in ohm: sign in, say where your posts live, write a post, decide who sees it, and publish. Then connect a folder of your own and bring in your agent.",
    body="""
## 1. Sign in {#sign-in}
Sign in or sign up with Google, Microsoft or Bluesky. That makes your ohm account. [More about signing in](/docs/sign-in)

## 2. Say where your posts live {#where}
Your posts belong to an account on the open network, not to ohm. Once, you say which one.
- **You have a server of your own.** Enter your handle and an app password from it.
- **You have a website, and no server yet.** ohm shows you how to set one up beside your site, then you come back with your handle.
- **You use Bluesky.** Enter your Bluesky handle. If you signed in with Bluesky, this step is already done.
What you have already published there is brought into your workspace on its own.

## 3. Look around your workspace {#workspace}
The workspace has three parts.
- **A narrow rail on the left,** with you at the foot of it.
- **Your repository beside it:** your labels as folders, with your posts inside them. Labels are the sections of your work, in your own words: Writings, Photographs, Things I make.
- **The post you have open,** filling the rest.
[More about the workspace](/docs/workspace)

## 4. Write a post {#write}
Start a new post and write. A post is Markdown, and it can be one sentence.
You do not say what kind of thing it is. A post with a title is a writing, one without is a note, and one that only shows a photograph is an image. ohm reads that from the post.
To add a picture, paste the address of one that is already on the web.
A new post is private. Nobody else can see it. [More about posts](/docs/posts)

## 5. Decide who sees it {#who}
Every post is one of three things.
- **Private.** Only you.
- **Friends.** The people you follow who follow you back.
- **Public.** Everyone, on your website and anywhere else your published layer is read.
Changing this does not share anything yet. It marks the post, and a mark on the Publish button shows that something is waiting. [More about who sees a post](/docs/visibility)

## 6. Publish {#publish}
Press Publish. Before anything happens, you see exactly what will change: which posts will be published for the first time, replaced, or taken down. Then you approve at your own server, and it is done.
A public post is now part of your published layer. Anything published is public for good: other services copy it the moment it is written. Taking it down later removes it from your account, not from every copy. [More about publishing](/docs/publish)

## 7. Connect a folder of your own {#folder}
Connect a folder on your computer and sync. Each post appears there as a Markdown file, filed in a folder named for its label.
From then on your originals live with you, and ohm holds a working copy. Edit a file in the folder and sync, and the change arrives in your workspace. Syncing never publishes.
Until you connect a folder, ohm holds the only copy of your private and friends-only posts. [More about syncing](/docs/sync)

## 8. Bring in your agent {#agent}
Connect the coding agent you already use, and it can read and write in your workspace. It reads your private posts too, which is how it knows what you are working on.
Anything that changes what other people see is shown to you first, publishing included. [More about your agent](/docs/agent)

## Things to ask your agent first {#next}
- "What have I written about this before?"
- "Save this as a private note under Writings."
- "Look at my posts and suggest how to label them."
- "What is not published yet?"
""")

doc("sign-in", "Sign in",
    "You sign in to ohm with an ohm account, made with Google, Microsoft or Bluesky. Your posts belong to an account on the open network, the same kind Bluesky uses, and you say once which one is yours.",
    body="""
## Two steps {#steps}
1. **Sign in or sign up.** With Google, Microsoft or Bluesky. This is your ohm account: it is who is at the keyboard.
2. **Say where your posts live,** once. This is your account on the open network: it is where your published posts are kept, and it is yours whether or not you use ohm.
If you sign in with Bluesky, the second step is already answered: your Bluesky account is where your posts live.

## Where your posts live {#where}
| You have | What you do | What comes with you |
| --- | --- | --- |
| A server of your own | Enter your handle and an app password | What you have already published there |
| A website, and no server yet | Set one up beside your site, then enter your handle | Nothing yet |
| A Bluesky account | Enter your Bluesky handle and an app password | Your own posts. Replies and reposts are not brought in |
All three give you the same workspace. They differ only in where your account is hosted.
Someone with none of these cannot go further today. An account that ohm hosts for you is planned.

## Proving the account is yours {#proof}
ohm never takes your word for which account is yours. The server that holds the account says so.
- **With an app password,** typed on ohm's own page. An app password is one you make for apps, and can take away at any time. It goes from the page straight to your own server and nowhere else: not to ohm.
- **With a passkey,** at your server's own screen. You are sent there, approve, and are brought straight back.
Either way the sign-in at your server is let go as soon as ohm knows the account is yours. What stays is your ohm session.

## Your handle and your identity {#identity}
Your handle is your name on the open network and the address of your site. It can be a domain you own.
Behind the handle is a permanent identifier that does not change when the handle does. It names the server that hosts your account, so you can move the account to another host and keep your posts, your followers and your name.

## What you see the first time {#first}
What you have already published is brought into your workspace on its own. Nothing has to be named: ohm finds your website from your handle, and reads every post you have published, including ones written before the shared post type.
What comes in is already public, and it stays public. Nothing new is shared by signing in.
A post that comes in with no label sits under `other` until you file it.

## One account, one account {#one}
An ohm account works in one account on the open network, and that account belongs to one ohm account. If you sign in with Bluesky after connecting the same Bluesky account another way, you arrive in the same place.

## Leaving {#leaving}
You can take everything out and have ohm's copy deleted at any time. Your account on the open network and your published posts stay where they are hosted. [Export and leaving](/docs/export)
""")

doc("workspace", "The workspace",
    "The workspace is one page: a narrow rail, your repository beside it, and the post you have open filling the rest.",
    body="""
## Your repository, in the side panel {#tree}
The side panel is everything you have, as folders that open and close.
- A **label** is a section of your work, in your own words.
- A **sublabel** is a group inside a label, such as a series or an album.
- **Posts** sit inside those, private, friends-only and public together. A small mark beside each says who it is for.
A post you have not filed sits under `other`. [Labels](/docs/labels)

## Three ways to look at it {#views}
Pills at the top of the side panel choose what the folders are.
| View | The folders are |
| --- | --- |
| Labels | Your own sections |
| Platforms | Where each post first appeared: your website, or somewhere else such as Bluesky |
| Visibility | Everyone, friends, only you |
A filter beside them leaves out any label, platform or audience you do not want to see. Your choice is kept for next time.

## The post, in the main screen {#editor}
The main screen is where you write. A post is Markdown, so a heading, a list, a link and a picture are all written as text.
Above the text are the title and what files the post: its label, sublabel, slug and date. Who can see it is beside Save.
What you write is saved to your workspace. Saving shares nothing: a post reaches other people only when you publish it.

## What a post says about itself {#properties}
| Property | What it is |
| --- | --- |
| Title | Optional. A post with a title is a writing; one without is a note |
| Date | When the post is from. A post that was brought in keeps its original date |
| Label and sublabel | Where the post is filed |
| Slug | The last part of the post's address. You can change it |
| Who can see it | Private, friends or public |
A post also has an ID that is given once and never changes. Renaming or refiling a post does not change which post it is.

## Publish {#buttons}
The Publish button is at the top of the side panel. A mark on it means something is waiting: a post you marked public, a published post you edited, or one you made private or removed.
Pressing it shows what would change, and changes nothing until you approve. [Publish](/docs/publish)

## Bringing in what is new {#mirror}
The arrows beside Publish read your account on the open network again and bring in anything published there since. A post you have changed in your workspace is never overwritten by this.

## When two things edit the same post {#saving}
You, your agent and a sync can all change a post. Every save says which version it replaces. If the post changed in the meantime, the save is refused and you are shown the current version, so nothing is silently overwritten.

## You {#you}
Your picture is at the foot of the rail. Its menu takes your whole vault away as files, disconnects your account on the open network, and signs you out.
""")

doc("posts", "Posts",
    "Everything you keep in ohm is a post: an essay, a note to yourself, a photograph, a link. A post is a piece of Markdown with a date, and it can be one sentence.",
    body="""
## What a post has {#parts}
- **A body,** in Markdown.
- **A date.**
- **A title and a subtitle,** if you give them.
- **A label,** and a sublabel if you use one. [Labels](/docs/labels)
- **Who can see it.** A new post is private. [Who sees a post](/docs/visibility)
- **Pictures and files** placed in the body.

## You do not choose what kind it is {#forms}
ohm reads what kind of thing a post is from the post. It is not shown on your site. It tells other software what it is looking at, whatever you called the section it sits in.
| What the post contains | Read as |
| --- | --- |
| A title, with text and anything placed in the text | writing |
| No title: a thought, a caption with a photo | note |
| Only one image | image |
| Only images, more than one | gallery |
| Only video | video |
| Only audio | audio |
| Only files, such as a PDF | file |
| Only attachments, of more than one kind | media |
| No title, and a link on a line of its own | link |
| The same, when the link plays something, such as a video page | embed |
| No title, a quoted passage, and a link to its source | quote |
| Nothing but a list | list |
| Nothing but code blocks | code |
So two posts under different labels can be the same kind, and one label can hold several kinds.

## Pictures and files {#attachments}
Paste the address of a picture or file that is already on the web.
- **Your workspace keeps the address, not the file.** A post points at its pictures where they are.
- **When you publish, a copy is sent to your own account.** The published post then no longer depends on the other site staying up.
- **The original address is kept** with the copy, as its source.
- **An address that cannot be fetched is named** when you publish: one that needs a sign-in, or a file larger than 25 MB.
Dropping a file in from your computer, and ohm keeping its own copy of each file, are planned.
An attachment is an image, a video, audio, or a file such as a PDF, EPUB, ZIP, CSV or text file.
Describe a picture in its alt text. In a post with no words of its own, that description is also what names the post in lists.

## Links {#links}
A link on a line of its own, in a post with no title, makes the post a link. ohm saves what the page says about itself: its title, description and preview image.
A link that points straight at a picture, a video, an audio file or a document is taken in as that thing. A photograph is an image whether you upload it or point at it.
| The whole post is | What is kept | Read as |
| --- | --- | --- |
| A link to a photograph | The photograph, with the link as its source | image |
| A link to a PDF | The PDF, with the link as its source | file |
| A link to a video page | The link, with the page's title and preview | embed |
| A link to an article | The link, with the page's title and preview | link |
| A sentence, then a link to a photograph | The sentence and the link | link |

## Connecting posts {#connections}
A link from one post to another is a connection. Use it for a reply, a follow-up, or the next part of a series. A post can connect to as many as 32 others.
A public post that connects to a private one does not show the private post's title, or that it exists, to anyone who cannot read it.

## A post's address {#address}
A post's address is built from where it is filed and its slug.
```
/posts/writings/collisions/trap-of-independency
       label    sublabel   slug
```
- **Change the slug** and the address changes. For a published post, the old address sends readers on to the new one.
- **Move the post to another label** and the address changes too. Publish shows you the new address before it does anything.
- **A slug is used once** in your workspace.

## Deleting a post {#deleting}
Deleting a private post removes it from your workspace. With a folder connected, the next Sync asks before removing the file.
Deleting a post that is published removes it from your site at the next Publish. Copies that other services already made stay where they are.
""")

doc("labels", "Labels",
    "Labels are the sections of your work, in your own words. Every post sits under one label, and the post's address comes from it.",
    body="""
## Labels are your sections {#labels}
A label is whatever you call a part of your work: `Writings`, `Photographs`, `Things I make`. Another person might have `Blog`, `Journal` and `Field recordings`.
- A label can be any words, in any language, with any capitalisation.
- ohm never renames a label or makes one up for you.
- Each label becomes a list on your site, and a folder when you sync.

## Sublabels are groups inside a label {#sublabels}
Use a sublabel when several posts are parts of one thing: the essays of a series, the photographs from one city.
| On your site | Label | Sublabel |
| --- | --- | --- |
| Writings → the Collisions essays → one essay | `Writings` | `Collisions` |
| Writings → an essay on its own | `Writings` | |
| Photographs → Seoul | `Photographs` | `Seoul` |
Most posts have no sublabel. Inside a sublabel, posts read in the order they were written.

## The address follows the label {#address}
| Label | Sublabel | Address |
| --- | --- | --- |
| `Writings` | `Collisions` | `/posts/writings/collisions/trap-of-independency` |
| `Writings` | | `/posts/writings/elsewheren` |
| `Photographs` | `서울` | `/posts/photographs/서울/…` |
| `Things I make` | | `/posts/things-i-make/why-i-started-ohm` |
| none | | `/posts/other/a-stray-note` |
Names are lowercased and their spaces become hyphens. Letters of any script are kept.
Each label and sublabel has an address of its own, such as `/posts/writings/`, which lists what is in it.

## Moving a post {#moving}
Refiling a post under another label changes its address. Nothing changes for readers until you publish, and Publish shows the new address first.

## Posts with no label {#other}
A post you have not filed sits under `other`. It is a last resort, not a section: file the post when you know where it belongs.

## Not sure what your labels should be {#suggest}
Ask your agent: "Look at my posts and suggest how to label them." It starts from a plain default, `Writing`, `Photos` and `Projects`, and asks you questions until the structure is yours. The names are always your decision. [Your agent](/docs/agent)
""")

doc("visibility", "Who sees a post",
    "Every post is private, for friends, or public. You choose for each post, and you can change your mind in any direction.",
    body="""
## The three choices {#three}
| | Who can read it | Where it is published |
| --- | --- | --- |
| Private | Only you | Nowhere |
| Friends | The people you follow who follow you back | Nowhere outside ohm |
| Public | Everyone | Your own account on the open network, and your website |
A new post is private. A post that comes in from a folder is private unless its file says otherwise.

## Changing it only marks the post {#marks}
Setting a post to friends or public does not share it. It marks the post, and the Publish button shows that something is waiting. A public post reaches other people when you press Publish and approve. [Publish](/docs/publish)

## Friends {#friends}
A friend is someone you follow who follows you back. There is no separate request to approve: following back is the approval. [Friends](/docs/friends)

## Making a post less visible {#narrowing}
You can move a public post back to friends or private, and a friends post back to private. At the next Publish it is removed from where it was.
That is not a recall. Copies of a public post that other services made stay where they are, and a friend who already read a post has read it.

## What private means {#private}
Private means private from other people. Two things still read a private post.
- **ohm.** Your workspace holds every post, so ohm can read it. ohm shows your private posts to nobody and does not use them to match you with other people.
- **Your agent,** if you connect one, and therefore the company that runs the model it uses.
[Where your things live](/docs/where-things-live)
""")

doc("publish", "Publish",
    "Publish makes what other people see match your workspace. It is the only thing in ohm that shares anything, and it always shows you what will change first.",
    note="Publishing public posts is built. Serving friends-only posts to friends is not.",
    body="""
## Before you publish {#status}
A mark on the Publish button means something is waiting: posts you marked public, published posts you edited, and published posts you made private or removed.

## The steps {#steps}
1. **You see the changes.** What will be published for the first time, what will be replaced and why, and what will be taken down.
2. **You approve at your own server.** With an app password typed on ohm's page, or with a passkey at your server's own screen.
3. **The changes are made,** all of them or none.

## Who makes the changes {#who}
You do. ohm works out what would change, and holds no standing permission to write to your account. The changes are made from your browser, or by your agent, signed in at your own server for as long as publishing takes and no longer.

## What Publish does to each post {#does}
| Your workspace says | Published now | Publish does |
| --- | --- | --- |
| Public | Nothing | Publishes it to your account, with a copy of each picture it places |
| Public | An older version | Replaces it |
| Friends or private, or the post is removed | A public post | Takes it down |
| The same as what is published | | Nothing |
| Public, but something stops it | Anything | Nothing. The post is named with the reason, and what is published stays as it is |
Editing a published post does not change what readers see. They see the last version you published until you publish again.

## What Publish never touches {#safe}
- **Anything that is not a post.** Only the shared post type in your account is ever written or removed.
- **A published post your workspace does not know.** Something published from elsewhere is left where it is and named, so you can bring it in first.
- **Your folder.** Sync does not publish, and Publish does not sync.

## Where a public post goes {#where}
A public post is written to your own account on the AT Protocol, in the repository that belongs to your identity. It is not kept on a platform of ours.
- **Your website can show it.** A site can be a view of what is in that repository.
- **Other applications can read it.** Every public post has the same shape on every site, so other software can find and read it.
- **You can move it.** The repository goes with your account to another host.

## Public is for good {#for-good}
Other services copy a public post the moment it is written. Making it private later removes it from your account. It does not remove it from every copy. You are told this each time, before you approve.

## Addresses {#addresses}
A post's record is kept under its permanent ID, so renaming or refiling a post changes its address without making it a different post. The old address sending readers on to the new one is planned.

## What is not built {#not}
- **Friends.** A post marked for friends is not shown to anyone else yet. [Friends](/docs/friends)
- **A preview** of a post as it will appear.
- **Holding a copy of each file in your workspace.** Today a copy is made when you publish.
""")

doc("friends", "Friends",
    "A friend is someone you follow who follows you back. Friends can read the posts you mark for friends, and you can read theirs.",
    note="Friends reading each other's posts is not built yet. This is how it is planned to work.",
    body="""
## Following {#following}
Following someone on ohm is the same follow that Bluesky uses, kept in your own account. Someone you follow on Bluesky is followed here, and following someone here shows on Bluesky.
Following a person brings their public posts to you.

## Becoming friends {#mutual}
When someone you follow follows you back, you are friends. There is no request to accept. The follow-back button says what it grants before you press it.

## What friends can read {#read}
- Your posts marked **friends**, in the version you last published.
- Your **public** posts, like everyone else.
They never see your private posts, or a friends post you have edited and not published again.
Only people on ohm can read friends posts at all.

## The first time you share with friends {#first}
You may have followed people on Bluesky long before friends posts existed. Before your first friends post is shared, you see the list of people who would be able to read it, and you can remove anyone from it.

## Ending a friendship {#ending}
If either of you unfollows, the friendship ends at once. That cuts access from then on. It does not take back what was already read.

## What is visible to others {#graph}
Who follows whom is public, as it is on Bluesky. That is what lets an agent see a route to someone: you do not know her, but a friend of yours does.
""")

doc("sync", "Sync with a folder",
    "Connect a folder of your own and your posts live there as Markdown files. Sync brings the folder and your workspace into line, in both directions.",
    note="Sync is built for a folder on your computer, from the command line. It is not in the workspace yet, and cloud storage comes after.",
    body="""
## Why connect a folder {#why}
Your workspace is a working copy. With a folder connected, the originals of your private and friends-only posts are files you hold, on your own machine or in the cloud storage you already use.
- You can open and edit them in any Markdown editor, such as Obsidian.
- Deleting ohm's copy loses nothing: syncing from the folder brings every post back.
Until you connect a folder, ohm holds the only copy of your private and friends-only posts, and the workspace says so.

## Connect one {#connect}
Choose a folder, connect it, and press Sync. The first sync writes every post into it, filed in folders named for your labels. [How posts look as files](/docs/files)
The folder can be on your computer, or in any cloud storage that keeps a folder in sync.

## What Sync does {#does}
Sync compares each post in your workspace with its file, and with what was there at the last sync.
| In your folder | In your workspace | Sync does |
| --- | --- | --- |
| A new or changed file | Unchanged since the last sync | Updates your workspace |
| Unchanged since the last sync | A new or changed post | Writes it to your folder |
| Changed | Changed differently | Overwrites neither. See below |
| A file removed | The post is still there | Asks you before removing the post |

## When both sides changed {#conflict}
If you edited a post in your folder and in your workspace since the last sync, neither version is overwritten. Sync puts ohm's version beside your file under a name that says so, reports it, and you choose which one stands.

## Sync never publishes {#never}
An edit you make to a public post's file arrives in your workspace as a change that is not published yet. Readers see it after you publish.
Writing `visibility: public` in a file only marks the post. It becomes public when you press Publish.

## What you do in the folder, and what Sync makes of it {#obsidian}
| In your folder | Sync reads it as |
| --- | --- |
| A new file | A new post. Its slug is the file name, and it is private unless the file says otherwise |
| A file moved to another folder | The post refiled under another label. For a published post this changes its address, which Publish shows first |
| A file renamed | The same post with a new slug. For a published post, the old address sends readers on |
| A file deleted | A post to ask you about |
| `[[another note]]` and `![[image.png]]` | A link to that post, and a picture. They are kept in the file as you wrote them |
| Properties edited in Obsidian's own panel | The post's properties |

## What Sync leaves alone {#leaves}
- **Files that are not posts.** Your editor's own settings and anything else in the folder stay yours and are not sent.
- **How you formatted a file.** Sync compares posts, not characters. A file you laid out differently is the same post, and it is rewritten only when the post itself changed in your workspace.
- **A file that cannot be read as a post.** It is reported to you by name, and nothing is sent.

## If a sync is interrupted {#interrupted}
Run it again. A sync can be repeated safely, and it picks up where things stand.
""")

doc("files", "Posts as files",
    "In your folder, each post is one Markdown file. A label is a folder, a sublabel is a folder inside it, and everything else about the post is written at the top of the file.",
    note="The file format below is built, and is what writing your vault out gives you.",
    body="""
## The folder {#folder}
```
vault/
├── writings/
│   ├── collisions/
│   │   └── trap-of-independency.md
│   └── why-i-started-ohm.md
├── photographs/
│   └── lisboa/
│       └── lisboa-12.md
└── loose-thought.md              no folder: filed under other
```

## One file {#file}
```
---
title: Trap of independency
date: 2026-03-01
visibility: public
---

The body, in Markdown.

![The author](https://example.com/media/author.webp)
```
The part between the two lines of dashes holds the post's properties, as plain YAML. Obsidian shows it in its own properties panel, and you can edit it there.

## What maps to what {#mapping}
| In the file | In your workspace |
| --- | --- |
| The folder | The label |
| The folder inside it | The sublabel |
| The file name | The slug |
| `title`, `subtitle`, `date` | The same |
| `visibility` | Who can see it. A file with none is private |
| A picture or file placed by its address or path | An attachment |
| A link to another post | A connection |
| Any other property | Kept with the post, and never published |
Each file also carries the post's permanent ID as a property. Leave it as it is: it is how a renamed or moved file is known to be the same post.

## Links and pictures {#links}
Both ways of writing them are read, and each file keeps whichever it was written in.
| | Standard Markdown | Obsidian |
| --- | --- | --- |
| A link to another post | `[the first essay](first-essay.md)` | `[[first-essay]]` |
| A picture | `![A wet street](street.jpg)` | `![[street.jpg]]` |

## Nothing is lost on the way {#exact}
A post written out as a file and read back is the same post. That holds for titles and text in any script, and for text that YAML would otherwise misread.
""")

doc("export", "Export and leaving",
    "You can take everything out of ohm at any time, and have ohm's copy deleted.",
    body="""
## What you get {#what}
Every post, private, friends-only and public, and every picture and file ohm kept for them.

## The format {#format}
An export is the same folder of Markdown files that Sync uses. There is one format, not two. It opens in Obsidian or any other Markdown editor, and it can be connected and synced again later. [Posts as files](/docs/files)

## How to export {#how}
From the menu under your picture, at the foot of the rail.
- **Into a folder,** on your computer. Chrome and Edge can do this.
- **As one file,** downloaded.
If you already sync, your folder is your export, as of the last sync.
Deleting ohm's copy on request is not built yet: ask, and it is done by hand.

## Deleting ohm's copy {#deleting}
You can ask for everything ohm holds for you to be deleted.
| | After ohm's copy is deleted |
| --- | --- |
| Public posts | Still in your own account, and still on your website |
| Private and friends-only posts | In your folder, if you connected one or exported first. Otherwise gone |
| Your account and your handle | Unchanged. They were never ohm's |
Export first if you have not connected a folder. Until you do one or the other, ohm holds the only copy of your private and friends-only posts.

## Coming back {#back}
Sign in, connect the same folder, and sync. Every post comes back as it was.
""")

doc("agent", "Your agent",
    "Connect the coding agent you already use, and it can read and write in your workspace. It reads everything, private posts included, which is how it knows what you are working on.",
    note="The agent's tools are built. They sign in with an app password from your own server.",
    nav="Connect your agent",
    body="""
## What it is {#what}
ohm does not run an agent for you. Your agent is the one you already use, given a set of tools for your workspace. It works only while you are in a session with it.
The tools work in the same workspace you see in the browser. A post your agent saves is there when you open it.

## What it can read {#reads}
All of your posts: public, friends and private. That is the point. An agent that only saw what you published would know the polished part.
Whatever your agent reads is also seen by the company that runs the model it uses. Keep that in mind before you connect one.

## What it can do, and what needs your yes {#does}
| | Alone | Only after showing you |
| --- | --- | --- |
| Look at your repository, list and read your posts | Yes | |
| Search your posts | Yes | |
| Say what is not published yet | Yes | |
| Save a new post, as private | Yes | |
| Edit a private post | Yes | |
| Edit a post that is not private | | Yes: it shows what changes |
| Change who a post is for | | Yes |
| Bring in what you have published | | Yes: it looks first, and says what it found |
| Publish | | Yes: it shows what will change, and waits |
| Remove a post | | Yes |
The rule behind the table: reading is free, and anything that changes what other people see, or removes something, is shown to you first. The first answer says exactly what would happen. Only your yes to that exact answer does it.

## The tools {#tools}
| Tool | What it does |
| --- | --- |
| `vault_tree` | Your repository: labels, sublabels, and each post with who it is for |
| `vault_list`, `vault_read` | List posts, and read one in full |
| `vault_search` | Find posts by the words in them |
| `vault_save` | Make a post, always private, or change one |
| `vault_set_visibility` | Mark a post public, for friends, or private |
| `vault_status` | What publishing would change |
| `vault_publish` | Publish |
| `vault_mirror` | Bring in what you have published |
| `vault_delete` | Remove a post |
A tool has no ability of its own. Each is a way of asking ohm for something the workspace can already do.

## Signing in {#sign-in}
Your agent signs in to your own server with an app password, and your server vouches for each thing it asks ohm. A key made only for an agent, which reaches your workspace and nothing else and can be taken away, is planned.

## Other people's writing is not trusted {#safety}
The same agent reads your private posts and other people's posts. Someone could write a post meant to make an agent give something away. The protection is in the tools, not in the agent's judgement: no tool sends anything out without showing you first.

## Things to ask it {#ask}
- "What have I written about this before?"
- "Save this as a private note under Writings."
- "Look at my posts and suggest how to label them."
- "Bring in my posts." Then: "File the ones under other."
- "Make that one public." Then: "Publish."
- "What is not published yet?"

## Not built yet {#not}
- **Sync** from your agent. It runs from the command line.
- **Following, and drafting an email to someone.** [Finding people](/docs/finding-people)

## Editing alongside it {#together}
You and your agent can work in the same workspace at once. Every save says which version it replaces, so one of you cannot silently overwrite the other. [The workspace](/docs/workspace#saving)
""")

doc("finding-people", "Finding people",
    "When you are stuck on something that needs another person, your agent helps you find that person. What it can settle alone, it settles. For everything else, it takes you to someone.",
    note="Finding people is not built yet. This is how it is planned to work.",
    body="""
## When a person is what you need {#kinds}
| You need | That is |
| --- | --- |
| Advice | Someone who has lived the situation |
| Feedback | An honest reaction to something you made |
| An introduction | A route to a specific person, or kind of person |
| A collaborator | Someone to build it with |
Before it looks for anyone, your agent checks whether it can settle the matter from your own posts or from what it knows. If it can, it does, and nobody is asked.

## Where it looks {#where}
1. **Your friends' posts,** public and friends-only.
2. **Public posts further out,** from people you do not know.
3. **If nobody fits,** it drafts a need for you to post.

## How it chooses {#ranks}
1. **Evidence.** A post showing they have lived or thought about exactly this. The suggestion links to it.
2. **Closeness.** A friend, then a friend of a friend, then a stranger.
3. **Whether they are likely to say yes,** and what you can offer in return.
4. **Timing.** Whether it is what they are thinking about now.
You are shown one person and the reason, not a list to work through.

## Reaching out {#email}
There is no messenger to learn. Your agent drafts the first email with you, and it opens in your own email. You read it, change it, and send it yourself. The conversation is between the two of you.

## Posting a need {#need}
A need is a short post that says you are looking for someone. It is for friends or for everyone, and it is open until you mark it resolved. Your agent shows you the exact text and who will see it before it is posted.

## Being found {#found}
You also hear when you are the person someone else is looking for. Your agent passes on only the asks that fit, with the reason they fit.

## What it never does {#never}
- It does not hold the conversation for you.
- It does not use your private posts to match you with strangers.
- It does not send anything you have not read.
""")

doc("where-things-live", "Where your things live",
    "ohm keeps a working copy of your posts, private ones included, so that you and your agent can work from anywhere. Your originals live with you.",
    body="""
## Three places {#places}
| | What is there | Whose it is |
| --- | --- | --- |
| Your account on the open network | Your public posts, and your identity | Yours. It is hosted by Bluesky or on a server you run, and it can be moved. Hosting by ohm is planned |
| Your ohm account | Who you are when you sign in to ohm | Made with Google, Microsoft or Bluesky. It holds no posts |
| Your folder | Every post that is not public, as Markdown files | Yours, on your machine or in your own cloud storage |
| Your workspace on ohm | A working copy of all of it | ohm holds it for you |

## By who can see the post {#by-visibility}
| | The original | ohm's working copy | Who ohm shows it to |
| --- | --- | --- | --- |
| Public | Your account, in the open | Yes | Everyone |
| Friends | Your folder, once connected | Yes | You, and your friends |
| Private | Your folder, once connected | Yes | Only you |

## What ohm can read {#reads}
Everything in your workspace, private posts included. An editor and an agent need the whole of your work to be useful, so ohm holds all of it.
- ohm shows your private posts to nobody.
- ohm does not use your private posts to match you with other people.
- A private post is never written to your account on the open network. Everything there can be read by anyone.
The promise is not that ohm cannot read your posts. It is that nothing depends on ohm keeping them.

## With and without a folder {#folder}
With a folder connected, deleting ohm's copy loses nothing. Until you connect one, ohm holds the only copy of your private and friends-only posts. [Sync with a folder](/docs/sync)

## Your identity {#identity}
Your identity is your own. It is an AT Protocol account, and its name can be your domain. Your follows are kept there too. [Sign in](/docs/sign-in#identity)
""")

doc("limits", "What to know first",
    "ohm is early. This page says what is built, what cannot be undone, and what ohm is not.",
    body="""
## It is early {#early}
| Part | Where it stands |
| --- | --- |
| Signing in with Google, Microsoft or Bluesky | Built. One person has used it |
| Saying where your posts live, with a server of your own | Built, and used |
| The same, with a Bluesky account | Built. Nobody has finished one yet |
| An account that ohm hosts for you | Not built yet |
| Who is let in | One account, while it is tested |
| The workspace in the browser | Built: your repository, three views and a filter, writing and filing posts |
| Bringing in what you have published | Built. It runs on its own the first time |
| Publishing public posts | Built, and tested against a stand-in server. Not yet run against a real account |
| Showing friends-only posts to friends | Not built yet |
| Pictures and files kept by ohm | Not built yet. A post points at them, and a copy is made when you publish |
| Your agent working in the workspace | Built. Not yet run with a real sign-in |
| Syncing with a folder on your computer | Built, from the command line |
| Syncing from the workspace, and with cloud storage | Later |
| Deleting everything ohm holds for you | By hand, on request |
| Your agent finding people | Not built yet |

## Anything you publish is public for good {#for-good}
A public post on the AT Protocol is copied by other services the moment it is written. Taking a post down removes it from your website, not from every copy.

## Your agent reads your private posts {#agent}
That is how it knows what you are working on. Whichever company runs the model your agent uses sees what it reads.

## ohm can read your private posts {#ohm}
Your workspace includes them, and ohm holds your workspace. ohm shows private posts to nobody. Connect a folder and nothing depends on ohm keeping them.

## What ohm is not {#not}
- **Not a place to build an audience.** There is no count of followers to grow and no feed built to keep you scrolling.
- **Not a replacement for talking to people.** The agent's job ends at the introduction.
- **Not only an editor.** The editor is what you see. The working copy under it, and your say over where each post goes, are the point.
- **Not a vault we cannot read.** The working copy includes your private posts, and we can read it.
- **Not a Bluesky competitor.** Your account, your follows and your public posts are part of the same network.
""")

# ---------------------------------------------------------------- markup

ORDER = [slug for _, slugs in GROUPS for slug in slugs]
assert set(ORDER) == set(PAGES), set(ORDER) ^ set(PAGES)
GROUP_OF = {slug: name for name, slugs in GROUPS for slug in slugs}


def inline(text):
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!!)\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text.replace("&amp;", "&")


def inline_code_safe(text):
    """`code` first, so brackets and bangs inside code are not read as links."""
    parts = re.split(r"(`[^`]+`)", text)
    return "".join(
        f"<code>{html.escape(p[1:-1], quote=False)}</code>" if p.startswith("`") and p.endswith("`") and len(p) > 2
        else inline(p)
        for p in parts
    )


def blocks(lines, indent):
    pad = " " * indent
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
        elif line.startswith("```"):
            j = i + 1
            while not lines[j].startswith("```"):
                j += 1
            out.append(f"{pad}<pre>{html.escape(chr(10).join(lines[i + 1:j]), quote=False)}</pre>")
            i = j + 1
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, body = rows[0], rows[2:]
            t = [f'{pad}<div class="table">', f"{pad}  <table>", f"{pad}    <thead>",
                 f"{pad}      <tr>" + "".join(f"<th>{inline_code_safe(c)}</th>" if c else "<td></td>" for c in head) + "</tr>",
                 f"{pad}    </thead>", f"{pad}    <tbody>"]
            for row in body:
                cells = "".join(
                    (f'<th scope="row">{inline_code_safe(c)}</th>' if n == 0 else f"<td>{inline_code_safe(c)}</td>")
                    for n, c in enumerate(row)
                )
                t.append(f"{pad}      <tr>{cells}</tr>")
            t += [f"{pad}    </tbody>", f"{pad}  </table>", f"{pad}</div>"]
            out.append("\n".join(t))
        elif line.startswith("- ") or re.match(r"\d+\. ", line):
            ordered = not line.startswith("- ")
            pattern = r"\d+\. " if ordered else r"- "
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines) and re.match(pattern, lines[i]):
                items.append(re.sub("^" + pattern, "", lines[i]))
                i += 1
            out.append(f"{pad}<{tag}>\n" + "\n".join(f"{pad}  <li>{inline_code_safe(x)}</li>" for x in items) + f"\n{pad}</{tag}>")
        else:
            out.append(f"{pad}<p>{inline_code_safe(line)}</p>")
            i += 1
    return "\n".join(out)


def sections(body):
    """→ [(id, heading, html)]"""
    result = []
    for chunk in re.split(r"\n(?=## )", body.strip()):
        first, *rest = chunk.split("\n")
        match = re.match(r"## (.+?) \{#([\w-]+)\}$", first)
        assert match, first
        result.append((match.group(2), match.group(1), blocks(rest, 10)))
    return result


def href(slug):
    return "/" if slug == "index" else f"/{slug}"


def gid(name):
    return re.sub(r"[^a-z]+", "-", name.lower()).strip("-")


def local(text):
    """The content was written with /docs/... links; on its own site the docs start at /."""
    return (text.replace('href="/docs/', 'href="/').replace('href="/docs#', 'href="/#')
                .replace('href="/docs"', 'href="/"'))


# Icons are Lucide (lucide.dev, ISC licence), drawn as DESIGN.md sets them: 18px, stroke 2.25, round.
def icon(*shapes):
    return ('<svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" '
            'stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + "".join(shapes) + "</svg>")


ARROW_LEFT = icon('<path d="m12 19-7-7 7-7"/>', '<path d="M19 12H5"/>')
ARROW_RIGHT = icon('<path d="M5 12h14"/>', '<path d="m12 5 7 7-7 7"/>')
MENU = icon('<path d="M4 12h16"/>', '<path d="M4 6h16"/>', '<path d="M4 18h16"/>')


# ---------------------------------------------------------------- docs.ohmmmm.com

def docs_sidebar(current):
    here = ' aria-current="page"' if current == "index" else ""
    out = ['    <nav class="site-sidebar" aria-label="Docs">', "      <ul>", f'        <li><a href="/"{here}>Docs</a></li>', "      </ul>"]
    for name, slugs in GROUPS:
        out.append(f'      <p class="sidebar-group">{name}</p>')
        out.append("      <ul>")
        for slug in slugs:
            mark = ' aria-current="page"' if slug == current else ""
            out.append(f'        <li><a href="{href(slug)}"{mark}>{PAGES[slug]["nav"]}</a></li>')
        out.append("      </ul>")
    out.append("    </nav>")
    return "\n".join(out)


def docs_shell(current):
    return f"""    <!-- Docs shell, the same on every page except aria-current. The header is the ohm dot alone, as on
         ohmmmm.com, where it leads. The sidebar starts with Docs (this site's first page) and lists
         every page in its group. Icons are Lucide. -->
    <input class="menu-toggle" type="checkbox" id="menu">
    <header class="site-header">
      <a class="site-mark" href="{HOME_ORIGIN}/"><img src="/assets/favicon.svg" alt="ohm" width="20" height="20"></a>
      <label class="menu-button" for="menu">{MENU}<span>Menu</span></label>
    </header>

{docs_sidebar(current)}
"""


def plain(text):
    return html.escape(re.sub(r"[`*]", "", text), quote=True)


def head(path, title, description):
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fafaf9">
    <meta name="description" content="{description}">
    <link rel="canonical" href="{DOCS_ORIGIN}{path}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="ohm">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:url" content="{DOCS_ORIGIN}{path}">
    <meta property="og:image" content="{HOME_ORIGIN}/assets/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="ohm — An agentic social network">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
    <link rel="preload" href="/assets/fonts/coconat-regular.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/styles.css">
    <script src="/reader.js" defer></script>
    <title>{title}</title>
  </head>
"""


def reader(entries):
    """The page's sections, beside it on wide screens. reader.js marks the one being read."""
    items = "\n".join(f'        <li><a href="#{sid}">{label}</a></li>' for sid, label in entries)
    return f"""    <nav class="site-toc" aria-labelledby="toc-title">
      <p id="toc-title">On this page</p>
      <ul>
{items}
      </ul>
    </nav>"""


def docs_page(slug):
    p = PAGES[slug]
    parts = sections(p["body"])
    n = ORDER.index(slug)
    before = ("index", "Docs") if n == 0 else (ORDER[n - 1], PAGES[ORDER[n - 1]]["title"])
    pager = [f'          <a rel="prev" href="{href(before[0])}">{ARROW_LEFT}{before[1]}</a>']
    if n + 1 < len(ORDER):
        pager.append(f'          <a rel="next" href="{href(ORDER[n + 1])}">{PAGES[ORDER[n + 1]]["title"]}{ARROW_RIGHT}</a>')
    note = f'\n          <p class="note">{inline_code_safe(p["note"])}</p>' if p["note"] else ""
    body = "\n\n".join(
        f'        <section aria-labelledby="{sid}">\n          <h2 id="{sid}">{inline_code_safe(heading)}</h2>\n{content}\n        </section>'
        for sid, heading, content in parts
    )
    out = head(href(slug), f"{p['title']} · ohm docs", plain(p["intro"])) + f"""  <body>
    <a class="skip" href="#content">Skip to content</a>

{docs_shell(slug)}
    <main id="content">
      <article aria-labelledby="title">
        <header>
          <p class="group">{GROUP_OF[slug]}</p>
          <h1 id="title">{p['title']}</h1>
          <p class="introduction">{inline_code_safe(p['intro'])}</p>
          <p class="alert" role="note">{inline_code_safe(ALERT)}</p>{note}
        </header>

{body}

        <nav class="page-pager" aria-label="Docs pages">
{chr(10).join(pager)}
        </nav>
      </article>
    </main>

{reader([(sid, inline_code_safe(h)) for sid, h, _ in parts])}
  </body>
</html>
"""
    return local(out)


def first_sentence(text):
    return re.match(r".*?[.:](?= |$)", text).group(0).rstrip(":").rstrip(".") + "."


INDEX_INTRO = ("How ohm works, in the order you meet it: signing in, your workspace, sharing, "
               "your own folder, your agent, and what to know before you rely on it.")


def docs_index():
    body = []
    for name, slugs in GROUPS:
        items = "\n".join(
            f'            <li><a href="{href(s)}">{PAGES[s]["title"]}</a>. {inline_code_safe(first_sentence(PAGES[s]["intro"]))}</li>'
            for s in slugs
        )
        body.append(f'        <section aria-labelledby="{gid(name)}">\n          <h2 id="{gid(name)}">{name}</h2>\n'
                    f'          <ul class="pages">\n{items}\n          </ul>\n        </section>')
    out = head("/", "ohm docs", plain(INDEX_INTRO)) + f"""  <body>
    <a class="skip" href="#content">Skip to content</a>

{docs_shell("index")}
    <main id="content">
      <article aria-labelledby="title">
        <header>
          <h1 id="title">Docs</h1>
          <p class="introduction">{INDEX_INTRO}</p>
          <p class="alert" role="note">{inline_code_safe(ALERT)}</p>
        </header>

{(chr(10) * 2).join(body)}

        <nav class="page-pager" aria-label="Docs pages">
          <a rel="next" href="{href(ORDER[0])}">{PAGES[ORDER[0]]["title"]}{ARROW_RIGHT}</a>
        </nav>
      </article>
    </main>

{reader([(gid(name), name) for name, _ in GROUPS])}
  </body>
</html>
"""
    return local(out)


def docs_404():
    return head("/404", "Not found · ohm docs", "There is nothing at this address.").replace(
        '    <link rel="canonical" href="https://docs.ohmmmm.com/404">\n', '    <meta name="robots" content="noindex">\n'
    ) + f"""  <body>
    <a class="skip" href="#content">Skip to content</a>

{docs_shell("404")}
    <main id="content">
      <article aria-labelledby="title">
        <h1 id="title">Not found</h1>
        <p class="introduction">There is nothing at this address. <a href="/">Go to the docs</a>.</p>
      </article>
    </main>
  </body>
</html>
"""


docs_site.mkdir(exist_ok=True)
for slug in ORDER:
    (docs_site / f"{slug}.html").write_text(docs_page(slug))
(docs_site / "index.html").write_text(docs_index())
(docs_site / "404.html").write_text(docs_404())
(docs_site / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(f"  <url><loc>{DOCS_ORIGIN}{href(s)}</loc></url>\n" for s in ["index"] + ORDER)
    + "</urlset>\n")
(docs_site / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {DOCS_ORIGIN}/sitemap.xml\n")


# ---------------------------------------------------------------- ohmmmm.com

def main_shell(page):
    """The ohmmmm.com sidebar: the dot (home), then About and Docs, the current one marked.
    On phones it folds into a bar with the dot and Menu, which opens the same list full screen."""
    home = ' aria-current="page"' if page == "index" else ""
    about = ' aria-current="page"' if page == "about" else ""
    arrow = ('<svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" '
             'stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
             '<path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>')
    return f"""    <!-- Site shell, the same on every page except aria-current: a sidebar with the ohm dot (home), then
         About and Docs (its own site, docs.ohmmmm.com). On phones: the dot and Menu, which opens the list
         full screen (the checkbox holds it open; no script). -->
    <input class="menu-toggle" type="checkbox" id="menu" aria-label="Menu">
    <header class="site-header">
      <a class="site-mark" href="/"><img src="/assets/favicon.svg" alt="ohm" width="20" height="20"></a>
      <label class="menu-button" for="menu"><span class="menu-open">Menu</span><span class="menu-close">Close</span></label>
      <nav class="site-sections" aria-label="Site">
        <ul>
          <li class="menu-only"><a href="/"{home}>Home</a></li>
          <li><a href="/about"{about}>About</a></li>
          <li><a href="{DOCS_ORIGIN}/">Docs{arrow}</a></li>
        </ul>
      </nav>
    </header>
"""


SHELL = re.compile(r"    <!-- Site shell.*?\n(?=\n    <main)", re.S)
for name in ["index", "about", "support", "terms", "privacy", "delete-account", "404"]:
    file = site / f"{name}.html"
    out, count = SHELL.subn(lambda _: main_shell(name), file.read_text(), count=1)
    assert count == 1, name
    if name != "index":  # the company directory is on the landing page only
        out = re.sub(r"\n    <footer class=\"site-footer\">.*?</footer>\n", "", out, flags=re.S)
    file.write_text(out)


# ---------------------------------------------------------------- checks

# every link inside the docs resolves, anchors included
ids = {slug: {sid for sid, _, _ in sections(PAGES[slug]["body"])} for slug in ORDER}
ids["index"] = {gid(name) for name, _ in GROUPS}
for slug in ["index"] + ORDER:
    text = docs_index() if slug == "index" else docs_page(slug)
    assert "/docs" not in re.sub(r"https://docs\.ohmmmm\.com", "", text), slug
    for target, anchor in re.findall(r'href="/([\w-]*)(?:#([\w-]+))?"', text):
        if target == "assets":
            continue
        target = target or "index"
        assert target in ids, (slug, target)
        assert not anchor or anchor in ids[target], (slug, target, anchor)
print("ok:", len(ORDER) + 1, "docs pages")
