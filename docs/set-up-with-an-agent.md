# Set this up with your coding agent

A coding agent can do most of this for you: bring in your website and your posts from other platforms, and change your site so it reads from records you own. Your job is to answer its questions, check its work, and say when to go live.

The agent reads [AGENTS.md](../AGENTS.md) first, which tells it what this project is for: building your own PDS and your own schemas from your website, in a form other AT Protocol applications can read.

Three rules shape the whole process, and the agent is given them in writing.

- **Nothing is lost.** Every piece of text, date, image, and alt text is carried over and checked against what was there before.
- **Nothing looks different.** Your pages keep their layout and their design, and every old address keeps working.
- **Only the content side changes.** The agent touches where your site gets its content from. It leaves your templates, styles, navigation, scripts, and hosting alone.
- **The post schema is fixed.** What your site needs beyond it goes in your own optional layer, which only your site shows.

It works on a copy of your site the whole time. Your live site keeps running, and nothing is published to your live PDS, until you approve.

## Before you start

- **Set up the tools.** Follow [Set up your site](../README.md#set-up-your-site) to install them and create your PDS. You can ask the agent to walk you through it. Your DID is the root of everything that follows. [Identity](identity.md)
- **Get your exports.** Download your archive from each platform you want to bring in. X has [an importer](../README.md#import-an-x-archive). For other platforms the agent converts the export itself.
- **Give your agent the skills.** In Claude Code, run `/plugin install ohm-content-layer --marketplace haeinej/ohm-content-layer`. With another agent, point it at this repository's `AGENTS.md` and `skills/` folder.
- **Open your website's source with the agent.** The commands run there with `npx github:haeinej/ohm-content-layer`, so nothing has to be cloned to convert and preview.

No website yet? Skip to step 2. The agent helps you decide your sections, and you publish posts into them as you go.

## The steps

Give the agent one step at a time and read what it hands back before moving on. The agent follows [the migrate-site skill](../skills/migrate-site/SKILL.md), which holds the detailed rules.

### 1. Take stock

> Follow skills/migrate-site/SKILL.md. Make a copy of my site to work in and do not touch the live one. Take the baseline in step 1: list every page and every piece of content, save how each page looks now, and count what is in my exports from [X, Substack, …]. Tell me the totals. Change nothing yet.

You get a count of pages, posts, and media files. Check it against what you expect. Anything missing here will be missing later.

### 2. Decide your labels

> Follow skills/suggest-labels/SKILL.md and settle my labels with me.

The agent shows you the sections your site already has, or a plain starting point if you have none, and asks you questions until the structure is yours. [Forms, labels, and sublabels](labels.md)

### 3. Try one item

> Convert one item from my site. Show me its record, the page before and after, and how you mapped each piece. Wait for my approval.

Look at the before and after side by side. This is the cheapest moment to correct how things are mapped.

### 4. Convert everything, on the copy

> Convert the rest, one label at a time, then my exports. Keep every text, date, image, and alt text exactly. List anything you could not carry over.

For platforms without an importer, the agent shows you five converted posts before doing the rest.

### 5. Switch the copy to read from records

> Change the content side of the copy so its pages read from the records. Keep all markup as it is, and make every old address lead to the post's new one. Do not change anything outside the content side; if you think you need to, ask me first.

### 6. Check and report

> Run the loss checks in step 6 of the skill and give me the report in step 7.

You get the totals before and after, every difference found, the items left out, and a list of every file changed. Open the copy yourself and click through it. The list of changed files should contain content files and loaders, and nothing from your design.

### 7. Go live

> I approve. Publish to my live PDS and deploy, then check the live site and tell me how to go back if I need to.

## What the agent decides and what you decide

| The agent | You |
| --- | --- |
| How each piece of content maps to a record field | What your labels and sublabels are called |
| What kind of object a post is. This is identified automatically and never shown | Which platforms to bring in |
| Whether a link is really an image, video, or file, and should be saved as one | Whether an item is public, private, or left out |
| How to prove nothing was lost | When to go live |

When the agent meets something with no obvious place, such as a subtitle or a note saying an essay first appeared elsewhere, it asks you. Each question covers one decision and gives a few options with what each leads to, the one it recommends first. Your answer is applied to every item of that kind.

## What to keep in the record

| Content you have | How to carry it over |
| --- | --- |
| Essay, caption, thread, or link | Use a Markdown body, with an optional title. |
| A link to an image, video, audio file, or document | Post the link on its own, or attach it with `--media ID=URL`. The file is taken in and the link kept as its source. |
| A link to a page | Post the link. Its page's title, description, and preview image are saved with it. |
| Images, audio, or video you have the files for | Upload them as blobs to your PDS. Place them in the body with `media:ID` references. |
| Existing website URL | A post's address is `/posts/<label>/<sublabel>/<slug>`, set by the publish command. Use the old page's name as the slug, and redirect the old address to the new one. |
| Social post ID, URL, and date | Preserve the ID as a string, the original URL in `source.uri`, and the original date in `publishedAt` when available. |
| A reply, follow-up, or thread | List the earlier post's AT URI, or the web page's URL, in `connect`. |
| Writings, photographs, projects, or other groups | Use the section's own name as the `label`, and a `sublabel` for a group inside it. [Forms, labels, and sublabels](labels.md) |

The [Java importer](../README.md#import-an-x-archive) handles X exports. The [publish command](../README.md#publish-a-post) works with local text and media from other sources and accepts source metadata. For another platform's export, have your agent map the fields and convert a sample first. Each export has its own format and may omit media or other context.

## Own the schema and its addresses

Follow [the setup instructions](../README.md#set-up-your-site) to generate the site configuration and a Lexicon file. A site on `example.com` can start with `com.example.post`. The reversed domain is the namespace, and the last part names the record type. [AT Protocol NSID specification](https://atproto.com/specs/nsid)

Use the same collection in the generated schema, the site's feed configuration, and the X importer's `--collection` option. For a post named `hello`, the AT URI might be `at://did:web:pds.example.com/com.example.post/hello`. The DID comes from the account holding the record. The public URL comes from the site. [Record and link examples](group-and-connect.md)

Keep the schema file with your site code. The post schema is fixed: do not add fields to it, rename them, or change what one means, because that is what keeps your posts readable by other software. Anything your site needs beyond it, such as a project status, goes in your own optional schema and is saved under the post's `site` field. [The fixed schema and your own fields](schema-layers.md) Keep the collection name once posts are live, because changing it changes their AT URIs. If you want other software to discover the schema, follow the [AT Protocol guide to publishing Lexicons](https://atproto.com/guides/publishing-lexicons) to publish it as a record and set the corresponding DNS TXT record.
