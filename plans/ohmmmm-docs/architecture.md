# System overview

ohm is built from three kinds of system with a strict division of ownership: the member's AT Protocol account, which holds their identity and everything public; ohm's services, which hold a working copy; and clients on the member's device, the only place a write to the member's account originates.

## How it works

Everything in ohm is a post, and every post is in a member's vault: one working copy of all their work, held by ohm, in a structure of labels, sublabels and posts. A post is private, for friends, or public. The whole system follows from keeping two things apart: working in the vault, and publishing from it.

1. **Sign in.** A person signs in to ohm, and once connects the AT Protocol account that owns their posts. That account lives on a Personal Data Server (PDS) they host themselves or at Bluesky. It is theirs whether or not they use ohm.
2. **Mirror.** What the account has already published is read from its repository into the vault. From then on the vault holds everything: public posts, and private and friends-only ones that exist nowhere else on the network.
3. **Work.** Posts are read, written and filed in the vault, through any of three clients: the workspace in a browser, an agent's tools, or a synced folder of Markdown files. A new post is private. Saving changes the vault and nothing else.
4. **Mark.** Setting a post to public or friends marks it. Nothing is shared by marking.
5. **Publish.** The vault service works out what would have to change in the member's repository for what is published to match the vault. The member reviews that plan and approves it, and their own device, signed in at their own PDS, makes the changes. Public posts become `com.ohmmmm.post` records.
6. **Read.** The member's website and any other AT Protocol application read those records from the repository. ohm is not in that path.
7. **Keep.** The vault can be synced to a folder the member holds, or exported, as Markdown files. With a folder connected, nothing depends on ohm keeping its copy.

Three rules hold everywhere and are worth knowing before anything else.

- **Saving never publishes.** Only Publish changes what other people see, and it always shows the change first.
- **ohm never writes to a member's repository.** It has no credential that could. Every write comes from the member's own device.
- **Private stays in the vault.** A private post is never written to the repository, where everything is public.

## Components

Diagram: the parts of ohm and what passes between them.
- On the member's device: the workspace (browser), the agent tools (MCP server) and folder sync (command line).
- Run by ohm: the vault service (the working copy of every post) and ohm sign-in (accounts and sessions).
- The member's own account, on the AT Protocol: a Personal Data Server holding their identity and public repository.
- Device → vault service: API requests.
- Device → Personal Data Server: sign-in, service tokens, and the writes of a publish.
- Vault service → Personal Data Server: reads only.
- Vault service → ohm sign-in: session check.
- Personal Data Server → the member's website and other applications: public records.

| Component | Runs on | Responsibility | Status |
| --- | --- | --- | --- |
| Workspace | The member's browser, served from `app.ohmmmm.com/vault` | Editor, repository tree, publish review | Implemented |
| Agent tools | An MCP server, `ohm-vault`, on the member's machine | Ten tools composed from service requests. [Agent integration](https://docs.ohmmmm.com/mcp.md) | Implemented |
| Folder sync | A command-line client on the member's machine | Two-way sync between the vault and a folder of Markdown files | Implemented |
| Vault service | Cloudflare Workers and D1 | Stores the working copy of every post. Computes mirror and publish plans. Never writes to a member's repository | Implemented |
| ohm sign-in | Cloudflare Workers and D1 | ohm accounts and sessions, with Google, Microsoft and Bluesky as identity providers | Implemented |
| Personal Data Server (PDS) | The member's host: self-hosted, or Bluesky | The account's DID, signing key, and repository of public records and files | External |
| Website and other applications | Their own hosts | Read public records from the repository | External |
| Network service | | Friends-only delivery, the follow graph, and matching | Planned |

## Ownership

Each kind of data has one system of record. ohm is the system of record for nothing a member cannot take away.

| Data | System of record | What ohm holds |
| --- | --- | --- |
| Identity: DID, handle, signing key | The member's PDS | A reference to the DID |
| Public posts | The member's repository, as `com.ohmmmm.post` records | A working copy |
| Private and friends-only posts | The member's folder, once connected | A working copy. Until a folder is connected, the only copy |
| ohm account and session | ohm sign-in | The account itself |
| The link between an ohm account and a DID | Vault service | One row, unique in both directions |

## Design principles

1. **The service never writes to a member's repository.** It holds no credential that could. Publishing is planned by the service and carried out from the member's device. [Mirror and publish](https://docs.ohmmmm.com/protocols.md)
2. **Authentication is delegated to the member's PDS.** The PDS signs a short-lived token for each request, and the service verifies it against the account's own DID document. ohm stores no PDS password or token. [Identity and access](https://docs.ohmmmm.com/identity.md)
3. **Every change is conditional.** A write names the version it replaces and is refused if the post has moved on, so the editor, an agent and a sync can work on the same vault without overwriting each other.
4. **Capabilities are isolated.** The service offers eight capabilities, each a separate module with its own requests. An agent's tools are compositions of those requests and add none of their own. [Service API](https://docs.ohmmmm.com/api.md)
5. **Requests are idempotent.** A request sent twice ends in the same state as one sent once. A post's ID is generated by the client, so creating it twice creates one post.
6. **One portable format.** Sync and export produce the same folder of Markdown files, and reading them back yields the same posts. [Posts as files](https://docs.ohmmmm.com/files.md)

## Deployment

| Address | Serves |
| --- | --- |
| `app.ohmmmm.com/vault/` | The workspace, and the service API under `/vault/xrpc/`, where the ohm session cookie is in scope |
| `vault.ohmmmm.com` | The service API under `/xrpc/`. The service identifies itself as `did:web:vault.ohmmmm.com` |
| `app.ohmmmm.com/api/auth/` | ohm sign-in |
| `docs.ohmmmm.com` | This documentation |

The vault service and ohm sign-in are separate Workers with separate databases. The vault service asks ohm sign-in whose session a request carries; ohm sign-in asks the vault service which account a PDS token names. Neither reads the other's database.

## In this section

- [Identity and access](https://docs.ohmmmm.com/identity.md): the two identities, and how every request is authenticated.
- [Data model](https://docs.ohmmmm.com/data-model.md): a post in the vault, the published record, identifiers and versions.
- [Mirror and publish](https://docs.ohmmmm.com/protocols.md): the two exchanges with a member's repository.
- [Agent integration](https://docs.ohmmmm.com/mcp.md): the MCP server, its tools, and how changes are confirmed.
- [Service API](https://docs.ohmmmm.com/api.md): every request, error and agent tool.

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
