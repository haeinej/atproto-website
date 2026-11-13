# Repository ownership and state contracts

This is the source-checkout maintenance reference for the [human repository guide](../repository-map.md).
Use [AGENTS.md](../../AGENTS.md) for policy, [service capabilities](../../service/CAPABILITIES.md)
for exact request metadata, and the [public agent guide](../../public/docs/agent-guide.md)
for member-facing tool use. This map explains why paths are retained and where
state transitions live; it does not replace those contracts. The packaged CLI
intentionally excludes the backend, public-site source, Java tool and Cirrus;
clone the repository to follow their source and build links.

## Data and control boundaries

```text
DID document -> named PDS -> public records -> feed / owner's renderer
member browser or MCP -> authenticated service -> DID-scoped vault posts
                                             -> separate private Cortex
vault -> approved publication plan -> member-side PDS uploads / record writes
local folder <-> versioned vault sync
configured published source -> mirror Worker -> owner PDS + mirror checkpoint KV
```

Publish and Mirror do not read Cortex. A name or request argument never selects
another member's private storage. Shared lexicons remain fixed. Owner-specific
fields stay in the optional owner layer. Newly imported posts file under an author
label or `other`; the label-derived path and permanent record key are separate.
Preserve legacy slug-keyed records and configuration filenames when extending
current ID-keyed paths.

## Entry points, loading and generated output

| Boundary | Entry/source | Loading reason and ownership |
| --- | --- | --- |
| npm CLI | [bin/ohm.mjs](../../bin/ohm.mjs), [package.json](../../package.json) | npm `bin` dispatches commands into `scripts/`; package `files` is the distribution boundary. Check an extracted tarball, not only source imports. |
| MCP stdio | [mcp/server.mjs](../../mcp/server.mjs), [protocol](../../mcp/protocol.mjs), [tools](../../mcp/tools.mjs), [Cortex tools](../../mcp/cortex-tools.mjs) | Serialized JSON-RPC; lazy member authentication; nineteen interfaces. `service/public/vault/publish.js` is intentionally shared with member-side publication and must be packed. |
| Hosted member service | [worker](../../service/src/worker.mjs), [capability registry](../../service/src/capabilities/index.mjs), [schema](../../service/schema.sql) | Registry dispatch and D1 state, with browser assets under `service/public/vault/`; service dependencies have their own lock. |
| Public feed / attached UI | [feed config](../../feed/wrangler.jsonc), [worker](../../feed/worker.mjs), [site](../../site/) | Wrangler mounts assets, cron and routes; absence of JS imports is not dead-code evidence. |
| Scheduled source mirror | [mirror config](../../mirror/wrangler.jsonc), [sync](../../mirror/sync.mjs), [readers](../../mirror/sources.mjs) | Configured sources, write credentials, budget and KV checkpoints; explicit deployment/source approval is separate from a local build. |
| Public home | [home config](../../public/home/wrangler.jsonc), [worker](../../public/home/src/worker.js), [site map](../../public/home/README.md) | Six canonical HTML routes plus join/static/alias handling. Home schema path resolves to the root Wrangler dependency. |
| Public docs / draft shell | [build.py](../../public/docs/build.py), [public ownership](../../public/README.md) | Edit generator, then regenerate HTML/Markdown/LLM/navigation. Draft content is separate; generated shell ownership does not make it the live home. `.assetsignore` excludes generator/config from docs assets. |
| Capability reference | [scripts/capabilities.mjs](../../scripts/capabilities.mjs) | `npm run capabilities` writes `service/CAPABILITIES.md` from executable registry/tool tables. |
| Java archive tool | [pom](../../importer/pom.xml), [Importer](../../importer/src/main/java/com/atprotowebsite/Importer.java) | Maven manifest loads the established internal Java package; its old package name is still wired. Java21 build stays separate from Node installation/tests. |
| PDS wrapper | [Cirrus entry](../../cirrus/src/index.ts), [config](../../cirrus/wrangler.jsonc), [package](../../cirrus/package.json) | Upstream PDS re-export is a Vite/Wrangler entry, with independent lock and durable-object migration history. |
| Compatibility / examples / plans | [legacy schema](../../feed/com.haeinjung.note.json), [lexicons](../../lexicons/), [examples](../../examples/), [plans](../../plans/), [skills](../../skills/) | External records, namespace templates, round-trip fixtures and instruction/design consumers. Plans and authenticated placeholders do not prove runtime feature completion. |

Before removal, check direct imports, dynamic command dispatch, package allowlists,
Wrangler mounts/routes/bindings, Maven resources/manifest, generators, tests,
external compatibility and instruction links. Regenerate a consumer when its
authored source moves. Keep runtime outputs such as `.ohm/sync.json`, temporary
replacement files and `.from-ohm` conflict copies distinct from repository source.

## Content lifecycle inventory

These are state/process families, not a claim that each is a formal FSM class.
External calls can fail between every transition. Source links identify the owner;
tests named below are local fixtures unless explicitly stated otherwise.

| Flow | States, guards and recovery | Owner / verification |
| --- | --- | --- |
| Configuration and deployment mode | Explicit config or first discovered legacy/current path -> validated owner/site -> attach or standalone mode. `posts`/`snapshot` accept `--config` or one legacy positional path, never both. Invalid input stops before work. | [config](../../scripts/config.mjs), [CLI regressions](../../test/content-cli.test.mjs) |
| DID and handle resolution | Resolve -> document/PDS validation -> verified/unverified handle. A positively mismatched PDS refuses refresh; unavailable resolution differs from a verified mismatch. | [identity](../../feed/identity.mjs), [identity tests](../../test/identity.test.mjs) |
| CLI publication | Validate -> stage attachments -> preview -> explicitly approved upload/record commit. `--publish` is the public write boundary; private import `--save`, folder `--apply` and local renderer output are distinct. Failed final writes can leave unreferenced uploaded blobs. | [publish](../../scripts/publish.mjs), [vault tests](../../test/vault.test.mjs) |
| Store versions and blobs | Absent/present -> create or expected-version replace/delete -> conflict/commit. PDS uses CID preconditions; blob identity is not record version. Own-KV uses read-before-write and requires a single writer. | [stores](../../vault/stores.mjs), [core](../../vault/core.mjs) |
| Visibility transfer | Find unique source -> copy destination -> delete source. Failed removal keeps both; normal operations refuse duplicates. Operator compares both stores and version-deletes only the unwanted copy. No cross-store rollback claim. | [vault](../../vault/vault.mjs), [safety tests](../../test/content-safety.test.mjs) |
| Markdown/file identity | Parse -> validate metadata/ID/path -> post/version. Invalid occupants and copied IDs block affected sync work; they do not become absence. Reserved conflict-copy suffixes are not new posts. | [file](../../vault/file.mjs), [folder](../../scripts/folder.mjs) |
| Three-way folder sync | Compare local, vault and baseline -> push/pull/delete/conflict -> apply -> keep next baseline. Occupied/reserved destinations refuse; affected baseline and conflict copies remain. Apply is not atomic across filesystem and service. | [sync](../../vault/sync.mjs), [sync tests](../../test/sync.test.mjs), [safety tests](../../test/content-safety.test.mjs) |
| Published import | Complete inventory -> reconstruct -> report differences/losses -> optional save. Changed vault versions are preserved. An incomplete inventory cannot proceed to mutation. | [import command](../../scripts/import.mjs), [import](../../vault/import.mjs) |
| Legacy migration | Read old collection -> convert/validate -> preview -> approved fixed-type writes. Preserve legacy read paths; do not rename the shared schema. | [migrate](../../scripts/migrate.mjs), [upgrade](../../feed/upgrade.mjs) |
| Hosted publication | Plan -> prepare attachments -> displayed confirmation -> member-side upload/apply. Compare placement, source/blob address, kind and alt; ID-only renaming is not content loss. Mutable bytes behind an unchanged remote URL are not previewed as a content digest. | [plan](../../vault/publish.mjs), [preparation](../../service/src/capabilities/publish.mjs), [browser apply](../../service/public/vault/publish.js) |
| Profile merge | Read valid current record/CID -> merge selected fields -> stage optional blobs/links -> conditional self-record write. Only explicit RecordNotFound is absence during publication; HTTP/protocol failures stop writes. Multiple records/blobs are not one transaction. | [profile](../../scripts/profile.mjs), [CLI tests](../../test/content-cli.test.mjs) |
| CLI PDS/service authentication | Sign in -> obtain method-bound service token -> request; renew on the defined refusal path. Credentials remain private process input, never post content or docs. | [RPC](../../scripts/rpc.mjs), [vault client](../../scripts/vault-client.mjs) |
| Mirror scheduling/retries | Read source window -> per-item validation -> bounded attempts -> waiting/error/complete. Cursor rotates attempts across sources; failing expensive items consume budget. No distributed run lock or full-history guarantee. | [mirror](../../mirror/sync.mjs), [mirror tests](../../test/mirror.test.mjs) |
| Mirror ownership/checkpoints | Bind repository/origin/site/source identity -> select stable/collision-safe key -> validate ownership/version -> persist intended record -> write -> complete checkpoint. Interrupted acknowledgments reconcile canonical intended records regardless of JSON property order. Ambiguous v1/media/metadata mappings, unrecognized checkpoint variants or external edits require operator review. | [mirror](../../mirror/sync.mjs), [mirror tests](../../test/mirror.test.mjs) |
| Feed refresh/inventory/expiry | Verify config/identity -> bounded complete pages -> normalize -> snapshot. Cursor cycles/caps fail; empty advancing pages continue. Previous snapshot may remain until TTL on failure; it does not establish live slug absence. | [repository reader](../../feed/repository.mjs), [worker](../../feed/worker.mjs) |
| Public routing and aliases | Resolve live owner-scoped slug or permanent key -> normalize -> canonical redirect/render. Qualified canonical slug and bare key aliases must not hijack each other. Duplicate slug matches or incomplete required inventories fail closed. No historical slug registry is added. | [worker](../../feed/worker.mjs), [slug tests](../../test/slug.test.mjs) |
| Private/friends feed gate | Access identity -> configured permission -> scoped graph/blob response or refusal. This self-hosted surface is distinct from hosted vault cookies and planned friends delivery. | [private feed](../../feed/private.mjs) |
| Static notes view | Load graph/view hints -> filter/render -> detail or failure. Owner hints are presentation, not authorization. Server-side gates remain authoritative. | [notes UI](../../site/notes.js) |
| Renderer adoption/build | Adopt original page -> structural sidecar/template -> compare round trip -> build only compatible shape. Sidecar v2 records item/link/image shape and required tokens. Old/missing sidecars, changed cardinality or removed slots refuse before output replacement; explicit re-adoption is recovery. | [engine](../../scripts/render-engine.mjs), [command](../../scripts/render.mjs), [renderer tests](../../test/render.test.mjs) |
| Java archive selection | Parse archive -> select eligible posts/media -> offline preview -> approved publication. Keep `x-ID` keys; effective label determines URL folder. Unicode tables are pinned in ICU4J78.3, separately from the JDK. | [Importer](../../importer/src/main/java/com/atprotowebsite/Importer.java), [Post tests](../../importer/src/test/java/com/atprotowebsite/PostTest.java) |
| Java PDS session/create recovery | Obtain session -> upload -> create-if-absent -> acknowledge or inspect existing record on retry. Preview is offline; tests do not establish authenticated publication. | [PdsClient](../../importer/src/main/java/com/atprotowebsite/PdsClient.java) |
| Schema/site-layer binding | Select fixed/shared schema and optional owner layer -> validate -> render/publish. Example namespace files are templates, not hard-coded owner state. | [lexicon command](../../scripts/lexicon.mjs), [layers](../../scripts/layers.mjs) |
| Cirrus build/migration | Install locked package -> Vite build -> separately configured deploy/storage migration. A single upstream re-export is intentional; do not prune migrations as unused source. | [Cirrus](../../cirrus/), [config](../../cirrus/wrangler.jsonc) |

## Member workspace lifecycle inventory

| Flow | States, guards and recovery | Owner / verification |
| --- | --- | --- |
| HTTP identity/admission | Token or ohm cookie -> one request DID snapshot -> expected-DID check -> membership -> capability. Cookie and PDS paths enforce admission for private data/keyboard changes. Account discovery/connect/disconnect remain recovery paths. Reconnect never retargets an admitted mutation to the new DID. | [worker](../../service/src/worker.mjs), [identity](../../service/src/identity.mjs), [race tests](../../test/workspace-service.test.mjs) |
| Browser onboarding/session | Disconnected -> OAuth pending or visit-only password session -> connected/expired/logged out. Persistent owner ID and token-pair compare/write share an IndexedDB transaction. Late refresh/callback cannot restore logout or same-DID replacement; old stored sessions without ownership require sign-in again. | [signin](../../service/public/vault/signin.js), [signin tests](../../test/signin.test.mjs) |
| Scoped browser transport | Capture displayed DID/generation -> issue auth -> send expected-DID header -> read JSON/bytes -> recheck. Stale attachment bytes never reach later upload/apply. A PDS write already sent is not reversible. | [scope](../../service/public/vault/account-scope.js), [browser handlers](../../service/public/vault/vault.js), [handler tests](../../test/vault-browser.test.mjs) |
| Editor/tree/save | Read/selected/dirty/saving -> saved/conflicted/abandoned. Selection tickets ignore old reads and completions. Dirty navigation can be cancelled; pending save advances base version while retaining subsequent typing. Unload warning is best effort; unsaved text has no durable draft store. | [browser handlers](../../service/public/vault/vault.js), [handler tests](../../test/vault-browser.test.mjs) |
| PDS-to-vault mirror approval | Preview -> confirm displayed summary -> apply reads once, compares optional `expectedSummary`, then saves that read. Counts/caveats changes refuse before saves; clean same-summary body/ID changes are allowed. This is not exact-content approval. Completion marks only the original user/DID link mirrored. | [mirror capability](../../service/src/capabilities/mirror.mjs), [MCP tests](../../test/mcp.test.mjs) |
| Memory/Context versions | Absent/current/history -> expected-version update/delete -> conflict or new version. Context reads selected private memories plus approved skills/enabled tool metadata, scoped by member DID. | [Cortex store](../../cortex/store.mjs), [Context](../../cortex/context.mjs), [Cortex tests](../../test/cortex.test.mjs) |
| Notes/evidence settlement | Observation recorded -> unresolved -> atomic memory change plus outcome, or dropped/kept outcome. Evidence links are not public posts. | [notes capability](../../service/src/capabilities/notes.mjs), [notes tests](../../test/notes.test.mjs) |
| Skill approval | Proposal/version -> pending -> member approval of exact version -> approved/stale/removed. Agent proposals cannot approve themselves. Mutations use the DID already checked by dispatch. | [skills](../../service/src/capabilities/skills.mjs), [skill/tool tests](../../test/skills-tools.test.mjs) |
| Tool metadata | Proposed inert descriptor -> keyboard-managed enabled/disabled/removed entry. No installation, credentials, server connection or executable enabling occurs from a proposal. | [tools](../../service/src/capabilities/tools.mjs), [skill/tool tests](../../test/skills-tools.test.mjs) |
| Cortex panel async state | List/detail/edit/dirty/pending -> completion/error/reset. Panel generation and leave checks preserve newer work and clear member state on reset. | [panel](../../service/public/vault/cortex.js), [panel tests](../../test/cortex-editor.test.mjs) |
| MCP protocol/auth/confirmation | Parse -> serialized dispatch -> result/error -> next request. Invalid parameter shapes return controlled errors; unexpected handler errors do not poison the queue. Side effects retain their tool-specific confirmation contracts. | [protocol](../../mcp/protocol.mjs), [tools](../../mcp/tools.mjs), [MCP tests](../../test/mcp.test.mjs) |
| Reserved Cortex operations | Authenticate -> explicit not-implemented response. Reserved turn/export tables or endpoints do not imply capture, recall hooks, export or adapters run. | [pending](../../cortex/pending.mjs), [limits](../../public/docs/limits.md) |

## Public surface and instruction lifecycle inventory

| Flow | States, guards and recovery | Owner / verification |
| --- | --- | --- |
| Home canonicalization | HTTP/www/known alias -> permanent canonical redirect; known page -> metadata/assets; missing route -> real noindex404. | [home Worker](../../public/home/src/worker.js), [SEO tests](../../public/home/test/seo.test.mjs) |
| Join submission/storage | Validate origin/body -> rate limit -> idempotent persistence or refusal. POST remains network-only and is not replayed by the service worker. | [home Worker](../../public/home/src/worker.js), [join tests](../../public/home/test/join.test.mjs) |
| Join popup | Closed/open -> submitting -> success/error -> close/reopen. UI feedback is separate from server validation. | [join UI](../../public/home/public/join.js) |
| Service-worker ownership | Register -> install/precache -> activate -> old-cache cleanup. Added/renamed/removed assets require updating cache ownership/version; ordinary edits follow existing refresh policy. | [service worker](../../public/home/public/sw.js), [site instructions](../../public/home/README.md) |
| Navigation fetch race | Preload/network vs timeout -> cached page/root fallback. Timeout fallback is not proof of network availability. | [service worker](../../public/home/public/sw.js) |
| Asset cache | Cached asset -> background refresh; fonts retain immutable policy. Every precached script, including join.js, has a reachable GET route. | [service worker](../../public/home/public/sw.js), [cache tests](../../public/home/test/sw.test.mjs) |
| Responsive navigation | Desktop rail vs mobile menu checkbox -> open/closed -> selected route. Docs stay header-free with a normal-flow mobile control. | [docs source](../../public/docs/build.py), [docs CSS](../../public/docs/styles.css) |
| Docs reader | Heading click/scroll -> queued active-section update -> stable linked heading. Preserve legacy `#architecture` and generated HTML/Markdown anchors. | [reader](../../public/docs/reader.js), [docs tests](../../test/docs.test.mjs) |
| Landing rendering | WebGL available/unavailable -> active/paused/reduced-motion -> render or CSS fallback. Viewport and motion preference own animation work. | [landing](../../public/home/public/landing.js) |
| Docs generation | Authored content -> parser modes -> generated outputs -> link/ID checks. A failed run can leave partial output; rerun from fixed source and inspect the full diff before committing. | [generator](../../public/docs/build.py), [docs tests](../../test/docs.test.mjs) |
| Agent-led site/label workflow | Inspect original -> baseline copy -> proposed filing/migration -> owner approval -> verified change. Source is the rendering specification; no unapproved public writes. | [migration skill](../../skills/migrate-site/SKILL.md), [label skill](../../skills/suggest-labels/SKILL.md) |
| Documentation completion | Coherent implementation -> establish final truth -> human/agent canonical updates -> regenerated navigation -> handoff with evidence/limits. Instructions add no automation runtime. | [document-work](../../skills/document-work/SKILL.md) |
| Cortex learning policy | Observe -> propose/settle evidence -> exact-version member approval where required -> later Context. Instruction policy is distinct from actual hook/adaptor implementation. | [Cortex skill](../../skills/cortex/SKILL.md), [notes API](../../skills/cortex/notes-api.md) |
| Planned social/folder models | Design/proposal only for friends delivery, finding people and browser/cloud folder ownership. Keep planned states separate from implemented local CLI sync and authenticated placeholders. | [network plan](../../plans/network-architecture.md), [status](../../public/docs/limits.md) |

## Verification and changes

From the repository root, with Node22+ and Python3:

```sh
npm ci
npm --prefix service ci
npm run capabilities
python3 public/docs/build.py
npm test
git diff --check
```

The suite covers schema/registry parity, member isolation, CAS, queue recovery,
OAuth races, DOM-handler interleavings, pagination, mirror recovery, renderer
shape, extracted-package MCP startup, HTML/Markdown IDs and offline asset routing.
The minimal DOM and in-memory D1/IndexedDB/network fixtures are not Chrome, live
OAuth, production D1/KV or proof of deployment. Do not relabel them as browser
end-to-end evidence.

For affected components, add:

```sh
npm run home:check
npm exec -- wrangler deploy --config public/docs/wrangler.jsonc --dry-run
npm exec -- wrangler deploy --config feed/wrangler.jsonc --dry-run
npm exec -- wrangler deploy --config mirror/wrangler.jsonc --dry-run
npm --prefix cirrus ci
npm --prefix cirrus run build
mvn -f importer/pom.xml package
java -jar importer/target/x-archive-importer.jar --help
```

The Java commands need JDK21/Maven; they are not root test prerequisites. Java
path fixtures compare ICU4J78.3/Unicode17 with Node24.22.2/ICU78.3/Unicode17.
The Java tool pins its tables; JavaScript uses its runtime's Unicode tables.
When changing either runtime, compare contextual casing, normalization and new
letter categories before claiming parity. Preserve `x-ID` keys and authored label
text, trim/default100UTF16 rules, and old public routing compatibility.

`expectedSummary`/`summary` on PDS-to-vault mirror are additive metadata; direct
older apply calls remain valid. The guard needs a service that implements it;
updating a local client does not update the deployed backend. Keep the existing
request names, authorization modes and MCP interfaces stable. Report any additive
contract change explicitly instead of claiming byte-for-byte contract equality.

Run package checks against a fresh extracted npm artifact with locked production
dependencies. Do not load accidental source-checkout files through symlinks or
install service dependencies from a test hook. Check static asset/config paths
from their declaring directory, including deployment conventions and fragments.
No source deletion is justified by a missing literal-import edge alone.

Use [document-work](../../skills/document-work/SKILL.md) before handoff. Keep fixed
schemas, DID isolation, owner approval and original-site comparison as release
gates. Distinguish local build, fixture tests, packaged execution, live account
verification and deployment; do not use a green local suite to claim all five.
