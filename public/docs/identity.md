# Identity and access

A member has two identities: an ohm account, which says who is signed in, and an AT Protocol account, which owns their posts. Every request to the vault service is authenticated by one of them, and resolved to exactly one AT Protocol account before any data is read.

## Two identities

| | ohm account | AT Protocol account |
| --- | --- | --- |
| Identifies | The person signed in | The owner of the posts |
| Identifier | An internal user ID | A DID, such as `did:plc:…` or `did:web:example.com` |
| Issued by | ohm sign-in, through Google, Microsoft or Bluesky | The member's PDS |
| Credential | A session cookie on `app.ohmmmm.com` | A service token signed by the PDS |
| Holds | No posts | The repository of public records |

One ohm account is connected to one AT Protocol account, and that account to one ohm account. The vault service enforces the constraint in both directions.

## Resolving an account

A member names their account by its handle, which is a domain name. The service resolves it as the AT Protocol specifies, and believes nothing it cannot confirm from the account's own documents.

1. **Handle to DID.** A `TXT` record at `_atproto.<handle>`, or failing that the file `https://<handle>/.well-known/atproto-did`.
2. **DID to document.** `did:plc` from the public directory, `did:web` from the domain's `/.well-known/did.json`.
3. **Confirmation.** The document must name the handle back in `alsoKnownAs`. A handle that points at a DID which does not claim it is refused.
4. **Endpoints.** The PDS address is the document's `#atproto_pds` service, and the signing key is its `#atproto` verification method.

Redirects are not followed at any step: an answer has to come from the address that was asked.

## Authenticating a request

A request carries one of two credentials.

**A service token from the member's PDS.** This is what the command line and an agent's tools send. The client asks the PDS for a token for one named request, and the service verifies it against the account's DID document.

Diagram: how a request with a service token is authenticated.
1. Client → Member's PDS: getServiceAuth
2. Member's PDS → Client: Signed token (response)
3. Client → Vault service: Request with the token
4. Vault service → DID document: Resolve the DID
5. DID document → Vault service: Signing key (response)
6. Vault service → Client: Response

| Claim | Check |
| --- | --- |
| `iss` | A well-formed DID, and on the allow list while access is restricted. Checked before anything is fetched, so a token cannot make the service read an address of the sender's choosing |
| `aud` | The service's own DID, `did:web:vault.ohmmmm.com` |
| `lxm` | The exact request being made. A token for one request is not accepted for another |
| `exp`, `iat` | Not expired, valid for no more than one hour, and not dated in the future. |
| Signature | ES256K or ES256, in low-S form, against the signing key in the DID document. Documents are cached for five minutes |

**An ohm session.** This is what the workspace sends. A request with no `Authorization` header is checked against ohm sign-in, which answers whose session the cookie is. The service then looks up the AT Protocol account that member connected. A request that changes anything must also originate from ohm's own pages.

## Access levels

Each request declares one access level, and the router settles it before the request's own code runs.

| Level | Accepted credential | Used for |
| --- | --- | --- |
| Public | None | Finding an account from its handle |
| Any authenticated account | A service token from any PDS | Establishing which account a token names, during sign-in |
| Member | A service token from the member's own PDS, or an ohm session connected to that account | Every request that reads or changes a vault |
| Member, with an ohm session | An ohm session only | Connecting and disconnecting an AT Protocol account |

A member's vault and cortex are served to that member and to nobody else. The authenticated DID determines the scope; callers do not choose another member's store.

Approving or removing skills and changing tool settings require the linked member's ohm session. A PDS token can propose a skill or tool, but cannot grant itself these permissions. The editor binds requests to the account displayed and discards private state when that account changes.

## Signing in at the PDS

The workspace needs the member to sign in at their PDS twice in its life: to connect the account, and each time they publish. There are two ways, and both work with any PDS.

- **An app password.** The member types it on ohm's page. The page sends it directly to the member's PDS (`com.atproto.server.createSession`) and to no other host. The resulting PDS session is held in the page's memory for that task and ended with `deleteSession` when the task completes. Neither the password nor the session is stored, and neither reaches ohm.
- **OAuth.** The member approves at the PDS's own screen, where a passkey works. The flow is the AT Protocol profile of OAuth: pushed authorization requests, PKCE, and DPoP-bound tokens.

## Connecting an account

1. The page resolves the handle with `com.ohmmmm.identity.findAccount`, which also returns the service's DID.
2. The member signs in at their PDS.
3. The page asks the PDS for a service token issued for `com.ohmmmm.account.connect`.
4. The service verifies the token and records the link between the ohm account and the DID. It refuses if either side is already connected elsewhere.
5. ohm sign-in is told of the link, so that signing in with that AT Protocol account later resolves to the same ohm account.

## Signing in with Bluesky

Bluesky is an identity provider for ohm accounts as well as a host for AT Protocol accounts.

1. The member approves at Bluesky through OAuth.
2. The page obtains a service token issued for `com.ohmmmm.identity.whoAmI` and hands it to ohm sign-in.
3. ohm sign-in asks the vault service which account the token names. The service verifies the token as above.
4. ohm sign-in opens a session for the ohm account connected to that DID, creating the account on first sign-in. The token is accepted once.

Because the identity provider is the member's own AT Protocol account, the connection step is already complete.

## Access during testing

While ohm is tested, the service accepts requests only from DIDs on an allow list. An account that is not on it receives `NotAMember`.

---
ohm is in development. These docs cover the implementation and the work still planned. Built does not mean verified on the live service; see Status and limits.
All pages: https://docs.ohmmmm.com/llms.txt
