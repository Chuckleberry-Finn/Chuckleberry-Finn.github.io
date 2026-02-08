/**
 * ============================================================
 *  STEAM ISSUE TRACKER — Cloudflare Worker (GitHub App Auth)
 * ============================================================
 *  Uses GitHub App authentication so issues appear as created
 *  by a bot instead of a personal account.
 *
 *  ENVIRONMENT VARIABLES:
 *    GITHUB_APP_ID          — Your GitHub App ID
 *    GITHUB_APP_PRIVATE_KEY — Your GitHub App private key (.pem contents)
 *    GITHUB_INSTALLATION_ID — Installation ID for your repos
 *    GITHUB_OWNER           — Your GitHub username / org
 *    ALLOWED_REPOS          — Comma-separated list of allowed repo names
 *    SESSION_SECRET         — Random string for HMAC session tokens
 *    ALLOWED_ORIGINS        — Comma-separated CORS origins
 * ============================================================
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/auth/steam')          return handleSteamStart(url, env);
      if (url.pathname === '/auth/steam/callback')  return handleSteamCallback(url, env);
      if (url.pathname === '/api/issues' && request.method === 'POST') {
        return await handleCreateIssue(request, env, cors);
      }
      if (url.pathname === '/health') {
        return json({ status: 'ok', time: new Date().toISOString() }, 200, cors);
      }
      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      console.error('Worker error:', err);
      console.error('Error stack:', err.stack);
      return json({ 
        error: 'Internal server error', 
        message: err.message,
        type: err.name
      }, 500, cors);
    }
  }
};


/* ═══════════════════════════════════════════════════════════
   STEAM OPENID
   ═══════════════════════════════════════════════════════════ */

function handleSteamStart(url, env) {
  const returnUrl = url.searchParams.get('return_url');
  if (!returnUrl) return new Response('Missing return_url', { status: 400 });

  const cb = new URL('/auth/steam/callback', url.origin);
  cb.searchParams.set('return_url', returnUrl);

  const params = new URLSearchParams({
    'openid.ns':         'http://specs.openid.net/auth/2.0',
    'openid.mode':       'checkid_setup',
    'openid.return_to':  cb.toString(),
    'openid.realm':      url.origin,
    'openid.identity':   'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  return Response.redirect(`https://steamcommunity.com/openid/login?${params}`, 302);
}

async function handleSteamCallback(url, env) {
  const returnUrl = url.searchParams.get('return_url');
  const redirect = new URL(returnUrl);

  // Verify with Steam
  const verify = new URLSearchParams(url.search);
  verify.set('openid.mode', 'check_authentication');

  const resp = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verify.toString(),
  });
  const text = await resp.text();

  if (!text.includes('is_valid:true')) {
    redirect.searchParams.set('steam_auth', 'error');
    return Response.redirect(redirect.toString(), 302);
  }

  // Extract Steam ID
  const claimed = url.searchParams.get('openid.claimed_id') || '';
  const match = claimed.match(/(\d{17})$/);
  if (!match) {
    redirect.searchParams.set('steam_auth', 'error');
    return Response.redirect(redirect.toString(), 302);
  }
  const steamId = match[1];

  // Fetch display name
  let steamName = `Steam User ${steamId}`;
  try {
    const pResp = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`);
    const pXml = await pResp.text();
    const nm = pXml.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/);
    if (nm) steamName = nm[1];
  } catch (e) { console.error('Profile fetch failed:', e); }

  // Session token
  const token = await hmacToken(steamId, env.SESSION_SECRET);

  redirect.searchParams.set('steam_auth', 'success');
  redirect.searchParams.set('steam_id', steamId);
  redirect.searchParams.set('steam_name', steamName);
  redirect.searchParams.set('session_token', token);

  return Response.redirect(redirect.toString(), 302);
}


/* ═══════════════════════════════════════════════════════════
   GITHUB APP AUTHENTICATION
   ═══════════════════════════════════════════════════════════ */

async function getGitHubAppToken(env) {
  // Generate JWT for GitHub App authentication
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,  // Issued 60 seconds in the past to account for clock drift
    exp: now + 600, // Expires in 10 minutes
    iss: env.GITHUB_APP_ID
  };

  const jwt = await generateJWT(payload, env.GITHUB_APP_PRIVATE_KEY);

  // Exchange JWT for installation access token
  const resp = await fetch(
    `https://api.github.com/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'SteamIssueTracker/2.0',
        'X-GitHub-Api-Version': '2022-11-28',
      }
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get GitHub App token: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return data.token;
}

async function generateJWT(payload, privateKeyPem) {
  // Parse PEM private key
  const pemContents = privateKeyPem
    .replace('-----BEGIN RSA PRIVATE KEY-----', '')
    .replace('-----END RSA PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryKey = base64ToArrayBuffer(pemContents);
  
  // Import the key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Create JWT header
  const header = { alg: 'RS256', typ: 'JWT' };
  
  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  // Sign
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(data)
  );

  const encodedSignature = base64UrlEncode(signature);
  return `${data}.${encodedSignature}`;
}


/* ═══════════════════════════════════════════════════════════
   ISSUE CREATION (WITH GITHUB APP)
   ═══════════════════════════════════════════════════════════ */

async function handleCreateIssue(request, env, cors) {
  const body = await request.json();
  const { title, body: issueBody, labels, repo, session_token, steam_id, steam_name } = body;

  console.log('Issue creation request:', {
    hasTitle: !!title,
    hasBody: !!issueBody,
    hasRepo: !!repo,
    hasSessionToken: !!session_token,
    hasSteamId: !!steam_id,
    hasSteamName: !!steam_name,
    sessionTokenLength: session_token?.length,
    steamId: steam_id
  });

  // Validate input
  if (!title || !issueBody) {
    console.error('Missing title or body');
    return json({ error: 'Missing title or body' }, 400, cors);
  }
  if (!repo) {
    console.error('Missing repo');
    return json({ error: 'Missing repo' }, 400, cors);
  }
  if (!session_token || !steam_id) {
    console.error('Missing authentication', { hasToken: !!session_token, hasId: !!steam_id });
    return json({ error: 'Not authenticated', details: 'Missing session_token or steam_id' }, 401, cors);
  }

  // Verify session
  if (!env.SESSION_SECRET) {
    console.error('SESSION_SECRET not configured in worker!');
    return json({ error: 'Server configuration error', details: 'SESSION_SECRET not set' }, 500, cors);
  }
  
  const expected = await hmacToken(steam_id, env.SESSION_SECRET);
  console.log('Session validation:', {
    receivedTokenLength: session_token.length,
    expectedTokenLength: expected.length,
    tokensMatch: session_token === expected,
    steamId: steam_id
  });
  
  if (session_token !== expected) {
    console.error('Session token mismatch');
    return json({ 
      error: 'Invalid session', 
      details: 'Session token validation failed. Please sign in again.' 
    }, 403, cors);
  }

  // Check repo allowlist
  const allowed = (env.ALLOWED_REPOS || '*').split(',').map(s => s.trim());
  if (!allowed.includes('*') && !allowed.includes(repo)) {
    console.error('Repo not allowed:', { repo, allowed });
    return json({ error: `Repo "${repo}" is not in the allowed list` }, 403, cors);
  }

  // Get GitHub App token
  console.log('Getting GitHub App token...');
  let githubToken;
  try {
    githubToken = await getGitHubAppToken(env);
    console.log('Got GitHub App token');
  } catch (err) {
    console.error('Failed to get GitHub App token:', err);
    return json({
      error: 'GitHub authentication failed',
      details: err.message
    }, 500, cors);
  }

  // Create issue via GitHub API
  console.log('Creating GitHub issue:', { owner: env.GITHUB_OWNER, repo });
  
  const owner = env.GITHUB_OWNER;
  const issuePayload = { 
    title, 
    body: issueBody, 
    labels: labels || [] 
  };
  
  console.log('GitHub API request:', {
    url: `https://api.github.com/repos/${owner}/${repo}/issues`,
    payload: issuePayload
  });
  
  let ghResp;
  try {
    ghResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'SteamIssueTracker/2.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(issuePayload),
    });
  } catch (fetchError) {
    console.error('GitHub API fetch failed:', fetchError);
    return json({ 
      error: 'Failed to reach GitHub API', 
      message: fetchError.message,
      details: 'Network error when connecting to GitHub'
    }, 502, cors);
  }

  console.log('GitHub response status:', ghResp.status);

  if (!ghResp.ok) {
    let errText = '';
    let errJson = null;
    
    try {
      errText = await ghResp.text();
      errJson = JSON.parse(errText);
      console.error(`GitHub API error ${ghResp.status}:`, errJson);
    } catch (e) {
      console.error(`GitHub API error ${ghResp.status}:`, errText);
    }
    
    let userMessage = '';
    if (ghResp.status === 401) {
      userMessage = 'GitHub App authentication failed';
    } else if (ghResp.status === 403) {
      userMessage = 'GitHub App lacks permission to create issues';
    } else if (ghResp.status === 404) {
      userMessage = `Repository ${owner}/${repo} not found or not accessible`;
    } else if (ghResp.status === 422) {
      userMessage = 'Invalid issue data';
    } else {
      userMessage = `GitHub API error (${ghResp.status})`;
    }
    
    return json({ 
      error: 'GitHub API error', 
      message: userMessage,
      status: ghResp.status,
      details: errJson?.message || errText.substring(0, 200)
    }, 502, cors);
  }

  const gh = await ghResp.json();
  console.log('Issue created successfully:', { number: gh.number, url: gh.html_url });
  return json({ success: true, issue_number: gh.number, issue_url: gh.html_url }, 201, cors);
}


/* ═══════════════════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════════════════ */

async function hmacToken(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64UrlEncode(data) {
  let base64;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else {
    base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
