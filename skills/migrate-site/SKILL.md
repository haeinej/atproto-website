---
name: migrate-site
description: Move an existing website's content, and posts from the owner's social accounts, into this content layer without losing anything or changing how the site looks. Use when someone wants to set this project up on their site, bring in their website or social posts, or refactor a site to read its content from records.
---

# Move a site onto the content layer

You are moving what the owner has published into records they own, and changing their website to read from those records. Two things must hold when you finish: nothing is lost, and nothing looks different. You work on a copy until the owner says to go live.

Read the [README](../../README.md) and [Forms, labels, and sublabels](../../docs/labels.md) first.

## The boundary

Only the content side of the website changes.

| You may change | You must not change |
| --- | --- |
| Where the site gets its content: content files, data files, the code that loads content and hands it to a page | Layout, templates' markup, CSS, fonts, images that are part of the design |
| Build steps whose only job is to assemble content | Navigation, URLs, redirects, and the sitemap's addresses |
| New files this project needs: its configuration, the Lexicon, a content loader | Scripts unrelated to content, analytics, SEO tags, deploy and hosting configuration |

If a page mixes content and layout in one file, lift the content out and leave the markup around it exactly as it was. If you think something on the right-hand side has to change, stop and ask the owner. Do not tidy, modernise, or fix unrelated code, even when it is clearly wrong; mention it instead.

## Work on a copy

- Make a branch or a separate checkout of the website. Never edit the default branch or the deployed site.
- Do not publish to the owner's live PDS during the trial. A record on a PDS is public the moment it is written. Use the publish command without `--publish` to preview a record, and for a working copy use a PDS that is not the live one: Cirrus running locally under `wrangler dev`, or a separate staging PDS. The tools accept a loopback PDS origin for this.
- Serve the copy locally or on a preview address. The live site keeps running unchanged the whole time.

## 1. Take a baseline before touching anything

You cannot show that nothing was lost without a record of what was there.

- List every route the site serves and what each one contains.
- For every content item, record its text, title, date, order on its page, links, and each media file with its alt text and a hash of its bytes. Save this as a file in the copy.
- Save the rendered HTML of every page, and take screenshots of each page at a desktop and a phone width.
- Ask the owner which social accounts and other platforms to bring in, and get each platform's export. Count what each export holds.

Tell the owner the totals: pages, items by kind, media files, and posts per platform.

## 2. Settle the labels

Follow [the suggest-labels skill](../suggest-labels/SKILL.md). The site's existing section names are the labels. Do this before converting anything, because every post is filed under one.

## 3. Show the mapping and convert one item

For each kind of content on the site, write down which record field each piece goes to. [What to keep in the record](../../docs/set-up-with-an-agent.md#what-to-keep-in-the-record) lists the fields.

Convert a single item, preview its record, render its page in the copy, and compare that page with the baseline. Show the owner the record, the before and after, and the mapping. Wait for approval before converting more.

## 4. Convert the rest

Go one label at a time. For each item keep its text exactly, its original date, every media file, every alt text, and its public URL.

- **The website's own content** is published with the [publish command](../../README.md#publish-a-post). Use the item's existing URL path as its slug where the site allows, so addresses do not change.
- **X** has [an importer](../../README.md#import-an-x-archive). It reports the replies, reposts, and quote posts it leaves out. Pass that list on to the owner.
- **Other platforms** have no importer. Map the export's fields yourself, convert a sample of five, and show them before doing the rest. Keep each post's original ID, URL, and date, and name its platform with `--source-platform`.
- **Never set a post's form.** The command identifies it. If the result looks wrong for a post, say so and ask; `--form` exists for the owner's decision, not yours.
- **Use your judgement about what a link is.** The command looks at what a link points to, and takes in an image, video, audio file, or PDF even when its address does not look like a file. If you can see that a link is one of those and it was still saved as a link, attach it with `--media ID=URL`. An image is an image however it arrived.
- **Ask about anything personal.** If an item looks like it was not meant to be public, ask whether to leave it out or publish it with `--private`.

Do not drop, merge, shorten, or reword anything. If an item cannot be carried over whole, keep it on your list of exceptions.

## 5. Change the content side of the copy

Make the copy's pages read from the records instead of from the old content files. Each page keeps its address and its markup. Remove an old content file only after the page that used it renders identically from records.

## 6. Check for loss

Compare the copy against the baseline and report every difference, including the ones you think are harmless.

| Check | Passes when |
| --- | --- |
| Counts | Items per kind, media files, and posts per platform match the baseline, less the listed exceptions |
| Text | Each item's text is the same, ignoring only whitespace |
| Media | Every file is present with the same hash and the same alt text |
| Dates and order | Each item has its original date and sits in the same position on its page |
| Addresses | Every baseline route answers with the same status, and every internal link resolves |
| Markup | The rendered HTML of each page matches the baseline, or each difference is explained |
| Appearance | Screenshots at both widths match the baseline |

Fix what you can within the boundary and run the checks again.

## 7. Report and wait

Give the owner:

- what moved, with the totals from step 1 beside the totals now
- every difference the checks found
- the exceptions: items left out, and why
- every file you changed, so they can see nothing outside the content side was touched

Then stop. Do not publish to the live PDS, merge the branch, or change live routes until the owner says so.

## 8. Go live

After approval, publish the records to the live PDS, deploy the copy, and run the address and appearance checks once more against the live site. Leave the old content files in the repository's history, and tell the owner how to go back to the previous version.
