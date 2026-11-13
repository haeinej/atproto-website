# public

Every site ohm serves to the public, one folder to a site. This repository is where each is edited and deployed from.

| Folder | Address | Worker | Run | Deploy |
| --- | --- | --- | --- | --- |
| `home/` | https://ohmmmm.com, and `www` | `ohm-web` | `npm run home:dev` | `npm run home:check`, then `npm run home:deploy` |
| `docs/` | https://docs.ohmmmm.com | `ohm-docs` | the `ohmmmm-docs` entry in `.claude/launch.json` | `npm run docs:build`, then `npm run docs:deploy` |
| `home-draft/` | Nowhere. A draft of the home page | None | the `ohmmmm-draft` entry in `.claude/launch.json` | Not deployed |

- `home/` is a Worker (`src/worker.js`) in front of static pages (`public/`), with a database of the people who joined the plan (`schema.sql`, `npm run home:joiners`). Its map is `home/README.md`.
- `docs/` is authored in `docs/build.py`, which generates its HTML, Markdown and LLM copies and also writes the sidebar into `home-draft/`.
- After a deploy of `home/`, `npm run home:seo` crawls the live site and checks it.
- The vault at `vault.ohmmmm.com` is not here. It is `service/`.

`home/` came from the app repository (haeinej/ohm, `website/`) on 13 November 2026.
