"""Builds docs.ohmmmm.com, and puts the site header on every page of the ohmmmm.com draft.

    python3 public/docs/build.py

The docs' words are in this file: GROUPS sets the sidebar and the order of pages, and each doc()
call below is one page, written in a small Markdown (## headings with {#ids}, lists, tables,
code blocks, **bold**, `code`, [links](/docs/page#section), ### headings inside a section, and
{{figure:name}} for a diagram drawn in FIGURES). Edit here, run, and commit what changes. The
Service API page is read from ../../service/CAPABILITIES.md.

It writes, in this folder: index.html, one .html per page, 404.html, sitemap.xml and robots.txt,
and for agents a .md copy of each page, llms.txt and llms-full.txt.
It does not write styles.css, reader.js, _headers, wrangler.jsonc or assets/, which are edited by
hand. In ../home-draft it replaces each page's sidebar (the "Site shell" block: the dot, About, Docs)
and keeps the company directory on index.html only.

The live ohmmmm.com is ../home (public/home/public) and is not touched here.
Deploy the docs from this folder: npx wrangler deploy --profile ohm"""
import html
import re
from pathlib import Path

docs_site = Path(__file__).resolve().parent
site = docs_site.parent / "home-draft"
DOCS_ORIGIN = "https://docs.ohmmmm.com"
HOME_ORIGIN = "https://ohmmmm.com"

# ---------------------------------------------------------------- content

GROUPS = [
    ("Get started", ["quick-start", "sign-in"]),
    ("Workspace", ["workspace", "posts", "labels"]),
    ("Sharing", ["visibility", "publish", "friends"]),
    ("Folder", ["sync", "files", "export"]),
    ("Agent", ["agent", "finding-people"]),
    ("Architecture", ["architecture", "identity", "data-model", "protocols", "mcp", "api"]),
    ("Reference", ["where-things-live", "limits"]),
]

PAGES = {}


def doc(slug, title, intro, body, nav=None):
    PAGES[slug] = dict(title=title, nav=nav or title, intro=intro, body=body)


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
A post's record is kept under its permanent ID, so renaming or refiling a post changes its address without making it a different post.
""")

doc("friends", "Friends",
    "A friend is someone you follow who follows you back. Friends can read the posts you mark for friends, and you can read theirs.",
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
A tool has no ability of its own. Each is a way of asking ohm for something the workspace can already do. [Agent integration](/docs/mcp) describes the server behind them.

## Signing in {#sign-in}
Your agent signs in to your own server with an app password, and your server vouches for each thing it asks ohm.

## Other people's writing is not trusted {#safety}
The same agent reads your private posts and other people's posts. Someone could write a post meant to make an agent give something away. The protection is in the tools, not in the agent's judgement: no tool sends anything out without showing you first.

## Things to ask it {#ask}
- "What have I written about this before?"
- "Save this as a private note under Writings."
- "Look at my posts and suggest how to label them."
- "Bring in my posts." Then: "File the ones under other."
- "Make that one public." Then: "Publish."
- "What is not published yet?"

## Editing alongside it {#together}
You and your agent can work in the same workspace at once. Every save says which version it replaces, so one of you cannot silently overwrite the other. [The workspace](/docs/workspace#saving)
""")

doc("finding-people", "Finding people",
    "When you are stuck on something that needs another person, your agent helps you find that person. What it can settle alone, it settles. For everything else, it takes you to someone.",
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
| Your account on the open network | Your public posts, and your identity | Yours. It is hosted by Bluesky or on a server you run, and it can be moved |
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

doc("limits", "Status and limits",
    "The implementation status of each part of ohm, what cannot be undone, and what ohm is not.",
    body="""
## Implementation status {#status}
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

# ---------------------------------------------------------------- architecture
#
# These pages describe the system itself: its parts, who owns what, how a request is proved, and
# what is exchanged. The request reference is read from service/CAPABILITIES.md, which the
# service's own tables write, so it cannot say anything the service does not do.

SERVICE_REFERENCE = docs_site.parent.parent / "service" / "CAPABILITIES.md"

ACCESS = {
    "Anyone": "Public",
    "Whoever holds a token from a PDS": "Any authenticated account",
    "The member": "Member",
    "The member, signed in to ohm": "Member, with an ohm session",
}


def service_reference():
    """→ (capabilities, errors, tools) as the service's reference lists them."""
    text = SERVICE_REFERENCE.read_text()
    request = re.compile(
        r"### `([\w.]+)`\n\n(.+?)\n\n\| \| \|\n\| --- \| --- \|\n\| Reads or changes \| .+?\(`(GET|POST)`\) \|\n"
        r"\| Who may ask \| (.+?) \|\n\| Takes \| (.+?) \|\n\| Gives \| (.+?) \|\n")
    capabilities = []
    for chunk in re.split(r"\n(?=## )", text):
        found = request.findall(chunk)
        if found:
            name, about = re.match(r"## (.+?)\n\n(.+?)\n", chunk).groups()
            capabilities.append((name, about, found))
    rows = lambda heading: [
        [cell.strip() for cell in line.strip().strip("|").split("|")]
        for line in text.split(f"\n## {heading}\n")[1].split("\n## ")[0].split("\n")
        if line.startswith("| `")
    ]
    assert len(capabilities) == 8 and sum(len(found) for _, _, found in capabilities) == 15, capabilities
    return capabilities, rows("When the answer is no"), [row for row in rows("The tools an agent has") if row[0].startswith("`vault_")]


def api_body():
    capabilities, errors, tools = service_reference()
    out = ["""
## Conventions {#conventions}
The vault service speaks XRPC, the request convention of the AT Protocol. Every request has a namespaced name and is sent to `/xrpc/` followed by that name.
| | |
| --- | --- |
| Base addresses | `https://vault.ohmmmm.com`, and `https://app.ohmmmm.com/vault` for the workspace, where the ohm session cookie is in scope |
| Reads | `GET`, with parameters in the query string |
| Changes | `POST`, with parameters as a JSON body |
| Responses | JSON, sent with `Cache-Control: private, no-store`. `getAttachment` answers with the file itself |
| Idempotency | Every request can be repeated safely. A change names the version it replaces, and a repeat of a change already made reports `unchanged` |
| Authentication | A service token from the member's PDS in `Authorization: Bearer`, or an ohm session. [Identity and access](/docs/identity) |
The access level of each request is one of four.
| Access | Credential |
| --- | --- |
| Public | None. The response contains only public information |
| Any authenticated account | A service token from any PDS, issued for this request |
| Member | A service token from the member's own PDS, or an ohm session connected to that account |
| Member, with an ohm session | An ohm session only. A change must also originate from ohm's own pages |
"""]
    for name, about, requests in capabilities:
        out.append(f"## {name} {{#{name.lower()}}}\n{about}")
        for request, summary, method, access, takes, gives in requests:
            out.append(f"### `{request}`\n{summary}\n| | |\n| --- | --- |\n| Method | `{method}` |\n| Access | {ACCESS[access]} |\n"
                       f"| Parameters | {'None' if takes == 'Nothing' else takes} |\n| Returns | {gives} |")
    out.append("## Errors {#errors}\nA refusal is JSON with an `error` code from the table below and a `message` written to be shown to a person as it is.\n"
               "| Error | Status | Cause |\n| --- | --- | --- |\n" + "\n".join(f"| {code} | {status} | {cause} |" for code, status, cause in errors))
    out.append("## Agent tools {#tools}\nAn agent's tools are compositions of the requests above and add no capability of their own. Each runs on the member's machine and "
               "authenticates as the member, with a service token per request.\n| Tool | Effect | Requests used |\n| --- | --- | --- |\n"
               + "\n".join(f"| {tool} | {'Read' if effect == 'Reads only' else 'Change'} | {made} |" for tool, effect, made, _ in tools)
               + "\nThe server that offers these tools is described in [Agent integration](/docs/mcp). Three rules hold for every tool that changes something.\n"
               "1. **A new post is private.** Marking it for anyone else is a separate, confirmed step.\n"
               "2. **Changes that others can see take two calls.** The first returns what would happen and a `confirm` value bound to exactly that outcome. Only a second call carrying the value proceeds.\n"
               "3. **A post is changed from the version that was read.** If it has changed since, nothing is saved.")
    return "\n".join(out)


doc("architecture", "System overview",
    "ohm is built from three kinds of system with a strict division of ownership: the member's AT Protocol account, which holds their identity and everything public; ohm's services, which hold a working copy; and clients on the member's device, the only place a write to the member's account originates.",
    nav="Overview",
    body="""
## How it works {#how}
Everything in ohm is a post, and every post is in a member's vault: one working copy of all their work, held by ohm, in a structure of labels, sublabels and posts. A post is private, for friends, or public. The whole system follows from keeping two things apart: working in the vault, and publishing from it.
1. **Sign in.** A person signs in to ohm, and once connects the AT Protocol account that owns their posts. That account lives on a Personal Data Server (PDS) they host themselves or at Bluesky. It is theirs whether or not they use ohm.
2. **Mirror.** What the account has already published is read from its repository into the vault. From then on the vault holds everything: public posts, and private and friends-only ones that exist nowhere else on the network.
3. **Work.** Posts are read, written and filed in the vault, through any of three clients: the workspace in a browser, an agent's tools, or a synced folder of Markdown files. A new post is private. Saving changes the vault and nothing else.
4. **Mark.** Setting a post to public or friends marks it. Nothing is shared by marking.
5. **Publish.** The vault service works out what would have to change in the member's repository for what is published to match the vault. The member reviews that plan and approves it, and their own device, signed in at their own PDS, makes the changes. Public posts become `com.ohmmmm.post` records.
6. **Read.** The member's website and any other AT Protocol application read those records from the repository. ohm is not in that path.
7. **Keep.** The vault can be synced to a folder the member holds, or exported, as Markdown files. With a folder connected, nothing depends on ohm keeping its copy.
Three rules hold everywhere and are worth knowing before anything else.
- **Saving never publishes.** Only Publish changes what other people see, and it always shows the change first.
- **ohm never writes to a member's repository.** It has no credential that could. Every write comes from the member's own device.
- **Private stays in the vault.** A private post is never written to the repository, where everything is public.

## Components {#components}
{{figure:system}}
| Component | Runs on | Responsibility | Status |
| --- | --- | --- | --- |
| Workspace | The member's browser, served from `app.ohmmmm.com/vault` | Editor, repository tree, publish review | Implemented |
| Agent tools | An MCP server, `ohm-vault`, on the member's machine | Ten tools composed from service requests. [Agent integration](/docs/mcp) | Implemented |
| Folder sync | A command-line client on the member's machine | Two-way sync between the vault and a folder of Markdown files | Implemented |
| Vault service | Cloudflare Workers and D1 | Stores the working copy of every post. Computes mirror and publish plans. Never writes to a member's repository | Implemented |
| ohm sign-in | Cloudflare Workers and D1 | ohm accounts and sessions, with Google, Microsoft and Bluesky as identity providers | Implemented |
| Personal Data Server (PDS) | The member's host: self-hosted, or Bluesky | The account's DID, signing key, and repository of public records and files | External |
| Website and other applications | Their own hosts | Read public records from the repository | External |
| Network service | | Friends-only delivery, the follow graph, and matching | Planned |

## Ownership {#ownership}
Each kind of data has one system of record. ohm is the system of record for nothing a member cannot take away.
| Data | System of record | What ohm holds |
| --- | --- | --- |
| Identity: DID, handle, signing key | The member's PDS | A reference to the DID |
| Public posts | The member's repository, as `com.ohmmmm.post` records | A working copy |
| Private and friends-only posts | The member's folder, once connected | A working copy. Until a folder is connected, the only copy |
| ohm account and session | ohm sign-in | The account itself |
| The link between an ohm account and a DID | Vault service | One row, unique in both directions |

## Design principles {#principles}
1. **The service never writes to a member's repository.** It holds no credential that could. Publishing is planned by the service and carried out from the member's device. [Mirror and publish](/docs/protocols)
2. **Authentication is delegated to the member's PDS.** The PDS signs a short-lived token for each request, and the service verifies it against the account's own DID document. ohm stores no PDS password or token. [Identity and access](/docs/identity)
3. **Every change is conditional.** A write names the version it replaces and is refused if the post has moved on, so the editor, an agent and a sync can work on the same vault without overwriting each other.
4. **Capabilities are isolated.** The service offers eight capabilities, each a separate module with its own requests. An agent's tools are compositions of those requests and add none of their own. [Service API](/docs/api)
5. **Requests are idempotent.** A request sent twice ends in the same state as one sent once. A post's ID is generated by the client, so creating it twice creates one post.
6. **One portable format.** Sync and export produce the same folder of Markdown files, and reading them back yields the same posts. [Posts as files](/docs/files)

## Deployment {#deployment}
| Address | Serves |
| --- | --- |
| `app.ohmmmm.com/vault/` | The workspace, and the service API under `/vault/xrpc/`, where the ohm session cookie is in scope |
| `vault.ohmmmm.com` | The service API under `/xrpc/`. The service identifies itself as `did:web:vault.ohmmmm.com` |
| `app.ohmmmm.com/api/auth/` | ohm sign-in |
| `docs.ohmmmm.com` | This documentation |
The vault service and ohm sign-in are separate Workers with separate databases. The vault service asks ohm sign-in whose session a request carries; ohm sign-in asks the vault service which account a PDS token names. Neither reads the other's database.

## In this section {#section}
- [Identity and access](/docs/identity): the two identities, and how every request is authenticated.
- [Data model](/docs/data-model): a post in the vault, the published record, identifiers and versions.
- [Mirror and publish](/docs/protocols): the two exchanges with a member's repository.
- [Agent integration](/docs/mcp): the MCP server, its tools, and how changes are confirmed.
- [Service API](/docs/api): every request, error and agent tool.
""")

doc("identity", "Identity and access",
    "A member has two identities: an ohm account, which says who is signed in, and an AT Protocol account, which owns their posts. Every request to the vault service is authenticated by one of them, and resolved to exactly one AT Protocol account before any data is read.",
    body="""
## Two identities {#two}
| | ohm account | AT Protocol account |
| --- | --- | --- |
| Identifies | The person signed in | The owner of the posts |
| Identifier | An internal user ID | A DID, such as `did:plc:…` or `did:web:example.com` |
| Issued by | ohm sign-in, through Google, Microsoft or Bluesky | The member's PDS |
| Credential | A session cookie on `app.ohmmmm.com` | A service token signed by the PDS |
| Holds | No posts | The repository of public records |
One ohm account is connected to one AT Protocol account, and that account to one ohm account. The vault service enforces the constraint in both directions.

## Resolving an account {#resolution}
A member names their account by its handle, which is a domain name. The service resolves it as the AT Protocol specifies, and believes nothing it cannot confirm from the account's own documents.
1. **Handle to DID.** A `TXT` record at `_atproto.<handle>`, or failing that the file `https://<handle>/.well-known/atproto-did`.
2. **DID to document.** `did:plc` from the public directory, `did:web` from the domain's `/.well-known/did.json`.
3. **Confirmation.** The document must name the handle back in `alsoKnownAs`. A handle that points at a DID which does not claim it is refused.
4. **Endpoints.** The PDS address is the document's `#atproto_pds` service, and the signing key is its `#atproto` verification method.
Redirects are not followed at any step: an answer has to come from the address that was asked.

## Authenticating a request {#authentication}
A request carries one of two credentials.
**A service token from the member's PDS.** This is what the command line and an agent's tools send. The client asks the PDS for a token for one named request, and the service verifies it against the account's DID document.
{{figure:auth}}
| Claim | Check |
| --- | --- |
| `iss` | A well-formed DID, and on the allow list while access is restricted. Checked before anything is fetched, so a token cannot make the service read an address of the sender's choosing |
| `aud` | The service's own DID, `did:web:vault.ohmmmm.com` |
| `lxm` | The exact request being made. A token for one request is not accepted for another |
| `exp`, `iat` | Not expired, valid for no more than one hour, and not dated in the future. |
| Signature | ES256K or ES256, in low-S form, against the signing key in the DID document. Documents are cached for five minutes |
**An ohm session.** This is what the workspace sends. A request with no `Authorization` header is checked against ohm sign-in, which answers whose session the cookie is. The service then looks up the AT Protocol account that member connected. A request that changes anything must also originate from ohm's own pages.

## Access levels {#access}
Each request declares one access level, and the router settles it before the request's own code runs.
| Level | Accepted credential | Used for |
| --- | --- | --- |
| Public | None | Finding an account from its handle |
| Any authenticated account | A service token from any PDS | Establishing which account a token names, during sign-in |
| Member | A service token from the member's own PDS, or an ohm session connected to that account | Every request that reads or changes a vault |
| Member, with an ohm session | An ohm session only | Connecting and disconnecting an AT Protocol account |
A member's vault is served to that member and to nobody else.

## Signing in at the PDS {#pds}
The workspace needs the member to sign in at their PDS twice in its life: to connect the account, and each time they publish. There are two ways, and both work with any PDS.
- **An app password.** The member types it on ohm's page. The page sends it directly to the member's PDS (`com.atproto.server.createSession`) and to no other host. The resulting PDS session is held in the page's memory for that task and ended with `deleteSession` when the task completes. Neither the password nor the session is stored, and neither reaches ohm.
- **OAuth.** The member approves at the PDS's own screen, where a passkey works. The flow is the AT Protocol profile of OAuth: pushed authorization requests, PKCE, and DPoP-bound tokens.

## Connecting an account {#connect}
1. The page resolves the handle with `com.ohmmmm.identity.findAccount`, which also returns the service's DID.
2. The member signs in at their PDS.
3. The page asks the PDS for a service token issued for `com.ohmmmm.account.connect`.
4. The service verifies the token and records the link between the ohm account and the DID. It refuses if either side is already connected elsewhere.
5. ohm sign-in is told of the link, so that signing in with that AT Protocol account later resolves to the same ohm account.

## Signing in with Bluesky {#bluesky}
Bluesky is an identity provider for ohm accounts as well as a host for AT Protocol accounts.
1. The member approves at Bluesky through OAuth.
2. The page obtains a service token issued for `com.ohmmmm.identity.whoAmI` and hands it to ohm sign-in.
3. ohm sign-in asks the vault service which account the token names. The service verifies the token as above.
4. ohm sign-in opens a session for the ohm account connected to that DID, creating the account on first sign-in. The token is accepted once.
Because the identity provider is the member's own AT Protocol account, the connection step is already complete.

## Access during testing {#allow-list}
While ohm is tested, the service accepts requests only from DIDs on an allow list. An account that is not on it receives `NotAMember`.
""")

doc("data-model", "Data model",
    "The unit of ohm is the post. It exists in three forms that map onto each other exactly: a row in the vault, a `com.ohmmmm.post` record in the member's repository when it is public, and a Markdown file in the member's folder.",
    body="""
## A post in the vault {#post}
| Field | Type | Meaning |
| --- | --- | --- |
| `id` | String, 13 characters | Permanent identifier, generated once by whichever client creates the post |
| `slug` | String | The last segment of the post's address. Mutable. Unique within a vault |
| `label`, `sublabel` | String | Where the post is filed, in the author's own words |
| `visibility` | `public`, `friends` or `private` | Who the post is for. A new post is `private` |
| `title`, `subtitle` | String, optional | |
| `date` | Timestamp, optional | When the post is from. A mirrored post keeps its original date |
| `body` | Markdown | As the author wrote it |
| `connect` | List, up to 32 | Other posts or web pages this post follows from |
| `address` | URL, optional | The post's address on the author's site, when it is not the one its label and slug give |
| `source` | Object, optional | Where the post first appeared, if elsewhere: platform, address, and the platform's own ID |
| `site` | Object, optional | Fields of the author's own site, outside the shared schema |
| `properties` | Object | Anything else the author gave it. Stored, and never published |

## Identifiers and versions {#identifiers}
| | Form | Purpose |
| --- | --- | --- |
| Post ID | 13 characters that sort by creation time, in the form the AT Protocol uses for record keys | Identity. Renaming or refiling a post does not change it. It is also the record key when the post is published |
| Version | `v` followed by a SHA-256 digest of the post's content | Concurrency control. Every write names the version it replaces. A mismatch is refused with `Changed` and the current version |
| Sequence | A counter per vault, advanced by every change | Incremental sync. `listPosts` with `since` returns only what changed after a cursor, removals included |
A removed post keeps its row with no version, so a client that asks what changed is told that it went.

## The published record {#record}
A public post is one record of type `com.ohmmmm.post` in the member's repository, stored under the post's ID. The schema is fixed and the same on every site.
| Field | Type | Meaning |
| --- | --- | --- |
| `body` | String, required | CommonMark with footnotes. `media:ID` as an image destination places an attachment |
| `publishedAt` | Datetime, required | |
| `canonicalUrl` | URI, required | The post's address on the author's website |
| `title`, `subtitle` | String | |
| `updatedAt` | Datetime | When the post last changed after it was published |
| `slug` | String | The last segment of the address |
| `label`, `sublabel` | String | Free-form, as the author named them |
| `form` | String | The kind of object, derived from the content: `writing`, `note`, `image`, `gallery`, `video`, `audio`, `file`, `media`, `link`, `embed`, `quote`, `list`, `code` or `other` |
| `connect` | List of URIs | AT URIs or web addresses of what the post follows from |
| `link` | Object | For a link or embed: the page as it described itself |
| `source` | Object | Where the post first appeared, if not on the author's site |
| `media` | List | Attachments, each with an ID unique within the post |
| `site` | Object | Site-specific data, namespaced by its own `$type` |
`visibility` and `properties` are not part of the record. A post that is not public has no record.

## Attachments {#attachments}
An entry in `media` is an image, a video, an audio recording or a file. Each carries a `file`, which is a blob stored in the member's repository, and may carry `sourceUrl`, the address the original came from.
| Kind | Accepts | Additional fields |
| --- | --- | --- |
| `image` | `image/*` | `alt`, `caption`, `width`, `height` |
| `video` | `video/*` | `poster`, `caption`, `durationMs` |
| `audio` | `audio/*` | `caption`, `durationMs` |
| `file` | `application/*`, `text/*` | `caption` |
In the vault, a post references its attachments by address. The copy in the repository is made when the post is published. [Mirror and publish](/docs/protocols#attachments)

## From vault to record {#mapping}
| In the vault | In the record |
| --- | --- |
| `id` | The record key |
| `label`, `sublabel`, `slug` | The same fields, and `canonicalUrl`: `/posts/<label>/<sublabel>/<slug>` on the member's site, lowercased and hyphenated |
| `date` | `publishedAt`. A post with no date is dated when it is first published and keeps that date |
| The content of `body` | `form`, derived |
| A link to another post | An entry in `connect`, as that post's address. Only a public post can be linked from a published one |
| `visibility`, `properties` | Not published |

## Storage {#storage}
The vault service stores two tables.
| Table | Key | Holds |
| --- | --- | --- |
| `posts` | Account DID and post ID | The post as JSON, its version and sequence, and indexed copies of the fields the repository tree is drawn from |
| `links` | ohm user ID, with the DID unique | Which AT Protocol account an ohm account works in, and when its published posts were first mirrored |
The database enforces two invariants itself: a slug is used once within a vault, and a write succeeds only against the version it names.
""")

doc("protocols", "Mirror and publish",
    "Two exchanges connect a vault to its member's repository. Mirror reads what is published into the vault. Publish makes what is published match the vault. The service reads the repository in both, and writes to it in neither.",
    body="""
## Mirror {#mirror}
Mirror brings what a member has already published into their vault. It needs no credential at the PDS, because a repository's records are public.
1. **Locate.** The service takes the PDS address from the member's DID document and the website from their handle.
2. **Discover.** It lists the repository's collections and keeps the shared type, `com.ohmmmm.post`, and any type of the member's own whose records read as posts: a body and a publication date. Protocol and Bluesky types are not examined.
3. **Read.** It reads every record of those types. Where a post exists in both an older type and the shared one, the shared one is kept.
4. **Report.** It returns what it found before saving anything: the number of posts, which would differ from what is published, what could not be carried over, and what was skipped.
5. **Apply.** On request, it saves the posts. Each save is conditional on the post's version, so a post the member has since changed in the vault is never overwritten.
Mirror runs once automatically when an account is first connected, and on demand afterwards. Mirrored posts are already public and remain public. Nothing new is shared.

## Publish {#publish}
Publish is split between the service, which computes a plan, and the member's device, which carries it out.
{{figure:publish}}
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

## Plan rules {#rules}
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

## Attachments {#attachments}
A post in the vault references its files by address. Publishing gives the repository a copy of each.
- **A file the member's PDS already holds** is referenced by its content ID. The service confirms its type and size with a `HEAD` request and nothing is uploaded.
- **Any other file** is fetched for the device by the service, because a page in a browser cannot read a file from another site. The service fetches only addresses that one of the member's own posts places, over HTTPS, up to 25 MB.
- **The original address** is recorded with the copy as `sourceUrl`.
A file that cannot be fetched stops that post from publishing and is reported. Other posts are unaffected.

## Consistency and consent {#consistency}
- **Writes are atomic.** `applyWrites` applies a batch entirely or not at all. A plan is sent as one batch up to 200 changes.
- **Approval is bound to the plan.** The plan's name is a digest of its writes. An agent's confirmation carries that name, so approval of one plan cannot be used for another.
- **Publishing is repeatable.** A plan is computed from current state each time. Running it again after a partial failure produces only the changes still outstanding.
- **Records keep their keys.** A record is stored under the post's permanent ID. A record published before posts had IDs is moved to its ID in the same batch that removes the old one.

## Consequences {#consequences}
- ohm cannot publish, edit or remove anything in a member's repository on its own, including in response to a fault or a compromise of the service.
- Nothing is published in the background. Every publish begins with the member present and signed in at their PDS.
- A published post is public from the moment it is written. Removing it removes the record, not copies that other services have made.
""")

CONFIRMED = {
    "vault_save": "When the post is not private",
    "vault_set_visibility": "Always", "vault_publish": "Always", "vault_mirror": "Always", "vault_delete": "Always",
}


def mcp_body():
    _, _, tools = service_reference()
    listed = "\n".join(
        f"| {tool} | {'Read' if effect == 'Reads only' else 'Change'} | {CONFIRMED.get(tool.strip('`'), 'None') if effect != 'Reads only' else 'None'} | {made} |"
        for tool, effect, made, _ in tools)
    assert len(tools) == 10 and all(name in [tool.strip("`") for tool, *_ in tools] for name in CONFIRMED), tools
    return f"""
## Overview {{#overview}}
ohm does not run an agent. It ships a Model Context Protocol (MCP) server, `ohm-vault`, that a member runs on their own machine and connects to the agent they already use. The server exposes ten tools, and each tool is a composition of vault service requests made as the member.
{{{{figure:mcp}}}}
1. **Call.** The agent calls a tool over the MCP connection.
2. **Vouch.** The server asks the member's PDS for a service token for the one request it is about to make.
3. **Token.** The PDS returns a token signed with the account's key.
4. **Request.** The server sends the request to the vault service with that token.
5. **Response.** The service verifies the token and answers. [Identity and access](/docs/identity#authentication)
6. **Result.** The server returns the tool's result to the agent.
The tools work in the same working copy the workspace shows. A post an agent saves is the same row, with the same version, that the editor opens.

## What an agent should know {{#model}}
An agent that reads only this section can work in a vault correctly.
- **The vault is one person's work,** as posts filed under labels and sublabels. Start with `vault_tree` to see its shape, then `vault_read` or `vault_search`.
- **Every post is private, for friends, or public.** Private posts are context for helping the member. Nothing from one belongs in anything another person can see.
- **A new post is saved private.** `vault_save` never shares anything. To change who a post is for, use `vault_set_visibility`, which always asks first.
- **Saving is not publishing.** A post marked public reaches the member's website and the network only through `vault_publish`. `vault_status` says what is waiting.
- **Changes are made from a version.** `vault_read` returns it, and `vault_save` passes it back. If the post changed in between, read it again.
- **A two-call tool is asking for the member's decision.** Show the member what the first call returned, and make the second call only if they agree.
- **Publishing cannot be recalled.** Other services copy a public post as soon as it is written.

## Protocol {{#protocol}}
| | |
| --- | --- |
| Transport | Standard input and output. One JSON-RPC 2.0 message per line in each direction |
| Protocol versions | `2025-06-18`, `2025-03-26`, `2024-11-05` |
| Methods | `initialize`, `ping`, `tools/list`, `tools/call` |
| Capabilities | Tools only. The server offers no resources and no prompts |
| Server name | `ohm-vault` |
| Ordering | Calls are handled one at a time, in the order received, so two changes to the same post cannot cross |
| Results | A tool's result is JSON, returned as text content. A refusal is a result marked `isError` with a message the agent can read and act on |
| Annotations | Tools that only read carry `readOnlyHint`. `vault_delete` carries `destructiveHint` |
| Instructions | On `initialize`, the server states the rules of the vault to the agent: what private means, and that any change other people can see is shown to the member first |
Listing the tools needs no configuration and no sign-in. The server signs in at the PDS the first time a tool is called.

## Configuration {{#configuration}}
| Setting | Source | Purpose |
| --- | --- | --- |
| The member's account | The site configuration file, found in the agent's working folder, or named with `--config` or `OHM_CONTENT_LAYER_CONFIG` | Which AT Protocol account the server acts as |
| `ATPROTO_APP_PASSWORD` | Environment | An app password for the member's PDS. It can be revoked at the PDS at any time |
| `OHM_VAULT_URL`, `OHM_VAULT_DID` | Configuration, or the flags `--vault` and `--vault-did` | The vault service to use. Defaults to `https://vault.ohmmmm.com` and `did:web:vault.ohmmmm.com` |
The server is started by the ohm plugin for agents that load it, or directly:
```
npx github:haeinej/ohm-content-layer mcp
```

## Authentication {{#authentication}}
The server holds one credential: the app password, in its own environment on the member's machine.
- **It signs in at the member's PDS** with `com.atproto.server.createSession` and renews the session when it expires.
- **Each request to the vault service carries its own token,** obtained from the PDS with `getServiceAuth` for that request's name and valid for 60 seconds.
- **The vault service never receives the app password** or the PDS session. It sees only tokens it can verify against the account's DID document.
- **Publishing uses the same PDS session.** The server uploads files and applies the plan's writes itself, as the workspace does in a browser. [Mirror and publish](/docs/protocols#publish)

## Tools {{#tools}}
| Tool | Effect | Confirmation | Requests used |
| --- | --- | --- | --- |
{listed}
A tool has no capability of its own. Anything a tool can do, the service API can do, and the access rules are the service's. [Service API](/docs/api)

## Confirmation {{#confirmation}}
A tool that changes something other people can see, or removes something, takes two calls.
1. **The first call changes nothing.** It returns `done: false`, a description of exactly what would happen in `willHappen`, and a `confirm` value.
2. **The agent shows that description to the member.**
3. **The second call repeats the request with the `confirm` value,** and only then does the change happen.
The `confirm` value is a digest of the request and of the state it was computed from: the post's current version, or the publish plan. If either has changed between the two calls, the value no longer matches and the call is refused. The server keeps no state between calls, so a confirmation cannot be replayed against a different change.

## Safety model {{#safety}}
The same agent reads the member's private posts and content written by other people, which may be written to manipulate it. The controls are properties of the tools, not of the agent's judgement.
| Risk | Control |
| --- | --- |
| A private post is exposed by a save | A new post is always private. Widening who can see a post is a separate tool that always requires confirmation |
| Something is published without the member knowing | Saving never publishes. `vault_publish` always requires confirmation of the exact plan |
| A post is overwritten | Every save names the version that was read. A stale save is refused |
| A post is lost | `vault_delete` always requires confirmation |
| Content leaves the vault another way | No tool sends content to any destination other than the member's own vault and repository |
One exposure is outside these controls: whatever the agent reads is also processed by the provider of the model it runs on.

## Requests without a tool {{#excluded}}
Some service requests are deliberately not available to an agent.
| Requests | Reason |
| --- | --- |
| `listPosts` | It serves incremental sync. The tools read the repository tree |
| `exportFiles` | Export is for the command line and the workspace |
| `account.get`, `account.connect`, `account.disconnect` | They require an ohm session, which an agent does not have |
| `identity.findAccount`, `identity.whoAmI` | They are steps of signing in |
"""


doc("mcp", "Agent integration",
    "An agent reaches a vault through an MCP server that runs on the member's own machine. The server authenticates as the member, composes its tools from service requests, and requires confirmation for every change that others could see.",
    body=mcp_body())

doc("api", "Service API",
    "The vault service exposes fifteen requests in eight capabilities. This reference is generated from the same tables the service runs on.",
    body=api_body())

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
        elif line.startswith("{{figure:"):
            out.append(pad + FIGURES[line.strip()[9:-2]]())
            i += 1
        elif line.startswith("### "):
            out.append(f"{pad}<h3>{inline_code_safe(line[4:])}</h3>")
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
            cell = lambda text: "<br>".join(inline_code_safe(part) for part in text.split("<br>"))
            # A table with nothing in its heading is a list of facts: a name, then what it is.
            facts = ' class="facts"' if not any(head) else ""
            t = [f'{pad}<div class="table">', f"{pad}  <table{facts}>", f"{pad}    <thead>",
                 f"{pad}      <tr>" + "".join(f"<th>{cell(c)}</th>" if c else "<td></td>" for c in head) + "</tr>",
                 f"{pad}    </thead>", f"{pad}    <tbody>"]
            for row in body:
                cells = "".join(
                    (f'<th scope="row">{cell(c)}</th>' if n == 0 else f"<td>{cell(c)}</td>")
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


# ---------------------------------------------------------------- figures
#
# Diagrams are drawn here as SVG and placed in a page with a line reading {{figure:name}}. They
# carry no styles of their own (the site's policy allows none inline): every shape has a class,
# and styles.css sets how each class looks.

def esc(text):
    return html.escape(text, quote=False)


def figure(name, title, caption, width, height, parts):
    head = (f'<marker id="head-{name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            '<path class="d-head" d="M0 0 10 5 0 10z"/></marker>')
    drawn = "".join(parts).replace("url(#head)", f"url(#head-{name})")
    return (f'<figure class="figure">\n            <div class="figure-scroll"><svg viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" '
            f'aria-labelledby="figure-{name}"><title id="figure-{name}">{esc(title)}</title><defs>{head}</defs>{drawn}</svg></div>\n'
            f'            <figcaption>{inline_code_safe(caption)}</figcaption>\n          </figure>')


def box(x, y, w, h, title, sub="", kind="d-box"):
    out = f'<rect class="{kind}" x="{x}" y="{y}" width="{w}" height="{h}" rx="10"/>'
    out += f'<text class="d-title" x="{x + 14}" y="{y + (26 if sub else h / 2 + 5)}">{esc(title)}</text>'
    if sub:
        out += f'<text class="d-sub" x="{x + 14}" y="{y + 45}">{esc(sub)}</text>'
    return out


def group(x, y, w, h, label):
    return f'<rect class="d-group" x="{x}" y="{y}" width="{w}" height="{h}" rx="14"/><text class="d-caption" x="{x + 16}" y="{y + 24}">{esc(label)}</text>'


def arrow(x1, y1, x2, y2, label="", at=None, anchor="start", dashed=False):
    out = f'<path class="d-arrow{" d-dashed" if dashed else ""}" d="M{x1} {y1}L{x2} {y2}" marker-end="url(#head)"/>'
    if label:
        lx, ly = at
        out += f'<text class="d-label" x="{lx}" y="{ly}" text-anchor="{anchor}">{esc(label)}</text>'
    return out


def system_figure():
    parts = [
        group(0, 0, 640, 112, "MEMBER'S DEVICE"),
        box(16, 38, 192, 58, "Workspace", "Browser"),
        box(224, 38, 192, 58, "Agent tools", "MCP server"),
        box(432, 38, 192, 58, "Folder sync", "Command line"),
        group(0, 168, 296, 232, "OHM"),
        box(16, 206, 264, 64, "Vault service", "Working copy of every post"),
        box(16, 320, 264, 64, "ohm sign-in", "Accounts and sessions"),
        group(344, 168, 296, 118, "MEMBER'S ACCOUNT"),
        box(360, 206, 264, 64, "Personal Data Server", "Identity and public repository"),
        box(344, 342, 140, 58, "Website", "Renders records", "d-box d-outside"),
        box(500, 342, 140, 58, "Other apps", "Read records", "d-box d-outside"),
        arrow(148, 112, 148, 204, "API requests", (158, 146)),
        arrow(528, 112, 528, 204, "Sign-in, tokens, publish", (518, 146), "end"),
        arrow(280, 238, 358, 238, "reads", (320, 229), "middle"),
        arrow(148, 270, 148, 318, "session check", (158, 300)),
        arrow(414, 270, 414, 340),
        arrow(570, 270, 570, 340, "public records", (492, 322), "middle"),
    ]
    return figure("system", "The parts of ohm and what passes between them",
                  "Clients on the member's device call the vault service for everything in the working copy, and the member's own PDS for sign-in and publishing. "
                  "The vault service only reads from the PDS.", 640, 400, parts)


def sequence_figure(name, title, caption, actors, steps):
    width, top, row = 640, 0, 42
    column = width / len(actors)
    centre = [round(column * (n + 0.5)) for n in range(len(actors))]
    head = min(column - 16, 168)
    height = top + 40 + 30 + row * len(steps)
    parts = []
    for n, actor in enumerate(actors):
        parts.append(f'<path class="d-life" d="M{centre[n]} {top + 40}L{centre[n]} {height - 6}"/>')
        parts.append(f'<rect class="d-box" x="{centre[n] - head / 2}" y="{top}" width="{head}" height="40" rx="10"/>')
        parts.append(f'<text class="d-title" x="{centre[n]}" y="{top + 25}" text-anchor="middle">{esc(actor)}</text>')
    y = top + 40 + 38
    for number, (start, end, label, *reply) in enumerate(steps, 1):
        text = f"{number}  {label}"
        if start == end:
            wide = len(text) * 6.4 + 28
            parts.append(f'<rect class="d-note" x="{centre[start] - wide / 2}" y="{y - 20}" width="{wide}" height="28" rx="14"/>')
            parts.append(f'<text class="d-step" x="{centre[start]}" y="{y - 1}" text-anchor="middle">{esc(text)}</text>')
        else:
            toward = 1 if end > start else -1
            parts.append(arrow(centre[start] + 1 * toward, y, centre[end] - 2 * toward, y, dashed=bool(reply)))
            parts.append(f'<text class="d-step" x="{(centre[start] + centre[end]) / 2}" y="{y - 8}" text-anchor="middle">{esc(text)}</text>')
        y += row
    return figure(name, title, caption, width, height, parts)


SEQUENCES = {
    "auth": ("How a request with a service token is authenticated",
             ["Client", "Member's PDS", "Vault service", "DID document"],
             [(0, 1, "getServiceAuth"), (1, 0, "Signed token", True), (0, 2, "Request with the token"), (2, 3, "Resolve the DID"),
              (3, 2, "Signing key", True), (2, 0, "Response", True)]),
    "mcp": ("The path of one tool call",
            ["Agent", "MCP server", "Member's PDS", "Vault service"],
            [(0, 1, "tools/call"), (1, 2, "getServiceAuth"), (2, 1, "Signed token", True), (1, 3, "Request with the token"),
             (3, 1, "Response", True), (1, 0, "Tool result", True)]),
    "publish": ("The sequence of a publish",
                ["Vault service", "Member's device", "Member's PDS"],
                [(1, 0, "getPublishPlan"), (0, 2, "listRecords"), (0, 1, "Plan and its writes", True), (1, 1, "The member approves"),
                 (1, 2, "createSession"), (1, 0, "getAttachment"), (1, 2, "uploadBlob"), (1, 2, "applyWrites"), (1, 2, "deleteSession")]),
}
CAPTIONS = {
    "auth": "The PDS vouches for one request at a time. The vault service trusts the signature because the key comes from the account's own DID document. Dashed lines are responses.",
    "mcp": "The MCP server runs on the member's machine and acts as the member. Dashed lines are responses.",
    "publish": "The vault service computes the plan and reads the repository. Every write comes from the member's device, signed in at the member's own PDS. Dashed lines are responses.",
}
FIGURES = {"system": system_figure, **{
    name: (lambda name=name: sequence_figure(name, SEQUENCES[name][0], CAPTIONS[name], *SEQUENCES[name][1:])) for name in SEQUENCES
}}

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
    markdown = "/llms.txt" if path in ("/", "/404") else f"{path}.md"
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
    <link rel="alternate" type="text/markdown" href="{markdown}">
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
          <p class="alert" role="note">{inline_code_safe(ALERT)}</p>
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


INDEX_INTRO = ("How ohm works. The guides follow the product in the order you meet it: signing in, the workspace, "
               "sharing, your own folder and your agent. Architecture describes the system underneath: its components, "
               "how requests are authenticated, the data model, and the service API.")


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
          <p class="introduction">Reading as an agent? Every page is also plain Markdown: start at <a href="/llms.txt">llms.txt</a>.</p>
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


# ---------------------------------------------------------------- for agents
#
# The same pages as Markdown, which an agent reads more easily than HTML: one .md beside each
# page, /llms.txt listing them (llmstxt.org), and /llms-full.txt with all of them in one file.
# A diagram is written out as the exchanges it shows.

FIGURE_TEXT = {
    "system": """Diagram: the parts of ohm and what passes between them.
- On the member's device: the workspace (browser), the agent tools (MCP server) and folder sync (command line).
- Run by ohm: the vault service (the working copy of every post) and ohm sign-in (accounts and sessions).
- The member's own account, on the AT Protocol: a Personal Data Server holding their identity and public repository.
- Device → vault service: API requests.
- Device → Personal Data Server: sign-in, service tokens, and the writes of a publish.
- Vault service → Personal Data Server: reads only.
- Vault service → ohm sign-in: session check.
- Personal Data Server → the member's website and other applications: public records.""",
}


def figure_text(name):
    if name in FIGURE_TEXT:
        return FIGURE_TEXT[name]
    title, actors, steps = SEQUENCES[name]
    lines = [f"Diagram: {title[0].lower() + title[1:]}."]
    for number, (start, end, label, *reply) in enumerate(steps, 1):
        who = actors[start] if start == end else f"{actors[start]} → {actors[end]}"
        lines.append(f"{number}. {who}: {label}{' (response)' if reply and label != 'Response' else ''}")
    return "\n".join(lines)


def md_link(text):
    """Links between pages point at the Markdown copies."""
    return re.sub(r"\]\(/docs/([\w-]+)(#[\w-]+)?\)", lambda m: f"]({DOCS_ORIGIN}/{m.group(1)}.md{m.group(2) or ''})", text)


def md_body(body):
    """The small Markdown these pages are written in, as standard Markdown: a blank line between
    blocks, since here each line of prose is a paragraph of its own."""
    out, kind, fenced = [], None, False
    for line in body.strip().split("\n"):
        if line.startswith("```"):
            fenced = not fenced
            if fenced and out:
                out.append("")
            out.append(line)
            kind = "code"
            continue
        if fenced:
            out.append(line)
            continue
        if not line.strip():
            continue
        if line.startswith("{{figure:"):
            now, line = "figure", figure_text(line.strip()[9:-2])
        elif line.startswith("#"):
            now, line = "heading", re.sub(r" \{#[\w-]+\}$", "", line)
        elif line.startswith("|"):
            now = "table"
        elif line.startswith("- "):
            now = "ul"
        elif re.match(r"\d+\. ", line):
            now = "ol"
        else:
            now = "p"
        if out and not (now == kind and now in ("table", "ul", "ol")):
            out.append("")
        out.append(md_link(line))
        kind = now
    return "\n".join(out)


def md_page(slug, level=1):
    p = PAGES[slug]
    body = md_body(p["body"])
    if level > 1:  # inside the one-file copy, a page is a section and its sections sit under it
        body = re.sub(r"^(#+) ", lambda m: "#" * (len(m.group(1)) + level - 1) + " ", body, flags=re.M)
    return f"{'#' * level} {p['title']}\n\n{md_link(p['intro'])}\n\n{body}\n"


AGENT_ORDER = [s for s in ORDER if GROUP_OF[s] == "Architecture"] + [s for s in ORDER if GROUP_OF[s] != "Architecture"]
LLMS_INTRO = (f"# ohm docs\n\n> ohm is an agentic social network that extends a person's own website: a vault of posts that are private, "
              f"for friends or public, with public posts published to the person's own AT Protocol account, and tools that let their agent work in the vault.\n\n"
              f"{ALERT}\n\n")


def llms_index():
    out = [LLMS_INTRO + f"For the big picture, read [System overview]({DOCS_ORIGIN}/architecture.md) first. An agent that will work in a vault should then read "
           f"[Agent integration]({DOCS_ORIGIN}/mcp.md). Everything in one file: [{DOCS_ORIGIN}/llms-full.txt]({DOCS_ORIGIN}/llms-full.txt)\n"]
    for name in ["Architecture"] + [name for name, _ in GROUPS if name != "Architecture"]:
        out.append(f"## {name}\n\n" + "\n".join(
            f"- [{PAGES[s]['title']}]({DOCS_ORIGIN}/{s}.md): {plain_text(first_sentence(PAGES[s]['intro']))}" for s in ORDER if GROUP_OF[s] == name) + "\n")
    return "\n".join(out)


def plain_text(text):
    return re.sub(r"[`*]", "", text)


for slug in ORDER:
    (docs_site / f"{slug}.md").write_text(f"{md_page(slug)}\n---\n{ALERT}\nAll pages: {DOCS_ORIGIN}/llms.txt\n")
(docs_site / "llms.txt").write_text(llms_index())
(docs_site / "llms-full.txt").write_text(LLMS_INTRO + "\n".join(md_page(slug, level=2) for slug in AGENT_ORDER))


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
        if target in ("assets", "llms"):
            continue
        target = target or "index"
        assert target in ids, (slug, target)
        assert not anchor or anchor in ids[target], (slug, target, anchor)
print("ok:", len(ORDER) + 1, "docs pages")
