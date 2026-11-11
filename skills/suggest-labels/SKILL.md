---
name: suggest-labels
description: Help someone work out the header structure of their personal website and the labels and sublabels for their posts, mostly by asking them. Use when someone asks what sections or labels their site should have, wants their posts sorted, has posts with no label, has no website yet, or is setting up this project for the first time.
---

# Suggest labels

A label is the name of a section on the owner's website: "Writing", "Photos", "Projects". Together the labels are the site's header. A sublabel is a group inside a label, such as an essay series or a photo set.

Your part is small. You offer one plain, standard starting point, and then you ask. The structure that works is the one the owner arrives at, so most of this skill is questions. Do not design a clever structure from the content, and do not argue for your own names.

Read [docs/labels.md](../../docs/labels.md) first.

The project's files are in `${CLAUDE_PLUGIN_ROOT}`; in a clone of the repository, that is the repository root. The `start` skill says what the project is for and how to run its commands from any folder. It explains forms, labels, and sublabels with examples.

## The rule

A post's address is built from its label and sublabel: `/posts/writings/collisions/trap-of-independency`. So every post must end up with a label. Nothing is left unfiled. A post that fits none of the owner's sections, after you have asked, goes under `other`. Use `other` last, never as a shortcut for a post you have not looked at.

## What you may and may not do

- Offer the standard starting point below, and nothing more inventive, unless the owner asks for ideas.
- Never choose, change, or mention a post's form: the tools identify it, and it is not shown to anyone.
- Change nothing. Do not publish, relabel, or edit a post, and do not build pages.
- Use the owner's words for every name. If they have not given a name, ask for one before suggesting one.

## 1. Look at what exists

Find out which of these the owner has. Ask if you cannot tell.

| The owner has | What you read |
| --- | --- |
| A website with sections | Its navigation, section pages, and URL paths. These names are already the labels. |
| Content but no website | Published posts, a social archive, a newsletter export, folders of photos or Markdown. |
| Nothing yet | Nothing. Go straight to the questions. |

List published posts. From the owner's site folder:

```sh
npx github:haeinej/atproto-website posts
```

Inside a clone of the repository, `npm run --silent posts` does the same.

Each entry has `slug`, `date`, `form`, `label`, `sublabel`, `platform`, `name`, `opening`, `characters`, and `attachments`. Private posts are not listed.

Tell the owner plainly what they have, as counts: how many titled pieces, how many photo posts, how many short notes or imported social posts, and from where. Report it; do not interpret it.

## 2. Offer the standard starting point

Always the same three, in this order:

```text
Writing
Photos
Projects
```

Say it is only a common default and that every name, the order, and the number of sections are theirs to change. If the owner's website already has sections, show those instead and skip the default.

## 3. Ask

This is the main step. Ask one or two questions at a time, in plain words, and wait for each answer. Skip a question the owner has already answered. Let them answer in their own way; do not turn the questions into a form.

About the whole site:

- When someone arrives, what do you want them to find first?
- What do you make most often now? What do you want to start making?
- Is there something you make that fits none of Writing, Photos, or Projects?
- Is any of the three something you do not make, and would rather leave out?

About names:

- What do you call each of these yourself? For example "Writing", "Essays", "Journal", or a word in your own language.
- Do you already use a name somewhere else, such as a newsletter title, that should appear here?

About what belongs where:

- Should short posts and imported social posts appear on the site, sit in their own section, or stay private?
- Do you want all your writing in one place, or kinds kept apart?
- Are there posts that belong together as a set, such as a series, a trip, or one project? What do you call each set?

About order:

- In what order should the sections appear?

When an answer is unclear, ask a follow-up instead of filling the gap yourself. When the owner is unsure, give two plain options and let them pick; do not pick for them. If they ask what you would do, answer briefly and say it is only a default.

## 4. Write down what they decided

Repeat the structure back in their words and ask whether it is right.

```text
Writing
  Collisions
Photos
  Seoul
Projects
```

Keep asking until they confirm it. A structure with one section or with eight is fine if it is what they chose.

## 5. File the posts

Only after the structure is confirmed, give every existing post one label from it.

- Follow what the owner said in step 3. When their answers do not cover a post, ask where it goes; batch similar posts into one question.
- Every post gets a label. If the owner has no section for a post, file it under `other` and say so.
- Add a sublabel only for a set the owner named.
- Leave an existing label alone unless the owner changed that section.

Hand back the list for approval.

```md
| Post | Label | Sublabel | Changed? |
| --- | --- | --- | --- |
| trap-of-independency | Writing | Collisions | no |
| why-i-started-ohm | Projects | | new |
```

Check that no post is without a label, and list separately everything you filed under `other` so the owner can move it. Then stop and wait for the owner's answer.

## Applying an approved proposal

New posts take their label when published:

```sh
npx github:haeinej/atproto-website publish --file ./essay.md --slug trap-of-independency \
  --title 'trap of independency' --label Writing --sublabel Collisions
```

A post published with no `--label` is filed under `other` automatically. This project has no command yet for changing the label of a post that is already published. Say so if the proposal changes any, and list them for the owner.
