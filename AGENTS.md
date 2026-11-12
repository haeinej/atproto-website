# For coding agents

## What this project is for

You are helping someone build their own home on AT Protocol, from the website they already have.

- **Their own PDS.** Their content lives in a repository on a Personal Data Server they run, rooted in their own DID. [Cirrus](cirrus/) runs it on Cloudflare.
- **One shared post, and a layer of their own.** Every post is the same record type on every site, `com.ohmmmm.post`. What only their site needs is declared in schemas under their own domain, shaped from what their website actually contains.
- **Compatible with other AT Protocol applications.** Identity is standard AT Protocol. The profile uses Bluesky's own fields. The post schema is fixed, and has the same name and fields on every site. So other software can resolve who they are, and find and read what they publish.

The website stays theirs. It becomes a view of the repository, and its design does not change.

## The rules

These are enforced by the commands and tests. Do not work around them.

1. **Identity is the root.** Everything starts from the DID. Its document names the handle and the PDS; the repository is the container for every record. [docs/identity.md](docs/identity.md)
2. **The fixed schemas stay fixed.** Never add, rename, or repurpose a field in the post or profile schema, and never give the post another type name: it is `com.ohmmmm.post` for everyone. [docs/schema-layers.md](docs/schema-layers.md)
3. **Match the shared language first.** If something on the site means the same as a fixed field, fill that field, so other applications can read it. A profile's fixed fields are Bluesky's.
4. **Otherwise it is unlisted.** What has no match goes in the site's own optional layer, declared in the site's optional schema and set with `--site`. The owner's site shows it; applications it does not apply to never see it.
5. **Every post has a label, and the address comes from it.** `/posts/<label>/<sublabel>/<slug>`. A post that fits no section goes under `other`, as a last resort. [docs/labels.md](docs/labels.md)
6. **Labels are the owner's words.** Offer the plain default and ask. [skills/suggest-labels/SKILL.md](skills/suggest-labels/SKILL.md)
7. **Never set or mention a post's form.** The publish command identifies it.
8. **The site's source is the specification.** Do not ask the owner how to build their site. Rebuild it identically and swap only where the content is read from. Ask only what neither the source nor the content can tell you, one decision per question.
9. **Nothing lost, nothing looks different, only the content side changes.** Work on a copy, take a baseline, and check against it. [skills/migrate-site/SKILL.md](skills/migrate-site/SKILL.md)
10. **Publish nothing without the owner's approval.** A record on a PDS is public the moment it is written. Preview first.

## Where to start

- Someone setting this up: [docs/set-up-with-an-agent.md](docs/set-up-with-an-agent.md)
- Moving a site in: [skills/migrate-site/SKILL.md](skills/migrate-site/SKILL.md)
- Deciding sections: [skills/suggest-labels/SKILL.md](skills/suggest-labels/SKILL.md)
- Making a site's pages build from records: [skills/build-renderer/SKILL.md](skills/build-renderer/SKILL.md)
- The commands: `npm run identity`, `posts`, `profile`, `publish:post`, `render`, `lexicon`, `configure`, `migrate`. Run `npm test` after changing code.
