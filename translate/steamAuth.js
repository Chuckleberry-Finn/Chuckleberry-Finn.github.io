const STEAM_STORAGE_KEY = "cfi_translate_steam";
const STATE_STORAGE_KEY = "cfi_translate_state";

let steamState = { username: null, steamId: null, avatar: null, token: null };

function restoreSteam() {
  try {
    const s = localStorage.getItem(STEAM_STORAGE_KEY);
    if (s) steamState = JSON.parse(s);
  } catch (e) {}
}

function saveSteam() {
  localStorage.setItem(STEAM_STORAGE_KEY, JSON.stringify(steamState));
}

function signOutSteam() {
  steamState = { username: null, steamId: null, avatar: null, token: null };
  localStorage.removeItem(STEAM_STORAGE_KEY);
  updateAuthUI();
}

function isSteamSignedIn() {
  return !!steamState.token;
}

function saveAppStateForRedirect(state) {
  try { sessionStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function restoreAppStateAfterRedirect() {
  try {
    const s = sessionStorage.getItem(STATE_STORAGE_KEY);
    if (!s) return null;
    sessionStorage.removeItem(STATE_STORAGE_KEY);
    return JSON.parse(s);
  } catch (e) { return null; }
}

function startSteamSignIn(appState) {
  if (appState) saveAppStateForRedirect(appState);
  const cleanUrl = window.location.origin + window.location.pathname;
  const returnUrl = encodeURIComponent(cleanUrl);
  window.location.href = `${CONFIG.worker.url}/auth/steam?return_url=${returnUrl}`;
}

function checkSteamCallback() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("steam_auth") === "success") {
    const avatarParam = params.get("steam_avatar") || "";
    steamState = {
      username: params.get("steam_name") || "Steam User",
      steamId: params.get("steam_id"),
      avatar: avatarParam ? decodeURIComponent(avatarParam) : "",
      token: params.get("session_token"),
    };
    saveSteam();
    window.history.replaceState({}, "", window.location.pathname);
    updateAuthUI();
    return restoreAppStateAfterRedirect();
  } else if (params.get("steam_auth") === "error") {
    window.history.replaceState({}, "", window.location.pathname);
    updateAuthUI();
    setSourceStatus("Steam authentication failed. You can still download translations without signing in.", "error");
  }
  return null;
}

function updateAuthUI() {
  const steamBadge = document.getElementById("steam-user-badge");
  const steamName = document.getElementById("steam-user-name");
  const steamBtn = document.getElementById("steamSignInBtn");
  const githubBadge = document.getElementById("github-user-badge");
  const githubName = document.getElementById("github-user-name");
  const githubBtn = document.getElementById("githubSignInBtn");
  const orDivider = document.getElementById("signInOrDivider");
  const createPrBtn = document.getElementById("createPrBtn");

  const hasRepoSource = currentSource && currentSource.type === "repo";
  const steamIn = isSteamSignedIn();
  const githubIn = typeof isGithubSignedIn === "function" && isGithubSignedIn();

  if (steamState.token) {
    steamBadge.classList.remove("hidden");
    steamName.textContent = steamState.username;
  } else {
    steamBadge.classList.add("hidden");
  }

  if (githubBadge) {
    if (githubIn) {
      githubBadge.classList.remove("hidden");
      githubName.textContent = githubAuth.login;
    } else {
      githubBadge.classList.add("hidden");
    }
  }

  if (steamBtn) steamBtn.classList.toggle("hidden", !hasRepoSource || steamIn || githubIn);
  if (githubBtn) githubBtn.classList.toggle("hidden", !hasRepoSource || steamIn || githubIn);
  if (orDivider) orDivider.classList.toggle("hidden", !hasRepoSource || steamIn || githubIn);
  if (createPrBtn) createPrBtn.classList.toggle("hidden", !hasRepoSource || !(steamIn || githubIn));
}

document.addEventListener("DOMContentLoaded", () => {
  const signOutLink = document.getElementById("sign-out-link");
  if (signOutLink) signOutLink.addEventListener("click", signOutSteam);
});
