// The people who joined the plan from ohmmmm.com, oldest first, as lines of "email,when".
//
//   npm run home:joiners              prints the list
//   npm run home:joiners -- --since 2026-11-13    only those who joined on or after that day
//   npm run home:joiners -- --profile ohm         when the Wrangler login that can read it is a named one
//
// It reads the site's own database with your Wrangler login. Nothing is sent to anyone: writing
// to these people is done by hand.
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const { values } = parseArgs({ options: { since: { type: 'string' }, profile: { type: 'string' } } });
if (values.since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(values.since)) {
  console.error('Give --since as a day, such as 2026-11-13');
  process.exit(1);
}
const where = values.since ? `WHERE joined_at >= '${values.since}'` : '';
try {
  const { stdout } = await promisify(execFile)('npx', [
    'wrangler', 'd1', 'execute', 'ohm-web', '--remote', '--json', '--config', fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
    ...(values.profile ? ['--profile', values.profile] : []),
    '--command', `SELECT email, joined_at FROM joiners ${where} ORDER BY joined_at`,
  ], { maxBuffer: 64 * 1024 * 1024 });
  const rows = JSON.parse(stdout)[0].results;
  console.log('email,joined_at');
  for (const row of rows) console.log(`${row.email},${row.joined_at}`);
  console.error(`${rows.length} ${rows.length === 1 ? 'person' : 'people'}`);
} catch (problem) {
  // Wrangler reports a refusal as JSON on its output, not as an error message.
  let reason = problem.stderr?.trim() || problem.message;
  try {
    const { error } = JSON.parse(problem.stdout);
    reason = [error.text, ...(error.notes ?? []).map(note => note.text)].join(' ');
  } catch {}
  console.error(`The list could not be read: ${reason}`);
  if (!values.profile) console.error('If another Wrangler login owns the site, name it: npm run home:joiners -- --profile ohm');
  process.exit(1);
}
