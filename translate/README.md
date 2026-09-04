# Translation Tool (website build)

`translate/` adds a translation workflow for Build 42+ Project Zomboid mods,
built the same way as `issues/`: a static front-end + the same Cloudflare
Worker (`issues/worker/index.js`), reusing the existing GitHub App bot and
Steam OpenID login. No new worker deployment is needed — just redeploy the
updated `issues/worker/index.js`.

This build is scoped to **your own mods only** (picked from `../mods.json`),
matching how `issues/` works. A separate, more general build that also
accepts arbitrary third-party repos and local folders can be split out as
its own project later if you want it.

## ⚠️ "Failed to fetch" when testing locally

This almost always means the page was opened directly from disk
(`file:///.../translate/index.html`) rather than served over `http://`.
Browsers block `fetch()` of relative files like `../mods.json` and
`languages.json` under the `file://` origin, which throws exactly this
error and silently stops the page from initializing (you'd typically see
the mod dropdown stuck on "Loading mods…").

**Fix:** serve the site locally instead of double-clicking the HTML file:

```bash
# from the repo root (the folder containing index.html, issues/, translate/)
python3 -m http.server 8000
# then open:
http://localhost:8000/translate/
```

Any static server works (`npx serve`, VS Code's Live Server extension,
etc.) — the requirement is just that it's `http://`/`https://`, not `file://`.

The app now also catches this failure explicitly and shows that same
guidance in the status area instead of failing silently.

## What it does

1. **Mod picker** — a dropdown populated from `../mods.json`. Selecting a
   mod (or landing on `translate/?repo=owner/repo` for one already in
   `mods.json`) fetches its `Translate/<LANG>/*.json` files straight from
   the public GitHub API / raw.githubusercontent.com — no login needed to
   browse or download.
2. **Language picker** — origin defaults to `EN`, selectable from whatever
   language folders actually exist in the source. Target language is any
   code from `languages.json` (code → display name, e.g. "FR (Francais)",
   taken from `LanguagesInfo_b42.json`). Target options already present in
   the source are flagged "has existing translation".
3. **Editor** — one row per string key, grouped by file, source text next to
   an editable target field, a progress bar, and an "only show missing" filter.
4. **Download** — zips up the translated files with the original folder
   layout, no sign-in required.
5. **Pull request** — sign in with Steam (identifies the submitter only),
   then the worker commits the files to a new branch on the target repo
   using the bot's GitHub App token and opens a PR back to the default
   branch.

## Worker endpoints added

- `POST /api/translate/pr` — commits files + opens a PR. Requires the bot's
  GitHub App to be **installed on the target repo** with write access to
  contents + pull requests. Since this build only targets your own mods,
  that should already be true wherever the issue-tracker bot is installed.

`/auth/steam` and `/auth/steam/callback` are unchanged and reused as-is.

## Files

```
translate/
  index.html       page structure
  styles.css        design tokens shared with issues/styles.css
  config.js         worker URL, mods.json / languages.json paths
  languages.json    B42+ language code -> display name map
  pathRules.js      Translate-folder / B41-exclusion path logic
  githubSource.js   read repo files via public GitHub API; call worker for PR
  editor.js         renders the key/value grid and tracks fill progress
  zipExport.js      client-side .zip download (JSZip via CDN)
  steamAuth.js      Steam OpenID flow (mirrors issues/app.js)
  app.js            wires it all together
```

## Known limitations / follow-ups

- Only mods listed in `mods.json` with a `repo_url` are selectable — by
  design, for this build.
- If a repo has more than one `Translate/` root (e.g. a monorepo with
  several mods), the tool currently picks the one with the most language
  folders.
