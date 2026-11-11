// One call to a PDS. Returns the HTTP response and its JSON body, which is empty when there is none.
export async function rpc(origin, endpoint, { query, body, token, mime = 'application/json' } = {}) {
  const url = new URL(`/xrpc/${endpoint}`, origin);
  if (query) url.search = new URLSearchParams(query);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = mime;
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body instanceof Uint8Array ? body : body && JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  return { response, data: await response.json().catch(() => ({})) };
}

// Sign in to the configured account with an app password and return its access token.
export async function signIn(origin, did) {
  const password = process.env.ATPROTO_APP_PASSWORD;
  if (!password) throw new Error('Set ATPROTO_APP_PASSWORD for the account in your feed config');
  const session = await rpc(origin, 'com.atproto.server.createSession', { body: { identifier: did, password } });
  const token = session.data.accessJwt;
  if (!session.response.ok || session.data.did !== did || typeof token !== 'string' || !token) {
    throw new Error(`Could not sign in to the configured account (HTTP ${session.response.status})`);
  }
  return token;
}
