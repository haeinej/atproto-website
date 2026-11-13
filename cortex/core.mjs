export const KINDS = ['person', 'preference', 'project', 'reference'];
export const NAME = /^[a-z]+(?:-[a-z]+)*$/;
const FIELDS = ['name', 'description', 'kind', 'always', 'stated', 'from', 'project', 'body', 'notes', 'writtenBy', 'seen'];
const bytes = text => new TextEncoder().encode(text).length;

export class InvalidMemory extends Error {}

export function memoryProblems(memory) {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return ['Give a memory as an object'];
  const problems = [];
  if (typeof memory.name !== 'string' || memory.name.length > 100 || !NAME.test(memory.name)) problems.push('name is lowercase words joined with hyphens, at most 100 characters');
  if (typeof memory.description !== 'string' || !memory.description.trim() || [...memory.description].length > 200 || /[\r\n\u2028\u2029]/u.test(memory.description)) problems.push('description is one nonempty line, at most 200 characters');
  if (!KINDS.includes(memory.kind)) problems.push(`kind is one of: ${KINDS.join(', ')}`);
  if (typeof memory.stated !== 'boolean') problems.push('stated says whether the member said it, as true or false');
  if (memory.always !== undefined && typeof memory.always !== 'boolean') problems.push('always is true or false');
  if (typeof memory.body !== 'string' || bytes(memory.body) > 8192) problems.push('body is Markdown, at most 8 KB in UTF-8');
  for (const field of ['from', 'project']) {
    if (memory[field] !== undefined && (typeof memory[field] !== 'string' || memory[field].length > 2000 || /[\r\n\u0000]/u.test(memory[field]))) problems.push(`${field} is text, at most 2,000 characters`);
  }
  if (memory.notes !== undefined && (!Array.isArray(memory.notes) || memory.notes.length > 100 || new Set(memory.notes).size !== memory.notes.length || memory.notes.some(id => typeof id !== 'string' || !id || id.length > 200))) problems.push('notes is up to 100 distinct note IDs');
  if (memory.writtenBy !== undefined && (typeof memory.writtenBy !== 'string' || !memory.writtenBy)) problems.push('writtenBy is text');
  if (memory.seen !== undefined) {
    const seen = memory.seen;
    if (!seen || typeof seen !== 'object' || Array.isArray(seen) || !Number.isSafeInteger(seen.count) || seen.count < 0
      || (seen.last != null && (typeof seen.last !== 'string' || !Number.isFinite(Date.parse(seen.last))))
      || Object.keys(seen).some(key => !['count', 'last'].includes(key))) problems.push('seen holds a nonnegative count and the last time, or null');
  }
  for (const key of Object.keys(memory)) if (!FIELDS.includes(key)) problems.push(`Unknown memory field: ${key}`);
  return problems;
}

export function cleanMemory(given) {
  const problems = memoryProblems(given);
  if (problems.length) throw new InvalidMemory(problems.join('\n'));
  return Object.fromEntries(FIELDS.filter(key => given[key] !== undefined).map(key => [key, given[key]]));
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
}

export async function cortexVersion(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(ordered(value))));
  return `c${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export const memoryVersion = memory => cortexVersion(cleanMemory(memory));

// JSON values are also YAML scalars/collections; quoting avoids YAML's implicit conversions.
export function memoryFile(given) {
  const { body, ...properties } = cleanMemory(given);
  return `---\n${Object.entries(properties).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${body}`;
}

export function readMemoryFile(text) {
  const found = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!found) throw new InvalidMemory('A memory file starts with its properties between --- lines');
  const memory = { body: text.slice(found[0].length) };
  for (const line of found[1].split(/\r?\n/)) {
    const field = /^([A-Za-z]+): (.*)$/.exec(line);
    if (!field || Object.hasOwn(memory, field[1])) throw new InvalidMemory('A memory property is missing or repeated');
    try { memory[field[1]] = JSON.parse(field[2]); } catch { throw new InvalidMemory(`Cannot read memory property ${field[1]}`); }
  }
  return cleanMemory(memory);
}
