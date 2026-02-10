/**
 * ============================================================
 *  MAIN APP — Coordinates all modules
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

// Cache for GitHub stats
let githubStatsCache = {};

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
  const workshopIdParam = params.get('workshop_id');
  
  if (repoParam && mods.length > 0) {
    // Explicit repo parameter takes priority
    const mod = mods.find(m => m.repo_url.includes(`/${repoParam}`));
    if (mod) {
      showForm(mod);
    }
  } else if (workshopIdParam && mods.length > 0) {
    // Workshop ID parameter (works even through Steam's link filter)
    const mod = mods.find(m => m.steam_url && m.steam_url.includes(`id=${workshopIdParam}`));
    if (mod) {
      console.log('Auto-detected mod from workshop_id parameter:', mod.name);
      showForm(mod);
    }
  } else {
    // Try to detect from referer (Steam Workshop link)
    // This may not work if link goes through Steam's filter
    const detectedMod = detectModFromReferer();
    if (detectedMod) {
      showForm(detectedMod);
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
    
    // Fetch GitHub stats for all repos
    await fetchGitHubStats();
    
    loadingMsg.style.display = 'none';
    renderModGrid();
  } catch (error) {
    console.error('Failed to load mods:', error);
    loadingMsg.textContent = 'Error loading projects. Please refresh the page.';
  }
}

/**
 * Fetch GitHub stats for all mods
 */
async function fetchGitHubStats() {
  // Try to load from cache (valid for 30 minutes)
  const cacheKey = 'github_stats_cache';
  const cacheTimeKey = 'github_stats_cache_time';
  const cacheMaxAge = 30 * 60 * 1000; // 30 minutes
  
  try {
    const cachedData = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(cacheTimeKey);
    
    if (cachedData && cacheTime) {
      const age = Date.now() - parseInt(cacheTime);
      if (age < cacheMaxAge) {
        console.log('Using cached GitHub stats (age:', Math.round(age / 1000 / 60), 'minutes)');
        githubStatsCache = JSON.parse(cachedData);
        return;
      } else {
        console.log('Cache expired, fetching fresh data');
      }
    }
  } catch (e) {
    console.warn('Cache read failed:', e);
  }
  
  // Fetch fresh data
  console.log('Fetching GitHub stats for', mods.length, 'repositories...');
  const fetchPromises = mods.map(async (mod) => {
    const { owner, repo } = parseRepoUrl(mod.repo_url);
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (response.ok) {
        const data = await response.json();
        githubStatsCache[mod.repo_url] = {
          openIssues: data.open_issues_count,
          stars: data.stargazers_count,
          forks: data.forks_count,
          updatedAt: data.updated_at
        };
      } else if (response.status === 403) {
        console.warn(`GitHub API rate limit exceeded for ${owner}/${repo}`);
      } else {
        console.warn(`Failed to fetch stats for ${owner}/${repo}: ${response.status}`);
      }
    } catch (error) {
      console.warn(`Failed to fetch stats for ${owner}/${repo}:`, error);
    }
  });
  
  await Promise.all(fetchPromises);
  
  // Save to cache if we got any data
  if (Object.keys(githubStatsCache).length > 0) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(githubStatsCache));
      localStorage.setItem(cacheTimeKey, Date.now().toString());
      console.log('GitHub stats cached successfully');
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
  }
  
  // Log rate limit status
  fetch('https://api.github.com/rate_limit')
    .then(r => r.json())
    .then(data => {
      console.log('GitHub API Rate Limit - Remaining:', data.rate.remaining, '/', data.rate.limit);
      if (data.rate.remaining < 10) {
        console.warn('⚠️ GitHub API rate limit low! Resets at', new Date(data.rate.reset * 1000).toLocaleTimeString());
      }
    })
    .catch(() => {});
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
  
  // Only show subscriber count if available
  if (mod.subs !== undefined) {
    const subs = document.createElement('span');
    subs.className = 'mod-card-subs';
    subs.innerHTML = `
      <svg viewBox="0 0 256 259" fill="currentColor">
        <path d="M127.778 0C70.366 0 22.47 42.714 14.107 98.13L68.45 119.82c5.52-3.77 12.176-5.978 19.35-5.978.684 0 1.362.022 2.033.063l24.375-35.343v-.5c0-26.125 21.25-47.375 47.375-47.375 26.124 0 47.374 21.25 47.374 47.375 0 26.124-21.25 47.374-47.374 47.374h-1.093l-34.719 24.844c0 .53.016 1.054.016 1.584 0 19.007-15.46 34.467-34.468 34.467-16.758 0-30.747-12.028-33.875-27.968L9.596 141.03C22.03 201.394 70.84 248.79 129.778 248.79c69.036 0 125-55.964 125-125s-55.964-125-125-125zm-67.53 176.03l-13.25-5.47c2.344 4.874 6.406 8.936 11.75 11.094 11.53 4.687 24.81-.906 29.5-12.468 2.28-5.594 2.28-11.688 0-17.25-2.282-5.563-6.72-9.875-12.313-12.156-5.53-2.28-11.47-2.25-16.78-.155l13.718 5.686c8.5 3.5 12.53 13.28 9.03 21.78-3.5 8.5-13.156 12.437-21.656 8.938z"/>
      </svg>
      ${formatNumber(mod.subs)}
    `;
    meta.appendChild(subs);
  }
  
  // Add GitHub stats if available
  const stats = githubStatsCache[mod.repo_url];
  if (stats && stats.openIssues !== undefined) {
    const issues = document.createElement('span');
    issues.className = 'mod-card-issues';
    issues.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"/>
      </svg>
      ${stats.openIssues} open
    `;
    meta.appendChild(issues);
  }
  
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
  
  // Update topbar
  document.getElementById('topbar-sub').textContent = 'Report bugs & request features';
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
    
    const hasSavedData = tabFormData[typeKey] && Object.keys(tabFormData[typeKey]).length > 0;
    
    tab.innerHTML = typeConfig.label;
    
    if (hasSavedData && typeKey !== currentTab) {
      const dot = document.createElement('span');
      dot.className = 'tab-indicator';
      dot.title = 'This tab has saved data';
      tab.appendChild(dot);
    }
    
    tab.onclick = () => switchTab(typeKey);
    
    if (typeKey === currentTab) {
      tab.classList.add('active');
    }
    
    tabsMount.appendChild(tab);
  });
}

let tabFormData = {
  bug: {},
  feature: {}
};

/**
 * Switch to a different tab
 */
function switchTab(typeKey) {
  if (currentTab === typeKey) return;
  
  if (currentTab && hasFormData()) {
    saveCurrentTabData();
  }
  
  currentTab = typeKey;
  
  renderTabs();
  
  renderFields();
}

function hasFormData() {
  const form = document.getElementById('issue-form');
  if (!form) return false;
  
  const inputs = form.querySelectorAll('input, textarea, select');
  for (let input of inputs) {
    if (input.value.trim()) {
      return true;
    }
  }
  return false;
}

function saveCurrentTabData() {
  const form = document.getElementById('issue-form');
  if (!form) return;
  
  const data = {};
  const inputs = form.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    if (input.name) {
      data[input.name] = input.value;
    }
  });
  
  tabFormData[currentTab] = data;
}

function restoreTabData() {
  const savedData = tabFormData[currentTab];
  if (!savedData || Object.keys(savedData).length === 0) return;
  
  const form = document.getElementById('issue-form');
  if (!form) return;
  
  setTimeout(() => {
    Object.keys(savedData).forEach(fieldName => {
      const input = form.querySelector(`[name="${fieldName}"]`);
      if (input) {
        input.value = savedData[fieldName];
        // Trigger input event to update validation
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }, 50);
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
  FormValidator.initValidation(form, issueTypeConfig.fields);
  
  if (currentTab === 'bug') {
    FormValidator.showQualityIndicator();
  } else {
    FormValidator.hideQualityIndicator();
  }
  
  restoreTabData();
  
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
  
  // Check if there's a file attachment
  const fileInput = document.getElementById('f-attachment');
  const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
  
  let body = buildIssueBody(data, issueTypeConfig, false);
  
  if (hasFile) {
    const file = fileInput.files[0];
    body += `\n\n---\n**Note:** User has a file attachment (${file.name}, ${(file.size / 1024).toFixed(1)}KB) that they will need to drag-and-drop into this issue after creation, as GitHub's issue creation URL doesn't support file uploads.`;
  }
  
  const params = new URLSearchParams({
    title: title,
    body: body,
    labels: issueTypeConfig.githubLabel
  });
  
  const url = `https://github.com/${owner}/${repo}/issues/new?${params.toString()}`;
  window.open(url, '_blank');
  
  if (hasFile) {
    showToast('Issue form opened! Don\'t forget to drag-and-drop your attachment into the issue.', false);
  }
}

/**
 * Handle Steam submit button click
 */
function handleSteamSubmit() {
  if (!steamState.token) {
    // Save form state before redirect
    saveFormState();
    
    // Redirect to Steam login
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `${CONFIG.worker.url}/auth/steam?return_url=${returnUrl}`;
    return;
  }
  
  submitViaSteam();
}

/**
 * Submit via Steam (POST to worker)
 */
async function submitViaSteam() {
  if (!currentMod) return;
  
  const form = document.getElementById('issue-form');
  if (!FormValidator.validateForm(form)) {
    showToast('Please fill in all required fields', true);
    return;
  }
  
  const btn = document.getElementById('btn-steam-submit');
  const btnLabel = document.getElementById('steam-btn-label');
  const originalText = btnLabel.textContent;
  
  btn.disabled = true;
  btnLabel.textContent = 'Submitting...';
  
  try {
    const data = FormHandler.getFormData(form);
    const issueTypeConfig = CONFIG.issueTypes[currentTab];
    const { owner, repo } = parseRepoUrl(currentMod.repo_url);
    
    const prefix = currentTab === 'bug' ? 'Bug' : 'Feature';
    const title = `[${prefix}] ${data.title}`;
    let body = buildIssueBody(data, issueTypeConfig, true);
    
    // Handle file attachment
    const fileInput = document.getElementById('f-attachment');
    let fileData = null;
    
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      btnLabel.textContent = 'Uploading file...';
      
      try {
        // Convert file to base64
        const base64 = await fileToBase64(file);
        fileData = {
          name: file.name,
          size: file.size,
          type: file.type,
          content: base64
        };
        
        body += `\n\n### Attachment\n**File:** ${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
        btnLabel.textContent = 'Creating issue...';
      } catch (err) {
        console.error('File upload error:', err);
        showToast('Failed to process file attachment', true);
        btn.disabled = false;
        btnLabel.textContent = originalText;
        return;
      }
    }
    
    console.log('Submitting to worker:', {
      url: `${CONFIG.worker.url}/api/issues`,
      repo: repo,
      hasToken: !!steamState.token,
      hasFile: !!fileData
    });
    
    const resp = await fetch(`${CONFIG.worker.url}/api/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        labels: [issueTypeConfig.githubLabel],
        repo: repo,
        session_token: steamState.token,
        steam_id: steamState.steamId,
        steam_name: steamState.username,
        steam_avatar: steamState.avatar,
        file_attachment: fileData
      })
    });
    
    console.log('Worker response status:', resp.status);
    
    if (!resp.ok) {
      let err;
      try {
        err = await resp.json();
      } catch (e) {
        err = { message: await resp.text() };
      }
      
      console.error('Worker error:', err);
      
      // Check if this is an auth error
      if (resp.status === 401 || resp.status === 403) {
        console.log('Auth error detected:', {
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
    
    // Clear form
    form.reset();
    FormValidator.clearValidation(form);
    
    // Clear file input display
    const fileInfo = document.getElementById('f-attachment-info');
    if (fileInfo) fileInfo.textContent = '';
    const fileLabel = document.querySelector('.file-input-text');
    if (fileLabel) fileLabel.textContent = 'Choose file...';
    
    // Open the created issue in new tab
    if (result.issue_url) {
      window.open(result.issue_url, '_blank');
    }
    
    // Return to hub after a short delay
    setTimeout(() => {
      showHub();
    }, 2000);
    
  } catch (err) {
    console.error('Submit error:', err);
    showToast(`Failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btnLabel.textContent = originalText;
  }
}

/**
 * Convert file to base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Build issue body from form data
 */
function buildIssueBody(data, issueTypeConfig, isSteam) {
  const lines = [];
  
  if (isSteam && steamState.username) {
    console.log('Building Steam issue body with:', {
      username: steamState.username,
      steamId: steamState.steamId,
      hasAvatar: !!steamState.avatar,
      avatarUrl: steamState.avatar
    });
    
    lines.push(`> **Submitted by Steam user:** [${steamState.username}](https://steamcommunity.com/profiles/${steamState.steamId}) (ID: \`${steamState.steamId}\`)`);
    if (steamState.avatar) {
      lines.push(`> <img src="${steamState.avatar}" width="48" height="48" alt="${steamState.username}"/>`);
      console.log('Avatar image tag added to issue body');
    } else {
      console.log('No avatar URL available, skipping image');
    }
  }
  lines.push(`> **Mod:** [${currentMod.name}](${currentMod.steam_url})`);
  lines.push('');
  
  issueTypeConfig.fields.forEach(field => {
    if (field.id === 'title' || !data[field.id]) return;
    
    lines.push(`### ${field.label}`);
    lines.push(data[field.id]);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Check for Steam callback
 */
function checkSteamCallback() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('steam_auth') === 'success') {
    const avatarParam = params.get('steam_avatar') || '';
    const decodedAvatar = avatarParam ? decodeURIComponent(avatarParam) : '';
    
    steamState = {
      username: params.get('steam_name') || 'Steam User',
      steamId: params.get('steam_id'),
      avatar: decodedAvatar,
      token: params.get('session_token'),
    };
    
    console.log('Steam auth successful:', {
      username: steamState.username,
      steamId: steamState.steamId,
      hasAvatar: !!steamState.avatar,
      avatarUrl: steamState.avatar
    });
    
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
 * Detect which mod to show based on referer (Steam Workshop link)
 */
function detectModFromReferer() {
  const referer = document.referrer;
  
  if (!referer) return null;
  
  // Check if referer is from Steam Workshop
  if (!referer.includes('steamcommunity.com')) return null;
  
  console.log('Detected Steam Workshop referer:', referer);
  
  // Extract Steam Workshop ID from referer
  // Format: https://steamcommunity.com/sharedfiles/filedetails/?id=2503622437
  const idMatch = referer.match(/[?&]id=(\d+)/);
  if (!idMatch) return null;
  
  const workshopId = idMatch[1];
  console.log('Workshop ID:', workshopId);
  
  // Find mod with matching Steam URL
  const mod = mods.find(m => m.steam_url && m.steam_url.includes(`id=${workshopId}`));
  
  if (mod) {
    console.log('Auto-detected mod from referer:', mod.name);
  } else {
    console.log('No matching mod found for Workshop ID:', workshopId);
  }
  
  return mod;
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
