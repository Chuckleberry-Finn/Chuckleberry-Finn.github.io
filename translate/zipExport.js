async function downloadTranslationZip(sourceLabel, targetLang) {
  if (typeof JSZip === "undefined") {
    setSourceStatus("Zip library failed to load - check your connection and try again.", "error");
    return;
  }

  const exportData = getExportData();
  const zip = new JSZip();
  const root = zip.folder(targetLang);

  for (const [fileName, data] of Object.entries(exportData)) {
    root.file(fileName, JSON.stringify(data, null, 4));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeLabel = sourceLabel.replace(/[^a-z0-9._-]+/gi, "_");
  a.href = url;
  a.download = `${safeLabel}_${targetLang}_translation.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
