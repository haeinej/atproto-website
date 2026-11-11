# Forms, labels, and sublabels

A post has three things that say where it belongs. Two are yours to name. One is worked out for you.

| | What it is | Who decides | Seen on the site |
| --- | --- | --- | --- |
| Label | The section of your website the post sits in | You, in your own words | Yes |
| Sublabel | A group inside that section | You, in your own words | Yes |
| Form | What kind of object the post is | The tools, from its content | No |

## Labels are your site's sections

Start with the labels. They are the names your website already uses for its sections, and they are the place to begin building: each label becomes a list, a page, or a part of your navigation.

haeinjung.com has three sections in its navigation, so it has three labels.

| On the website | Label |
| --- | --- |
| writings | `Writings` |
| photographs | `photographs` |
| things i make | `things i make` |

A label can be any words, in any language, with any capitalisation. Another site might have `Blog`, `Journal`, and `Field recordings`. Nothing checks the name. A post has one label.

## Sublabels are groups inside a label

Use a sublabel when several posts are parts of one thing. It is also your own words.

| On the website | Label | Sublabel |
| --- | --- | --- |
| writings → the Collisions essays → "trap of independency" | `Writings` | `Collisions` |
| writings → "elsewheren", an essay on its own | `Writings` | |
| photographs → Seoul | `photographs` | `Seoul` |
| things i make → "Why I Started ohm." | `things i make` | |

In the posts list, a sublabel is a folder inside its label's folder, and its posts read in the order they were written. Most posts have no sublabel.

```sh
npm run publish:post -- --file ./essay.md --slug trap-of-independency \
  --title 'trap of independency' --label Writings --sublabel Collisions
```

## Forms are identified for you

Labels differ from site to site, so a label cannot tell other software what a post is. One site files its essays under `Writings`, another under `Blog`, a third under `Essais`. The form is the part that is the same everywhere: all three are a `writing`.

There are thirteen forms, and the list is fixed. You do not choose one, and it is not shown on your site. The publish command reads it off the post's format and saves it in the record.

| What the post contains | Form |
| --- | --- |
| A title, with text and anything placed in the text | writing |
| No title: a thought, a caption with a photo, an imported social post | note |
| Only one image | image |
| Only images, more than one | gallery |
| Only video | video |
| Only audio | audio |
| Only files, such as a PDF | file |
| Only attachments, of more than one kind | media |
| No title, and a link on a line of its own | link |
| The same, when the link plays something, such as a YouTube or SoundCloud page | embed |
| No title, a quoted passage, and a link to its source | quote |
| Nothing but a list, such as an ordered set of links | list |
| Nothing but code blocks | code |

Some examples, using the labels above.

| The post | Label you gave it | Form identified |
| --- | --- | --- |
| "trap of independency", a titled essay with two photos in the text | `Writings` | writing |
| "Why I Started ohm.", a titled project write-up | `things i make` | writing |
| Four photographs from Seoul, no text | `photographs` | gallery |
| A short film on its own | `things i make` | video |
| "It rained again, and this time I stayed out in it." | `Notes` | note |
| "Collisions", a title and a numbered list of links to four essays | `Writings` | list |
| A link to a talk on YouTube, with one line about it | `Notes` | embed |

Two things follow from this. Posts with different labels can share a form: an essay and a project write-up are both a writing. And one label can hold different forms: `Writings` holds writings and a list.

### A link to an image is an image

How a thing arrives does not change what it is. A photograph is an image whether you upload the file or point at it on the web. So when a post is nothing but a link to an image, video, audio file, or document, the publish command takes the file in, stores it with your other attachments, and remembers the link as its source. The post is then that object, and it stays intact if the other site goes away.

| The whole post is | What is saved | Form |
| --- | --- | --- |
| `<https://example.org/photos/street.jpg>` | The image, with the link as its source | image |
| `[The paper](https://example.org/paper.pdf)` | The PDF, with the link as its source and "The paper" as its description | file |
| `<https://images.example.org/photo-123?w=800>` | The image. The address does not look like a file, but the other site says it is one | image |
| `<https://www.youtube.com/watch?v=abc>` | The link, with the page's title, description, and preview image | embed |
| `<https://example.org/an-article>` | The link, with the page's title, description, and preview image | link |
| A sentence, then `<https://example.org/photos/street.jpg>` | The sentence and the link | link |

The last row stays a link because you wrote about it instead of posting the file itself. To place a web image inside a longer post, attach it by address: write `![A wet street](media:street)` in the body and pass `--media street=https://example.org/photos/street.jpg`. To keep a lone file link as a link, pass `--form link`.

The command looks at what a link points to and goes by what the other site returns. An image, video, audio file, or PDF is taken in whatever its address looks like. A page that only looks like a file stays a link.

A link or embed post keeps what its page said about itself: the title, description, site name, and a copy of the preview image. The post's page shows them as a card, and the post is listed under the page's title.

### What each form may hold

The form also sets limits, and the publish command refuses a post that breaks them.

| Form | Title | Words of its own | Attachments | Body must have |
| --- | --- | --- | --- | --- |
| writing | Required | Yes, free-form Markdown | Any | |
| note | None | Yes | Any | |
| image | Optional | No | One image | |
| gallery | Optional | No | Two or more images | |
| video | Optional | No | Video, at least one | |
| audio | Optional | No | Audio, at least one | |
| file | Optional | No | Files, at least one | |
| media | Optional | No | Any mix, at least one | |
| link | Optional | Yes | None | A link |
| embed | Optional | Yes | None | A link to something that plays |
| quote | None | Yes | None | A quoted passage and a link to its source |
| list | Optional | Yes | None | Only a list |
| code | Optional | No | None | Only code blocks |

An attachment is an image, a video, audio, or a file. Files are PDF, EPUB, ZIP, JSON, plain text, CSV, and Markdown.

For the forms without words, describe an attachment in its alt text: `![A wet street at dusk](media:street)`.

If the tools identify a post differently from what you meant, pass `--form`. A titled post that is really a link with a comment is `--form link`. The post must still fit the form you name.

## Not sure what your labels should be

You do not need a website to start. A coding agent can help you work it out. It looks at what you have so far, whether that is published posts, an export from another platform, or only an idea of what you want to make. It offers one plain starting point, `Writing`, `Photos`, and `Projects`, and then asks you questions until the structure is yours: what visitors should find first, what you call each section, what belongs together, and in what order. Point it at [the suggest-labels skill](../skills/suggest-labels/SKILL.md). To see what it reads, run `npm run --silent posts`.

## Where the rules live

[`feed/forms.mjs`](../feed/forms.mjs) holds the forms, how a form is identified, and the check. The `form` field in [the Lexicon](../lexicons/com/haeinjung/post.json) lists the same thirteen.
