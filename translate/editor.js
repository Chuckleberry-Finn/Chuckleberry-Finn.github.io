let editorSourceData = {};
let editorTargetData = {};
let editorDraftKey = null;
let editorDraftSaveTimer = null;

function renderFields(sourceData, targetData, sourceLang, targetLang) {
  editorSourceData = sourceData;
  editorTargetData = targetData;
  editorDraftKey = getDraftKey(sourceLang, targetLang);

  const container = document.getElementById("fieldsContainer");
  container.innerHTML = "";

  const fileNames = Object.keys(sourceData).sort();
  for (const fileName of fileNames) {
    const keys = Object.keys(sourceData[fileName]).sort();
    if (keys.length === 0) continue;

    const group = document.createElement("div");
    group.className = "field-group";
    group.dataset.file = fileName;

    const title = document.createElement("div");
    title.className = "field-group-title";
    title.textContent = fileName;
    group.appendChild(title);

    for (const key of keys) {
      const sourceText = sourceData[fileName][key];
      if (typeof sourceText !== "string") continue;
      const existing = (targetData[fileName] && targetData[fileName][key]) || "";

      const row = document.createElement("div");
      row.className = "field-row" + (existing ? " field-row-filled" : "");
      row.dataset.key = key;

      const srcCol = document.createElement("div");
      srcCol.innerHTML = `<div class="field-key">${escapeHtml(key)}</div><div class="field-source">${escapeHtml(sourceText)}</div>`;

      const tgtCol = document.createElement("div");
      tgtCol.className = "field-target";
      const textarea = document.createElement("textarea");
      textarea.value = existing;
      textarea.placeholder = "Enter translation…";
      textarea.dataset.key = key;
      if (existing) textarea.classList.add("filled");
      textarea.addEventListener("input", () => {
        textarea.classList.toggle("filled", textarea.value.trim().length > 0);
        row.classList.toggle("field-row-filled", textarea.value.trim().length > 0);
        updateProgress();
        scheduleDraftSave();
      });
      tgtCol.appendChild(textarea);

      const statusCol = document.createElement("div");
      statusCol.className = "field-status";
      statusCol.textContent = existing ? "✓" : "";

      row.appendChild(srcCol);
      row.appendChild(tgtCol);
      row.appendChild(statusCol);
      group.appendChild(row);
    }

    container.appendChild(group);
  }

  applyMissingFilter();
  updateProgress();
  restoreDraft();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function updateProgress() {
  const textareas = document.querySelectorAll("#fieldsContainer textarea");
  let filled = 0;
  textareas.forEach(t => { if (t.value.trim().length > 0) filled++; });
  const total = textareas.length;
  const pct = total ? Math.round((filled / total) * 100) : 0;

  document.getElementById("fieldsProgressFill").style.width = `${pct}%`;
  document.getElementById("fieldsProgressText").textContent = `${filled} / ${total} translated`;
}

function applyMissingFilter() {
  const onlyMissing = document.getElementById("onlyMissingToggle").checked;
  document.querySelectorAll("#fieldsContainer .field-row").forEach(row => {
    const textarea = row.querySelector("textarea");
    const isFilled = textarea.value.trim().length > 0;
    row.classList.toggle("hidden", onlyMissing && isFilled);
  });
  document.querySelectorAll("#fieldsContainer .field-group").forEach(group => {
    const visibleRows = group.querySelectorAll(".field-row:not(.hidden)");
    group.classList.toggle("hidden", visibleRows.length === 0);
  });
}

// Only emits keys that were actually provided — either already translated
// before this session started, or filled in just now. Fields left blank
// are omitted entirely rather than backfilled with the origin-language text.
function getExportData() {
  const out = {};
  document.querySelectorAll("#fieldsContainer .field-group").forEach(group => {
    const fileName = group.dataset.file;
    const source = editorSourceData[fileName] || {};
    const fileOut = {};

    for (const [key, value] of Object.entries(source)) {
      if (typeof value !== "string") fileOut[key] = value;
    }

    group.querySelectorAll(".field-row").forEach(row => {
      const key = row.dataset.key;
      const val = row.querySelector("textarea").value.trim();
      if (val.length > 0) fileOut[key] = val;
    });

    out[fileName] = fileOut;
  });
  return out;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("onlyMissingToggle").addEventListener("change", applyMissingFilter);
});

async function applyUploadedTranslationFolder(fileList) {
  const files = Array.from(fileList).filter(f => /\.json$/i.test(f.name));
  if (files.length === 0) {
    setSourceStatus("No .json files found in that folder.", "error");
    return;
  }

  const uploaded = {};
  for (const file of files) {
    const rel = (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name;
    try {
      uploaded[rel] = JSON.parse(await file.text());
    } catch (e) {
      console.warn(`Skipping ${file.name}: ${e.message}`);
    }
  }

  let filled = 0;
  let conflicts = 0;

  document.querySelectorAll("#fieldsContainer .field-group").forEach(group => {
    const uploadedFile = uploaded[group.dataset.file];
    if (!uploadedFile) return;

    group.querySelectorAll(".field-row").forEach(row => {
      const key = row.dataset.key;
      const uploadedVal = uploadedFile[key];
      if (typeof uploadedVal !== "string") return;

      const textarea = row.querySelector("textarea");
      const current = textarea.value.trim();

      if (current.length === 0) {
        textarea.value = uploadedVal;
        textarea.classList.add("filled");
        row.classList.add("field-row-filled");
        filled++;
      } else if (current !== uploadedVal.trim()) {
        showFieldConflict(row, textarea, uploadedVal);
        conflicts++;
      }
    });
  });

  applyMissingFilter();
  updateProgress();
  scheduleDraftSave();

  const parts = [];
  if (filled) parts.push(`${filled} blank field(s) filled in`);
  if (conflicts) parts.push(`${conflicts} conflict(s) to review below`);
  setSourceStatus(parts.length ? parts.join(", ") + "." : "Nothing new found in that folder — everything already matched.", conflicts ? "loading" : "ok");
}

function showFieldConflict(row, textarea, uploadedVal) {
  const existing = row.querySelector(".field-conflict");
  if (existing) existing.remove();

  const conflictEl = document.createElement("div");
  conflictEl.className = "field-conflict";

  const label = document.createElement("div");
  label.className = "field-conflict-label";
  label.textContent = "Uploaded version differs:";

  const text = document.createElement("div");
  text.className = "field-conflict-text";
  text.textContent = uploadedVal;

  const actions = document.createElement("div");
  actions.className = "field-conflict-actions";

  const useBtn = document.createElement("button");
  useBtn.type = "button";
  useBtn.className = "btn-mini btn-mini-primary";
  useBtn.textContent = "Use uploaded";
  useBtn.addEventListener("click", () => {
    textarea.value = uploadedVal;
    textarea.classList.add("filled");
    row.classList.add("field-row-filled");
    conflictEl.remove();
    updateProgress();
    scheduleDraftSave();
  });

  const keepBtn = document.createElement("button");
  keepBtn.type = "button";
  keepBtn.className = "btn-mini";
  keepBtn.textContent = "Discard";
  keepBtn.addEventListener("click", () => conflictEl.remove());

  actions.appendChild(useBtn);
  actions.appendChild(keepBtn);
  conflictEl.appendChild(label);
  conflictEl.appendChild(text);
  conflictEl.appendChild(actions);

  row.querySelector(".field-target").appendChild(conflictEl);
}

const DRAFT_STORAGE_PREFIX = "pzmc_translator_draft:";

function getDraftKey(sourceLang, targetLang) {
  if (!currentSource) return null;
  const sourceId = currentSource.type === "repo"
    ? `repo:${currentSource.owner}/${currentSource.repo}@${currentSource.branch}`
    : `local:${currentSource.label}`;
  return `${DRAFT_STORAGE_PREFIX}${sourceId}:${sourceLang}->${targetLang}`;
}

function scheduleDraftSave() {
  if (!editorDraftKey) return;
  clearTimeout(editorDraftSaveTimer);
  editorDraftSaveTimer = setTimeout(saveDraftNow, 600);
}

function saveDraftNow() {
  if (!editorDraftKey) return;
  const data = getExportData();
  // don't bother persisting a draft that's entirely empty
  const hasAnyValue = Object.values(data).some(file => Object.values(file).some(v => typeof v === "string" && v.trim().length > 0));
  try {
    if (hasAnyValue) {
      localStorage.setItem(editorDraftKey, JSON.stringify(data));
    } else {
      localStorage.removeItem(editorDraftKey);
    }
  } catch (e) {
    console.warn("Could not save draft:", e.message);
  }
}

function restoreDraft() {
  if (!editorDraftKey) return;
  let saved;
  try {
    const raw = localStorage.getItem(editorDraftKey);
    if (!raw) return;
    saved = JSON.parse(raw);
  } catch (e) {
    return;
  }

  let restored = 0;
  document.querySelectorAll("#fieldsContainer .field-group").forEach(group => {
    const savedFile = saved[group.dataset.file];
    if (!savedFile) return;

    group.querySelectorAll(".field-row").forEach(row => {
      const key = row.dataset.key;
      const val = savedFile[key];
      if (typeof val !== "string" || val.length === 0) return;

      const textarea = row.querySelector("textarea");
      if (textarea.value.trim() === val.trim()) return; // already matches, nothing to restore
      textarea.value = val;
      textarea.classList.add("filled");
      row.classList.add("field-row-filled");
      restored++;
    });
  });

  if (restored > 0) {
    applyMissingFilter();
    updateProgress();
    setSourceStatus(`Restored ${restored} field(s) from an autosaved draft in this browser.`, "ok");
  }
}

function clearCurrentDraft() {
  if (!editorDraftKey) return;
  localStorage.removeItem(editorDraftKey);
  setSourceStatus("Cleared the autosaved draft for this language pair.", "ok");
}

