// Mirrors Translator.is_b41_folder() from pz-translator's translate.py.
// A "Translate" directory counts as a Build 41 workshop-cache path when,
// walking upward from its parent, the nearest ancestor literally named
// "mods" is exactly 5 path segments above the Translate directory itself:
//   Workshop/mods/<id>/mods/<ModName>/media/Translate/...
//                 └ mods ┘  id   mods ModName media Translate  (5 after "mods")
const TRANSLATE_DIR_NAME = "Translate";

function isB41TranslatePath(pathParts) {
  for (let i = pathParts.length - 2; i >= 0; i--) {
    if (pathParts[i].toLowerCase() === "mods") {
      const relLen = pathParts.length - i - 1;
      return relLen === 5;
    }
  }
  return false;
}

function splitPath(p) {
  return p.split(/[/\\]+/).filter(Boolean);
}

// applyB41Filter is meant for local scans of a real Steam Workshop /
// mods-development directory, where old and new mods may be mixed
// together. It's skipped for GitHub repos, which are curated mod source
// rather than a Workshop cache, so folder depth shouldn't be second-guessed.
function findTranslateRoots(filePaths, applyB41Filter = true) {
  const rootsMap = new Map();

  for (const rawPath of filePaths) {
    if (!/\.json$/i.test(rawPath)) continue;
    const parts = splitPath(rawPath);

    for (let i = 0; i < parts.length - 2; i++) {
      if (parts[i].toLowerCase() !== TRANSLATE_DIR_NAME.toLowerCase()) continue;

      const translatePathParts = parts.slice(0, i + 1);
      if (applyB41Filter && isB41TranslatePath(translatePathParts)) continue;

      const langCode = parts[i + 1];
      if (!/^[A-Za-z]{2,6}$/.test(langCode)) continue;

      const relFromLang = parts.slice(i + 2).join("/");
      if (!relFromLang) continue;

      const rootKey = translatePathParts.join("/");
      if (!rootsMap.has(rootKey)) {
        rootsMap.set(rootKey, { translateRoot: rootKey, languages: new Map() });
      }
      const entry = rootsMap.get(rootKey);
      const upperLang = langCode.toUpperCase();
      if (!entry.languages.has(upperLang)) entry.languages.set(upperLang, []);
      entry.languages.get(upperLang).push(`${langCode}/${relFromLang}`);
    }
  }

  return Array.from(rootsMap.values()).map(({ translateRoot, languages }) => ({
    translateRoot,
    languages: Object.fromEntries(languages),
  }));
}
