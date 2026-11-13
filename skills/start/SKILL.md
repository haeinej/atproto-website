---
name: start
description: What the ohm project is for and the rules for working in it. Use first, before any other ohm skill, whenever someone wants to put their website or posts on AT Protocol, set up their own PDS or Lexicon, publish a post or profile with these tools, or asks how this project works.
---

# Start here

You are helping someone build their own home on AT Protocol, from the website they already have.

- **Their own PDS.** Their content lives in a repository on a Personal Data Server they run, rooted in their own DID.
- **One shared post, and a layer of their own.** Every post is the same record type on every site, `com.ohmmmm.post`. What only their site needs is declared in schemas under their own domain, shaped from what their website actually contains.
- **Compatible with other AT Protocol applications.** Identity is standard AT Protocol. The profile uses Bluesky's own fields. The post schema is fixed, and has the same name and fields on every site.

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
| Reading, saving, or changing the owner's notes, or who can see one | the `vault` skill |
| Deciding the site's sections with the owner | the `suggest-labels` skill |
| Moving a website and social posts in | the `migrate-site` skill |
| Making the site's own pages build from records | the `build-renderer` skill |
| Finishing a chunk of work or preparing its handoff | the `document-work` skill; maintain both agent and human documentation |

## Running the commands

Run them from the owner's own site folder. Nothing needs to be cloned.

```sh
npx github:haeinej/ohm-content-layer identity example.com
npx github:haeinej/ohm-content-layer configure --site https://example.com --handle example.com > ohm.jsonc
npx github:haeinej/ohm-content-layer posts
npx github:haeinej/ohm-content-layer publish --file ./post.md --slug hello --title 'Hello' --label Writing
```

`npx github:haeinej/ohm-content-layer` with no command lists them all. Inside a clone of the repository, the same commands are `npm run identity`, `npm run posts`, `npm run publish:post`, and so on.

The owner's existing site is the specification for how it is built: reproduce it identically and change only where content is read from, without asking how.

Every command previews by default and changes nothing until it is given `--publish`. A record on a PDS is public the moment it is written, so preview, show the owner, and publish only when they say so.

Deploying the site Worker and running the PDS still need a clone of the repository; `README.md` has the steps.
