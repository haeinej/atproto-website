# Memory and notes

Keep useful knowledge without turning every passing observation into a fact about you. Memories carry learning forward; notes give an agent somewhere to put an uncertain observation until there is enough reason to use it.

<a id="memory"></a>

## A memory

Every memory has a name, a one-line description and Markdown text. The description lets an agent decide whether to read the whole memory.

| What you can inspect | Why it matters |
| --- | --- |
| Its description and text | Lets you recognize the knowledge and check what the agent will read |
| Whether you stated it | Keeps an agent's inference distinguishable from something you explicitly said |
| Its project | Helps keep a convention for one project from becoming a rule for every project |
| Whether it is included at session start | Keeps standing preferences available without loading every memory in full |
| Its sources and history | Lets you understand where it came from and recover an earlier version |

Memory is prior learning, not an instruction that overrides what you say now. An agent must preserve uncertainty and project scope rather than turn a guess into a fact.

<a id="first-use"></a>

## Try it, then check the result

You need a connected agent to record learning through the tools, and the Cortex view to inspect it. [Your cortex](https://docs.ohmmmm.com/cortex.md#first-use) walks through the first connection and preference.

Tell the agent something you want carried forward, such as: "For this project, remember that dates should use the reader's local time." Open Cortex, choose Memories, and check that the text keeps the project restriction. The result should be a correct statement you recognize, rather than a general rule you never agreed to.

If the agent merely notices a possible preference, it can record a note instead. Open Notes to see the observation and where it came from. Recording a note alone has not changed your memories.

<a id="learning"></a>

## What you say, and what an agent notices

When you explicitly tell an agent something worth remembering, it can save the whole memory with `cortex_remember`, marked as stated. Memory saves do not wait for an approval queue.

For an observation, the agent uses `cortex_note`: one line, up to 500 characters, with an ID, its real originating session and an optional project. Recording it does not change any memory. Retrying the same ID and content records one note; reusing the ID for different content is refused.

An observation note is not a private vault post. It stays in the cortex.

<a id="settlement"></a>

## Settling observations

The agent reads pending notes and kept history, judges what they mean, and gives each note an explicit outcome.

| Outcome | Meaning |
| --- | --- |
| `kept` | Keep the observation for comparison with later sessions |
| `dropped` | Record that it should not become learning |
| A memory name | Attach the observation as evidence to that memory's current version |

The supplied settlement policy keeps a single sighting as an observation. A new inference needs evidence from distinct sessions; one contradiction does not silently replace something you explicitly stated. The service checks ownership, project scope and versions, and counts the distinct sessions in the source notes. It does not call a model or judge the truth of a sentence.

If an agent reports that settlement failed, some memory changes may already have been saved. Ask it to reread the memory and waiting notes before trying again. The [agent guide](https://docs.ohmmmm.com/agent-guide.md#recovery) explains the partial-completion contract.

<a id="versions"></a>

## Read before replacing

The editor and the agent use the version they read when replacing or removing a memory. If it has changed since, the service refuses the stale write. The right response is to read again and reconsider the edit, not overwrite the new version.

Earlier versions are preserved privately. In Cortex, open a memory's history, read an earlier version and choose Restore this version. The restore creates a fresh version and keeps the version it replaced in history.

<a id="forgetting"></a>

## Forgetting

Ask your agent to forget a memory. It first shows you the exact memory to be removed and only completes the removal if you agree. If the memory changes before you confirm, you need to review the new version.

Removal takes the memory out of current Context. It does not erase its preserved history. Deleting all retained data is a separate manual request. [Export and leaving](https://docs.ohmmmm.com/export.md)

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
