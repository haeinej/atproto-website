# Posts

Everything you keep in ohm is a post: an essay, a note to yourself, a photograph, a link. A post is a piece of Markdown with a date, and it can be one sentence.

## What a post has

- **A body,** in Markdown.
- **A date.**
- **A title and a subtitle,** if you give them.
- **A label,** and a sublabel if you use one. [Labels](https://docs.ohmmmm.com/labels.md)
- **Who can see it.** A new post is private. [Who sees a post](https://docs.ohmmmm.com/visibility.md)
- **Pictures and files** placed in the body.

## You do not choose what kind it is

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

## Pictures and files

Paste the address of a picture or file that is already on the web.

- **Your workspace keeps the address, not the file.** A post points at its pictures where they are.
- **When you publish, a copy is sent to your own account.** The published post then no longer depends on the other site staying up.
- **The original address is kept** with the copy, as its source.
- **An address that cannot be fetched is named** when you publish: one that needs a sign-in, or a file larger than 25 MB.

An attachment is an image, a video, audio, or a file such as a PDF, EPUB, ZIP, CSV or text file.

Describe a picture in its alt text. In a post with no words of its own, that description is also what names the post in lists.

## Links

A link on a line of its own, in a post with no title, makes the post a link. ohm saves what the page says about itself: its title, description and preview image.

A link that points straight at a picture, a video, an audio file or a document is taken in as that thing. A photograph is an image whether you upload it or point at it.

| The whole post is | What is kept | Read as |
| --- | --- | --- |
| A link to a photograph | The photograph, with the link as its source | image |
| A link to a PDF | The PDF, with the link as its source | file |
| A link to a video page | The link, with the page's title and preview | embed |
| A link to an article | The link, with the page's title and preview | link |
| A sentence, then a link to a photograph | The sentence and the link | link |

## Connecting posts

A link from one post to another is a connection. Use it for a reply, a follow-up, or the next part of a series. A post can connect to as many as 32 others.

A public post that connects to a private one does not show the private post's title, or that it exists, to anyone who cannot read it.

## A post's address

A post's address is built from where it is filed and its slug.

```
/posts/writings/collisions/trap-of-independency
       label    sublabel   slug
```

- **Change the slug** and the address changes. For a published post, the old address sends readers on to the new one.
- **Move the post to another label** and the address changes too. Publish shows you the new address before it does anything.
- **A slug is used once** in your workspace.

## Deleting a post

Deleting a private post removes it from your workspace. With a folder connected, the next Sync asks before removing the file.

Deleting a post that is published removes it from your site at the next Publish. Copies that other services already made stay where they are.

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
