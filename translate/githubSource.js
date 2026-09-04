/** Accepts "owner/repo", a full GitHub URL, or "owner/repo#branch". */
function parseRepoInput(raw) {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  s = s.replace(/\.git$/i, "").replace(/\/$/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

async function ghApiGet(path) {
  const resp = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) {
    if (resp.status === 403) {
      throw new Error("GitHub API rate limit reached — try again in a few minutes.");
    }
    if (resp.status === 404) {
      throw new Error("Repository not found (it may be private or misspelled).");
    }
    throw new Error(`GitHub API error (${resp.status})`);
  }
  return resp.json();
}

async function fetchDefaultBranch(owner, repo) {
  const info = await ghApiGet(`/repos/${owner}/${repo}`);
  return info.default_branch;
}

/** Returns the flat recursive file tree (paths only, blobs only). */
async function fetchRepoFileList(owner, repo, branch) {
  const data = await ghApiGet(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (data.truncated) {
    console.warn("Repo tree was truncated by the GitHub API; some files may be missed.");
  }
  return (data.tree || []).filter(e => e.type === "blob").map(e => e.path);
}

async function fetchRawFile(owner, repo, branch, path) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not fetch ${path} (${resp.status})`);
  return resp.text();
}

async function loadGithubSource(owner, repo, branchInput) {
  const branch = branchInput || (await fetchDefaultBranch(owner, repo));
  const filePaths = await fetchRepoFileList(owner, repo, branch);
  const jsonPaths = filePaths.filter(p => /\.json$/i.test(p));

  // No B41 filtering for repos — that heuristic is only meaningful for a
  // messy local Workshop cache, not a curated repo checkout.
  const roots = findTranslateRoots(jsonPaths, /* applyB41Filter */ false);
  if (roots.length === 0) {
    throw new Error("No Translate/<LANG>/*.json folder found in this repo.");
  }
  // Prefer the root with the most languages (usually the "real" mod content root).
  roots.sort((a, b) => Object.keys(b.languages).length - Object.keys(a.languages).length);
  const chosen = roots[0];

  return {
    type: "repo",
    owner,
    repo,
    branch,
    translateRoot: chosen.translateRoot,
    languages: chosen.languages,
    label: `${owner}/${repo}`,

    async readLanguageFiles(langCode) {
      const relPaths = chosen.languages[langCode] || [];
      const out = {};
      for (const relPath of relPaths) {
        const fullPath = `${chosen.translateRoot}/${relPath}`;
        const withinLangPath = relPath.split("/").slice(1).join("/");
        try {
          const text = await fetchRawFile(owner, repo, branch, fullPath);
          out[withinLangPath] = JSON.parse(text);
        } catch (e) {
          console.warn(`Skipping ${fullPath}: ${e.message}`);
        }
      }
      return out;
    },
  };
}

// files: [{ path: "ItemName.json", content: "...json string..." }]
async function submitTranslationPR(params) {
  if (!CONFIG.worker.url) throw new Error("No worker configured for pull requests.");
  if (!isSteamSignedIn()) throw new Error("Sign in with Steam first.");

  const resp = await fetch(`${CONFIG.worker.url}/api/translate/pr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: params.owner,
      repo: params.repo,
      base_branch: params.branch,
      translate_root: params.translateRoot,
      source_lang: params.sourceLang,
      target_lang: params.targetLang,
      files: params.files,
      steam_id: steamState.steamId,
      steam_name: steamState.username,
      session_token: steamState.token,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.message || data.error || `Pull request failed (${resp.status})`);
  }
  return data;
}
