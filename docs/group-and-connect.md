# Group and connect blocks

Each essay, photograph, or project has one post record, filed under one label. A sublabel groups posts inside a label. A curated group can also be an ordinary post with a title and an ordered list of links, so the same essay can sit in its sublabel and in a second group about independence. Each view links to the same record. [Forms, labels, and sublabels](labels.md)

For example, a site could present these sections.

```text
/writings/
  trap of independency
  just buy that jacket
  collisions
    trap of independency
    just buy that jacket
/photographs/
  seoul in the evening
/projects/
```

The labels and groups organize the site. A published block has its own stable record key, so moving it between groups does not change what a link points to.

## Connect a block

A block can say what it came from: an earlier block of yours, or a page on the web. There is one kind of connection. A reply, a follow-up, a response to an article, and the next part of a thread are each a block connected to what came before it.

```sh
npm run publish:post -- \
  --file ./rain-again.md \
  --slug rain-again \
  --connect after-the-rain \
  --connect https://example.org/the-article-that-started-it
```

`--connect` takes the slug of one of your posts, an AT URI, or an HTTPS URL. The record keeps them in `connect`.

```json
"connect": [
  "at://did:web:pds.example.com/com.example.post/after-the-rain",
  "https://example.org/the-article-that-started-it"
]
```

A post's own page stays the same: its text, date, platform, and label. Connections do not change the posts list either. The list opens on All, a plain list with the newest post first, and can be arranged by label or by platform instead. When you are signed in, it can also be arranged by visibility. [Keep a post private](../README.md#keep-a-post-private) The folders are then the labels in use, or the platforms your posts came from. Posts inside a folder are a flat list. Only a label has folders inside it, one for each sublabel. Posts without a label follow the label folders. A link to one of your posts inside the body counts as a connection too.

The list reads `/notes/graph.json`, which has every post by AT URI with its name, date, platform, form, label, sublabel, and the posts that branch from it. An untitled post is named by its first line. In `/notes.json`, each post keeps `connect` and has `links` with every connected address.

`source` is a different field. It records where the same post first appeared, such as the X URL of an imported post.

## Make an ordered group

Publish a Markdown post called “Collisions” with links in the order you want people to read them. Use the DID of the account that holds the records, your site's post collection, and the record keys you used when publishing. The example below assumes the two target records have been published at the example addresses.

```md
1. [trap of independency](at://did:web:pds.example.com/com.example.post/trap-of-independency)
2. [just buy that jacket](at://did:web:pds.example.com/com.example.post/just-buy-that-jacket)
```

The site renders links to your archive posts as clickable `/posts/<record-key>` URLs, which lead on to each post's full address. It also renders DID-based Bluesky post links as links to Bluesky. Use the other site's public HTTPS URL when linking to a different personal archive.

## Quote a passage

Put the quoted passage in a Markdown blockquote and link to the source underneath it.

```md
> i had confused independence with defensibility.

[trap of independency](at://did:web:pds.example.com/com.example.post/trap-of-independency)
```

That keeps the selected words in your block and gives the reader a link to the source.

## Address a record

| What you are identifying | Form |
| --- | --- |
| The post's record type | `com.example.post` |
| A specific post in someone's repo | `at://did:web:pds.example.com/com.example.post/trap-of-independency` |
| Its public web page | `https://example.com/posts/writings/collisions/trap-of-independency` |
| The folder it sits in | `https://example.com/posts/writings/collisions/` |
| The schema, when published by its authority | `at://did:web:pds.example.com/com.atproto.lexicon.schema/com.example.post` |

The DID belongs to the author of the record, so posts by different people can use the same Lexicon. Use a DID in durable links. A title can contain spaces and punctuation while the record key must follow AT Protocol's record-key syntax. The `#image` and other suffixes in the Lexicon name definitions inside the schema. [AT URI specification](https://atproto.com/specs/at-uri-scheme) · [Record keys](https://atproto.com/specs/record-key) · [Publishing Lexicons](https://atproto.com/guides/publishing-lexicons)
