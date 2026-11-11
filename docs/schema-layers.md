# The fixed schema and your own fields

A post and a profile each have two layers. One is the same on every site. The other is yours.

| | The fixed schema | Your optional layer |
| --- | --- | --- |
| What it holds | A post's title, subtitle, body, dates, address, form, label, sublabel, connections, link, source, attachments. A profile's name, description, pronouns, links, pictures | Anything only your site needs |
| Who defines it | This project | You, in a schema under your domain |
| Who understands it | Any software that reads AT Protocol posts of this kind | Your own website |
| Where it appears | Your site, the shared pages, and other applications | Your own site only |
| Where it sits in the record | The record's own fields | Under the record's `site` field |

## Why the fixed schema stays fixed

The fixed schema is what makes your posts readable by other software. Two sites that both use it can be read by the same tools, and a tool written for one works for the other. That only holds while the fields are identical everywhere, so a site does not add to it, rename in it, or change what a field means.

This is a rule of the project, and the tools enforce it. The publish command has no way to write a field outside the fixed schema except through the optional layer, and a test fails if the fixed schema's list of fields changes.

## Where your own fields go

Most sites have things the fixed schema has no place for: a small line above a title, an episode number, a translation, a project's status. These go in your optional layer.

1. Create your optional schema once, beside your post schema. A profile has one too.

   ```sh
   npm run --silent lexicon -- --kind postSite > lexicons/com/example/postSite.json
   npm run --silent lexicon -- --kind profileSite > lexicons/com/example/profileSite.json
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

Your optional layer is unlisted. That means it is there for your own site and absent everywhere it does not apply. Your website can show it however you like: it is passed through in `/notes.json` and `/notes/profile.json`. Another application, such as Bluesky, has no use for an episode number or a "now" section, so it never receives them, and the shared pages this project serves leave them out too.

Fixed fields are the opposite. They appear wherever they apply: on your site, on the shared pages, and in any application that reads AT Protocol records of that kind.

## Match the shared language first

Before anything goes in the optional layer, check whether it already has a fixed field. If it means the same thing, fill the fixed field, so every application can read it. Only what has no match is unlisted.

A profile uses Bluesky's own fields, so the match is by name.

| What your site has | Fixed field | Appears on Bluesky |
| --- | --- | --- |
| Name | `displayName` | Yes |
| Bio, about, tagline | `description` | Yes |
| Pronouns | `pronouns` | Yes |
| Links to your other places | `links` | Yes |
| Profile picture, cover image | `avatar`, `banner` | Yes |
| A "now" section, a location, a résumé | none: your optional layer | No |

A post's fixed fields line up with a Bluesky post like this.

| What your site has | Fixed field here | Bluesky's field |
| --- | --- | --- |
| The text | `body` | `text` |
| When it was published | `publishedAt` | `createdAt` |
| Images and video, with alt text | `media` | `embed` images and video |
| A link shown as a card | `link` | `embed` external |
| What it replies to or quotes | `connect` | `reply`, `embed` record |
| Section, category, series | `label`, `sublabel` | none |
| An episode number, a small line above the title | none: your optional layer | none |

The commands hold you to this. Asking for `--site bio=…` on a profile is refused with a pointer to `--description`, and `--site tags=…` on a post points to `--label`.

## Choosing between them

Use a fixed field when one fits, even loosely. Use your optional layer only when nothing fits. Ask before adding to the optional layer if you are an agent: what a site keeps about its posts is its owner's decision.

If something seems to belong in the fixed schema for everyone, that is a change to this project and not to your site. Raise it there.
