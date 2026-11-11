# Give your website a content layer

Start with your existing site. Keep its navigation, routes, and visual design. Give the content a home in your own AT Protocol repository, then use the records to render the views you want. The same photograph can appear in a gallery and in a travel note, with one record and one set of media.

[Cirrus](https://github.com/ascorbic/cirrus) runs the repository. This project gives you a starter post schema, publishing tools, and a feed Worker. The Worker refreshes its copy of the feed from your PDS; your site can render that feed or read records directly. The Worker does not fetch new posts from social accounts.

## Give your coding agent this brief

Open your existing website source with your coding agent and point it at this repository. Replace the example domain and tell it which section you want to try first.

> Give my existing site at example.com a content layer on AT Protocol. Start with one section. Inspect its routes and markup and identify the content separately from its layout. Keep the site's current public URLs and style.
>
> Use this repo's post template to generate a Lexicon under a domain I control. Use Markdown for the body, labels for categories, and AT URI links for connections between records. Add optional fields only where a real example needs them. Update the writer and the site's renderer for any new fields they use.
>
> Convert one existing item first. Keep its text, original date, media, alt text, and source ID and URL when available. Preview the record, the public page, and one link between posts. Check that the writer, importer, and reader all use the same collection. Show me the result before publishing records or changing live routes.

## What to keep in the record

| Content you have | How to carry it over |
| --- | --- |
| Essay, caption, thread, or link | Use a Markdown body, with an optional title. |
| Images, audio, or video you have the files for | Upload them as blobs to your PDS. Place them in the body with `media:ID` references. |
| Existing website URL | Use it as the canonical URL if the page stays there. The starter publisher generates `/posts/<slug>`; adjust the site's writer and routes when keeping an existing path. |
| Social post ID, URL, and date | Preserve the ID as a string, the original URL in `source.uri`, and the original date in `publishedAt` when available. |
| Writings, photographs, projects, or other groups | Start with labels in `tags`. Use ordered AT URI links for a curated group. |

The [Java importer](../README.md#import-an-x-archive) handles X exports. The [Markdown publisher](../README.md#publish-a-markdown-post) works with local text and media from other sources and accepts source metadata. For another platform's export, have your agent map the fields and convert a sample first. Each export has its own format and may omit media or other context.

## Own the schema and its addresses

Follow [the setup instructions](../README.md#set-up-your-site) to generate the site configuration and a Lexicon file. A site on `example.com` can start with `com.example.post`. The reversed domain is the namespace, and the last part names the record type. [AT Protocol NSID specification](https://atproto.com/specs/nsid)

Use the same collection in the generated schema, the site's feed configuration, and the X importer's `--collection` option. For a post named `hello`, the AT URI might be `at://did:web:pds.example.com/com.example.post/hello`. The DID comes from the account holding the record. The public URL comes from the site. [Record and link examples](group-and-connect.md)

Keep the schema file with your site code. You can add optional fields, such as a project status, while keeping the starter fields that your tools rely on. Keep the collection name once posts are live, because changing it changes their AT URIs. If you want other software to discover the schema, follow the [AT Protocol guide to publishing Lexicons](https://atproto.com/guides/publishing-lexicons) to publish it as a record and set the corresponding DNS TXT record.
