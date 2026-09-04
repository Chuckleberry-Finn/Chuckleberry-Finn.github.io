/**
 * ============================================================
 *  LOCAL SOURCE — scans a folder picked via
 *  <input type="file" webkitdirectory> for a B42+ Translate/
 *  layout, entirely in the browser (nothing is uploaded).
 * ============================================================
 */

async function loadLocalSource(fileList) {
  const files = Array.from(fileList).filter(f => /\.json$/i.test(f.name));
  if (files.length === 0) {
    throw new Error("No .json files found in that folder.");
  }

  const relPaths = files.map(f => f.webkitRelativePath || f.name);
  const roots = findTranslateRoots(relPaths, /* applyB41Filter */ true);
  if (roots.length === 0) {
    throw new Error(
      "No valid Build 42+ Translate/<LANG>/*.json folder found (or the only " +
      "Translate folder found looked like a Build 41 workshop-cache path and was skipped)."
    );
  }
  roots.sort((a, b) => Object.keys(b.languages).length - Object.keys(a.languages).length);
  const chosen = roots[0];

  // Map relPath -> File, for quick lookup when reading.
  const fileByPath = new Map();
  files.forEach(f => fileByPath.set(f.webkitRelativePath || f.name, f));

  const folderName = (relPaths[0] || "").split("/")[0] || "Local folder";

  return {
    type: "local",
    translateRoot: chosen.translateRoot,
    languages: chosen.languages,
    label: folderName,

    async readLanguageFiles(langCode) {
      const relPaths = chosen.languages[langCode] || [];
      const out = {};
      for (const relPath of relPaths) {
        const fullPath = `${chosen.translateRoot}/${relPath}`;
        const withinLangPath = relPath.split("/").slice(1).join("/");
        const file = fileByPath.get(fullPath);
        if (!file) continue;
        try {
          const text = await file.text();
          out[withinLangPath] = JSON.parse(text);
        } catch (e) {
          console.warn(`Skipping ${fullPath}: ${e.message}`);
        }
      }
      return out;
    },
  };
}
