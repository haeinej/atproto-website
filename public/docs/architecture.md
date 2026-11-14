# System overview

ohm keeps a vault of posts and a private cortex for agent knowledge. The member's PDS owns public records; ohm stores working state; clients on the member's device perform approved publication.

<a id="how"></a>

## How it works

The vault holds what a member makes: posts filed under labels and sublabels, private, for friends or public. The cortex holds what their agents learn and can use: memories, observations, approved skills and tool settings. Both are member-scoped, but only public posts can become repository records.

1. **Sign in.** A person signs in to ohm, and once connects the AT Protocol account that owns their posts. That account lives on a Personal Data Server (PDS) they host themselves or at Bluesky. It is theirs whether or not they use ohm.
2. **Mirror.** What the account has already published is read from its repository into the vault. From then on the vault holds everything: public posts, and private and friends-only ones that exist nowhere else on the network.
3. **Work.** Posts are read, written and filed in the vault, through any of three clients: the workspace in a browser, an agent's tools, or a synced folder of Markdown files. A new post is private. Saving changes the vault and nothing else.
4. **Mark.** Setting a post to public or friends marks it. Nothing is shared by marking.
5. **Publish.** The vault service works out what would have to change in the member's repository for what is published to match the vault. The member reviews that plan and approves it, and their own device, signed in at their own PDS, makes the changes. Public posts become `com.ohmmmm.post` records.
6. **Read.** The member's website and any other AT Protocol application read those records from the repository. ohm is not in that path.
7. **Keep.** The vault can be synced to a folder the member holds, or exported, as Markdown files. With a folder connected, nothing depends on ohm keeping its copy.
8. **Learn.** An agent reads Context, records observations, saves memories and proposes skills. The member can inspect memory history and approve skill versions in Cortex. This state is separate from post sync; cortex export is not built yet.

Three rules hold everywhere and are worth knowing before anything else.

- **Saving never publishes.** Only Publish changes what other people see, and it always shows the change first.
- **ohm never writes to a member's repository.** It has no credential that could. Every write comes from the member's own device.
- **Private stays in the vault.** A private post is never written to the repository, where everything is public.

<a id="components"></a>

## Components

Diagram: the parts of ohm and what passes between them.
- On the member's device: the workspace (browser), the agent tools (MCP server) and folder sync (command line).
- Run by ohm: the vault and cortex service (posts and private agent knowledge) and ohm sign-in (accounts and sessions).
- The member's own account, on the AT Protocol: a Personal Data Server holding their identity and public repository.
- Device → vault service: API requests.
- Device → Personal Data Server: sign-in, service tokens, and the writes of a publish.
- Vault service → Personal Data Server: reads only.
- Vault service → ohm sign-in: session check.
- Personal Data Server → the member's website and other applications: public records.

| Component | Runs on | Responsibility | Status |
| --- | --- | --- | --- |
| Workspace | The member's browser, served from `app.ohmmmm.com/vault` | Editor, repository tree, publish review | Implemented |
| Cortex panel | The member's browser, beside the vault | Memories, Notes and Skills; history, restore and approval | Implemented |
| Agent tools | An MCP server, `ohm-vault`, on the member's machine | Vault and cortex tools composed from service requests. [Agent integration](https://docs.ohmmmm.com/mcp.md) | Implemented |
| Folder sync | A command-line client on the member's machine | Two-way sync between the vault and a folder of Markdown files | Implemented |
| Vault and cortex service | Cloudflare Workers and D1 | Stores posts and private cortex data; checks versions, evidence and approvals; computes mirror and publish plans | Implemented |
| Agent adapters | The member's machine | Automatic session hooks, prompt recall and turn capture | Planned |
| ohm sign-in | Cloudflare Workers and D1 | ohm accounts and sessions, with Google, Microsoft and Bluesky as identity providers | Implemented |
| Personal Data Server (PDS) | The member's host: self-hosted, or Bluesky | The account's DID, signing key, and repository of public records and files | External |
| Website and other applications | Their own hosts | Read public records from the repository | External |
| Network service | | Friends-only delivery, the follow graph, and matching | Planned |

<a id="ownership"></a>

## Ownership

Public records remain at the member's PDS. Posts have a portable folder format. Cortex data currently lives in the service, and a complete way to export it is still missing.

| Data | System of record | What ohm holds |
| --- | --- | --- |
| Identity: DID, handle, signing key | The member's PDS | A reference to the DID |
| Public posts | The member's repository, as `com.ohmmmm.post` records | A working copy |
| Private and friends-only posts | The member's folder, once connected | A working copy. Until a folder is connected, the only copy |
| Memory, history, notes, skills and tool settings | Private cortex, scoped by the member's DID | The stored copy; post exports do not include it |
| ohm account and session | ohm sign-in | The account itself |
| The link between an ohm account and a DID | Vault service | One row, unique in both directions |

<a id="principles"></a>

## Design principles

1. **The service never writes to a member's repository.** It holds no credential that could. Publishing is planned by the service and carried out from the member's device. [Mirror and publish](https://docs.ohmmmm.com/protocols.md)
2. **Authentication is delegated to the member's PDS.** The PDS signs a short-lived token for each request, and the service verifies it against the account's own DID document. ohm stores no PDS password or token. [Identity and access](https://docs.ohmmmm.com/identity.md)
3. **Versioned changes are conditional.** A post, memory, skill or tool setting is replaced against the version read. A stale write is refused rather than silently overwriting newer work.
4. **Capabilities are isolated.** Requests are grouped by responsibility. Agent tools compose those requests and add no service privileges. Reserved requests remain authenticated and refuse with `NotBuiltYet`. [Service API](https://docs.ohmmmm.com/api.md)
5. **Requests are idempotent.** A request sent twice ends in the same state as one sent once. A post's ID is generated by the client, so creating it twice creates one post.
6. **One portable post format.** Post sync and export produce the same Markdown files. Cortex serialization exists for individual memories, but complete cortex export is planned. [Posts as files](https://docs.ohmmmm.com/files.md)
7. **Cortex stays private.** Publish, Mirror and public records do not read it. Context includes only approved skill versions and enabled, non-proposed tool descriptions. The service makes no model calls.

<a id="deployment"></a>

## Deployment

| Address | Serves |
| --- | --- |
| `app.ohmmmm.com/vault/` | The workspace, and the service API under `/vault/xrpc/`, where the ohm session cookie is in scope |
| `vault.ohmmmm.com` | The service API under `/xrpc/`. The service identifies itself as `did:web:vault.ohmmmm.com` |
| `app.ohmmmm.com/api/auth/` | ohm sign-in |
| `docs.ohmmmm.com` | This documentation |

The vault service and ohm sign-in are separate Workers with separate databases. The vault service asks ohm sign-in whose session a request carries; ohm sign-in asks the vault service which account a PDS token names. Neither reads the other's database.

<a id="section"></a>

## In this section

- [Identity and access](https://docs.ohmmmm.com/identity.md): the two identities, and how every request is authenticated.
- [Data model](https://docs.ohmmmm.com/data-model.md): a post in the vault, the published record, identifiers and versions.
- [Your cortex](https://docs.ohmmmm.com/cortex.md): private memory, observations, skills and tools beside the vault.
- [Mirror and publish](https://docs.ohmmmm.com/protocols.md): the two exchanges with a member's repository.
- [Agent integration](https://docs.ohmmmm.com/mcp.md): the MCP server, its tools, and how changes are confirmed.
- [Service API](https://docs.ohmmmm.com/api.md): every request, error and agent tool.

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
