// The stores a vault keeps its notes in. Public notes are records on the person's PDS. Friends-only
// and private notes are in the person's own key-value store, which only they can read.
import { blobCid, recordVersion, VaultProblem } from './core.mjs';
import { listRecords } from '../feed/repository.mjs';

const refuse = message => { throw new VaultProblem(message); };

// Key prefixes in the person's own store. Files are kept once, by their address, for both.
export const PRIVATE_POST = 'private:';
export const FRIENDS_POST = 'friends:';
export const OWN_BLOB = 'private-blob:';

// One visibility's notes in a key-value store. `kv` has the shape of a Workers KV namespace:
// get(key, type), put(key, value), delete(key), list({ prefix, cursor }).
export function kvStore(kv, prefix) {
  const read = async key => {
    const record = await kv.get(prefix + key, 'json');
    return record ? { record, version: await recordVersion(record) } : null;
  };
  // The key-value store cannot compare and write in one step, so this check narrows the gap
  // between two writers without closing it.
  const unchanged = async (key, version) => {
    const held = await read(key);
    if (version === undefined ? held : held?.version !== version) refuse(`"${key}" changed in the store while it was being saved.`);
  };
  return {
    get: read,
    async list() {
      const names = [];
      let cursor;
      do {
        const page = await kv.list({ prefix, cursor });
        names.push(...page.keys.map(({ name }) => name));
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      // A store that can read many keys at once is asked once; otherwise each note is read in turn.
      const texts = kv.getMany ? await kv.getMany(names) : null;
      const notes = [];
      for (const name of names) {
        const key = name.slice(prefix.length);
        const record = texts ? texts.has(name) && JSON.parse(texts.get(name)) : (await read(key))?.record;
        if (record) notes.push({ key, record, version: await recordVersion(record) });
      }
      return notes;
    },
    async put(key, record, { version } = {}) {
      await unchanged(key, version);
      await kv.put(prefix + key, JSON.stringify(record));
      return { version: await recordVersion(record) };
    },
    async remove(key, { version } = {}) {
      if (version !== undefined) await unchanged(key, version);
      await kv.delete(prefix + key);
    },
    async putBlob(bytes, mime) {
      if (bytes.length > 25_000_000) refuse('A file kept in your own store must be no larger than 25 MB');
      const cid = await blobCid(bytes);
      await kv.put(OWN_BLOB + cid, bytes);
      return { $type: 'blob', mimeType: mime, size: bytes.length, ref: { $link: cid } };
    },
    async getBlob(cid) {
      const bytes = await kv.get(OWN_BLOB + cid, 'arrayBuffer');
      return bytes ? new Uint8Array(bytes) : null;
    },
  };
}

// The friends-only and private stores of one person's own key-value store.
export const ownStores = kv => ({ friends: kvStore(kv, FRIENDS_POST), private: kvStore(kv, PRIVATE_POST) });

// A key-value store held in memory, for tests and previews.
export function memoryKv(held = new Map()) {
  return {
    held,
    async get(key, type) {
      const value = held.get(key);
      if (value === undefined) return null;
      if (type === 'json') return typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
      if (type === 'arrayBuffer') return value instanceof Uint8Array ? value.slice().buffer : value;
      return value;
    },
    async put(key, value) { held.set(key, value); },
    async delete(key) { held.delete(key); },
    async list({ prefix = '' } = {}) {
      return { keys: [...held.keys()].filter(name => name.startsWith(prefix)).sort().map(name => ({ name })), list_complete: true };
    },
  };
}

// Public notes: records in the person's repository on their PDS.
//   token: the account's access token, or a function that returns one. Reading needs none.
export function pdsStore({ did, origin, collection, token, get = fetch }) {
  const bearer = async () => {
    const value = typeof token === 'function' ? await token() : token;
    return value ?? refuse('Writing to the PDS needs the account signed in');
  };
  async function call(method, { query, body, mime = 'application/json', auth } = {}) {
    const url = new URL(`/xrpc/${method}`, origin);
    if (query) url.search = new URLSearchParams(query);
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${await bearer()}`;
    if (body) headers['Content-Type'] = mime;
    const response = await get(url, {
      method: body ? 'POST' : 'GET', headers,
      body: body instanceof Uint8Array ? body : body && JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    return { response, data: await response.json().catch(() => ({})) };
  }
  const failed = (what, { response, data }) =>
    refuse(`${what} failed (HTTP ${response.status}${data?.message ? `: ${data.message}` : ''})`);
  return {
    async get(key) {
      const result = await call('com.atproto.repo.getRecord', { query: { repo: did, collection, rkey: key } });
      if (result.response.ok && result.data.value && typeof result.data.cid === 'string') {
        return { record: result.data.value, version: result.data.cid };
      }
      if (result.data.error === 'RecordNotFound' || result.response.status === 404) return null;
      return failed(`Reading "${key}"`, result);
    },
    async list() {
      const { records } = await listRecords({ did, origin, collection, get, maxPages: 500 });
      return records.map(({ uri, cid, value }) => ({ key: uri.split('/').at(-1), record: value, version: cid }));
    },
    // Creating fails when the key is taken, and replacing fails unless the version is still the
    // one that was read. The PDS makes both checks itself.
    async put(key, record, { version } = {}) {
      const result = version === undefined
        ? await call('com.atproto.repo.createRecord', { body: { repo: did, collection, rkey: key, record }, auth: true })
        : await call('com.atproto.repo.putRecord', { body: { repo: did, collection, rkey: key, record, swapRecord: version }, auth: true });
      if (!result.response.ok || result.data.uri !== `at://${did}/${collection}/${key}`) failed(`Saving "${key}"`, result);
      return { version: result.data.cid };
    },
    async remove(key, { version } = {}) {
      const result = await call('com.atproto.repo.deleteRecord', {
        body: { repo: did, collection, rkey: key, ...(version ? { swapRecord: version } : {}) }, auth: true,
      });
      if (!result.response.ok) failed(`Removing "${key}"`, result);
    },
    async putBlob(bytes, mime) {
      const result = await call('com.atproto.repo.uploadBlob', { body: bytes, mime, auth: true });
      const blob = result.data.blob;
      if (!result.response.ok || blob?.$type !== 'blob' || blob.size !== bytes.length || blob.mimeType !== mime ||
          typeof blob.ref?.$link !== 'string') failed('Uploading a file', result);
      return blob;
    },
    async getBlob(cid) {
      const url = new URL('/xrpc/com.atproto.sync.getBlob', origin);
      url.search = new URLSearchParams({ did, cid });
      const response = await get(url, { signal: AbortSignal.timeout(60_000) });
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    },
  };
}
