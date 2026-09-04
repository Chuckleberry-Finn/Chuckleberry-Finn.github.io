let LANGUAGES = {};
let MODS = [];
let currentSource = null;
let currentSourceData = {};

document.addEventListener("DOMContentLoaded", async () => {
  initEditorActions();

  const languagesOk = await loadLanguages();
  const modsOk = await loadModsDropdown();
  if (!languagesOk || !modsOk) return;

  restoreSteam();
  const resumedState = checkSteamCallback();
  updateSteamUI();

  if (resumedState && resumedState.type === "repo") {
    await handleLoadRepo(resumedState.owner, resumedState.repo, resumedState.branch);
    if (resumedState.sourceLang) document.getElementById("sourceLangSelect").value = resumedState.sourceLang;
    if (resumedState.targetLang) document.getElementById("targetLangSelect").value = resumedState.targetLang;
    if (resumedState.sourceLang && resumedState.targetLang) await handleLoadFields();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const repoParam = params.get("repo") || params.get("repo_url");
  if (repoParam) {
    const parsed = parseRepoInput(repoParam);
    const match = parsed && MODS.find(m => {
      const p = parseRepoInput(m.repo_url || "");
      return p && p.owner.toLowerCase() === parsed.owner.toLowerCase() && p.repo.toLowerCase() === parsed.repo.toLowerCase();
    });
    if (match) {
      document.getElementById("modsSelect").value = match.repo_url;
      await handleLoadRepo(parsed.owner, parsed.repo, null);
    }
  }
});

// "Failed to fetch" almost always means this page was opened via file://
// instead of a local server, which silently breaks relative fetch() calls.
async function tryFetchStep(label, fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(`${label} failed:`, err);
    const isNetworkError = err instanceof TypeError;
    setSourceStatus(
      isNetworkError
        ? `Could not load ${label} — "Failed to fetch" usually means this page was opened directly ` +
          `from disk (a file:// URL). Serve the site with a local web server instead, e.g. run ` +
          `"python3 -m http.server" from the repo root and open http://localhost:8000/translate/.`
        : `Could not load ${label}: ${err.message}`,
      "error"
    );
    return false;
  }
}

async function loadLanguages() {
  return tryFetchStep("languages.json", async () => {
    const resp = await fetch(CONFIG.languagesJsonPath);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    LANGUAGES = await resp.json();
  });
}

async function loadModsDropdown() {
  const select = document.getElementById("modsSelect");
  return tryFetchStep("mods.json", async () => {
    const resp = await fetch(CONFIG.modsJsonPath);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    MODS = (await resp.json()).filter(m => m.repo_url);
    select.innerHTML = '<option value="">Select a mod…</option>' +
      MODS.map(m => `<option value="${escapeHtml(m.repo_url)}">${escapeHtml(m.name)}</option>`).join("");
  });
}

function setSourceStatus(message, kind) {
  const el = document.getElementById("sourceStatus");
  el.textContent = message;
  el.className = "source-status" + (kind ? ` status-${kind}` : "");
}

function initEditorActions() {
  document.getElementById("loadModBtn").addEventListener("click", async () => {
    const val = document.getElementById("modsSelect").value;
    if (!val) { setSourceStatus("Pick a mod first.", "error"); return; }
    const parsed = parseRepoInput(val);
    if (!parsed) { setSourceStatus("That mod has no valid repo_url configured.", "error"); return; }
    await handleLoadRepo(parsed.owner, parsed.repo, null);
  });

  document.getElementById("loadFieldsBtn").addEventListener("click", handleLoadFields);
  document.getElementById("downloadZipBtn").addEventListener("click", handleDownload);
  document.getElementById("steamSignInBtn").addEventListener("click", () => {
    startSteamSignIn(buildRedirectState());
  });
  document.getElementById("createPrBtn").addEventListener("click", handleCreatePR);
}

async function handleLoadRepo(owner, repo, branch) {
  setSourceStatus(`Fetching ${owner}/${repo}…`, "loading");
  try {
    currentSource = await loadGithubSource(owner, repo, branch);
    onSourceLoaded();
  } catch (err) {
    const isNetworkError = err instanceof TypeError;
    setSourceStatus(
      isNetworkError
        ? `Could not reach the GitHub API ("Failed to fetch"). Check your connection, or that this ` +
          `page is being served over http(s):// rather than opened as a file.`
        : err.message,
      "error"
    );
  }
}

function onSourceLoaded() {
  const availableLangs = Object.keys(currentSource.languages).sort();
  if (availableLangs.length === 0) {
    setSourceStatus("Found a Translate folder, but no recognizable language subfolders.", "error");
    return;
  }

  setSourceStatus(`Loaded ${currentSource.label} — found ${availableLangs.length} language folder(s).`, "ok");

  const meta = document.getElementById("editorMeta");
  meta.innerHTML = `<span class="meta-name">${escapeHtml(currentSource.label)}</span>`;

  populateLangSelects(availableLangs);
  document.getElementById("view-editor").classList.remove("hidden");
  document.getElementById("fieldsSection").classList.add("hidden");

  updateSteamUI();
  document.getElementById("view-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function langOptionLabel(code) {
  const name = LANGUAGES[code];
  return name ? `${code} (${name})` : code;
}

function populateLangSelects(availableLangs) {
  const sourceSelect = document.getElementById("sourceLangSelect");
  const targetSelect = document.getElementById("targetLangSelect");

  sourceSelect.innerHTML = availableLangs.map(l => `<option value="${l}">${escapeHtml(langOptionLabel(l))}</option>`).join("");
  sourceSelect.value = availableLangs.includes(CONFIG.defaultSourceLang) ? CONFIG.defaultSourceLang : availableLangs[0];

  const renderTargets = () => {
    const source = sourceSelect.value;
    const allCodes = Object.keys(LANGUAGES).filter(l => l !== source).sort();
    targetSelect.innerHTML = allCodes.map(l => {
      const has = availableLangs.includes(l);
      const label = langOptionLabel(l) + (has ? " — has existing translation" : "");
      return `<option value="${l}">${escapeHtml(label)}</option>`;
    }).join("");
  };
  sourceSelect.addEventListener("change", renderTargets);
  renderTargets();
}

function buildRedirectState() {
  if (!currentSource || currentSource.type !== "repo") return null;
  return {
    type: "repo",
    owner: currentSource.owner,
    repo: currentSource.repo,
    branch: currentSource.branch,
    sourceLang: document.getElementById("sourceLangSelect").value,
    targetLang: document.getElementById("targetLangSelect").value,
  };
}

async function handleLoadFields() {
  if (!currentSource) return;
  const sourceLang = document.getElementById("sourceLangSelect").value;
  const targetLang = document.getElementById("targetLangSelect").value;

  setSourceStatus(`Loading ${sourceLang} → ${targetLang} fields…`, "loading");
  try {
    currentSourceData = await currentSource.readLanguageFiles(sourceLang);
    const targetData = currentSource.languages[targetLang]
      ? await currentSource.readLanguageFiles(targetLang)
      : {};

    renderFields(currentSourceData, targetData);
    document.getElementById("fieldsSection").classList.remove("hidden");
    document.getElementById("fieldsSection").scrollIntoView({ behavior: "smooth", block: "start" });
    setSourceStatus(`Loaded ${Object.keys(currentSourceData).length} file(s) for ${sourceLang} → ${targetLang}.`, "ok");
    updateSteamUI();
  } catch (err) {
    setSourceStatus(`Could not load fields: ${err.message}`, "error");
  }
}

async function handleDownload() {
  const targetLang = document.getElementById("targetLangSelect").value;
  await downloadTranslationZip(currentSource.label, targetLang);
}

async function handleCreatePR() {
  const btn = document.getElementById("createPrBtn");
  const resultEl = document.getElementById("prResult");
  btn.disabled = true;
  resultEl.innerHTML = "";

  try {
    const sourceLang = document.getElementById("sourceLangSelect").value;
    const targetLang = document.getElementById("targetLangSelect").value;
    const exportData = getExportData();
    const files = Object.entries(exportData).map(([path, data]) => ({
      path,
      content: JSON.stringify(data, null, 4),
    }));

    const result = await submitTranslationPR({
      owner: currentSource.owner,
      repo: currentSource.repo,
      branch: currentSource.branch,
      translateRoot: currentSource.translateRoot,
      sourceLang,
      targetLang,
      files,
    });

    resultEl.innerHTML = `<span class="pr-success">Pull request opened:</span> <a href="${result.pr_url}" target="_blank" rel="noopener">${escapeHtml(result.pr_url)}</a>`;
  } catch (err) {
    resultEl.innerHTML = `<span class="pr-error">${escapeHtml(err.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}
