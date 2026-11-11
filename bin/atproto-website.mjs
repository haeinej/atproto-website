#!/usr/bin/env node
// One entry point for every command, so they can be run from any folder:
//   npx github:haeinej/atproto-website <command> [options]
const commands = {
  identity: ['identity.mjs', 'Show an identity and the repository it owns. Takes a handle or DID.'],
  configure: ['configure.mjs', 'Print a site configuration for --site and --handle or --did.'],
  lexicon: ['lexicon.mjs', 'Print a schema under your domain: --kind post, postSite, profile, profileLink, or profileSite.'],
  posts: ['posts.mjs', 'List every public post with its form, label, and opening lines.'],
  profile: ['profile.mjs', 'Preview or save your profile: --name, --description, --pronouns, --avatar, --link.'],
  publish: ['publish.mjs', 'Preview or publish a post: --file, --slug, --title, --label, --media. Add --publish to save.'],
  snapshot: ['snapshot.mjs', 'Print the feed snapshot the site Worker would store.'],
};
const [name] = process.argv.splice(2, 1);
if (!Object.hasOwn(commands, name ?? '')) {
  console.log('Usage: atproto-website <command> [options]\n');
  for (const [command, [, summary]] of Object.entries(commands)) console.log(`  ${command.padEnd(10)} ${summary}`);
  console.log('\nCommands preview by default and change nothing until you pass --publish.');
  process.exitCode = name && !['help', '--help', '-h'].includes(name) ? 1 : 0;
} else {
  await import(new URL(`../scripts/${commands[name][0]}`, import.meta.url));
}
