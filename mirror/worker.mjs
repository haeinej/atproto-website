// The mirror as a Worker. It runs on a schedule, and from one button on its own page.
import { signedIn } from '../feed/private.mjs';
import { mirror, sources } from './sync.mjs';

const escape = text => String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

// Only the owner may look or press: signed in through Cloudflare Access, or holding the mirror's own
// token, which is what a deploy hook or a script sends.
async function allowed(request, env, get) {
  const sent = request.headers.get('Authorization');
  if (env.MIRROR_TOKEN && sent === `Bearer ${env.MIRROR_TOKEN}`) return true;
  return signedIn(request, env, get);
}

function page(env, last) {
  const rows = sources(env).map(source => {
    const result = last?.sources.find(found => found.platform === source.platform && found.from === (source.feed ?? `@${source.userId}`));
    const state = !result ? 'not run yet'
      : `${result.seen} seen · ${result.written.length} written · ${result.unchanged} unchanged${result.waiting ? ` · ${result.waiting} waiting for the next run` : ''}${result.problems.length ? ` · ${result.problems.length} problem(s)` : ''}`;
    const problems = result?.problems.length ? `<ul>${result.problems.map(problem => `<li>${escape(problem)}</li>`).join('')}</ul>` : '';
    return `<li><strong>${escape(source.platform)}</strong> <span>${escape(source.feed ?? `@${source.userId}`)}</span><br><small>into ${escape([source.label, source.sublabel].filter(Boolean).join(' · '))} — ${escape(state)}</small>${problems}</li>`;
  }).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Mirror</title><link rel="stylesheet" href="/notes/notes.css">
<style>.mirror li{margin:0 0 16px}.mirror span,.mirror small{color:var(--muted)}.mirror button{font:inherit;padding:8px 16px;border:1px solid var(--ink);background:var(--ink);color:var(--background);border-radius:6px;cursor:pointer}.mirror button[disabled]{opacity:.5}</style></head>
<body><main class="notes-page mirror"><h1>Mirror</h1>
<p>Copies what you publish on each connected platform into your repository. It only reads from them.</p>
<ul class="note-tree">${rows || '<li>No platforms are connected yet.</li>'}</ul>
<p><button id="run">Mirror now</button> <small id="state">${last ? `Last run ${escape(last.at)}` : ''}</small></p>
<script>
document.getElementById('run').addEventListener('click', async event => {
  event.target.disabled = true;
  document.getElementById('state').textContent = 'Mirroring…';
  const response = await fetch('/mirror/run', { method: 'POST' });
  if (response.ok) location.reload();
  else { document.getElementById('state').textContent = 'The run failed (HTTP ' + response.status + ').'; event.target.disabled = false; }
});
</script></main></body></html>`;
}

export async function handle(request, env, get = fetch) {
  const url = new URL(request.url);
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' };
  if (!(await allowed(request, env, get))) return new Response('Not found', { status: 404, headers });
  if (url.pathname === '/mirror/run' && request.method === 'POST') return Response.json(await mirror(env, { get }), { headers });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
  const last = await env.MIRROR.get('mirror:last', 'json');
  if (url.pathname === '/mirror/status.json') return Response.json(last ?? {}, { headers });
  if (url.pathname === '/mirror' || url.pathname === '/mirror/') {
    return new Response(page(env, last), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  }
  return new Response('Not found', { status: 404, headers });
}

export default {
  async scheduled(_controller, env) {
    await mirror(env);
  },
  fetch: (request, env) => handle(request, env),
};
