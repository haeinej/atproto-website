# Memory and notes

A memory is something worth carrying forward. A note is an observation to consider before changing that memory. Both are private, with sources that you can inspect.

## A memory

Every memory has a name, a one-line description and Markdown text. The description lets an agent decide whether to read the whole memory.

| Field | Meaning |
| --- | --- |
| Name | Lowercase words joined with hyphens, such as `working-style` |
| Description | One nonempty line, up to 200 characters |
| Kind | `person`, `preference`, `project` or `reference` |
| Body | Markdown, up to 8 KB in UTF-8 |
| Stated | Whether you said it directly, rather than an agent inferring it |
| Always | Whether its full text belongs in starting Context |
| Project and source | Optional scope and where it came from |
| Evidence | Source note IDs, who last wrote it, and service-maintained session counts |

Memory is prior learning, not an instruction that overrides what you say now. An agent must preserve uncertainty and project scope rather than turn a guess into a fact.

## What you say, and what an agent notices

When you explicitly tell an agent something worth remembering, it can save the whole memory with `cortex_remember`, marked as stated. Memory saves do not wait for an approval queue.

For an observation, the agent uses `cortex_note`: one line, up to 500 characters, with an ID, its real originating session and an optional project. Recording it does not change any memory. Retrying the same ID and content records one note; reusing the ID for different content is refused.

An observation note is not a private vault post. It stays in the cortex.

## Settling observations

The agent reads pending notes and kept history, judges what they mean, and gives each note an explicit outcome.

| Outcome | Meaning |
| --- | --- |
| `kept` | Keep the observation for comparison with later sessions |
| `dropped` | Record that it should not become learning |
| A memory name | Attach the observation as evidence to that memory's current version |

The supplied settlement policy keeps a single sighting as an observation. A new inference needs evidence from distinct sessions; one contradiction does not silently replace something you explicitly stated. The service checks ownership, project scope and versions, and counts the distinct sessions in the source notes. It does not call a model or judge the truth of a sentence.

`cortex_settle` accepts judged rewrites and batches of up to 100 note outcomes. Its memory saves and receipt settlement are separate steps: a failed settlement does not roll back an earlier save. The agent must read the current versions again before retrying, and finish any remaining batches. A receipt already recorded cannot be changed to a different outcome.

## Read before replacing

The editor and the agent use the version they read when replacing or removing a memory. If it has changed since, the service refuses the stale write. The right response is to read again and reconsider the edit, not overwrite the new version.

Earlier versions are preserved privately. In Cortex, open a memory's history, read an earlier version and choose Restore this version. The restore creates a fresh version and keeps the version it replaced in history.

## Forgetting

Ask your agent to forget a memory. `cortex_forget` first returns the exact memory to be removed. The agent shows it to you and only completes the second call if you agree. Its confirmation is single-use and bound to that memory version and the running server.

Removal takes the memory out of current Context. It does not erase its preserved history. Deleting all retained data is a separate manual request. [Export and leaving](https://docs.ohmmmm.com/export.md)

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
