/**
 * ============================================================
 *  MAIN APP — Coordinates all modules (Grid layout version)
 * ============================================================
 */

let mods = [];
let currentMod = null;
let currentTab = 'bug';
let steamState = {
  username: null,
  steamId: null,
  avatar: null,
  token: null
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  restoreSteam();
  checkSteamCallback();
  await loadMods();
  updateSteamUI();
  
  // Check if we should auto-open a specific repo
  const params = new URLSearchParams(window.location.search);
  const repoParam = params.get('repo');
  if (repoParam && mods.length > 0) {
    const mod = mods.find(m => m.repo_url.includes(`/${repoParam}`));
    if (mod) {
      showForm(mod);
    }
  }
});

/**
 * Initialize UI elements
 */
function initUI() {
  // Set up back to hub link
  document.getElementById('back-to-hub').addEventListener('click', (e) => {
    e.preventDefault();
    showHub();
  });

  // Set up sign out link
  const signOutLink = document.getElementById('sign-out-link');
  if (signOutLink) {
    signOutLink.addEventListener('click', signOutSteam);
  }
}

/**
 * Load mods from JSON
 */
async function loadMods() {
  const loadingMsg = document.getElementById('loading-msg');
  const modGrid = document.getElementById('mod-grid');
  
  try {
    const response = await fetch(CONFIG.modsJsonPath);
    mods = await response.json();
    
    loadingMsg.style.display = 'none';
    renderModGrid();
  } catch (error) {
    console.error('Failed to load mods:', error);
    loadingMsg.textContent = 'Error loading projects. Please refresh the page.';
  }
}

/**
 * Render mod grid
 */
function renderModGrid() {
  const grid = document.getElementById('mod-grid');
  grid.innerHTML = '';
  
  mods.forEach(mod => {
    const card = createModCard(mod);
    grid.appendChild(card);
  });
}

/**
 * Create a mod card element
 */
function createModCard(mod) {
  const card = document.createElement('div');
  card.className = 'mod-card';
  card.onclick = () => showForm(mod);
  
  const banner = document.createElement('div');
  banner.className = 'mod-card-banner';
  if (mod.banner) {
    banner.style.backgroundImage = `url(${mod.banner})`;
  }
  
  const body = document.createElement('div');
  body.className = 'mod-card-body';
  
  const name = document.createElement('div');
  name.className = 'mod-card-name';
  name.textContent = mod.name;
  
  const meta = document.createElement('div');
  meta.className = 'mod-card-meta';
  
  const subs = document.createElement('span');
  subs.className = 'mod-card-subs';
  subs.innerHTML = `
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
    ${formatNumber(mod.subs || 0)}
  `;
  
  meta.appendChild(subs);
  
  const arrow = document.createElement('div');
  arrow.className = 'mod-card-arrow';
  arrow.innerHTML = '→';
  
  body.appendChild(name);
  body.appendChild(meta);
  card.appendChild(banner);
  card.appendChild(body);
  card.appendChild(arrow);
  
  return card;
}

/**
 * Show hub view
 */
function showHub() {
  document.getElementById('view-hub').classList.add('active');
  document.getElementById('view-form').classList.remove('active');
  currentMod = null;
  
  // Update URL
  window.history.pushState({}, '', window.location.pathname);
}

/**
 * Show form view for selected mod
 */
function showForm(mod) {
  currentMod = mod;
  document.getElementById('view-hub').classList.remove('active');
  document.getElementById('view-form').classList.add('active');
  
  // Update mod header
  const banner = document.getElementById('form-mod-banner');
  if (mod.banner) {
    banner.style.backgroundImage = `url(${mod.banner})`;
  } else {
    banner.style.backgroundImage = 'none';
  }
  
  document.getElementById('form-mod-name').textContent = mod.name;
  document.getElementById('form-mod-steam').href = mod.steam_url;
  document.getElementById('form-mod-github').href = mod.repo_url;
  
  // Update topbar subtitle
  document.getElementById('topbar-sub').textContent = mod.name;
  
  // Render tabs
  renderTabs();
  
  // Render fields for current tab
  renderFields();
  
  // Setup submit buttons
  setupSubmitButtons();
  
  // Update URL
  const repoMatch = mod.repo_url.match(/github\.com\/[^\/]+\/([^\/]+)/);
  if (repoMatch) {
    window.history.pushState({}, '', `?repo=${repoMatch[1]}`);
  }
}

/**
 * Render tabs (Bug / Feature)
 */
function renderTabs() {
  const tabsMount = document.getElementById('tabs-mount');
  tabsMount.innerHTML = '';
  
  Object.entries(CONFIG.issueTypes).forEach(([typeKey, typeConfig]) => {
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.dataset.type = typeKey;
    tab.textContent = typeConfig.label;
    tab.onclick = () => switchTab(typeKey);
    
    if (typeKey === currentTab) {
      tab.classList.add('active');
    }
    
    tabsMount.appendChild(tab);
  });
}

/**
 * Switch to a different tab
 */
function switchTab(typeKey) {
  currentTab = typeKey;
  document.querySelectorAll('#tabs-mount .tab').forEach(t =>
    t.classList.toggle('active', t.dataset.type === typeKey)
  );
  renderFields();
}

/**
 * Render form fields for current tab
 */
function renderFields() {
  const fieldsMount = document.getElementById('fields-mount');
  const issueTypeConfig = CONFIG.issueTypes[currentTab];
  
  // Build form using FormBuilder
  fieldsMount.innerHTML = '';
  
  issueTypeConfig.fields.forEach(fieldConfig => {
    const fieldGroup = FormBuilder.buildField(fieldConfig);
    fieldsMount.appendChild(fieldGroup);
  });
  
  // Initialize validation
  const form = document.getElementById('issue-form');
  FormValidator.initValidation(form);
  
  // Disable both submit buttons initially
  const githubBtn = document.getElementById('btn-github-submit');
  const steamBtn = document.getElementById('btn-steam-submit');
  if (githubBtn) {
    githubBtn.disabled = true;
    githubBtn.classList.remove('enabled');
  }
  if (steamBtn) {
    steamBtn.disabled = true;
    steamBtn.classList.remove('enabled');
  }
}

/**
 * Setup submit button handlers
 */
function setupSubmitButtons() {
  const githubBtn = document.getElementById('btn-github-submit');
  const steamBtn = document.getElementById('btn-steam-submit');
  
  githubBtn.onclick = submitViaGitHub;
  steamBtn.onclick = handleSteamSubmit;
}

/**
 * Submit via GitHub (direct redirect)
 */
function submitViaGitHub() {
  if (!currentMod) return;
  
  const form = document.getElementById('issue-form');
  if (!FormValidator.validateForm(form)) {
    showToast('Please fill in all required fields', true);
    return;
  }
  
  const data = FormHandler.getFormData(form);
  const issueTypeConfig = CONFIG.issueTypes[currentTab];
  const { owner, repo } = parseRepoUrl(currentMod.repo_url);
  
  const prefix = currentTab === 'bug' ? 'Bug' : 'Feature';
  const title = `[${prefix}] ${data.title}`;
  const body = buildIssueBody(data, issueTypeConfig, false);
  
  const params = new URLSearchParams({
    title: title,
    body: body,
    labels: issueTypeConfig.githubLabel,
  });
  
  window.open(`https://github.com/${owner}/${repo}/issues/new?${params}`, '_blank');
  showToast('Opened GitHub — review and submit your issue there!');
}

/**
 * Handle Steam submission
 */
async function handleSteamSubmit() {
  // If not logged in, start Steam login flow
  if (!steamState.token) {
    if (!CONFIG.worker?.url) {
      showToast('Steam login is not configured for this tracker.', true);
      return;
    }
    
    // Validate form before redirecting
    const form = document.getElementById('issue-form');
    if (!FormValidator.validateForm(form)) {
      showToast('Please fill in all required fields', true);
      return;
    }
    
    // Save form state before redirect
    saveFormState();
    
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `${CONFIG.worker.url}/auth/steam?return_url=${returnUrl}`;
    return;
  }
  
  // Validate form
  const form = document.getElementById('issue-form');
  if (!FormValidator.validateForm(form)) {
    showToast('Please fill in all required fields', true);
    return;
  }
  
  const data = FormHandler.getFormData(form);
  const issueTypeConfig = CONFIG.issueTypes[currentTab];
  const { owner, repo } = parseRepoUrl(currentMod.repo_url);
  
  const prefix = currentTab === 'bug' ? 'Bug' : 'Feature';
  const title = `[${prefix}] ${data.title}`;
  const body = buildIssueBody(data, issueTypeConfig, true);
  
  await submitViaSteam(title, body, issueTypeConfig.githubLabel, repo);
}

/**
 * Submit issue via Steam/Worker
 */
async function submitViaSteam(title, body, label, repo) {
  const btn = document.getElementById('btn-steam-submit');
  const btnLabel = document.getElementById('steam-btn-label');
  const originalText = btnLabel.textContent;
  
  try {
    btn.disabled = true;
    btnLabel.textContent = 'Submitting...';
    
    // Comprehensive debug logging
    console.group('🔍 Steam Submission Debug');
    console.log('Steam State:', {
      username: steamState.username,
      steamId: steamState.steamId,
      tokenLength: steamState.token?.length,
      tokenPreview: steamState.token?.substring(0, 10) + '...'
    });
    console.log('Payload:', {
      title,
      bodyLength: body.length,
      labels: [label],
      repo,
      hasSessionToken: !!steamState.token,
      hasSteamId: !!steamState.steamId,
      hasSteamName: !!steamState.username
    });
    console.log('Worker URL:', CONFIG.worker.url);
    console.groupEnd();
    
    const payload = {
      title,
      body,
      labels: [label],
      repo,
      session_token: steamState.token,
      steam_id: steamState.steamId,
      steam_name: steamState.username,
      steam_avatar: steamState.avatar,
    };
    
    console.log('📤 Sending request...');
    
    const resp = await fetch(`${CONFIG.worker.url}/api/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    console.log('📥 Response:', {
      status: resp.status,
      statusText: resp.statusText,
      ok: resp.ok
    });
    
    if (!resp.ok) {
      const contentType = resp.headers.get('content-type');
      let err;
      
      if (contentType && contentType.includes('application/json')) {
        err = await resp.json();
      } else {
        const text = await resp.text();
        err = { error: text || 'Unknown error' };
      }
      
      console.error('❌ Error Response:', err);
      
      // Handle 401/403 - session expired or invalid
      if (resp.status === 401 || resp.status === 403) {
        console.warn('Session invalid. Details:', {
          status: resp.status,
          error: err.error || err.message,
          currentSteamId: steamState.steamId,
          currentTokenLength: steamState.token?.length
        });
        
        // Clear invalid session
        steamState = { username: null, steamId: null, token: null };
        localStorage.removeItem('cfi_steam');
        updateSteamUI();
        
        // Save form and retry login
        saveFormState();
        
        const errorMsg = err.error || err.message || 'Session expired';
        showToast(`Authentication failed: ${errorMsg}. Please sign in again.`, true);
        
        setTimeout(() => {
          const returnUrl = encodeURIComponent(window.location.href);
          window.location.href = `${CONFIG.worker.url}/auth/steam?return_url=${returnUrl}`;
        }, 2500);
        return;
      }
      
      throw new Error(err.message || err.error || `HTTP ${resp.status}: ${resp.statusText}`);
    }
    
    const result = await resp.json();
    console.log('✅ Success:', result);
    showToast(`Issue #${result.issue_number} created successfully!`);
    
    document.getElementById('issue-form').reset();
    FormValidator.clearValidation(document.getElementById('issue-form'));
    
    // Open the created issue in new tab
    if (result.issue_url) {
      setTimeout(() => {
        window.open(result.issue_url, '_blank');
      }, 1000);
    }
    
  } catch (err) {
    console.error('Submit error:', err);
    showToast(`Failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btnLabel.textContent = originalText;
  }
}

/**
 * Build issue body from form data
 */
function buildIssueBody(data, issueTypeConfig, isSteam) {
  const lines = [];
  
  if (isSteam && steamState.username) {
    lines.push(`> **Submitted by Steam user:** [${steamState.username}](https://steamcommunity.com/profiles/${steamState.steamId}) (ID: \`${steamState.steamId}\`)`);
    if (steamState.avatar) {
      lines.push(`> <img src="${steamState.avatar}" width="48" height="48" alt="${steamState.username}"/>`);
    }
  } else {
    lines.push(`> **Submitted via:** Issue Tracker`);
  }
  lines.push(`> **Mod:** [${currentMod.name}](${currentMod.steam_url})`);
  lines.push('');
  
  issueTypeConfig.fields.forEach(field => {
    if (field.id === 'title' || !data[field.id]) return;
    
    lines.push(`### ${field.label}`);
    lines.push(data[field.id]);
    lines.push('');
  });
  
  lines.push('---');
  lines.push(`*Submitted via [Issue Tracker](${window.location.href})*`);
  
  return lines.join('\n');
}

/**
 * Check for Steam callback
 */
function checkSteamCallback() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('steam_auth') === 'success') {
    steamState = {
      username: params.get('steam_name') || 'Steam User',
      steamId: params.get('steam_id'),
      avatar: params.get('steam_avatar') || '',
      token: params.get('session_token'),
    };
    saveSteam();
    
    // Clean auth params, keep ?repo=
    const repo = params.get('repo');
    window.history.replaceState({}, '', window.location.pathname + (repo ? `?repo=${repo}` : ''));
    showToast(`Signed in as Steam user: ${steamState.username}`);
    updateSteamUI();
    
    // Restore form state after successful login
    restoreFormState();
  } else if (params.get('steam_auth') === 'error') {
    const repo = params.get('repo');
    window.history.replaceState({}, '', window.location.pathname + (repo ? `?repo=${repo}` : ''));
    showToast('Steam authentication failed.', true);
    localStorage.removeItem('cfi_form_state'); // Clear saved form on error
  }
}

/**
 * Restore Steam state from localStorage
 */
function restoreSteam() {
  try {
    const s = localStorage.getItem('cfi_steam');
    if (s) steamState = JSON.parse(s);
  } catch (e) {}
}

/**
 * Save Steam state to localStorage
 */
function saveSteam() {
  localStorage.setItem('cfi_steam', JSON.stringify(steamState));
}

/**
 * Save form state before redirect
 */
function saveFormState() {
  const form = document.getElementById('issue-form');
  if (!form || !currentMod) return;
  
  const formData = FormHandler.getFormData(form);
  const formState = {
    modRepo: currentMod.repo_url,
    tab: currentTab,
    data: formData,
    timestamp: Date.now()
  };
  localStorage.setItem('cfi_form_state', JSON.stringify(formState));
}

/**
 * Restore form state after redirect
 */
function restoreFormState() {
  try {
    const saved = localStorage.getItem('cfi_form_state');
    if (!saved) return;
    
    const formState = JSON.parse(saved);
    // Only restore if less than 10 minutes old
    if (Date.now() - formState.timestamp > 600000) {
      localStorage.removeItem('cfi_form_state');
      return;
    }
    
    // Find the mod
    const mod = mods.find(m => m.repo_url === formState.modRepo);
    if (!mod) {
      localStorage.removeItem('cfi_form_state');
      return;
    }
    
    // Show the form for this mod
    showForm(mod);
    
    // Switch to saved tab
    if (formState.tab) {
      currentTab = formState.tab;
      document.querySelectorAll('#tabs-mount .tab').forEach(t =>
        t.classList.toggle('active', t.dataset.type === formState.tab)
      );
    }
    
    // Restore form data
    setTimeout(() => {
      const form = document.getElementById('issue-form');
      if (form && formState.data) {
        Object.entries(formState.data).forEach(([key, value]) => {
          const input = form.querySelector(`[name="${key}"]`);
          if (input) {
            input.value = value;
          }
        });
        // Re-validate to enable submit button if form is complete
        FormValidator.initValidation(form);
      }
      localStorage.removeItem('cfi_form_state');
    }, 100);
    
  } catch (e) {
    console.error('Failed to restore form state:', e);
    localStorage.removeItem('cfi_form_state');
  }
}

/**
 * Sign out of Steam
 */
function signOutSteam() {
  steamState = { username: null, steamId: null, avatar: null, token: null };
  localStorage.removeItem('cfi_steam');
  updateSteamUI();
  showToast('Signed out of Steam.');
}

/**
 * Update Steam UI based on login state
 */
function updateSteamUI() {
  const badge = document.getElementById('steam-user-badge');
  const nameEl = document.getElementById('steam-user-name');
  const btnLabel = document.getElementById('steam-btn-label');
  const hint = document.getElementById('steam-submit-hint');
  
  if (!badge) return;
  
  if (steamState.token) {
    badge.classList.remove('hidden');
    nameEl.textContent = steamState.username;
    btnLabel.textContent = 'Submit via Steam';
    hint.textContent = `Issue will be created on your behalf as "${steamState.username}"`;
  } else {
    badge.classList.add('hidden');
    btnLabel.textContent = 'Sign in with Steam to submit';
    hint.textContent = 'No GitHub account? Submit via your Steam identity instead';
  }
}

/**
 * Show toast notification
 */
let toastTimer;
function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${isError ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = 'toast', 4000);
}

/**
 * Parse GitHub repo URL
 */
function parseRepoUrl(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  return m ? { owner: m[1], repo: m[2] } : { owner: CONFIG.defaultOwner, repo: 'unknown' };
}

/**
 * Format number (1000 -> 1K, etc)
 */
function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}
