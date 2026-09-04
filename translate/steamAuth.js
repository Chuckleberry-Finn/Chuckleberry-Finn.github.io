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
  updateSteamUI();
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
    updateSteamUI();
    return restoreAppStateAfterRedirect();
  } else if (params.get("steam_auth") === "error") {
    window.history.replaceState({}, "", window.location.pathname);
    updateSteamUI();
    setSourceStatus("Steam authentication failed. You can still download translations without signing in.", "error");
  }
  return null;
}

function updateSteamUI() {
  const badge = document.getElementById("steam-user-badge");
  const nameEl = document.getElementById("steam-user-name");
  const signInBtn = document.getElementById("steamSignInBtn");
  const createPrBtn = document.getElementById("createPrBtn");

  if (steamState.token) {
    badge.classList.remove("hidden");
    nameEl.textContent = steamState.username;
    if (signInBtn) signInBtn.classList.add("hidden");
    if (createPrBtn && currentSource && currentSource.type === "repo") {
      createPrBtn.classList.remove("hidden");
    }
  } else {
    badge.classList.add("hidden");
    if (signInBtn && currentSource && currentSource.type === "repo") {
      signInBtn.classList.remove("hidden");
    }
    if (createPrBtn) createPrBtn.classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const signOutLink = document.getElementById("sign-out-link");
  if (signOutLink) signOutLink.addEventListener("click", signOutSteam);
});
