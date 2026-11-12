// The Model Context Protocol, as much of it as serving tools needs: one JSON message in, at most
// one out. https://modelcontextprotocol.io/specification
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = [
  "These tools work in one person's vault: everything they have written and made, as posts in one structure.",
  'Every post is marked public (for everyone), for friends, or private. Private posts are theirs alone:',
  'use what they say to help the person, and never put any of it into something other people can see.',
  'New posts are saved private. A tool that would change a post that is not private, change who a post',
  'is for, or remove one, first answers with what would happen and a confirm value: show that to the',
  'person and call again only when they agree. Saving never publishes: publishing is a step of its own.',
].join(' ');

// `tools` is ready-made, or a function that makes them the first time a tool is used, so that
// starting up and listing the tools never depends on the person's configuration being in place.
export function createServer({ tools, list, name = 'ohm-vault', version = '0.1.0' }) {
  let ready;
  const made = () => (ready ??= Promise.resolve(typeof tools === 'function' ? tools() : tools).catch(problem => { ready = undefined; throw problem; }));
  const answer = (id, result) => ({ jsonrpc: '2.0', id, result });
  const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  return async function handle(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return failure(message?.id ?? null, -32600, 'Not a JSON-RPC 2.0 request');
    }
    const { id, method, params = {} } = message;
    // A notification has no ID and gets no answer.
    if (id === undefined) return undefined;
    if (method === 'initialize') {
      return answer(id, {
        protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name, version },
        instructions: INSTRUCTIONS,
      });
    }
    if (method === 'ping') return answer(id, {});
    if (method === 'tools/list') return answer(id, { tools: list });
    if (method === 'tools/call') {
      // A tool that cannot do what was asked says why in its result, so the agent can read it.
      try {
        const result = await (await made()).call(params.name, params.arguments ?? {});
        return answer(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (problem) {
        return answer(id, { content: [{ type: 'text', text: problem.message }], isError: true });
      }
    }
    return failure(id, -32601, `Method not found: ${method}`);
  };
}

// Serve over standard input and output: one JSON message a line, each way.
export async function serve(handle, input, output) {
  let buffered = '';
  let last = Promise.resolve();
  const send = message => output.write(`${JSON.stringify(message)}\n`);
  for await (const chunk of input) {
    buffered += chunk;
    let end;
    while ((end = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, end).trim();
      buffered = buffered.slice(end + 1);
      if (!line) continue;
      // Requests are answered in the order they came, so two changes to one note cannot cross.
      last = last.then(async () => {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Not JSON' } });
        }
        const response = await handle(message);
        if (response) send(response);
      });
    }
  }
  await last;
}
