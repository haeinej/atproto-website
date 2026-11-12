# Posts as files

In your folder, each post is one Markdown file. A label is a folder, a sublabel is a folder inside it, and everything else about the post is written at the top of the file.

## The folder

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

## One file

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

## What maps to what

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

## Links and pictures

Both ways of writing them are read, and each file keeps whichever it was written in.

| | Standard Markdown | Obsidian |
| --- | --- | --- |
| A link to another post | `[the first essay](first-essay.md)` | `[[first-essay]]` |
| A picture | `![A wet street](street.jpg)` | `![[street.jpg]]` |

## Nothing is lost on the way

A post written out as a file and read back is the same post. That holds for titles and text in any script, and for text that YAML would otherwise misread.

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
