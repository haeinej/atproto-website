---
name: build-renderer
description: Make a website's own pages build from the owner's post records while the design stays exactly as it is. Use when replacing a site's content layer, when a page must be regenerated from a record, when writing render rules for a site, or when checking that a rebuilt page matches the original.
---

# Rebuild a site's pages from records

The owner's content now lives in records. Their website must show it without looking any different. You replace the content layer and nothing else.

The project's files are in `${CLAUDE_PLUGIN_ROOT}`; in a clone of the repository, that is the repository root. Read the `start` skill and the `migrate-site` skill first. Work in the copy of the site, against a test PDS, never the live one.

## The three parts

| Part | Holds | Lives |
| --- | --- | --- |
| Record | The content: title, subtitle, date, body, attachments | The owner's repository |
| Template | The page's own markup with the content cut out, plus words only the site has | The website |
| Rules | How this site writes things: where content sits on each kind of page, how it writes links | The website, one file |

The renderer is `render`, and it runs when the site is built, so the site stays plain HTML. Never make a page fetch its content in the visitor's browser.

```sh
npx github:haeinej/atproto-website render adopt --page writing/essay.html --slug essay \
  --rules render-rules.json --kind essay --template templates/essay.html
npx github:haeinej/atproto-website render build --slug essay --rules render-rules.json --kind essay \
  --template templates/essay.html --out built/writing/essay.html --against writing/essay.html
```

- **`adopt`** cuts a template out of an existing page. It compares every piece it cuts with what the record would put back, and writes nothing unless each one matches. Its report names the block that does not.
- **`build`** fills a template from a record. With `--against` it compares the result with a page and fails unless they are identical.

A page that adopts cleanly builds back byte for byte. That is the pass mark.

## Writing the rules

A rules file names each kind of page and lists its slots in the order they appear on the page.

```json
{
  "inline": { "ownLinksRelative": true },
  "kinds": {
    "essay": {
      "slots": [
        { "name": "title", "pattern": "(<h1>)(.*?)(</h1>)" },
        { "name": "date", "from": "publishedAt", "pattern": "(<span class=\"date\">)(.*?)(</span>)",
          "date": { "locale": "en-US", "options": { "dateStyle": "long" } } },
        { "name": "body", "pattern": "(<div class=\"article-body\">)(.*?)(</div></article>)" }
      ]
    }
  }
}
```

- A pattern has three groups: what comes before the content, the content, what comes after. Only the middle is cut.
- Slots are looked for in order, each after the last. `from` says which field of the record fills it: `title`, `subtitle`, `publishedAt`, `body`, `label`, `sublabel`, or `site.<field>` for the site's optional layer.
- A page can hold the body in more than one place, such as a file link in the header and the text below: give it two `body` slots, and each takes the blocks its part of the page has.
- A page that holds several posts, such as a list of projects, is adopted and built once for each post: pass `--prefix` with the post's key, feed each run's result into the next (`--page` when adopting, `--into` when building), and use `--set name=value` to fill `{name}` in a pattern so it finds that post's place on the page.
- `siteText` is a pattern for elements that are the site's own and must be left alone, such as `lang=\"ko\"` for a second language written beside the first.
- `optional` lets a kind cover pages that lack a piece. `whenSame` is for a second edition that repeats the post's words on some pages and has its own on others, such as a translated title: it is cut only where it is the same, and otherwise left as site text.
- Inside the body nothing is configured. The page's own markup for each paragraph, image, and list is kept as it is, so each image keeps its own class and attributes. A row of links on the page matches a list in the post whose items are each one link.

Under `inline`, a site or a kind of page can say how it writes things: `ownLinksRelative` when links to the site itself leave the domain off, `externalLink` for how an outside link is opened, `footnoteRef` for a footnote's mark, and `escapeQuotes` when a page writes quotation marks as character references. `posts` maps a post's key to its address on the site, so a link to a post is written as that address.

Write the rules from the page's markup, then let `adopt` tell you what you got wrong. Do not guess a site's conventions: read them off the mismatch report.

## What to check

Each of these is here because skipping it produced a wrong result or a false alarm.

### Before you cut

1. **The baseline exists and the page still matches it.** Compare the page's hash with the baseline's. If the page moved, the comparison means nothing.
2. **The record is on a test PDS.** A record on the live PDS is public the moment it is written.
3. **You know which pieces are content.** For each piece of the page decide: content (in the record), design (markup and presentation), or site text (words only this site has). A property of the thing is content: an image's description and size. How the site presents it is design: `loading`, `target`, a class.

### Cutting the template

4. **Never retype a template.** Cut it from the real page with `adopt`. A retyped template differs from the page in ways you will not see.
5. **Two pages of the same kind can still differ.** One paper here wrote apostrophes as `&#x27;` and the other did not. Give the odd one its own kind; do not bend the shared rules.
6. **Look for the content everywhere it appears.** The same title or date often sits in a second language edition, in the page's `<head>`, in structured data, in next and previous links, and on index pages. Content left in a template goes stale the first time the post changes. `adopt` reports body text still in the template and counts the lines that repeat the title; read both.
7. **Check where each slot landed.** A pattern can match a later look-alike, such as the other edition's heading. The report lists the slots it cut, in order; confirm the list is the one you meant.
8. **Do not relax a check to make it pass.** `whenSame` is only for a repeat in another edition, and the report lists what it kept as site text. Never use it on the first edition, and never loosen a pattern to hide a mismatch.

### Rendering

9. **Stop on anything unknown.** The renderer stops on markup it does not handle. Leave it that way. A page that is not done is a fact to report; a page with a silently missing block is a loss.
10. **Add to the renderer only what a real page needs.** When a page does not adopt, first ask whether the post was converted wrongly, then whether a rule describes it. Change the renderer last, by the smallest amount, and leave a page as not done before building something general for one case.
11. **Site conventions go in the rules, found by evidence.** If the site writes links to itself without its domain, or opens outside links in a new tab, the mismatch report will show it. Add the rule then.
12. **A post that has changed shape needs adopting again.** `build` refuses when the body no longer has the blocks the template was cut for. Do not edit the template by hand to get past it.

### Comparing

13. **Byte for byte is the pass.** Say "identical" only when the files are the same. For anything else, say exactly what differs: `build --against` gives the line and the verdict (`whitespace only`, `image addresses only`, or `different`).
14. **A difference is your mistake until you have found its place.** Locate the line before you explain it. Explanations written first are usually wrong.
15. **Whitespace differences mean the cut is wrong.** The template keeps the page's own spacing, so a clean adoption has none. Do not call them harmless and move on.
16. **Compare screenshots only when the HTML differs, and only at the page's own address.** A page served from another folder can look different for reasons that are not yours: navigation that marks the current section, relative addresses. Use the same window size, in the same run, and first confirm that today's screenshot of the original equals the baseline's.
17. **Confirm that every check ran.** A script that fails halfway can leave no output and look like a clean result. Count the pages tried against the pages expected, and treat a missing report as a failure.
18. **Leave the site as you found it.** Build into a separate folder. If you must put a built page at its real address to screenshot it, restore the original and confirm no tracked file has changed.

### Reporting

19. **List what is not done.** Name each page the renderer could not handle and why.
20. **Put the owner's decisions to them.** Where images on their pages load from (the page's current address, the image's source, or their repository) changes the HTML and is theirs to choose. So is what happens to content in the `<head>` that the record does not hold.

## Settings for images

`--images` on `adopt` says where an image on the page should point.

| Setting | The page's `<img>` points to | Result |
| --- | --- | --- |
| `page` (default) | Wherever it already does | Nothing changes |
| `source` | The address the image first came from | Same as `page` when the two agree |
| `repository` | The owner's copy on their PDS | The page depends only on their repository; image addresses change |

Use `page` to prove a rebuild is identical. Change it only on the owner's decision.
