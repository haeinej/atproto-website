// Write the reference for what the vault can do, from the same tables the service and the tools
// run on (service/src/capabilities/ and mcp/tools.mjs), so the page cannot say anything they do not.
//
//   node scripts/capabilities.mjs            prints the page
//   node scripts/capabilities.mjs --write    writes service/CAPABILITIES.md
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../mcp/tools.mjs';
import { CAPABILITIES, REQUESTS } from '../service/src/capabilities/index.mjs';

export const PAGE = fileURLToPath(new URL('../service/CAPABILITIES.md', import.meta.url));

// Who may ask a request: what to call them, and how they are known.
const ASKS = {
  nobody: ['Anyone', 'Nothing is checked. Everything such a request answers with is already public'],
  token: ['Whoever holds a token from a PDS', 'A token the PDS issued for this one request and no other, signed with the key the account\'s own DID document names'],
  member: ['The member', 'Such a token from their own PDS, as the command line and an agent\'s tools send; or their ohm session, as the editor sends, which is worth exactly the one account it was connected to'],
  ohm: ['The member, signed in to ohm', 'Their ohm session only. A request that changes something must also come from ohm\'s own pages'],
};
const FILES = Object.fromEntries(Object.entries({
  Posts: 'posts', Structure: 'structure', Search: 'search', Mirror: 'mirror', Publish: 'publish', Export: 'export', Account: 'account', Identity: 'identity',
  Context: 'context', Memory: 'memory', Notes: 'notes', Skills: 'skills', Tools: 'tools',
}).map(([name, file]) => [name, `src/capabilities/${file}.mjs`]));
for (const name of ['Turns', 'Cortex Export']) FILES[name] = '../cortex/pending.mjs';

// Every way the service says no. The same words go to a person in the editor and to an agent.
export const REFUSALS = {
  SignInRequired: [401, 'The request rides on an ohm session, and there is none'],
  AuthRequired: [401, 'The token is missing, cannot be read, was issued for another request or service, has run out, or its signature does not match'],
  NotAMember: [403, 'The account has not been let in yet'],
  WrongOrigin: [403, 'A request that changes something came with a session but not from ohm\'s own pages'],
  NotConnected: [409, 'The ohm account has no AT Protocol account connected yet'],
  AlreadyConnected: [409, 'The ohm account already works in another AT Protocol account'],
  ConnectedElsewhere: [409, 'The AT Protocol account is already connected to another ohm account'],
  SignInUnavailable: [503, 'ohm\'s sign-in could not be reached to check a session'],
  MethodNotFound: [404, 'There is no such request'],
  WrongMethod: [405, 'The request is the other of GET and POST'],
  InvalidRequest: [400, 'The request is not JSON, or something it says is not what that request takes'],
  InvalidPost: [400, 'The post is not one the vault can hold. The message lists every reason'],
  InvalidMemory: [400, 'The memory is not one the cortex can hold, or its source notes do not belong to this member. The message says why'],
  InvalidSkill: [400, 'The skill or its supporting text files do not fit the cortex rules. The message says why'],
  SkillNotApproved: [403, 'An agent asked for skill instructions whose current version the member has not approved'],
  InvalidTool: [400, 'The tool setting or proposal is not valid. Credentials and executable configuration stay outside the cortex'],
  InvalidCursor: [400, '`since` is not a value an earlier list returned'],
  NotFound: [404, 'There is no such post, cortex item or saved version'],
  Changed: [409, 'The post or cortex item has changed since the version the request names. The answer carries the current version'],
  SlugTaken: [409, 'Another post in the vault already has that slug'],
  NameTaken: [409, 'A cortex item already has that name; read it and name its version to replace it. A tool proposal cannot replace an existing tool'],
  NotBuiltYet: [501, 'The cortex request is registered and authenticated, but its implementation has not been built yet'],
  TooLarge: [413, 'The post is more than 600 KB of text, or a file it places is empty or larger than 25 MB'],
  FileUnreachable: [502, 'A file a post places could not be fetched from where the post says it is'],
  AccountNotFound: [404, 'No AT Protocol account answers to that handle or DID'],
  NoRepository: [400, 'The account\'s DID document does not say where its repository is kept'],
  RepositoryUnreachable: [502, 'The account\'s PDS would not answer'],
  InternalError: [500, 'Something went wrong in the service itself'],
};

const short = name => name.split('.').at(-1);
const cell = text => String(text).replaceAll('|', '\\|');

export function capabilitiesPage() {
  const used = new Set(TOOLS.flatMap(tool => tool.requests));
  const without = Object.values(REQUESTS).filter(request => !(request.name.startsWith('com.ohmmmm.vault.') && used.has(short(request.name))));
  const lines = [
    '# What the vault can do',
    '',
    '<!-- Written by scripts/capabilities.mjs from service/src/capabilities/ and mcp/tools.mjs. Change those, then run `node scripts/capabilities.mjs --write`. -->',
    '',
    'The vault service does a small number of things, and each is kept apart from the others. A **capability** is one of those things: a few requests that belong together, in one file. A **request** is one question or one change. A **tool** is something an agent can decide to do, and every tool is made of requests and nothing else.',
    '',
    'This page is the whole list. It is written from the same tables the service and the tools run on, so it cannot say anything they do not do.',
    '',
    '## The capabilities',
    '',
    '| Capability | What it is for | Requests | Where |',
    '| --- | --- | --- | --- |',
    ...CAPABILITIES.map(capability => `| **${capability.name}** | ${cell(capability.about)} | ${Object.keys(capability.requests).map(name => `\`${short(name)}\``).join(', ')} | [${FILES[capability.name].split('/').at(-1)}](${FILES[capability.name]}) |`),
    '',
    'The service never writes to anyone\'s repository. Saving a post, whatever it says about who may see it, changes only the vault\'s own copy. Publishing is worked out here and carried out by the member, signed in at their own PDS ([public/vault/publish.js](public/vault/publish.js)).',
    '',
    '## Asking',
    '',
    'A request is sent to `/xrpc/` and its full name, such as `/xrpc/com.ohmmmm.vault.getTree`, at the service\'s own address or under `/vault` on the app\'s. One that only reads is a `GET` with what it takes in the address. One that changes something is a `POST` with what it takes as JSON. Every answer is JSON.',
    '',
    'Who may ask is one of four things, and each request says which:',
    '',
    '| Who | How they are known |',
    '| --- | --- |',
    ...Object.values(ASKS).map(([who, how]) => `| ${cell(who)} | ${cell(how)} |`),
    '',
    'A member\'s posts and cortex are served to that member and nobody else. Who is asking is settled before either store is looked at. Cortex data is private and is never part of Publish or the mirror.',
    '',
  ];
  for (const capability of CAPABILITIES) {
    lines.push(`## ${capability.name}`, '', capability.about, '');
    for (const [name, request] of Object.entries(capability.requests)) {
      lines.push(`### \`${name}\``, '', request.about, '',
        '| | |', '| --- | --- |',
        `| Reads or changes | ${request.changes ? 'Changes' : 'Reads only'} (\`${request.verb}\`) |`,
        `| Who may ask | ${cell(ASKS[request.asks][0])} |`,
        `| Takes | ${Object.keys(request.takes).length ? Object.entries(request.takes).map(([field, what]) => `\`${field}\`: ${cell(what)}`).join('<br>') : 'Nothing'} |`,
        `| Gives | ${cell(request.gives)} |`,
        '');
    }
  }
  lines.push(
    '## When the answer is no',
    '',
    'A refusal is JSON with an `error`, which is one of the names below, and a `message` in plain words. The message is written to be shown to a person as it is.',
    '',
    '| Error | Status | When |',
    '| --- | --- | --- |',
    ...Object.entries(REFUSALS).map(([name, [status, when]]) => `| \`${name}\` | ${status} | ${cell(when)} |`),
    '',
    '## The tools an agent has',
    '',
    'The tools are in [../mcp/tools.mjs](../mcp/tools.mjs), and reach the service as the person, with a token from the person\'s own PDS for each request ([../scripts/vault-client.mjs](../scripts/vault-client.mjs)). A tool adds no ability of its own: it is a way of asking for the requests beside it.',
    '',
    '| Tool | Reads or changes | Made of | What it does |',
    '| --- | --- | --- | --- |',
    ...TOOLS.map(tool => `| \`${tool.name}\` | ${tool.annotations?.readOnlyHint ? 'Reads only' : 'Changes'} | ${tool.requests.map(name => `\`${name}\``).join(', ')} | ${cell(tool.description)} |`),
    '',
    'Three rules hold for every tool that changes something:',
    '',
    '1. A new post is always private.',
    '2. Changing a post that is not private, changing who a post is for, publishing, bringing posts in from the PDS, and removing a post each take two calls. The first answers with what would happen and a `confirm` value; only a second call carrying that value does it.',
    '3. A post is changed from the version that was read. If it has changed since, the tool says so and nothing is saved.',
    '',
    '### Requests with no tool',
    '',
    'An agent cannot ask for these. They are for the editor, for the command line, or for signing in.',
    '',
    '| Request | Capability | Why it has no tool |',
    '| --- | --- | --- |',
    ...without.map(request => `| \`${short(request.name)}\` | ${request.capability} | ${NO_TOOL[request.name] ?? NO_TOOL[request.capability]} |`),
    '',
    '## Not here yet',
    '',
    'Attachments held by the vault, serving friends-only posts to friends, earlier versions of a post and bringing a removed one back, and a key a person can give an agent and take away again. Until there is such a key, an agent signs in with an app password from the person\'s PDS.',
    '',
  );
  return lines.join('\n');
}

const NO_TOOL = {
  'com.ohmmmm.vault.listPosts': 'It is for keeping a copy in step: every post\'s version, and what changed since. The tools read the structure instead',
  Export: 'The command line and the editor write the vault out. An agent reads posts one at a time',
  Account: 'It rides on an ohm session, which an agent does not have',
  Identity: 'It is part of signing in',
  Context: 'Cortex tools are not built yet; prompt recall is also reserved for the adapter',
  Memory: 'The Memory API is built; cortex tools will expose it in a later step',
  Notes: 'Cortex tools will record and settle notes in a later step; the editor can read their receipts',
  Turns: 'The authenticated request is reserved for the adapter and is not built yet',
  Skills: 'Cortex tools will read and propose skills in a later step. Approval and removal stay with the member in the editor',
  Tools: 'Tool settings belong to the member in the editor. A later cortex tool may propose something to be built, but cannot switch it on',
  'Cortex Export': 'The authenticated request is reserved for taking the cortex out and is not built yet',
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const page = capabilitiesPage();
  if (process.argv.includes('--write')) {
    await writeFile(PAGE, page);
    console.error(`Wrote ${PAGE}`);
  } else {
    process.stdout.write(page);
  }
}
