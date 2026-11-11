# Identity

Everything in this project hangs off one thing: your DID. It is your permanent identifier on AT Protocol, and it is the root of the rest.

```text
handle  ──points to──▶  DID  ──its document names──▶  PDS  ──hosts──▶  repository  ──holds──▶  records
example.com            did:web:pds.example.com        https://pds.example.com   at://did:web:pds.example.com   posts, profile
```

This is plain AT Protocol identity, the same as Bluesky uses, and nothing in it is specific to this project. Any AT Protocol software can resolve your identity and read your repository.

## The parts

| Part | What it is | Can it change |
| --- | --- | --- |
| DID | Your identifier. Cirrus gives you a `did:web`; Bluesky accounts have a `did:plc`. Both work here. | No. It is the root. |
| DID document | A small public file the DID points to. It names your handle, your signing key, and your PDS. | Yes, by you. |
| Handle | The name people see, which is a domain you control, such as `example.com`. | Yes. Your DID stays the same. |
| PDS | The server that hosts your repository. [Cirrus](https://github.com/ascorbic/cirrus) runs yours on Cloudflare. | Yes. You can move. |
| Repository | The container for everything you publish, addressed as `at://<your DID>`. | Its contents, yes. |

A handle is trusted only when it works in both directions: the handle points to your DID, and your DID's document claims the handle back. The tools check this and show a handle only when it holds.

## The repository is the container

Your posts are not stored by this project. They are records in your repository, grouped by type, and each has an address built from your DID.

| Address | What it is |
| --- | --- |
| `at://did:web:pds.example.com` | Your repository |
| `at://did:web:pds.example.com/com.example.post` | Every post in it |
| `at://did:web:pds.example.com/com.example.post/hello` | One post |
| `at://did:web:pds.example.com/com.example.profile/self` | Your profile |

The website, its feeds, and its pages are views of that repository. If the site disappeared, the repository would still hold everything, and you could point other software at it. The one exception is a private post, which is kept off the repository on purpose because a repository is public.

## What is fixed and what is optional

The identity is the fixed part, and it is the only part the shared pages show.

| | Fixed | Optional and unlisted |
| --- | --- | --- |
| What | Your DID, your verified handle, your repository's address | Your profile's sections: description, links, website, banner |
| Defined by | AT Protocol | Your profile record, which has the same fields as a Bluesky profile |
| On the shared posts page | Shown, with your name, picture, and pronouns | Not shown |
| For your own pages | `/notes/identity.json` | `/notes/profile.json` |

So a description and a list of links are yours to add or leave out, and your own website decides whether and how to present them. Posts work the same way: a fixed schema, and an optional layer of your own. [The fixed schema and your own fields](schema-layers.md)

## See your identity

```sh
npm run --silent identity
```

This resolves the account in your site configuration and lists the record types in its repository. Pass a handle or DID to look at any account: `npm run --silent identity -- example.com`.

## Set up from your identity

Give the configuration command your handle or your DID, and it reads the PDS from your DID's document.

```sh
npm run --silent configure -- --site https://example.com --handle example.com --mode attach > feed/wrangler.site.jsonc
```

The site then checks itself on every refresh. If your DID's document names a different PDS from the one the site is configured to read, the refresh stops, so the site can never show a repository your identity does not own.

## Make your domain your handle

Your handle is verified by one of two things on your domain.

- **A DNS record.** A TXT record at `_atproto.example.com` with the value `did=did:web:pds.example.com`.
- **A file on your site.** `https://example.com/.well-known/atproto-did` containing your DID. The site Worker answers this address for you. A standalone site serves it already; an attached site needs a route for `/.well-known/atproto-did`.

Cirrus sets the handle in your DID document when you create the account. [AT Protocol handles](https://atproto.com/specs/handle) · [AT Protocol DIDs](https://atproto.com/specs/did)
