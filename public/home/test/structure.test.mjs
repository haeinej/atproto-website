import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { parse } from 'parse5';
import test from 'node:test';

const nodes = node => [node, ...(node.childNodes ?? []).flatMap(nodes)];
const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;

test('home, draft and docs HTML have unique IDs and valid local/ARIA targets', async () => {
  for (const relative of ['../public/', '../../home-draft/', '../../docs/']) {
    const directory = new URL(relative, import.meta.url);
    for (const file of (await readdir(directory)).filter(name => name.endsWith('.html'))) {
      const all = nodes(parse(await readFile(new URL(file, directory), 'utf8')));
      const ids = all.map(node => attr(node, 'id')).filter(Boolean);
      const label = `${relative}${file}`;
      assert.equal(new Set(ids).size, ids.length, `${label}: duplicate IDs`);
      assert.ok(ids.includes('content'), `${label}: preserve skip navigation target`);
      for (const node of all) {
        const href = attr(node, 'href');
        const targets = [...(href?.startsWith('#') && href.length > 1 ? [decodeURIComponent(href.slice(1))] : []),
          ...(attr(node, 'aria-labelledby')?.split(/\s+/) ?? [])];
        for (const id of targets) assert.ok(ids.includes(id), `${label}: missing target ${id}`);
      }
    }
  }
});

test('home Wrangler schema resolves to the root installed dependency', async () => {
  const config = new URL('../wrangler.jsonc', import.meta.url);
  const source = await readFile(config, 'utf8');
  const path = source.match(/"\$schema":\s*"([^"]+)"/)[1];
  assert.equal(new URL(path, config).href, new URL('../../../node_modules/wrangler/config-schema.json', import.meta.url).href);
  await access(new URL(path, config));
});

test('About labels planned social/cloud features without hiding working local sync and sign-in', async () => {
  for (const relative of ['../public/about.html', '../../home-draft/about.html']) {
    const all = nodes(parse(await readFile(new URL(relative, import.meta.url), 'utf8')));
    const text = node => node.value ?? (node.childNodes ?? []).map(text).join(' ');
    const copy = text({ childNodes: all.filter(node => node.tagName === 'p') });
    assert.match(copy, /friends-only sharing and finding people are planned/i);
    assert.match(copy, /Browser and direct cloud-storage sync are planned/);
    assert.match(copy, /command-line sync brings your local folder and workspace into line when you run it/);
    assert.match(copy, /sign in to the workspace with Google, Microsoft or Bluesky/);
    assert.match(copy, /Public accounts hosted by ohm are planned/);
    assert.match(copy, /Nothing is published until you say so/);
    assert.ok(all.some(node => node.tagName === 'a' && attr(node, 'href') === 'https://docs.ohmmmm.com/limits'));
  }
});

test('local docs and retained draft previews use repo-owned paths, not private launchers', async () => {
  const root = new URL('../../../', import.meta.url);
  const { scripts } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  for (const [name, option, path] of [
    ['docs:dev', '--config', 'public/docs/wrangler.jsonc'],
    ['home-draft:dev', '--assets', 'public/home-draft'],
  ]) {
    assert.ok(scripts[name]?.includes(`${option} ${path}`));
    assert.match(scripts[name], /--ip 127\.0\.0\.1/);
    await access(new URL(path, root));
  }
  for (const path of ['public/README.md', 'public/home/README.md']) {
    assert.doesNotMatch(await readFile(new URL(path, root), 'utf8'), /\.claude\/launch\.json/);
  }
});
