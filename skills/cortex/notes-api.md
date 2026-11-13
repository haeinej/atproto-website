# Notes API contract

All three requests live under `/xrpc/com.ohmmmm.cortex.` and require the existing
member authentication. The router supplies the authenticated DID. No body field
can select a member or author. Requests and responses are JSON; reads are GET,
changes POST. Unknown body fields are refused as `400 InvalidRequest`.

## `addNote` / `cortex_note`

POST `com.ohmmmm.cortex.addNote`:

```json
{
  "id": "session-a:observation-1",
  "note": "The member shortened three suggested titles.",
  "session": "session-a",
  "project": "https://example.test/member/repo"
}
```

`id`, `note` and `session` are required nonempty single-line strings. IDs are
limited to 200 UTF-16 code units (the foundation source-note limit); notes and
sessions to 500 and 200 Unicode code points respectively. `project` is optional text,
up to 2,000 UTF-16 code units; empty or omitted means global (`null` in lists).
Line separators and NUL are refused. Supply the real originating session.

Response: `{"id":"session-a:observation-1"}`. Generate the ID once on the client.
The same member's same ID and content is a successful no-op, including after
settlement. Reusing that ID with different text, session or project returns
`409 Changed`. Different members may use identical IDs independently. Author
and creation time come from the service; `writtenBy`, `when`, counters, outcome,
visibility and DID are not accepted as input.

## `listNotes`

GET `com.ohmmmm.cortex.listNotes`. Default: only unsettled notes, ordered by
creation time then ID. `?settled=1` or `?settled=true` includes all receipts;
`0` and `false` retain the default. Other values return `400 InvalidRequest`.

```json
{
  "notes": [{
    "id": "session-a:observation-1",
    "text": "The member shortened three suggested titles.",
    "session": "session-a",
    "project": "https://example.test/member/repo",
    "writtenBy": "did:web:member.test",
    "when": "2026-11-13T00:00:00.000Z",
    "settledAt": "2026-11-14T00:00:00.000Z",
    "outcome": "kept"
  }]
}
```

`settledAt` and `outcome` are absent until settled. `kept` is a final receipt,
available as evidence for future comparisons through this history. It does not
reappear in the default waiting list.

## `settleNotes` / `cortex_settle`

POST `com.ohmmmm.cortex.settleNotes`:

```json
{
  "notes": [
    {"id":"one-off", "outcome":"dropped"},
    {"id":"first-sighting", "outcome":"kept"},
    {"id":"confirmation", "outcome":"plain-titles", "version":"c-current-memory-version"}
  ]
}
```

Response: `{"settled":["one-off","first-sighting","confirmation"]}` in request
order. Submit 1–100 distinct IDs, each with `outcome`. The outcome is `kept`,
`dropped`, or a lowercase hyphenated memory name (at most 100 characters).
`kept` and `dropped` are reserved outcome literals. A memory outcome requires
`version`, the exact current target-memory version; literal outcomes must not
include `version`. All notes going into the same memory name the same version.

The operation records one immutable outcome per note and is atomic across the
submitted notes and evidence updates to all target memories. Omitted notes are
left untouched; the caller must account for every note from its opening
snapshot, using multiple batches if needed. A retry of an acknowledged batch
is successful without counting again, even if target memories have since been
edited or removed. A different outcome for an acknowledged ID returns
`409 Changed`.

For an unacknowledged note, a missing note or target memory returns
`404 NotFound`; a stale target version or concurrent note/memory change returns
`409 Changed`. These failures leave every note and memory in the batch unchanged.
Malformed input returns `400 InvalidRequest`. Invalid source-note provenance,
project mismatch, exceeding the foundation's 100-source-note limit, or fewer
than two distinct sessions supporting an inferred target returns
`400 InvalidMemory`.

The service reads targets through the existing memory store. It leaves memory
text, `stated` and `writtenBy` intact and updates `notes`, `seen`, version and
history together, using the foundation revision recipe and history trigger.
`seen.count` counts distinct originating sessions, including prior notes routed
into that memory and historical kept notes explicitly included as sources;
`seen.last` is the latest source observation time. Notes from other projects,
dropped notes or notes routed into another memory cannot supply evidence.
Sessions and note text remain observations supplied by the authenticated
member's client; the service cannot establish their truth or independence with
a model. Never fabricate them.

Save semantic rewrites with `putMemory` first (including genuine supporting
`memory.notes` IDs and `replaces`), then settle using the returned version. A
settlement creates an evidence revision; call `getMemory` to obtain its new
version before the next edit. A failed settlement does not undo a separately
completed `putMemory`; read and reconcile it before retrying. The Notes endpoint
does not perform semantic rewriting or call models. The supplied policy in
`SKILL.md` tells the agent how to judge, especially how stated memory outranks
inferences.
