# Your agent

Connect the coding agent you already use, and it can read and write in your workspace. It reads everything, private posts included, which is how it knows what you are working on.

## What it is

ohm does not run an agent for you. Your agent is the one you already use, given a set of tools for your workspace. It works only while you are in a session with it.

The tools work in the same workspace you see in the browser. A post your agent saves is there when you open it.

## What it can read

All of your posts: public, friends and private. That is the point. An agent that only saw what you published would know the polished part.

Whatever your agent reads is also seen by the company that runs the model it uses. Keep that in mind before you connect one.

## What it can do, and what needs your yes

| | Alone | Only after showing you |
| --- | --- | --- |
| Look at your repository, list and read your posts | Yes | |
| Search your posts | Yes | |
| Say what is not published yet | Yes | |
| Save a new post, as private | Yes | |
| Edit a private post | Yes | |
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

## Signing in

Your agent signs in to your own server with an app password, and your server vouches for each thing it asks ohm.

## Other people's writing is not trusted

The same agent reads your private posts and other people's posts. Someone could write a post meant to make an agent give something away. The protection is in the tools, not in the agent's judgement: no tool sends anything out without showing you first.

## Things to ask it

- "What have I written about this before?"
- "Save this as a private note under Writings."
- "Look at my posts and suggest how to label them."
- "Bring in my posts." Then: "File the ones under other."
- "Make that one public." Then: "Publish."
- "What is not published yet?"

## Editing alongside it

You and your agent can work in the same workspace at once. Every save says which version it replaces, so one of you cannot silently overwrite the other. [The workspace](https://docs.ohmmmm.com/workspace.md#saving)

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
