import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

// Joining the plan from ohmmmm.com: the homepage's form, the Worker that keeps an address, and
// what it refuses. The database is SQLite in memory, which is what D1 is.

const site = 'https://ohmmmm.com';
async function running({ limit = () => true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = { prepare: sql => ({ bind: (...values) => ({ run: async () => db.prepare(sql.replace(/\?(\d+)/g, '?')).run(...values) }) }) };
  const env = {
    DB, JOIN_LIMITER: { limit: async () => ({ success: limit() }) },
    ASSETS: { fetch: async request => new Response(`the page at ${new URL(request.url).pathname}`, { headers: { 'Content-Type': 'text/html' } }) },
  };
  // `json` is how the page's own script sends the form: it asks for JSON and stays where it is.
  const post = (fields, { origin = site, path = '/join', json = false } = {}) => worker.fetch(new Request(site + path, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(origin ? { Origin: origin } : {}), ...(json ? { Accept: 'application/json' } : {}) }, body: new URLSearchParams(fields),
  }), env);
  const list = () => db.prepare('SELECT email, joined_at FROM joiners ORDER BY joined_at').all();
  return { env, post, list };
}
const went = response => [response.status, response.headers.get('Location')];

test('an email left on the homepage is kept, once, with when it came and nothing else', async () => {
  const { post, list } = await running();
  assert.deepEqual(went(await post({ email: '  Someone@Example.com ', website: '' })), [303, `${site}/joined`]);
  const [row] = list();
  assert.deepEqual([Object.keys(row), row.email, Number.isFinite(Date.parse(row.joined_at))], [['email', 'joined_at'], 'someone@example.com', true]);
  // The same address again is thanked again, and stays as it was.
  assert.deepEqual(went(await post({ email: 'someone@example.com' })), [303, `${site}/joined`]);
  assert.deepEqual(list().map(each => [each.email, each.joined_at]), [['someone@example.com', row.joined_at]]);
  // Sent by the page's script, the same thing happens and the answer says so without going anywhere.
  const quiet = await post({ email: 'another@example.org' }, { json: true });
  assert.deepEqual([quiet.status, quiet.headers.get('Location'), await quiet.json()], [200, null, { ok: true }]);
  assert.equal(list().length, 2);
});

test('what is not an email address, not a person, or not from this site is not kept', async () => {
  const { post, list } = await running();
  for (const email of ['', 'not an address', 'a@b', 'two@@example.com', 'someone@example.com, other@example.com', `${'x'.repeat(250)}@example.com`]) {
    assert.deepEqual(went(await post({ email })), [303, `${site}/join-problem`], email);
  }
  // Something that fills the field no person sees is thanked, and not kept.
  assert.deepEqual(went(await post({ email: 'bot@example.com', website: 'https://spam.example' })), [303, `${site}/joined`]);
  const refused = await post({ email: 'not an address' }, { json: true });
  assert.deepEqual([refused.status, await refused.json()], [400, { ok: false }]);
  assert.deepEqual(await (await post({ email: 'bot@example.com', website: 'x' }, { json: true })).json(), { ok: true });
  assert.equal((await post({ email: 'someone@example.com' }, { origin: 'https://elsewhere.example', json: true })).status, 403);
  // A form on another site cannot add to the list.
  assert.equal((await post({ email: 'someone@example.com' }, { origin: 'https://elsewhere.example' })).status, 403);
  assert.deepEqual(list(), []);
  // A burst from one place is turned away.
  const busy = await running({ limit: () => false });
  assert.deepEqual(went(await busy.post({ email: 'someone@example.com' })), [303, `${site}/join-problem`]);
  assert.deepEqual(busy.list(), []);
});

test('the page still serves, and lets its own form post to it and nothing else', async () => {
  const { env } = await running();
  const home = await worker.fetch(new Request(site + '/'), env);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('Content-Security-Policy'), /form-action 'self'; connect-src 'self'$/);
  assert.match(home.headers.get('Content-Security-Policy'), /default-src 'none'/);
  // There is nothing at /join to look at, and the two small pages have one address each.
  assert.deepEqual(went(await worker.fetch(new Request(site + '/join'), env)), [303, `${site}/#intro`]);
  assert.deepEqual(went(await worker.fetch(new Request(site + '/joined.html'), env)), [308, `${site}/joined`]);
  // The form on the homepage is the one this test posts: its address, its field names, its button.
  const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(page, /<form class="join" method="post" action="\/join">/);
  assert.match(page, /name="email" type="email" required/);
  assert.match(page, /name="website"/);
  // The hero has one button, which opens the popup the form is in. No script does it.
  assert.match(page, /<button class="button" type="button" popovertarget="join">Join our plan<\/button>/);
  assert.match(page, /<div class="join-popup" id="join" popover /);
  assert.equal(page.indexOf('<form class="join"') > page.indexOf('id="join" popover'), true);
  // After joining, the popup says thank you and nothing about a list. So does the page a plain form lands on.
  assert.match(page, /<div class="join-thanks" role="status" hidden>\s*<p class="join-thanks-title">Thank you for your interest\.<\/p>\s*<p class="join-thanks-more">We’ll let you know as soon as early access opens\.<\/p>/);
  assert.match(page, /<script src="\/join\.js" defer><\/script>/);
  const thanks = await readFile(new URL('../public/joined.html', import.meta.url), 'utf8');
  assert.match(thanks, /<h1 id="title">Thank you for your interest<\/h1>/);
  assert.match(thanks, /We’ll let you know as soon as early access opens\./);
  assert.doesNotMatch(page + thanks, /on the list/i);
  for (const name of ['joined', 'join-problem']) assert.match(await readFile(new URL(`../public/${name}.html`, import.meta.url), 'utf8'), /<meta name="robots" content="noindex">/);
});
