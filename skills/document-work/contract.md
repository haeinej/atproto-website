# Completed-work documentation contract

Use [the document-work skill](SKILL.md) before finishing
a coherent implementation or workflow outcome. It produces distinct human and
agent documentation, maintained with the work. The
[human guide](README.md) explains the resulting experience.

This skill is one folder: `SKILL.md`, both writing outlines, `README.md` for
people and this `contract.md` for agents. Keep its resources together when
bundling it. The product uses its own canonical pair: ohm's
[human quick start](../../public/docs/quick-start.md) and
[agent working guide](../../public/docs/agent-guide.md), both generated from the
authored public-docs source.

## Entry points and flow

1. [AGENTS.md](../../AGENTS.md) requires the skill at completion or handoff.
2. [The start skill](../../skills/start/SKILL.md) routes finishing work to it;
   [the README](../../README.md) exposes it to plugin users and other agents.
3. The agent checks the final request, implementation, diff and verification.
4. It updates the canonical pair, their navigation and any generated outputs.
5. It returns both document links, verification and any unresolved gap.

The files are instructions interpreted by the working agent. There is no new
runtime, task watcher, CI job or client hook. Bundling the skill makes it
discoverable; it does not prove automatic invocation in every client. Another
project must invoke it or adopt a completion instruction in its own agent rules.

## Dependencies and reasons

| Dependency | Direction and reason | If missing |
| --- | --- | --- |
| Final source, contracts and checks | Work evidence informs both docs; it prevents plans or summaries becoming unsupported guarantees | Inspect available evidence and name the exact unverified part |
| The working agent | The skill depends on its judgment to explain purpose, causal dependencies and the user's path through the result | Loading a file alone produces no docs |
| Agent and human outlines | The skill reads its sibling writing guides to cover the different audiences | Restore the packaged resources before treating the skill as complete |
| Canonical authored docs and navigation | The skill updates those sources to keep a single maintained account of the behavior | Create a stable topic pair and link it from an existing entry point |
| Existing generation and checks | Authored docs feed the site's build; checking outputs catches missing pages, anchors and stale references | State the verification gap and avoid claiming the published experience works |

## Output contract

Use existing audience-specific locations first. Otherwise create a human guide
at `docs/<topic>.md` and an agent guide at `docs/agents/<topic>.md`. The topic is a
durable capability, not a commit or session. Each should link to the other.

The human guide must explain the need, outcome, meaningful prerequisites and
their reasons, first use, recognizable result, relevant data/permission choices,
and likely recovery. Explain implementation details only when they help a person
understand, decide, act or recover.

The agent guide must name implementation entry points, dependency direction and
reasons, contracts and invariants, side effects, failures/retries, usage and
verification. Link to authoritative source; do not fork an existing API reference.
A generated Markdown copy of a human page does not satisfy this separate purpose.

Both must agree on names, scope, privacy, permissions and availability. Clearly
separate implementation, tested behavior and live deployment. Use synthetic
examples, keep private member data and credentials out of published docs, and
follow existing publication permissions. Do not add a new approval ceremony.

## Usage and recovery

From a project with access to the skill, ask:

> Use document-work on the completed change. Update the canonical human and agent
> guides from the final implementation, check them, and return both links.

Several commits may map to the same pair. Re-read the current documents before
editing; preserve unrelated work. If review changes behavior, reconcile both
guides and regenerate affected outputs. Missing evidence is a documented gap,
not permission to invent a command, control or success claim.

## Verification and maintenance

Check skill frontmatter and its linked resources. Confirm packaging includes the
skill directory. Review a completed example against both outlines and check local
document links. There is no automated test that proves the prose is understandable
or that a client will invoke the skill.

In this repository, run `npm test` and `git diff --check` from the repository root
when validating an implementation change. If public docs changed, edit
[public/docs/build.py](../../public/docs/build.py), run `npm run docs:build`, and
review the generated HTML, Markdown and LLM copies. The generated files are not
the authoring source.

The skill's authored sources are
[SKILL.md](SKILL.md),
[the agent outline](agent-guide.md) and
[the human outline](human-guide.md).
Keep their contract, the completion rule, startup routing, README discovery and
both example guides consistent when changing this workflow.
