let editorSourceData = {};
let editorTargetData = {};

function renderFields(sourceData, targetData) {
  editorSourceData = sourceData;
  editorTargetData = targetData;

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

// Empty fields fall back to the source-language text so files stay valid
// even when a translation run is only partial.
function getExportData() {
  const out = {};
  document.querySelectorAll("#fieldsContainer .field-group").forEach(group => {
    const fileName = group.dataset.file;
    const source = editorSourceData[fileName] || {};
    const fileOut = { ...source };

    group.querySelectorAll(".field-row").forEach(row => {
      const key = row.dataset.key;
      const val = row.querySelector("textarea").value.trim();
      fileOut[key] = val.length > 0 ? val : source[key];
    });

    out[fileName] = fileOut;
  });
  return out;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("onlyMissingToggle").addEventListener("change", applyMissingFilter);
});
