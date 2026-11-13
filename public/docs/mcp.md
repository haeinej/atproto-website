# Agent integration

An agent reaches a vault through an MCP server that runs on the member's own machine. The server authenticates as the member, composes its tools from service requests, and requires confirmation for every change that others could see.

## Overview

ohm does not run an agent. It ships a Model Context Protocol (MCP) server, `ohm-vault`, that a member runs on their own machine and connects to the agent they already use. The server exposes ten tools, and each tool is a composition of vault service requests made as the member.

Diagram: the path of one tool call.
1. Agent → MCP server: tools/call
2. MCP server → Member's PDS: getServiceAuth
3. Member's PDS → MCP server: Signed token (response)
4. MCP server → Vault service: Request with the token
5. Vault service → MCP server: Response
6. MCP server → Agent: Tool result (response)

1. **Call.** The agent calls a tool over the MCP connection.
2. **Vouch.** The server asks the member's PDS for a service token for the one request it is about to make.
3. **Token.** The PDS returns a token signed with the account's key.
4. **Request.** The server sends the request to the vault service with that token.
5. **Response.** The service verifies the token and answers. [Identity and access](https://docs.ohmmmm.com/identity.md#authentication)
6. **Result.** The server returns the tool's result to the agent.

The tools work in the same working copy the workspace shows. A post an agent saves is the same row, with the same version, that the editor opens.

## What an agent should know

An agent that reads only this section can work in a vault correctly.

- **The vault is one person's work,** as posts filed under labels and sublabels. Start with `vault_tree` to see its shape, then `vault_read` or `vault_search`.
- **Every post is private, for friends, or public.** Private posts are context for helping the member. Nothing from one belongs in anything another person can see.
- **A new post is saved private.** `vault_save` never shares anything. To change who a post is for, use `vault_set_visibility`, which always asks first.
- **Saving is not publishing.** A post marked public reaches the member's website and the network only through `vault_publish`. `vault_status` says what is waiting.
- **Changes are made from a version.** `vault_read` returns it, and `vault_save` passes it back. If the post changed in between, read it again.
- **A two-call tool is asking for the member's decision.** Show the member what the first call returned, and make the second call only if they agree.
- **Publishing cannot be recalled.** Other services copy a public post as soon as it is written.

## Protocol

| | |
| --- | --- |
| Transport | Standard input and output. One JSON-RPC 2.0 message per line in each direction |
| Protocol versions | `2025-06-18`, `2025-03-26`, `2024-11-05` |
| Methods | `initialize`, `ping`, `tools/list`, `tools/call` |
| Capabilities | Tools only. The server offers no resources and no prompts |
| Server name | `ohm-vault` |
| Ordering | Calls are handled one at a time, in the order received, so two changes to the same post cannot cross |
| Results | A tool's result is JSON, returned as text content. A refusal is a result marked `isError` with a message the agent can read and act on |
| Annotations | Tools that only read carry `readOnlyHint`. `vault_delete` carries `destructiveHint` |
| Instructions | On `initialize`, the server states the rules of the vault to the agent: what private means, and that any change other people can see is shown to the member first |

Listing the tools needs no configuration and no sign-in. The server signs in at the PDS the first time a tool is called.

## Configuration

| Setting | Source | Purpose |
| --- | --- | --- |
| The member's account | The site configuration file, found in the agent's working folder, or named with `--config` or `OHM_CONTENT_LAYER_CONFIG` | Which AT Protocol account the server acts as |
| `ATPROTO_APP_PASSWORD` | Environment | An app password for the member's PDS. It can be revoked at the PDS at any time |
| `OHM_VAULT_URL`, `OHM_VAULT_DID` | Configuration, or the flags `--vault` and `--vault-did` | The vault service to use. Defaults to `https://vault.ohmmmm.com` and `did:web:vault.ohmmmm.com` |

The server is started by the ohm plugin for agents that load it, or directly:

```
npx github:haeinej/ohm-content-layer mcp
```

## Authentication

The server holds one credential: the app password, in its own environment on the member's machine.

- **It signs in at the member's PDS** with `com.atproto.server.createSession` and renews the session when it expires.
- **Each request to the vault service carries its own token,** obtained from the PDS with `getServiceAuth` for that request's name and valid for 60 seconds.
- **The vault service never receives the app password** or the PDS session. It sees only tokens it can verify against the account's DID document.
- **Publishing uses the same PDS session.** The server uploads files and applies the plan's writes itself, as the workspace does in a browser. [Mirror and publish](https://docs.ohmmmm.com/protocols.md#publish)

## Tools

| Tool | Effect | Confirmation | Requests used |
| --- | --- | --- | --- |
| `vault_tree` | Read | None | `getTree` |
| `vault_list` | Read | None | `getTree` |
| `vault_read` | Read | None | `getTree`, `getPost` |
| `vault_search` | Read | None | `searchPosts` |
| `vault_save` | Change | When the post is not private | `getTree`, `getPost`, `putPost` |
| `vault_set_visibility` | Change | Always | `getTree`, `getPost`, `putPost` |
| `vault_status` | Read | None | `getPublishPlan` |
| `vault_publish` | Change | Always | `getPublishPlan`, `getAttachment` |
| `vault_mirror` | Change | Always | `importPublished` |
| `vault_delete` | Change | Always | `getTree`, `getPost`, `deletePost` |

A tool has no capability of its own. Anything a tool can do, the service API can do, and the access rules are the service's. [Service API](https://docs.ohmmmm.com/api.md)

## Confirmation

A tool that changes something other people can see, or removes something, takes two calls.

1. **The first call changes nothing.** It returns `done: false`, a description of exactly what would happen in `willHappen`, and a `confirm` value.
2. **The agent shows that description to the member.**
3. **The second call repeats the request with the `confirm` value,** and only then does the change happen.

The `confirm` value is a digest of the request and of the state it was computed from: the post's current version, or the publish plan. If either has changed between the two calls, the value no longer matches and the call is refused. The server keeps no state between calls, so a confirmation cannot be replayed against a different change.

## Safety model

The same agent reads the member's private posts and content written by other people, which may be written to manipulate it. The controls are properties of the tools, not of the agent's judgement.

| Risk | Control |
| --- | --- |
| A private post is exposed by a save | A new post is always private. Widening who can see a post is a separate tool that always requires confirmation |
| Something is published without the member knowing | Saving never publishes. `vault_publish` always requires confirmation of the exact plan |
| A post is overwritten | Every save names the version that was read. A stale save is refused |
| A post is lost | `vault_delete` always requires confirmation |
| Content leaves the vault another way | No tool sends content to any destination other than the member's own vault and repository |

One exposure is outside these controls: whatever the agent reads is also processed by the provider of the model it runs on.

## Requests without a tool

Some service requests are deliberately not available to an agent.

| Requests | Reason |
| --- | --- |
| `listPosts` | It serves incremental sync. The tools read the repository tree |
| `exportFiles` | Export is for the command line and the workspace |
| `account.get`, `account.connect`, `account.disconnect` | They require an ohm session, which an agent does not have |
| `identity.findAccount`, `identity.whoAmI` | They are steps of signing in |

---
ohm is still in production, and these pages are its architecture document: they describe how it is meant to work, not a finished product.
All pages: https://docs.ohmmmm.com/llms.txt
