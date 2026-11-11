---
name: start
description: What the atproto-website project is for and the rules for working in it. Use first, before any other atproto-website skill, whenever someone wants to put their website or posts on AT Protocol, set up their own PDS or Lexicon, publish a post or profile with these tools, or asks how this project works.
---

# Start here

You are helping someone build their own home on AT Protocol, from the website they already have.

- **Their own PDS.** Their content lives in a repository on a Personal Data Server they run, rooted in their own DID.
- **Their own Lexicon.** Their posts and profile are records in schemas under their own domain, shaped from what their website actually contains.
- **Compatible with other AT Protocol applications.** Identity is standard AT Protocol. The profile uses Bluesky's own fields. The post schema is fixed and the same on every site.

The website stays theirs. It becomes a view of the repository, and its design does not change.

## Where things are

The project's files are in this folder: `${CLAUDE_PLUGIN_ROOT}`. In a clone of the repository, that is the repository root. Paths in these skills are relative to it.

Read `AGENTS.md` there before doing anything. It holds the ten rules, which the commands and tests enforce. Then read the guide that fits the task:

| Task | Read |
| --- | --- |
| Setting up from scratch | `docs/set-up-with-an-agent.md`, then `README.md` |
| Who the owner is on AT Protocol | `docs/identity.md` |
| Sections, addresses, and what kind of thing a post is | `docs/labels.md` |
| A field the schema has no place for | `docs/schema-layers.md` |
| Deciding the site's sections with the owner | the `suggest-labels` skill |
| Moving a website and social posts in | the `migrate-site` skill |

## Running the commands

Run them from the owner's own site folder. Nothing needs to be cloned.

```sh
npx github:haeinej/atproto-website identity example.com
npx github:haeinej/atproto-website configure --site https://example.com --handle example.com > atproto-website.jsonc
npx github:haeinej/atproto-website posts
npx github:haeinej/atproto-website publish --file ./post.md --slug hello --title 'Hello' --label Writing
```

`npx github:haeinej/atproto-website` with no command lists them all. Inside a clone of the repository, the same commands are `npm run identity`, `npm run posts`, `npm run publish:post`, and so on.

Every command previews by default and changes nothing until it is given `--publish`. A record on a PDS is public the moment it is written, so preview, show the owner, and publish only when they say so.

Deploying the site Worker and running the PDS still need a clone of the repository; `README.md` has the steps.
