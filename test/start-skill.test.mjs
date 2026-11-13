import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('starter distinguishes local/private write controls from owner-approved public publication', async () => {
  for (const path of ['../skills/start/SKILL.md', '../README.md']) {
    const text = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /Every command previews by default and changes nothing until/);
    for (const flag of ['--publish', '--save', '--apply']) assert.ok(text.includes(flag), `${path}: explain ${flag}`);
    assert.match(text, /renderer[\s\S]*local/i);
    assert.match(text, /(?:show the owner|approval)/i);
  }
});
