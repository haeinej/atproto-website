# Build a block

A block is one thing you want to publish. It can be a sentence, a photograph, an essay, a project update, or a post you brought over from another site. Each block becomes one record in your site's post collection and has its own URL. A photograph and a paragraph can share one block when they belong together.

## Give it a body

Write the body in Markdown. You can start with just a sentence, a link, or a photo with alt text. The publishing command sets the publication date and builds the public URL from your site and the slug you choose. Add a title when it helps people recognize the block.

For example, save this as `rain.md`.

```md
The street went quiet after the rain.

![A wet street reflecting the evening light](media:street)

[The walk it came from](https://example.com/walks/after-the-rain)
```

`media:street` places the attachment exactly where it appears in the body. Match it to a file with `--media street=./street.jpg`, or to an image on the web with `--media street=https://example.org/street.jpg`. Leave out the media option for a text or link block.

## Give it a label

A label is the section of your site the block belongs to, in your own words: `Writings`, `photographs`, `Field notes`. Add a sublabel when the block is part of a group inside that section, such as an essay series. Both are optional, and a block has one of each at most.

You do not say what kind of thing the block is. The publish command identifies its form from the content and saves it: `rain.md` has words and a photo and no title, so it is a note. With a title it would be a writing, and with only the photo it would be an image. There are thirteen forms in all, covering galleries, video, audio, files, links, embeds, quotes, lists, and code. [Forms, labels, and sublabels](labels.md)

## Preview and publish

After [setting up your site](../README.md#set-up-your-site), run this command from the repository root.

```sh
npm run publish:post -- \
  --file ./rain.md \
  --slug after-the-rain \
  --label 'Field notes' \
  --media street=./street.jpg
```

This prints a local preview. When ready, set `ATPROTO_APP_PASSWORD` and rerun the command with `--publish` to make the block public. For an X archive, the Java importer accepts one `--label` for the posts in that selection. [X archive import](../README.md#import-an-x-archive)

## What the record needs

The smallest complete record has a type, a body, a publication date, a canonical URL, and its form. This example adds a label. Replace `com.example.post` with your site's collection.

```json
{
  "$type": "com.example.post",
  "body": "I want to remember how the city smelled after the rain.",
  "publishedAt": "2026-01-14T09:00:00Z",
  "canonicalUrl": "https://example.com/posts/after-the-rain",
  "form": "note",
  "label": "Field notes"
}
```

The same record can become a full page, a short feed entry, or a gallery card. Your site decides which fields to show and how to lay them out. [Generate your site's Lexicon](set-up-with-an-agent.md)

Use [Group and connect blocks](group-and-connect.md) to build a series, connect related posts, or quote a passage.
