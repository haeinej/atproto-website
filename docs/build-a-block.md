# Build a block

A block is one thing you want to publish. It can be a sentence, a photograph, an essay, a project update, or a post you brought over from another site. Each block becomes one `com.haeinjung.post` record and has its own URL. A photograph and a paragraph can share one block when they belong together.

## Give it a body

Write the body in Markdown. You can start with just a sentence, a link, or a photo with alt text. The publishing command sets the publication date and builds the public URL from your site and the slug you choose. Add a title when it helps people recognize the block.

For example, save this as `rain.md`.

```md
The street went quiet after the rain.

![A wet street reflecting the evening light](media:street)

[The walk it came from](https://example.com/walks/after-the-rain)
```

`media:street` places the attachment exactly where it appears in the body. Match it to a file with `--media street=./street.jpg`. Leave out the media option for a text or link block.

## Choose your own labels

Labels are optional. Use any words that make sense for your site, including multiple words or names in your own language. A block can have several labels, so the same photograph can belong with both `Photographs` and `Field notes`.

| Example | Possible labels |
| --- | --- |
| A site like haeinjung.com | `Writings`, `Photographs`, `Projects` |
| A personal notebook | `Thoughts`, `Daily notes`, `Ideas` |
| A writing archive | `Essays`, `Blogs`, `Draft reflections` |
| An archive of old social posts | `Tweets`, `Threads`, `Things I made` |

Choose labels by repeating `--label`. The CLI saves them in the record's `tags` field, and the site displays them with the block. Your labels are available in the JSON feed if you want to build a view for one of them.

## Preview and publish

After [setting up your site](../README.md#set-up-your-site), run this command from the repository root.

```sh
npm run publish:post -- \
  --file ./rain.md \
  --slug after-the-rain \
  --label 'Photographs' \
  --label 'Field notes' \
  --media street=./street.jpg
```

This prints a local preview. When ready, set `ATPROTO_APP_PASSWORD` and rerun the command with `--publish` to make the block public. For an X archive, the Java importer accepts the same repeatable `--label` option. It applies those labels to the posts in that selection. [X archive import](../README.md#import-an-x-archive)

## What the record needs

The smallest complete record has a type, a body, a publication date, and a canonical URL. This example adds two author labels.

```json
{
  "$type": "com.haeinjung.post",
  "body": "I want to remember how the city smelled after the rain.",
  "publishedAt": "2026-01-14T09:00:00Z",
  "canonicalUrl": "https://example.com/posts/after-the-rain",
  "tags": ["Thoughts", "Field notes"]
}
```

The same record can become a full page, a short feed entry, or a gallery card. Your site decides which fields to show and how to lay them out. [Post Lexicon](../lexicons/com/haeinjung/post.json)
