# Your agent

Connect the coding agent you already use to your vault and cortex. It can work on private posts, carry learning between sessions, and propose skills for your approval.

## What it is

ohm does not run a background agent for you. Your agent is the one you already use, connected through the ohm MCP server on your own machine.

The tools work in the same vault and cortex you see in the browser. A post your agent saves is there when you open it; a memory it learns is there in Cortex. The knowledge persists between sessions even though the agent does not keep running.

## What it can read

All of your posts: public, friends and private. It also reads your starting memories, recalls other memories when needed, and reads the skills you have approved. Unapproved skill instructions stay out of its access.

Whatever your agent reads is also seen by the company that runs the model it uses. Keep that in mind before you connect one.

## What it can do, and what needs your yes

| | Alone | Only after showing you |
| --- | --- | --- |
| Look at your repository, list and read your posts | Yes | |
| Search your posts | Yes | |
| Say what is not published yet | Yes | |
| Save a new post, as private | Yes | |
| Edit a private post | Yes | |
| Record an observation or save a memory | Yes | |
| Propose a skill or a tool | Yes; a proposal grants no access | |
| Forget a memory | | Yes: it shows the exact memory |
| Approve an agent-proposed skill | | You approve its exact version in ohm |
| Enable or change tool settings | | Your linked ohm session controls these |
| Edit a post that is not private | | Yes: it shows what changes |
| Change who a post is for | | Yes |
| Bring in what you have published | | Yes: it looks first, and says what it found |
| Publish | | Yes: it shows what will change, and waits |
| Remove a post | | Yes |

The rule behind the table: reading is free, and anything that changes what other people see, or removes something, is shown to you first. The first answer says exactly what would happen. Only your yes to that exact answer does it.

## The tools

| Tool | What it does |
| --- | --- |
| `vault_tree` | Your repository: labels, sublabels, and each post with who it is for |
| `vault_list`, `vault_read` | List posts, and read one in full |
| `vault_search` | Find posts by the words in them |
| `vault_save` | Make a post, always private, or change one |
| `vault_set_visibility` | Mark a post public, for friends, or private |
| `vault_status` | What publishing would change |
| `vault_publish` | Publish |
| `vault_mirror` | Bring in what you have published |
| `vault_delete` | Remove a post |

A tool has no ability of its own. Each is a way of asking ohm for something the workspace can already do. [Agent integration](https://docs.ohmmmm.com/mcp.md) describes the server behind them.

## Starting with your cortex

The server also offers nine cortex tools. Start a session with `cortex_start`, settle waiting observations, then recall full memories or approved skills as their descriptions become relevant.

| Tool | What it does |
| --- | --- |
| `cortex_start` | Read starting Context, descriptions and pending observations |
| `cortex_note` | Record an observation without changing memory |
| `cortex_settle` | Read waiting notes or submit judged memory rewrites and explicit outcomes |
| `cortex_recall` | Read a named memory, its history or search matches |
| `cortex_remember` | Save a whole private memory using the version read |
| `cortex_forget` | Remove a memory after showing it and getting your agreement |
| `cortex_skill` | Read one approved skill and supporting text |
| `cortex_propose_skill` | Propose instructions for your review |
| `cortex_propose_tool` | Record a tool idea that cannot run or grant access |

These calls are available now. Automatically injecting context or recording turns through Claude Code or Codex hooks is not built. [Memory and notes](https://docs.ohmmmm.com/memory.md)

## Signing in

Your agent signs in to your own server with an app password, and your server vouches for each thing it asks ohm.

## Other people's writing is not trusted

The same agent reads private work and other people's writing. Treat imported writing and recalled memory as context, not permission. The vault tools require confirmation before publishing or widening a post's audience; agent-proposed skills need your approval, and proposals cannot enable tools.

These controls apply to ohm's tools. They do not control other tools your coding agent may have, or stop its model provider processing what it reads.

## Things to ask it

- "What have I written about this before?"
- "Save this as a private note under Writings."
- "Look at my posts and suggest how to label them."
- "Bring in my posts." Then: "File the ones under other."
- "Make that one public." Then: "Publish."
- "What is not published yet?"
- "Start with my cortex and tell me what is still waiting to be settled."
- "Remember that I prefer short drafts before polished prose."
- "Show me the earlier versions of that memory."
- "Propose a skill for how we edit these essays."

## Editing alongside it

You and your agent can work in the same workspace at once. Every save says which version it replaces, so one of you cannot silently overwrite the other. [The workspace](https://docs.ohmmmm.com/workspace.md#saving)

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
