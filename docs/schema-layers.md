# The fixed schema and your own fields

A post has two layers. One is the same on every site. The other is yours.

| | The fixed schema | Your optional layer |
| --- | --- | --- |
| What it holds | Title, subtitle, body, dates, address, form, label, sublabel, connections, link, source, attachments | Anything only your site needs |
| Who defines it | This project | You, in a schema under your domain |
| Who understands it | Any software that reads AT Protocol posts of this kind | Your own website |
| Shown by the shared pages and lists | Yes | No |
| Where it sits in the record | The post's own fields | Under the post's `site` field |

## Why the fixed schema stays fixed

The fixed schema is what makes your posts readable by other software. Two sites that both use it can be read by the same tools, and a tool written for one works for the other. That only holds while the fields are identical everywhere, so a site does not add to it, rename in it, or change what a field means.

This is a rule of the project, and the tools enforce it. The publish command has no way to write a field outside the fixed schema except through the optional layer, and a test fails if the fixed schema's list of fields changes.

## Where your own fields go

Most sites have things the fixed schema has no place for: a small line above a title, an episode number, a translation, a project's status. These go in your optional layer.

1. Create your optional schema once, beside your post schema.

   ```sh
   npm run --silent lexicon -- --kind postSite > lexicons/com/example/postSite.json
   ```

2. Declare each field in it before you use it. Every field is optional.

   ```json
   "properties": {
     "eyebrow": { "type": "string", "description": "The small line above the title." },
     "episode": { "type": "integer", "description": "Position in a series." }
   }
   ```

3. Set the fields when you publish, one at a time or from a JSON file.

   ```sh
   npm run publish:post -- --file ./essay.md --slug trap-of-independency --title 'trap of independency' \
     --label Writings --sublabel Collisions --site 'eyebrow=collisions — ep.01' --site ./more.json
   ```

The command refuses a field your optional schema does not declare, a value of the wrong type, and any attempt to set a fixed field this way. The record then carries your fields under `site`, marked with your schema's name:

```json
"site": { "$type": "com.example.postSite", "eyebrow": "collisions — ep.01", "episode": 1 }
```

## Who sees it

Your optional layer is unlisted. The shared posts list, the post pages this project serves, and `/notes/graph.json` do not show it or use it, and other software ignores it. It is passed through in `/notes.json`, so your own website's pages can read it and present it however you like.

This keeps the two jobs apart. The fixed schema describes the post to everyone. Your optional layer describes how your site wants to present it.

## Choosing between them

Use a fixed field when one fits, even loosely. Use your optional layer only when nothing fits. Ask before adding to the optional layer if you are an agent: what a site keeps about its posts is its owner's decision.

If something seems to belong in the fixed schema for everyone, that is a change to this project and not to your site. Raise it there.
