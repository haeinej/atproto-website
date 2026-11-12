# Mirror

The mirror copies what you publish on other platforms into your repository. Press one button, or let it run on a schedule, and every connected platform is brought up to date.

It runs one way only. It reads from each platform and writes to your PDS. It never writes back to a platform, and it never deletes a post because a platform stopped listing it.

## When to use it

There are two ways to put a website on this content layer.

| | Source of truth | What you run |
| --- | --- | --- |
| Refactor | Your repository | [The renderer](../skills/build-renderer/SKILL.md): your site builds its pages from records |
| Mirror | Your website and platforms | The mirror: your repository follows them |

Pick one per source. A site that has been refactored should not also be mirrored, or the two would overwrite each other.

## Connect platforms

A source is a platform's name, where to read it, and the label its posts are filed under. They are listed in the mirror's configuration as `MIRROR_SOURCES`.

```json
[
  { "platform": "website", "feed": "https://example.com/feed.xml", "label": "Writing" },
  { "platform": "substack", "feed": "https://example.substack.com/feed", "label": "Writing", "sublabel": "Newsletter" },
  { "platform": "x", "userId": "1234567890", "label": "Notes" }
]
```

| Platform | How it is read | Needs |
| --- | --- | --- |
| Anything with a feed: your website, Substack, a blog | Its RSS, Atom, or JSON Feed | The feed's address |
| X | X's API | An X developer token with read access, saved as the secret `X_BEARER_TOKEN`. This reader has not been run against X. Bring in history with [the archive importer](../README.md#import-an-x-archive) |

Each post becomes one record. Its key comes from its address, so the same post always lands on the same record: `a-walk` from your website, `substack-a-letter` from Substack, `x-1234` from X. Its form is identified from its content, its images are copied into your repository with their source addresses kept, and a post from another platform records where it first appeared. A post from your own website keeps the address of the page it came from as its address, and one that changes at its source is written again with the time it was updated.

## Run it

- **On a schedule.** The Worker runs every hour by default; change `triggers.crons` in `mirror/wrangler.jsonc`.
- **With one button.** Open `https://example.com/mirror/`. The page lists each connected platform with the result of its last run, and has a **Mirror now** button.
- **From a deploy hook or a script.** `POST https://example.com/mirror/run` with `Authorization: Bearer <MIRROR_TOKEN>`.

A run writes only what changed. It also does a bounded amount of work, 25 posts by default (`MIRROR_BUDGET`), and leaves the rest for the next run, so a first mirror of a large platform completes over several runs. A post that fails is reported with its reason and does not stop the others.

## Set it up

1. Copy `mirror/wrangler.jsonc`, and set your domain, DID, PDS, namespace, and sources.
2. Save two secrets: `PDS_AUTH_TOKEN`, your PDS's own write token, and `MIRROR_TOKEN`, any long random value, for scripts.
3. Put the page behind Cloudflare Access, as for [private posts](../README.md#keep-a-post-private), and set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. Without Access and without the token, every address under `/mirror` answers 404.
4. Deploy: `pnpm --dir cirrus exec wrangler deploy --config ../mirror/wrangler.jsonc`.

## What it cannot do

- **It reads what a feed carries.** Many feeds hold only the latest posts, or a summary instead of the full text. The mirror copies what it is given.
- **HTML it has no Markdown for is reduced to its words.** An embedded player or a table loses its form; the run's report names which posts were simplified.
- **Images only.** Video and audio attached to a post are not copied yet.
- **Nothing is published without you connecting the platform.** Adding a source is the approval; a record on a PDS is public the moment it is written.
