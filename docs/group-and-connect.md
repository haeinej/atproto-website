# Group and connect blocks

Each essay, photograph, or project has one post record. A section page can show posts with a label you choose. A curated group can be an ordinary post with a title and an ordered list of links. The same essay can appear under Writings, inside a series, and in a second group about independence. Each view links to the same record.

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

## Make an ordered group

Publish a Markdown post called “Collisions” with links in the order you want people to read them. Use the DID of the account that holds the records, your site's post collection, and the record keys you used when publishing. The example below assumes the two target records have been published at the example addresses.

```md
1. [trap of independency](at://did:web:pds.example.com/com.example.post/trap-of-independency)
2. [just buy that jacket](at://did:web:pds.example.com/com.example.post/just-buy-that-jacket)
```

Put the same kind of link inside a paragraph to connect related blocks. The site renders links to your archive posts as clickable `/posts/<record-key>` URLs. It also renders DID-based Bluesky post links as links to Bluesky. Use the other site's public HTTPS URL when linking to a different personal archive. The JSON feed includes recognized AT URIs in each post's `links` array. A backlinks view can build a reverse index from the links in all its source records.

Obsidian uses internal links to connect notes and can show which other notes link back. It also lets an author embed all or part of another note. Markdown links serve as the portable authoring format here. [Obsidian internal links](https://obsidian.md/help/links) · [Obsidian backlinks](https://obsidian.md/help/plugins/backlinks) · [Obsidian embeds](https://obsidian.md/help/embeds)

## Quote a passage

Put the quoted passage in a Markdown blockquote and link to the source underneath it.

```md
> i had confused independence with defensibility.

[trap of independency](at://did:web:pds.example.com/com.example.post/trap-of-independency)
```

That keeps the selected words in your block and gives the reader a link to the source. Bluesky's native quote card uses an `app.bsky.embed.record` containing a strong reference. The AT URI identifies the target record and the CID identifies the version. Use a strong reference if adding version-specific quote cards to this project. [Bluesky posting tutorial](https://github.com/bluesky-social/bsky-docs/blob/main/docs/tutorials/creating-a-post.mdx#quote-posts) · [AT URI specification](https://atproto.com/specs/at-uri-scheme)

## Address a record

| What you are identifying | Form |
| --- | --- |
| The post's record type | `com.example.post` |
| A specific post in someone's repo | `at://did:web:pds.example.com/com.example.post/trap-of-independency` |
| Its public web page | `https://example.com/posts/trap-of-independency` |
| The schema, when published by its authority | `at://did:web:pds.example.com/com.atproto.lexicon.schema/com.example.post` |

The DID belongs to the author of the record, so posts by different people can use the same Lexicon. Use a DID in durable links. A title can contain spaces and punctuation while the record key must follow AT Protocol's record-key syntax. The `#image` and other suffixes in the Lexicon name definitions inside the schema. [AT URI specification](https://atproto.com/specs/at-uri-scheme) · [Record keys](https://atproto.com/specs/record-key) · [Publishing Lexicons](https://atproto.com/guides/publishing-lexicons)
