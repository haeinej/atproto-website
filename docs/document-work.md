# Documentation that follows your work

When an agent finishes something, you should be able to understand what it makes
possible without reconstructing the conversation. The next agent should be able
to continue from the same facts. Those readers need different explanations.

The `document-work` skill makes both explanations part of finishing the work.
One guide helps you understand the purpose and use the result. The other gives
agents the contracts and evidence they need to work on it safely. They stay with
the project, where you can read, edit and review them alongside the change.

## What you get

Imagine an agent has finished a private memory editor. A useful human guide starts
with why you would keep working knowledge separately from published posts. It
explains why you connect an account, where to open the editor, how to change a
memory, and what stays private. A list of database tables would not answer those
questions.

The agent guide covers those tables and the requests that use them, including
account isolation, version checks and failure recovery. Keeping that detail in
its own guide lets you follow the experience while another agent can find the
technical contract. Both guides must describe the same implemented behavior.

## What it needs, and why

| What is needed | Why it matters | What you need to do |
| --- | --- | --- |
| An agent with access to the finished work | It needs to check what actually exists so the guide does not promise the original plan as a finished feature | Work in the project and make the relevant source and results available |
| The skill and the project's instructions | They tell the agent to write for both audiences before calling work done | This repository includes that completion instruction; elsewhere, ask your agent to use the skill |
| A home for the docs | A guide is useful later only if people can find and update it | Keep existing documentation locations; the agent creates a pair if none exists |
| The documentation build, when the project has one | It turns the authored guide into the version people actually read | The agent uses the project's build and checks rather than editing generated copies |

The skill needs no additional service or credentials. It is a routine the agent
follows, rather than a background process that notices work on its own. An agent
must load the skill or follow the repository's completion instruction for it to run.

## Use it on a finished chunk

In this repository, ask your agent to finish a feature, fix or workflow normally.
The completion instruction includes documentation. You can also ask explicitly:

> Use the document-work skill for the chunk we just finished. Update the human
> guide so I understand why it is needed, what depends on what and why, and how I
> use the result. Update the agent reference from the actual implementation too.

The agent checks the finished work and finds the right place for both guides.
It updates existing pages when they already cover the topic, so you do not get a
new pair of files after every small edit. A coherent feature can span several
commits and still have one maintained pair of guides.

When it finishes, you get links to both guides and a short account of what was
verified. Read the human guide from your own starting point: can you explain why
you would use this, satisfy its prerequisites, and recognize a successful result?
If a dependency is missing, the guide should explain what remains possible and
what to do next.

## What to expect from an honest guide

Something implemented in code is not necessarily available on the live service.
The guides must distinguish what was built, what was tested and what you can use
where you are. An unfinished step should be visible where it affects your use.

The docs describe the product using synthetic examples. They do not turn your
private posts, memories or conversation into public material. Writing them also
does not deploy the feature or publish a record.

If an agent skips the guides, ask it to run `document-work` on the finished chunk.
If a guide describes a button or result you cannot find, ask the agent to check it
against the actual implementation and deployment rather than guess at a workaround.

For the precise completion contract and file locations, see
[the agent reference](agents/document-work.md). To change how the explanations
are written, edit [the skill](../skills/document-work/SKILL.md) and its
[human writing guide](../skills/document-work/human-guide.md).
