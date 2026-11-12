// A Cloudflare D1 database for tests, over the SQLite built into Node. D1 is SQLite, so the
// service's own statements run here as they are.
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

export async function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(await readFile(new URL('../service/schema.sql', import.meta.url), 'utf8'));
  const prepared = (sql, values = []) => {
    // D1 numbers its parameters ?1, ?2. Node's SQLite does not take numbered ones in order, so each
    // is given a name and the values are passed by that name. The statement is otherwise unchanged.
    const named = {};
    const text = sql.replace(/\?(\d+)/g, (_, number) => {
      named[`$p${number}`] = values[number - 1] ?? null;
      return `$p${number}`;
    });
    const run = method => sqlite.prepare(text)[method](named);
    return {
      bind: (...given) => prepared(sql, given),
      first: async () => run('get') ?? null,
      all: async () => ({ results: run('all') }),
      run: async () => ({ meta: { changes: Number(run('run').changes) } }),
    };
  };
  return { prepare: sql => prepared(sql), sqlite };
}
