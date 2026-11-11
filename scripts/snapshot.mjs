import { refreshNotes } from '../feed/worker.mjs';
import { siteVars } from './config.mjs';

try {
  const vars = await siteVars(process.argv[2]);
  const snapshot = await refreshNotes({ ...vars, NOTES: { put: async () => {}, delete: async () => {} } });
  console.log(JSON.stringify(snapshot));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
