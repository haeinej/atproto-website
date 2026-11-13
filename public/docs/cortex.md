# Your cortex

Give your agent a place to keep what it learns about your work, so you do not have to explain the same preferences every session. You can inspect and correct that knowledge without making it a post.

## Beside your posts

A memory about how you work is not a post. Neither is a skill that tells an agent how to help you. They live in the cortex so that your working knowledge can carry between agent sessions without becoming part of your published work.

| Part | Holds | Available now |
| --- | --- | --- |
| Memories | Named pieces of learning, with descriptions and history | Read, search, edit, remove and restore |
| Notes | Short observations awaiting a decision | Record, inspect and settle with explicit outcomes |
| Skills | Instructions and supporting text files | Propose, review and approve an exact version |
| Tools | Descriptions, on/off settings and proposals | Member-controlled API; no automatic installation |
| Turns | Captured conversation turns | Reserved requests only; not built |

This is private working context. It is not used to find other people, and Publish and Mirror never read it.

## Open it in the workspace

Choose Cortex in the rail, then Memories, Notes or Skills.

- **Memories** show the text, whether it was stated or inferred, its sources, project and evidence count. You can edit one, remove it, inspect earlier versions and restore an earlier text as a new version.
- **Notes** show the observation, who recorded it, when, its originating session and any settlement outcome.
- **Skills** show the instructions and supporting files. Sign in with your linked ohm account to review an agent's proposal and approve exactly the version you read.

Tool settings are currently available through the service API. There is no tool-settings panel in this view.

## What you need, and why

Your connected account identifies whose private knowledge this is. Your agent needs the ohm MCP connection to read or save it; opening a new chat alone does not bring that knowledge into the conversation. [Connect your agent](https://docs.ohmmmm.com/agent.md)

The browser is where you inspect the result and review proposed skills. To approve a skill, use your linked ohm sign-in: the agent's credentials intentionally cannot approve its own instructions.

## Try one preference

1. Connect your agent and ask it to start with your cortex. The first Context request creates three starting memories without guessing your identity or preferences.
2. Tell it: "Remember that I prefer a short first draft before polished prose." This is an example; use a preference that is true for you.
3. Open Cortex, choose Memories, and read the saved preference. Check that it says what you meant. You can edit the text if it does not.
4. In a later session, ask the agent to start with your cortex and read the relevant memory before drafting.

The visible result is a memory you can inspect and reuse. Whether a later draft follows it also depends on the agent reading it and following your current request. Automatic recall into every prompt is not built.

## What a session starts with

The agent calls `cortex_start`. Context includes full memories marked `always`, descriptions of the other memories, approved skill descriptions, enabled tool descriptions and pending notes. The agent reads the full memory or approved skill when its description fits the task.

Three standing memories are created at the start.

| Memory | Purpose |
| --- | --- |
| `identity` | What is known about you, without guessing what has not been said |
| `vault-map` | How your work is arranged; Context adds current labels, counts and recent posts |
| `working-style` | How you prefer to work, leaving unknown preferences open |

The memories are editable. A description index is not the same as every memory being loaded into every prompt. Automatic prompt recall and session adapters are still planned.

## Yours, and private

The service authenticates every cortex request as one member before reading any data. Another member cannot select your cortex by naming your DID or a memory name. Signing out or switching accounts clears the editor's cortex state.

ohm can read the copy it stores. The provider of an agent's model processes whatever the agent reads. Private here means kept out of public records and other members' access; it does not mean end-to-end encryption.

## Keeping a copy

Post sync and vault export do not include the cortex. Individual memories have an exact Markdown representation in the code, but a complete cortex export and a folder adapter are not built yet. Until then, the service may hold the only copy of this knowledge.

See [Memory and notes](https://docs.ohmmmm.com/memory.md), [Skills and tools](https://docs.ohmmmm.com/skills-tools.md) and [Status and limits](https://docs.ohmmmm.com/limits.md).

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
