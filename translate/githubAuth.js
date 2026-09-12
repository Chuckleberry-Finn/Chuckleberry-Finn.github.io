const GH_TOKEN_STORAGE_KEY = "cfi_translate_github_token";
const GH_OAUTH_STATE_KEY = "cfi_translate_github_oauth_state";
const GH_OAUTH_APPSTATE_KEY = "cfi_translate_github_oauth_appstate";

let githubAuth = { token: null, login: null, avatar: null };

function restoreGithubAuth() {
  try {
    const saved = sessionStorage.getItem(GH_TOKEN_STORAGE_KEY);
    if (saved) githubAuth.token = JSON.parse(saved).token || null;
  } catch (e) { /* ignore */ }
}

function saveGithubAuth() {
  try {
    sessionStorage.setItem(GH_TOKEN_STORAGE_KEY, JSON.stringify({ token: githubAuth.token }));
  } catch (e) { /* ignore */ }
}

function isGithubSignedIn() {
  return !!githubAuth.token;
}

function getGithubToken() {
  return githubAuth.token;
}

function signOutGithub() {
  githubAuth = { token: null, login: null, avatar: null };
  sessionStorage.removeItem(GH_TOKEN_STORAGE_KEY);
  updateAuthUI();
}

async function signInGithub(token) {
  const resp = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) {
    if (resp.status === 401) throw new Error("That sign-in was rejected - the token is invalid or expired.");
    throw new Error(`Could not verify sign-in (HTTP ${resp.status}).`);
  }
  const user = await resp.json();
  githubAuth = { token, login: user.login, avatar: user.avatar_url };
  saveGithubAuth();
  updateAuthUI();
  return user;
}

async function restoreAndVerifyGithubAuth() {
  restoreGithubAuth();
  if (!githubAuth.token) return;
  try {
    await signInGithub(githubAuth.token);
  } catch (e) {
    signOutGithub();
  }
}

function startGithubOAuth() {
  if (!CONFIG.githubOauth || !CONFIG.githubOauth.clientId || !CONFIG.githubOauth.workerUrl) {
    setSourceStatus("GitHub sign-in isn't configured on this deployment yet - try Steam instead.", "error");
    return;
  }
  const state = crypto.randomUUID();
  sessionStorage.setItem(GH_OAUTH_STATE_KEY, state);

  if (typeof buildRedirectState === "function") {
    const appState = buildRedirectState();
    if (appState) sessionStorage.setItem(GH_OAUTH_APPSTATE_KEY, JSON.stringify(appState));
  }

  const redirectUri = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    client_id: CONFIG.githubOauth.clientId,
    scope: "repo",
    redirect_uri: redirectUri,
    state,
  });
  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

/** Returns true if this page load is the redirect back from GitHub. */
async function checkGithubOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code) return false;

  window.history.replaceState({}, "", window.location.pathname);

  const expectedState = sessionStorage.getItem(GH_OAUTH_STATE_KEY);
  sessionStorage.removeItem(GH_OAUTH_STATE_KEY);
  if (!state || state !== expectedState) {
    setSourceStatus("GitHub sign-in failed a security check - please try again.", "error");
    return true;
  }

  setSourceStatus("Finishing GitHub sign-in…", "loading");
  try {
    const workerUrl = (CONFIG.githubOauth.workerUrl || "").replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(workerUrl)) {
      throw new Error(`config.js's githubOauth.workerUrl ("${CONFIG.githubOauth.workerUrl}") is missing "https://".`);
    }
    const resp = await fetch(`${workerUrl}/token?code=${encodeURIComponent(code)}`);
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`The worker at ${workerUrl} didn't return JSON (got "${contentType}" instead).`);
    }
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || data.error || "Token exchange failed.");
    await signInGithub(data.access_token);
    setSourceStatus("", null);

    const savedAppState = sessionStorage.getItem(GH_OAUTH_APPSTATE_KEY);
    sessionStorage.removeItem(GH_OAUTH_APPSTATE_KEY);
    if (savedAppState && typeof restoreAppStateAfterOAuth === "function") {
      await restoreAppStateAfterOAuth(JSON.parse(savedAppState));
    }
  } catch (e) {
    setSourceStatus(`GitHub sign-in failed: ${e.message}`, "error");
  }
  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  const signInBtn = document.getElementById("githubSignInBtn");
  if (signInBtn) signInBtn.addEventListener("click", startGithubOAuth);

  const signOutLink = document.getElementById("github-sign-out-link");
  if (signOutLink) signOutLink.addEventListener("click", signOutGithub);
});
