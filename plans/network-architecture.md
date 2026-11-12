# The network: architecture

A plan for turning the content layer into a social network of personal websites, where each person's own coding agent does most of the social work. Written 12 November 2026 from a planning conversation. Nothing here is built unless the "Built today" column says so.

## The idea in one paragraph

Each person keeps a vault of notes in one fixed schema. Every note has a visibility. Public notes are records on the person's own PDS, and their website is a view of them. People follow each other, and mutual follows are friends. A person's own coding agent, connected through this plugin, reads their whole vault, and when they need another human (advice, feedback, an introduction, a collaborator) it finds the best person on the network and makes first contact easy. People can also scroll a feed of what friends are thinking and looking for, and get notified when something concerns them.

## Current focus

Two things come before any of the network below:

1. **The personal website.** A person's site built from their own records, with the design entirely theirs.
2. **A clean schema.** The post as one solid unit under `com.ohmmmm.post`, with nothing in it that exists only to serve one platform.

Not in scope now: reading posts in from X or other outside platforms. That is a further tool we provide later.

## Principles

1. **The website is the profile.** A person's handle is their identity and the address of their site. It is their own domain when they have one, and otherwise the handle their AT Protocol account already has (for example `name.bsky.social`), with the site on a page we host.
2. **One vault, one schema.** Private, friends-only and public notes have the same structure and the same address. Changing visibility moves a note; it does not rewrite it.
3. **Public is the publication layer.** Only public notes go to the PDS. The website and the public network are views of the PDS.
4. **Agents connect people; they do not replace them.** An agent resolves what it can alone. What needs a person, it routes to the best person. It never holds the conversation in place of the two humans.
5. **Nothing leaves without a visibility the owner approved.** Agents have no side channel. Everything an agent sends is a note with an explicit audience, marked as agent-written, confirmed by the owner.
6. **Attention is the scarce resource.** Needs are rare, suggestions are single, notifications are few.

## The pieces

| Piece | What it is | Who runs it | Built today |
| --- | --- | --- | --- |
| PDS | Holds the person's public records and identity | The person, on Cloudflare with Cirrus. Later also a PDS we host | Yes (Cirrus path) |
| Private store | Holds private notes, off the PDS | The person, in their own Cloudflare account. For a member with no account of their own to hold it, us | Yes for the person's own store (KV, behind Cloudflare Access). No for ours |
| Website | A view of the person's public records | The person | Yes |
| Plugin and MCP | Gives the person's coding agent tools for the vault and the network | Runs inside the person's own agent | Publishing skills and commands only |
| Network service (AppView) | Indexes public records, stores friends-only notes, needs, inboxes and notifications; serves the feed | Us | No |
| Web feed | Scrollable stream and notifications in a browser | Us | No |

## The post is the unit

Our post is the one solid unit of the network, and it sits above any single platform's record.

- **One shared name.** Every site's posts are `com.ohmmmm.post` and every need is `com.ohmmmm.need`, named after ohmmmm.com, which this project owns. The service and other applications can find them all by that name. Only the optional `site` layer is named after the person's own domain.
- **A Bluesky post is one kind of our post.** The service reads `app.bsky.feed.post` records from a member's repository and treats each as a post whose platform is Bluesky, with its form identified from its format in the usual way. It is read in place, not copied into a second record.
- **Only a person's original Bluesky posts count.** Replies and reposts are not read as posts.
- **Other platforms come later.** Reading posts in from X, Substack and other platforms is a separate tool for later. The unit has a platform field so those posts will fit when that tool exists, but nothing in this plan depends on them.

## Schema decisions for `com.ohmmmm.post`

Once the schema is published and other people's records use it, optional fields can be added but nothing can be removed or renamed. So unused things go now and missing things wait.

Decided:

- **`canonicalUrl` is the post's address on the person's public site, whatever its visibility.** A private post stores the address it would have if public (`/posts/writings/hello`) and is served from the private area because of where it is stored, not because of what is written in it. Switching visibility is then only a move.
- **`summary` is dropped.**
- **Visibility is not a field.** Where a note is stored says who can read it.
- **Media works like Are.na: a kept copy, plus the address of the original.** Every attachment holds a copy in the repository and, when it came from somewhere, where the original lives.

- **`form` is an open list with `other` as the catch-all.** New forms can be added later without breaking older software, and software that meets a form it does not know treats it as `other`: it shows the title, body and attachments and nothing more.
- **New kinds of content have two doors, and neither changes the post.** Structured data for a kind the post has no fields for goes in the typed slot the post already has (`site`), under a schema of its own. When a kind becomes common, it gets a named form and a shared schema under `com.ohmmmm`. The list of attachment kinds is open in the same way.

- **The copy of an attachment is required.** A pointer alone breaks when the source disappears. When a file is too large for the PDS, the copy is a reduced version and the source address points to the full one.

Applied in the draft, [com.ohmmmm.post.draft.json](com.ohmmmm.post.draft.json), and open to change until it is published:

- **An attachment's `original` is renamed `file`.** When a site is mirrored the copy in the repository is not the original.
- **`link.site` is renamed `siteName`**, so it does not read like the `site` layer.
- **`updatedAt` stays**, and the tools should start writing it.
- **Text limits count characters, not bytes.** The old limits were in bytes, which allowed a label of 100 Latin letters but only about 33 Korean ones. Titles, subtitles, labels, captions and alt text now have limits that are the same in any language.
- **Unused sub-fields are dropped:** `source.author`, `image.credit`, `image.extractedText`.
- **`connect` holds at most 32 entries**, which is what the reader already uses.

Not added now, because they can be added later as optional fields: a language field, and a marker for agent-written posts.

### Two ways onto the content layer, one schema

The project already offers both, and the schema is the same for each. What differs is which side is the truth.

| | Mirror | Refactor |
| --- | --- | --- |
| Source of truth | The person's website, in their own repository or host | The person's PDS |
| What the PDS holds | A copy that follows the site | The original |
| An attachment's source address | The file on the person's site | Empty, unless it was taken from the web |
| `canonicalUrl` | The page's real address on the site | The address built from label and slug |
| Effort to join | Minutes; the site is untouched | A rebuild of the site from records |

Mirror is how most members join. Refactor is the later step for someone who wants the PDS to be the original.

To fix in the mirror: a mirrored website post today gets an address built from its label and key, and records nothing pointing back to the page it came from. It should store the page's real address as `canonicalUrl`.

### People with no website yet

Decided 12 November 2026. Someone with an AT Protocol account and no website, most often a Bluesky account, joins with that account.

- **They sign in with the account they have.** A Bluesky account is already an AT Protocol identity with a repository. We do not create an account or host a PDS for them.
- **Their public posts are `com.ohmmmm.post` records in that repository**, wherever it is hosted. The PDS is the original from the first day. This is the Refactor column with no migration step.
- **We host their site.** Bluesky's own application does not show our records, so the person's site is a page we build from their records by our own logic, at an address of ours. The exact form of that address is not decided.
- **Their private notes are held by our service.** They have no store of their own, so we keep them. We can read them and we show them to nobody. See the information layer below.
- **Their notes also sync to a local copy** on the person's own machine, so the vault does not exist only on our service.
- **They can move up later without rewriting anything:** set their own domain as their handle, then run their own PDS, site and private store. The records and the schema stay the same at every step.

The editor is the same view of the vault that the agent's tools use, shown as the person's site.

## The information layer

| Visibility | Stored | Who can read | Service can read | Person's agent can read |
| --- | --- | --- | --- | --- |
| Public | The person's PDS | Anyone, including other AT Protocol applications | Yes | Yes |
| Friends | The network service, off the PDS | Mutual follows | Yes | Yes |
| Private | The person's own store, or our service for a member who has none | Only the person | No when it is the person's own store. Yes when we hold it | Yes |

Rules:

- **Imports land as private.** A bulk import exposes nothing until the person promotes a note.
- **Visibility switches in every direction.** Narrowing is not a recall: copies of a public note elsewhere on the network, and anything a friend already read, stay out. The interface says so at the moment of publishing.
- **Links across the boundary are dropped in the wider view.** A public note that connects to a private or friends-only note must not show that note's title or existence to someone who cannot read it.
- **A note or label can be marked "not for the agent".** The person's agent then skips it.
- **Private means private from other people.** It is read by the person's own agent, and therefore by whichever model provider that agent uses. This is stated to users.
- **Whether our service can read a private note depends on where it is kept.** In the person's own store, we cannot. For a member with no store of their own, we hold their private notes and can read them. We do not show them to anyone, and we do not use them for matching. This is stated to those members when they join.
- **Private notes are never records in an AT Protocol repository.** Everything in a repository can be read by anyone, so a private note written there would be public. Private notes we hold are stored under the person's AT Protocol identity (their DID), off the repository, and synced to their local copy.

The fixed schema and the optional `site` layer are unchanged and are independent of visibility. See [the fixed schema and your own fields](../docs/schema-layers.md).

## Friends

- **Follow is Bluesky's own follow record** on the follower's PDS. The two are the same thing, so they are always in sync: someone you follow on Bluesky is followed here, and following someone here shows on Bluesky.
- **Following someone** puts their public notes in your feed.
- **Bluesky mutuals become friends, so the person confirms them first.** People followed each other on Bluesky before friends-only notes existed. Before a person's first friends-only note is shared, they see the list of mutuals who would be able to read it and can remove anyone. Only members of the network can read friends-only notes at all.
- **Friends are mutual follows.** Each sees the other's friends-only notes. There is no separate approval step; following back is the approval, and the follow-back button says what it grants.
- **Either side unfollowing ends the friendship at once.** It cuts future access only.
- **The friend graph is public.** This lets an agent see routes: "you do not know her, but Jun does."

Proposed, not yet decided: a **subscribe** that puts someone's public notes in your feed without counting toward friendship, so reading a stranger does not expose your friends-only notes when they follow you.

## Needs

A need is a short note that says a person is looking for another human. It is posted only when the thing wanted cannot be handled by an agent.

| Kind | What is wanted |
| --- | --- |
| Advice | Someone who has lived the situation |
| Feedback | A real reaction to something made |
| Introduction | A route to a specific person or kind of person |
| Collaboration | Someone to work on it with |

- A need has a visibility (friends or public) and a status (open or resolved).
- Before drafting one, the agent checks whether it could settle the matter from the person's notes or general knowledge. If so it does that and posts nothing.
- A need is a new record type beside the post, not a new post form, so the fixed post schema stays fixed.

## The agent

The agent is the person's own coding agent with this plugin installed. We do not run it. It is awake only while the person is in a session.

Its core instruction:

> Your purpose is to connect this person with the humans who can help them, and with the humans they can help. Resolve what you can yourself. For what needs a person, find the single best one, explain why with evidence, and make the first contact easy. Never substitute for the human conversation.

**When the person has a need**, the agent works outward:

1. Search friends' notes, friends-only and public.
2. Search public notes across the network.
3. If nobody fits, draft a need for the person to post to friends or to everyone.

**How it ranks a person:**

1. Evidence: a note showing they have lived or thought about exactly this. The suggestion links to it.
2. Closeness: a friend, then a friend of a friend, then a stranger.
3. Likelihood of a yes: whether they are open to this kind of ask, and what this person can offer in return.
4. Timing: whether it is what they are thinking about now.

**When the person opens the feed in a session**, the agent compares friends' recent notes and open needs with the vault and points out where the person can help.

**It also suggests unprompted**: two people working on the same problem, or an open need the person is unusually well placed to answer.

### The tools it gets

| Tool | Does | Needs the person's confirmation |
| --- | --- | --- |
| Read and search the vault | All three layers, except notes marked not for the agent | No |
| Read the feed | Friends' and followed people's recent notes and needs | No |
| Search the network | Public notes, and friends-only notes of friends | No |
| Read the inbox | Rough matches and notifications waiting | No |
| Save a note | Private by default | No for private; yes for any wider visibility |
| Change a note's visibility | Moves it between layers | Yes, showing the note and the new audience |
| Post a need | At friends or public | Yes, showing the exact text and audience |
| Draft an email | An introduction to one person, opened as a draft in the person's own email | Yes: the person reads it and sends it themselves |
| Follow or unfollow | Writes or deletes a follow record | Yes |
| Save a suggestion | Writes a match to the person's notifications | No |

### The safety boundary

The same agent reads the person's private notes and other people's notes. Other people's notes are untrusted text and may be written to make an agent disclose something. The protection is in the tools, not in the agent's discretion: reading is free, and every tool that sends anything out shows the person the exact text and audience and waits for a yes. Service-side, every outbound record is checked against the visibility the person confirmed, and records written through the agent are marked as agent-written.

## The network service

Storage, indexing and search. It runs no agent.

- **Index** public posts, needs and follows from each member's PDS.
- **Store** friends-only notes and friends-only needs, and serve each only to a reader who has proved their identity and is allowed to see it. This access check is the most sensitive code in the system.
- **Compute friendship** from the two follow records at the time of each read.
- **Rough matching**: compare new needs against the public and friends-only notes of the people who could see them, by similarity search. Never against private notes: most it cannot read, and those it holds for members with no store of their own it does not use.
- **Inbox and notifications** per person.
- **Serve the feed** to the web and to the MCP tools.

## Feed and notifications

**The feed** is a scrollable stream. Each item links out to the note on its author's own site.

- New notes from friends and followed people
- Open needs from friends and from the public network
- Suggestions the person's agent has saved

**Notifications** are how a person knows about what concerns them without scrolling.

| Kind | Produced by | Examples |
| --- | --- | --- |
| Event | The service | A new follower; a new friend; a friend posted a need |
| Rough match | The service | A friend's need resembles one of your public or friends-only notes |
| Suggestion | The person's agent, in a session | A match confirmed and explained, including ones that rest on private notes |

Notifications appear in the web feed and at the start of an agent session. Match notifications are capped at a few a day and ranked. Email or push comes later.

## How an introduction happens

There is no messenger inside the network. People reach each other by email.

1. In a session, Haein's agent finds that Jun is the best person for a need, and shows the evidence.
2. The agent drafts an email to Jun with Haein: what the need is, and the note of Jun's that makes him the right person.
3. Haein reads it and sends it from her own email address.
4. Jun gets an ordinary email. If Jun's agent has access to his email, it can explain why the request fits and draft a reply.
5. From there the two people talk, by email or however they like.

Email works for someone who is not a member, needs nothing new to check, and leaves the conversation with the two people and not on our service. The email client ohm already has is where this returns later: a mailbox with the agent inside it, so that introductions, replies and follow-ups are handled in one place.

Still to work out:

- **How the agent learns someone's email address.** Either a member chooses who may see their address (friends, or everyone), or the service forwards a first email without revealing the address until the person replies.
- **Protecting people from a flood.** With no inbox of our own, the cap on asks has to be applied before an email is drafted, not after it arrives.
- **Knowing an introduction happened.** With email outside the service, the measure "two people talked" depends on what members tell their agents, or on the email client.

## Later: the paid layer

**Negotiation agents in the cloud.** We run an always-on agent for a member, so introductions are handled without waiting for either person to open a session: it screens inbound email, establishes fit and willingness with the other side's agent, and hands over to the humans. This is also where the email client returns.

This changes the trust model and needs its own design before it is built:

- It can only work well if it reads private notes, which today never reach our service.
- It talks to other people's agents with no human present, so the outer part that talks must be separated from the part that reads private notes, and given only what the other person may already see plus what the owner pre-approved.
- The owner sets in advance what it may say and commit to.

**A PDS we host**, for people without a Cloudflare site. It makes us a data host, with account recovery, verification email, abuse handling and storage costs.

## Build order

1. **Shared record types**: the need, alongside the existing post, with follows read from Bluesky's follow records and Bluesky posts read as posts.
2. **Network service, public only**: sign-in, index members' public posts, follow, public feed in the browser.
3. **MCP network tools, read side**: feed, search, inbox, in the plugin.
4. **Friends tier**: friends-only visibility, storage on the service, the access check, mutual-follow rule.
5. **Needs and introductions by email**: posting a need with confirmation, the email draft, the introduction flow.
6. **Notifications**: events first, then rough matching, then agent suggestions.
7. **Paid layer**: hosted PDS, then cloud negotiation agents.

## Open questions

1. **Moving to the shared name.** The names are decided: `com.ohmmmm.post` and `com.ohmmmm.need`. Still to work out: how existing posts under `com.haeinjung.post` are republished under the new name without breaking their addresses, and publishing the schemas from ohmmmm.com so other applications can look them up.
2. **Subscribe versus follow.** Whether to add a one-way subscribe that never counts toward friendship.
3. **Friends: one audience or several.** Whether friends-only always means all friends, or a note can name a smaller group.
4. **Private store at vault scale.** Key-value storage suits a few private posts. Thousands of notes with search and backlinks probably need a database in the person's account.
5. **How the agent searches a large vault.** Whether the plugin builds a local index, or the person's own store offers search.
6. **Sign-in for readers.** Today the private store recognises only the owner, through Cloudflare Access. The service needs members to prove a DID with AT Protocol sign-in.
7. **The web feed's design.** What the stream and a suggestion look like on screen.

## To verify before building

- **Permissioned data in AT Protocol.** The protocol team has been designing private and shared-audience data. If it has shipped, the friends tier may belong in the protocol rather than on our service. Either way, keep friends-only notes in the same schema and addresses so they can move.
- **Cirrus.** Account migration in and out, sign-in from third-party applications, and blob size limits for photographs.
- **Schemas for publishing that others already share.** If a common long-form schema has adoption on AT Protocol, mapping to it makes members' posts readable by more applications.
