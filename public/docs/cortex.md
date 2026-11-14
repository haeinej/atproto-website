# Your cortex

Give your agent a place to keep what it learns about your work, so you do not have to explain the same preferences every session. You can inspect and correct that knowledge without making it a post.

<a id="beside"></a>

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

<a id="how"></a>

## How it works

The cortex is a private store that ohm keeps for your account, beside your vault. Your agent reaches it through nine tools, and you reach it through the workspace. Nothing in it acts on its own: every change is a call that you or your agent made.

Diagram: how the cortex works, as who calls what.
- The cortex holds five parts: Context (built at the start of every session), notes (awaiting a decision), memories (versioned learning), skills (used once approved) and tools (described, on or off).
- Agent → Context: `cortex_start`.
- Agent → notes: `cortex_note`.
- Agent → memories: `cortex_remember`.
- Agent, notes → memories: `cortex_settle` attaches a note to a memory as evidence, or marks it kept or dropped.
- Agent → skills: `cortex_propose_skill`.
- Agent → tools: `cortex_propose_tool`.
- Member, in the workspace → memories: edit.
- Member, in the workspace → skills: approve.

1. **A session starts by reading.** The agent calls `cortex_start` and receives Context: your standing memories in full, one-line descriptions of the rest, the skills you approved, the tools that are on, and the notes still waiting. It reads a whole memory or skill only when its description fits the task. [What a session starts with](https://docs.ohmmmm.com/cortex.md#context)
2. **What you say is saved at once.** When you tell the agent something to carry forward, it saves the whole memory with `cortex_remember`, marked as stated by you. There is no approval queue for memories; you correct them afterwards in the workspace.
3. **What the agent notices waits.** A guess about your preferences is recorded with `cortex_note`. A note is one line with its originating session. Recording it changes no memory.
4. **Settling turns notes into evidence.** With `cortex_settle` the agent gives every waiting note an outcome: kept for comparison with later sessions, dropped, or attached to a named memory as evidence. The agent does the judging. The service checks whose note it is, its project and the versions involved; it never calls a model. [Memory and notes](https://docs.ohmmmm.com/memory.md#settlement)
5. **Instructions wait for you.** The agent can propose a skill or describe a tool it would like, but a proposal is inert. A skill reaches Context only after you approve the exact version you read, signed in to the workspace. The agent's own credentials cannot approve it. [Skills and tools](https://docs.ohmmmm.com/skills-tools.md#approval)

Two rules hold the loop together. Every replacement names the version that was read, so a stale edit is refused instead of overwriting a newer one. And every request is authenticated as one member before any data is read, so the loop only ever touches your own cortex.

The code is open: the store and Context are in [cortex/](https://github.com/haeinej/ohm-content-layer/tree/main/cortex) and the nine tools are in [mcp/cortex-tools.mjs](https://github.com/haeinej/ohm-content-layer/blob/main/mcp/cortex-tools.mjs), both in [haeinej/ohm-content-layer on GitHub](https://github.com/haeinej/ohm-content-layer).

<a id="workspace"></a>

## Open it in the workspace

Choose Cortex in the rail, then Memories, Notes or Skills.

- **Memories** show the text, whether it was stated or inferred, its sources, project and evidence count. You can edit one, remove it, inspect earlier versions and restore an earlier text as a new version.
- **Notes** show the observation, who recorded it, when, its originating session and any settlement outcome.
- **Skills** show the instructions and supporting files. Sign in with your linked ohm account to review an agent's proposal and approve exactly the version you read.

Tool settings are currently available through the service API. There is no tool-settings panel in this view.

<a id="need"></a>

## What you need, and why

Your connected account identifies whose private knowledge this is. Your agent needs the ohm MCP connection to read or save it; opening a new chat alone does not bring that knowledge into the conversation. [Connect your agent](https://docs.ohmmmm.com/agent.md)

The browser is where you inspect the result and review proposed skills. To approve a skill, use your linked ohm sign-in: the agent's credentials intentionally cannot approve its own instructions.

<a id="first-use"></a>

## Try one preference

1. Connect your agent and ask it to start with your cortex. The first Context request creates three starting memories without guessing your identity or preferences.
2. Tell it: "Remember that I prefer a short first draft before polished prose." This is an example; use a preference that is true for you.
3. Open Cortex, choose Memories, and read the saved preference. Check that it says what you meant. You can edit the text if it does not.
4. In a later session, ask the agent to start with your cortex and read the relevant memory before drafting.

The visible result is a memory you can inspect and reuse. Whether a later draft follows it also depends on the agent reading it and following your current request. Automatic recall into every prompt is not built.

<a id="context"></a>

## What a session starts with

The agent calls `cortex_start`. Context includes full memories marked `always`, descriptions of the other memories, approved skill descriptions, enabled tool descriptions and pending notes. The agent reads the full memory or approved skill when its description fits the task.

Three standing memories are created at the start.

| Memory | Purpose |
| --- | --- |
| `identity` | What is known about you, without guessing what has not been said |
| `vault-map` | How your work is arranged; Context adds current labels, counts and recent posts |
| `working-style` | How you prefer to work, leaving unknown preferences open |

The memories are editable. A description index is not the same as every memory being loaded into every prompt. Automatic prompt recall and session adapters are still planned.

<a id="privacy"></a>

## Yours, and private

The service authenticates every cortex request as one member before reading any data. Another member cannot select your cortex by naming your DID or a memory name. Signing out or switching accounts clears the editor's cortex state.

ohm can read the copy it stores. The provider of an agent's model processes whatever the agent reads. Private here means kept out of public records and other members' access; it does not mean end-to-end encryption.

<a id="copy"></a>

## Keeping a copy

Post sync and vault export do not include the cortex. Individual memories have an exact Markdown representation in the code, but a complete cortex export and a folder adapter are not built yet. Until then, the service may hold the only copy of this knowledge.

See [Memory and notes](https://docs.ohmmmm.com/memory.md), [Skills and tools](https://docs.ohmmmm.com/skills-tools.md) and [Status and limits](https://docs.ohmmmm.com/limits.md).

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
