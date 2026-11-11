import { readFile } from 'node:fs/promises';
import { refreshNotes } from '../feed/worker.mjs';

try {
  const configPath = process.argv[2] ?? 'feed/wrangler.site.jsonc';
  const { vars } = JSON.parse(await readFile(configPath, 'utf8'));
  const snapshot = await refreshNotes({ ...vars, NOTES: { put: async () => {}, delete: async () => {} } });
  console.log(JSON.stringify(snapshot));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
