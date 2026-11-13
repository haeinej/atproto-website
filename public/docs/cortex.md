# Your cortex

Your vault holds what you make. Your cortex holds what your agent remembers and the skills and tools available to it. The cortex belongs to your connected account and stays private.

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
