/**
 * Mod Translator OAuth relay — Cloudflare Worker
 *
 * Environment variables:
 *   GITHUB_OAUTH_CLIENT_ID     — Client ID of the GitHub OAuth App
 *   GITHUB_OAUTH_CLIENT_SECRET — Client Secret of the GitHub OAuth App
 *   ALLOWED_ORIGINS            — comma-separated CORS origins
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/{2,}/g, "/"); // tolerate accidental double slashes
    const cors = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (pathname === '/token' && request.method === 'GET') {
      return handleTokenExchange(url, env, cors);
    }
    if (pathname === '/health') {
      return json({ status: 'ok' }, 200, cors);
    }
    return json({ error: 'Not found' }, 404, cors);
  },
};

async function handleTokenExchange(url, env, cors) {
  const code = url.searchParams.get('code');
  if (!code) return json({ error: 'Missing code' }, 400, cors);

  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) {
    return json({ error: 'Worker is not configured (missing OAuth client id/secret)' }, 500, cors);
  }

  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });

  const data = await resp.json();
  if (data.error) {
    return json({ error: data.error, message: data.error_description || data.error }, 400, cors);
  }

  return json({ access_token: data.access_token, scope: data.scope }, 200, cors);
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : '',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
