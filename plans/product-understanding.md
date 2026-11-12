# Product understanding: the job and the value

Written 12 November 2026. This is a reading of the product from the planning conversation behind [the architecture plan](network-architecture.md). The jobs and the value are interpretations, not findings: nobody outside the project has been interviewed or has used it. The last two sections say what would have to be true and how to find out.

## What has changed since this was written

One thing this reading leans on has changed. It gives, as the reason for the vault's design, that people keep their real thinking only where they own it and control who sees it, and it assumes private notes stay in the person's own store. ohm now keeps a working copy of the whole vault, private posts included, so the editor and an agent can work in it. What a member is promised is that their posts live in their own repository and their own folder, and that losing ohm's copy loses nothing. That promise is only true once a folder is connected, which is not yet asked for when someone joins. [The build plan](build-plan.md) has the detail.

Whether people will write their real thinking into a copy that ohm can read is now the first thing to find out, ahead of the questions in the last two sections.

## The product in one sentence

A network of personal websites where your own agent, knowing what you are really thinking, gets you to the right person when you need one, and tells you when you are the right person for someone else.

## The unit of value

One conversation between two people that would not otherwise have happened, and that resolved something.

Everything else in the product exists to produce that. The vault gives the agent something to know. The shared schema makes one person's notes comparable with another's. The website and the friends tier give people a reason to keep their thinking there and to let some of it be seen. The agent is present at the moment someone is stuck.

## Who it is for, first

People who already think in writing and already have a place of their own on the web. Concretely, at the start: someone with a personal website on Cloudflare who uses a coding agent in their daily work and keeps notes for themselves.

What they have in common matters more than the tools:

- They write to think, and most of what they write is never published.
- They want a home on the web that is theirs, not a profile on a platform.
- They are working on something where other people matter: a project, a piece of writing, a company, a change of direction.
- They find existing social networks a poor fit: too much performing, too little help.

## The main job

> When I am working on something and I need another person, get me to the right one, without my having to broadcast it, perform for an audience, or already know who to ask.

"Need another person" means the four kinds of need in the plan: advice from someone who has lived it, feedback on something made, an introduction, a collaborator. These are things an agent cannot supply.

### Why this job is hard today

1. **Nobody knows who knows what.** What people are actually thinking about sits in private notes, chats and half-finished drafts. Their public profile shows a small, polished and often outdated part of it.
2. **Asking has a social cost.** Reaching out cold, admitting to being stuck, and worrying about bothering someone all push people to not ask.
3. **Putting the need into words is work.** By the time someone can state clearly what they need, they are often halfway to not needing help.
4. **The places to ask are built for something else.** A feed rewards what gets attention. A request for help competes with everything else there and is seen by the wrong people.
5. **Your own context is connected to nothing.** The notes that show what you are stuck on cannot act. They cannot find anyone.

### What people do instead

| Today | What it costs them |
| --- | --- |
| Ask the few people they already know | The best person is usually one step outside that circle |
| Post "does anyone know someone who…" in a group chat or on a social network | Public exposure, low response, wrong audience |
| Ask an AI instead of a person | Gets an answer, but no relationship, no lived experience, no introduction |
| Stay stuck, or work around it | Time, and the help they would have got |

The third row is the important one. The easiest substitute for this product is to stop asking people at all. The product takes the opposite position: the agent's job is to route you to a human, and to handle only what does not need one.

## The jobs around it

The main job only works if these are also done, and each is worth something by itself.

### 1. Keep everything I think and make in one place that is mine

> I want one home for my writing, photographs, projects and notes, where I decide who sees each thing.

- **What they get:** a vault in one structure; a website that is a view of the public part; an identity that is their own domain; content that survives the service.
- **What it feels like:** not being a tenant. Not having to choose between a private notebook and a public site, because they are the same notes at different visibilities.

### 2. Let the right people see my thinking without performing it

> I want the people I trust to know what I am working through, without turning it into a post.

- **What they get:** sharing is changing the visibility of a note that already exists. The friends tier is an audience for unfinished thinking.
- **What it feels like:** being known by a few people, as opposed to being visible to many.

### 3. Keep up with people I care about without a feed that wastes my time

> I want to know what my friends are really thinking about and what they need, in a few minutes.

- **What they get:** a stream of friends' notes and open needs, and a small number of notifications that each mean something.
- **What it feels like:** scrolling that ends, and that leaves them with someone to talk to.

### 4. Be found for what I actually know

> I want to be asked the right things by the right people, at a volume I can live with.

- **What they get:** their agent screens incoming asks and passes on only the ones that fit, with the reason.
- **What it feels like:** being useful, and being recognised for knowledge that is not on a profile anywhere.

### 5. Build and change my website without it being a chore

> I want my site to stay current without maintaining it by hand.

- **What they get:** the site is rebuilt from their records, and their agent can add or change sections on request.
- This is the on-ramp. It is the reason to arrive, not the reason to stay.

## The value, and why each piece is needed for it

Read as a chain, from the outcome backwards:

1. **A good introduction needs evidence.** "Talk to Jun, he wrote about exactly this in March" is worth acting on. "You two might get along" is not.
2. **Evidence needs people's real thinking, including the unfinished part.** A public profile is not enough to match on.
3. **People only keep real thinking where they own it and control who sees it.** That is why there is a vault, three visibilities, and the person's own PDS and private store.
4. **Matching across people needs a common structure.** That is why the post schema is fixed and shared, and why other sources are read as the same unit.
5. **Acting at the right moment needs to be present at it.** People are already talking to their agent when they get stuck. That is why the agent is their own, and reads their private notes.
6. **None of it is safe unless nothing leaves without consent.** That is why every outward action shows the exact text and audience and waits.

Three kinds of value come out of this:

- **Functional:** less time between being stuck and talking to the right person; help the person would not have asked for at all; a site and a body of work that maintain themselves.
- **Emotional:** asking stops feeling like exposure, because the agent finds the person and the reason before anything is sent; the person's own unfinished thinking turns out to be useful to someone.
- **Social:** relationships that start from something specific and real; a reputation built on what one actually thinks, among people one chose.

## What makes it different

| Compared with | The difference |
| --- | --- |
| A social network | The feed is not the product. The measure is conversations between people, not time spent. Needs are rare and notifications are few |
| A notes app | The notes can act. The same vault that holds private thinking is what connects the person to others |
| A website builder | The site is a view of content the person owns in an open format, and it is one node in a network |
| An AI assistant | It sends you to people. It handles only what does not need one |
| Professional networking | The match rests on what someone has written and is thinking now, not on titles and history |

## The value a member gets at each stage

The network is worth little when it is small, so each stage has to be worth having alone.

| Stage | What a member gets |
| --- | --- |
| Alone | One home for their content, a site built from it, and an agent that knows their notes |
| With a few friends | A stream of friends' real thinking, and matching within people they already trust |
| With a network | Finding the right stranger, and routes to them through friends |

The first row is the one that has to stand without help. If the product is not worth using alone, nobody stays long enough for the second.

## What would have to be true

Each of these is an assumption the product rests on. None has been tested.

1. **People write down what they are stuck on.** The match depends on notes that show the real problem. This is true of the person building it. It may be true of far fewer people than keep notes.
2. **People will let an agent read their private notes.** The agent is their own, and that helps. It is still a real ask.
3. **Being asked is welcome.** The inbound side has to feel like being useful, not like a new inbox. This depends on asks being few and well matched.
4. **Some needs really do require a person.** For plain advice, many people will accept a model's answer. The product is strongest where that fails: introductions, collaboration, feedback from a particular person, lived experience.
5. **The first audience is big enough to start a network.** A person with a website on Cloudflare who uses a coding agent is a narrow group. It is a good first fifty. It also shapes who the product seems to be for.
6. **Friends are on it.** The second stage needs a person's actual friends to join, not just similar people.

## How to tell it is working

In order of how much they say:

1. **Conversations that happened.** Introductions that led to the two people talking, and needs marked resolved.
2. **Time from stuck to talking.** How long between a need appearing and a conversation starting.
3. **A useful suggestion early.** The share of new members who get one suggestion they act on in their first two weeks.
4. **Notes moving from private to friends.** A sign of trust in the tier and the people in it.
5. **Use alone.** Whether members with no friends on the network still write to the vault each week.

What not to measure it by: time in the feed, number of posts, number of notifications opened. Optimising any of these works against the main job.

## What it is not

- Not a place to build an audience.
- Not an AI companion or a replacement for talking to people.
- Not a Bluesky client, though it reads Bluesky follows and posts.
- Not a general website builder, though it includes an editor.
