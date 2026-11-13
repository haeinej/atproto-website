# Skills and tools

A skill tells an agent how to do a task. A tool describes something it can use. Your approval controls agent-proposed instructions, and only your ohm session can change tool settings.

## A skill

A skill has a `SKILL.md` with its name and description in YAML frontmatter, plus any supporting text files kept inside that skill. It is private to your account.

An agent can propose a skill or a revision with `cortex_propose_skill`. That does not approve it. The description and approval state can be listed, but a PDS token cannot read an unapproved skill's instructions or supporting files.

## Approve the version you read

1. Sign in to ohm with the account connected to your vault.
2. Open Cortex, then Skills, and select the proposal.
3. Read `SKILL.md` and its supporting files.
4. Choose Approve this version.

Approval names the exact saved version. If an agent later edits it, that revision needs approval again. A stale approval is refused, and an unavailable or no-longer-approved skill is cleared from the editor when refreshed.

Context lists only skills whose current version is approved. `cortex_skill` reads an approved skill in full. Agents have no tool to approve their own proposals. A member-authored save through the linked ohm session is approved as that member's edit.

## Why approval and installation are separate

A repeated task needs both a method and a way to act. A skill supplies the method, such as how to edit an essay. A tool supplies an operation, such as reading a post. Instructions alone cannot make an unavailable operation work.

Use a connected agent to propose a skill, then sign in to the browser with your linked ohm account to review it. Those are separate permissions so the proposer cannot approve itself. The task's actual tools must also be available in your agent; approving instructions does not install software or grant credentials.

The useful result is a reviewed method your agent can read again. If the task still cannot run, check whether its required tool is actually connected rather than approving the same instructions again.

## Tool settings

The service stores a tool's name, description, on/off setting and optional HTTPS server address. Only your linked ohm session can save, switch or remove a tool setting. Context includes only tools that are on and are not proposals.

These settings are metadata. Saving an address does not connect a server, install software or run a tool. Credentials and executable configuration are not accepted here; credentials remain in your own local settings. Tool management currently uses the API, rather than a panel in Cortex.

## A proposal is not a running tool

`cortex_propose_tool` records the name, purpose, inputs and outputs of a tool that would need to be built. It is always marked proposed and off. A proposal cannot overwrite an existing tool, grant permission or be switched on as though it were implemented.

## What is still separate

The nine cortex MCP tools already provide memory, observation and proposal operations. Automatic installation of skills into a particular coding agent, session hooks and shared plugin packaging are separate adapter work. Approving a skill here does not install that adapter. [Agent integration](https://docs.ohmmmm.com/mcp.md)

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
