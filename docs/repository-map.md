# Working on ohm without losing the thread

ohm lets someone keep a working copy of their posts, publish the ones they choose
to their own PDS, and show those records through the website they already have.
Their private agent context belongs beside that work, with its own storage and
permissions. Keeping these responsibilities separate makes it possible to change
the editor or an agent tool without accidentally publishing a draft or exposing
private memory.

This guide helps contributors find the right place to change something and
recognize when the result is safe to use. For a first personal workspace, start
with the [human product guide](../public/docs/quick-start.md). For exact ownership,
state transitions and checks, use the [agent repository guide](agents/repository-map.md).

## Follow the person's work

The DID identifies the person and names their PDS. The vault keeps working posts;
the Cortex keeps private memories, observations, skills and tool descriptions.
A browser or an authorized agent uses the same member-scoped service. Publishing
prepares a separate proposal, then the member applies approved changes at their
PDS. The feed and their site read published records.

That separation matters during an ordinary edit. Saving a private draft must not
make it public. Switching accounts must not send its attachments to another
account. Typing while a save is waiting must leave the newer text available for
the next save. Moving a website must preserve its content and appearance. These
are the outcomes the module boundaries and failure checks protect.

## Find the right home

| If you are changing… | Start here | Why it exists separately |
| --- | --- | --- |
| Commands and configuration | [bin](../bin/ohm.mjs), [scripts](../scripts/) | One command entry point finds the owner's configuration; individual commands keep their distinct write permissions. |
| Post files, versions, folder sync or publication proposals | [vault](../vault/) | Shared transformations keep file identity and record identity consistent across the browser, CLI and agents. |
| The member API or editor | [service](../service/README.md) | Authentication and durable member storage belong at the service boundary; the editor adds draft and navigation behavior. |
| Private agent context | [cortex](../cortex/), [Cortex guide](../public/docs/cortex.md) | Memory and learning stay outside post storage and public publishing. |
| Agent tools | [mcp](../mcp/) | MCP composes the same service operations, including previews and confirmations, rather than inventing another data store. |
| Public records and post addresses | [feed](../feed/), [labels](labels.md) | Public readers resolve the owner's records and their label-derived addresses. |
| The attached notes interface | [site](../site/) | These files are mounted as Worker assets; they are reached by HTTP routes rather than JavaScript imports. |
| Scheduled copying from published sources | [mirror](mirror.md) | A configured source reader has its own budget, ownership checkpoints and recovery; it is different from bringing PDS posts into a private vault. |
| An X archive | [Java importer](../importer/) | A standalone local archive reader supports historical imports without making Node run Java during ordinary use or tests. |
| A PDS deployment | [Cirrus](../cirrus/) | Its own package and build wrap the upstream PDS and its durable storage. Root CLI installation does not deploy it. |
| Public product pages | [public site map](../public/home/README.md) | The live home Worker owns its pages, SEO, join flow and offline assets. |
| Public documentation | [documentation source](../public/docs/build.py) | One authored source produces HTML, Markdown, the LLM reference and navigation so they agree. |
| Reusable agent methods | [skills](../skills/README.md) | Instructions guide agent behavior; they are not a runtime watcher or background service. |
| Protocol contracts | [lexicons](../lexicons/), [schema layers](schema-layers.md) | Fixed shared schemas preserve compatibility; optional owner schemas describe only the owner's extra fields. |
| Examples, tests or design rationale | [examples](../examples/), [tests](../test/), [plans](../plans/) | Examples preserve supported shapes, tests exercise failure boundaries, and plans explain intent without claiming it is implemented. |

Do not delete a file just because it has no import. Wrangler loads assets and
Workers from configuration; npm loads command and plugin entry points; Maven
loads the Java main class. The legacy schema and old configuration filenames
still serve existing owners. The retained [home draft](../public/README.md) is a
separate preview with a partly generated shell, not the deployed home site.

## Get a useful local result

Use Node 22 or later. From the repository root:

```sh
npm ci
npm --prefix service ci
npm test
```

The root lock installs the CLI, Markdown tooling and local Worker tooling. The
service has a separate lock because its signature-verification library belongs
to the backend. Contributor tests need both; an owner running the packaged CLI
does not need to install the backend. If tests cannot find the service's
`@noble/curves`, run its install command instead of changing imports. Test and
package-install hooks do not download missing service dependencies for you.

A small first change is a documentation correction. Edit the authored text in
`public/docs/build.py`, then run:

```sh
python3 public/docs/build.py
npm test
npm run docs:dev
```

Python 3 generates the static documentation; no Python package install is needed.
The preview serves this checkout on loopback port 8791. Open it in a browser on
the machine running the command. You should see the correction, working section
links and the existing header-free reading layout. Inspect the generated diff:
the HTML, Markdown and LLM versions should tell the same story. If generation
fails partway, fix its source and rerun before keeping any output.

For public home work, use `npm run home:dev` on port 8790, then
`npm run home:seo -- http://127.0.0.1:8790`. For the retained draft, use
`npm run home-draft:dev` on port 8792. These commands are owned by the repository
and do not depend on a private editor launcher. Local tests and previews require
no member password or production deployment.

The Java importer is optional. Java 21 and Maven build its executable JAR and
run its own tests. Jackson reads the archive; ICU4J supplies Unicode normalization,
letter categories and contextual lowercase so addresses do not depend on the
JDK's older character tables. The Unicode data adds about 14.45 MiB before shading
and is confined to the Java tool. [Build and preview instructions](../README.md#import-an-x-archive)
show the actual command. Cirrus similarly needs its own `npm ci` and build only
when you work on the PDS component.

## Understand a refusal before retrying

| What you see | What it protects | What to do next |
| --- | --- | --- |
| A changed-account or membership refusal | A stale page must not read or mutate another displayed account's work. | Reopen the workspace for the intended account. Account discovery and disconnect remain available when admission is revoked. |
| A warning about unsaved writing | Navigation would discard a local draft. | Cancel to keep editing, or save. New text typed during a pending save still needs its own save. |
| A version conflict | Someone changed the stored post or memory after it was read. | Keep the draft, read the current version and reconcile before retrying. |
| An occupied sync path, invalid file or copied ID | Pulling must not overwrite an unrelated file or treat invalid local content as a deletion. | Preserve both copies; correct the metadata or choose another path, then preview again. Do not discard the sync baseline to suppress the warning. |
| An incomplete repository listing | A partial list cannot safely stand for everything the person owns. | Retry after the PDS recovers, or review the configured bound; do not treat the partial result as a completed import. |
| A changed mirror summary | Counts or conversion losses changed between review and saving. | Review a new preview and confirm it. This approval covers the displayed summary, not frozen body bytes. |
| An old renderer sidecar or changed page shape | The existing template has no proven place for all the content. | Keep the old template, sidecar and output. Update a copy of the source page as needed, then explicitly adopt it again and compare the rebuilt page. |
| An ambiguous mirror checkpoint or externally edited record | An automatic copy cannot prove that it owns the existing record. | Preserve the record and checkpoint for operator review; do not clear state to force an overwrite. |

Private writing in the editor lives in the current page until saved. Save before
closing it. A network request already sent can complete even after navigation;
the editor prevents its completion from reopening an old post or replacing newer
typing. An account switch can stop later publication steps, but cannot undo a
PDS write already sent.

Two older library boundaries remain deliberate. A failed move between visibility
stores can preserve two copies; normal vault commands then refuse the duplicate.
An operator must compare the stores and remove only the unwanted copy using its
current version. The own-KV adapter requires a single writer because its version
check is a read followed by a write, not a distributed transaction. Neither is a
promise of atomic movement across independent stores.

## Finish where the next person can continue

Run checks for the behavior you changed, regenerate references from their sources,
and use [document-work](../skills/document-work/README.md) to maintain both the
human guide and the agent contract. A useful handoff explains the result and the
remaining recovery boundary, with local checks separated from live verification.
The [status guide](../public/docs/limits.md) is the product boundary: automatic
adapters, turn capture, Cortex export, browser/cloud folder sync and planned social
flows must not be described as shipped merely because a plan or placeholder exists.
