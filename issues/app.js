/**
 * ============================================================
 *  MAIN APP — Coordinates all modules
 * ============================================================
 *  This is the entry point that initializes the app.
 * ============================================================
 */

let mods = [];
let selectedMod = null;
let currentIssueType = null;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  await loadMods();
  handleSteamAuth();
});

/**
 * Initialize UI elements
 */
function initUI() {
  // Set hub title and subtitle from config
  document.getElementById('hub-title').textContent = CONFIG.hub.title;
  document.getElementById('hub-subtitle').textContent = CONFIG.hub.subtitle;

  // Setup Steam login button
  const loginBtn = document.getElementById('steamLoginBtn');
  loginBtn.addEventListener('click', () => {
    const returnUrl = window.location.href.split('?')[0];
    window.location.href = `${CONFIG.worker.url}/auth/steam?return_url=${encodeURIComponent(returnUrl)}`;
  });

  // Setup logout button
  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('steam_id');
    localStorage.removeItem('steam_name');
    localStorage.removeItem('session_token');
    window.location.href = window.location.href.split('?')[0];
  });

  // Setup mod selector
  const modSelect = document.getElementById('modSelect');
  modSelect.addEventListener('change', (e) => {
    const modIndex = parseInt(e.target.value);
    if (!isNaN(modIndex) && mods[modIndex]) {
      selectedMod = mods[modIndex];
      showIssueTypeSelection();
    }
  });
}

/**
 * Load mods from JSON
 */
async function loadMods() {
  try {
    const response = await fetch(CONFIG.modsJsonPath);
    mods = await response.json();
    populateModSelector();
  } catch (error) {
    console.error('Failed to load mods:', error);
    document.getElementById('modSelect').innerHTML = '<option>Error loading mods</option>';
  }
}

/**
 * Populate mod selector dropdown
 */
function populateModSelector() {
  const select = document.getElementById('modSelect');
  select.innerHTML = '<option value="">-- Select a mod --</option>';
  
  mods.forEach((mod, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = mod.name;
    select.appendChild(option);
  });
}

/**
 * Handle Steam authentication callback
 */
function handleSteamAuth() {
  const params = new URLSearchParams(window.location.search);
  const authStatus = params.get('steam_auth');

  if (authStatus === 'success') {
    const steamId = params.get('steam_id');
    const steamName = params.get('steam_name');
    const token = params.get('session_token');

    // Store in localStorage
    localStorage.setItem('steam_id', steamId);
    localStorage.setItem('steam_name', steamName);
    localStorage.setItem('session_token', token);

    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Check if user is logged in
  const steamName = localStorage.getItem('steam_name');
  if (steamName) {
    document.getElementById('steamLoginBtn').style.display = 'none';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userName').textContent = steamName;
  }
}

/**
 * Show issue type selection buttons
 */
function showIssueTypeSelection() {
  const issueTypeSection = document.getElementById('issueTypeSection');
  const buttonsContainer = document.getElementById('issueTypeButtons');
  
  // Clear existing buttons
  buttonsContainer.innerHTML = '';

  // Create button for each issue type
  Object.entries(CONFIG.issueTypes).forEach(([typeKey, typeConfig]) => {
    const button = document.createElement('button');
    button.className = 'issue-type-btn';
    button.textContent = typeConfig.label;
    button.onclick = () => showForm(typeKey, typeConfig);
    buttonsContainer.appendChild(button);
  });

  issueTypeSection.style.display = 'block';
  document.getElementById('formContainer').style.display = 'none';
}

/**
 * Show form for selected issue type
 * @param {string} issueTypeName
 * @param {Object} issueTypeConfig
 */
function showForm(issueTypeName, issueTypeConfig) {
  currentIssueType = issueTypeName;

  // Check if user is logged in
  if (!localStorage.getItem('session_token')) {
    FormHandler.showStatus('Please sign in with Steam before submitting an issue', 'error');
    return;
  }

  // Build form
  const form = FormBuilder.buildForm(issueTypeConfig, issueTypeName);
  
  // Clear container and add form
  const container = document.getElementById('formContainer');
  container.innerHTML = '';
  container.appendChild(form);
  container.style.display = 'block';

  // Hide issue type selection
  document.getElementById('issueTypeSection').style.display = 'none';

  // Initialize validation
  FormValidator.initValidation(form);

  // Initialize submission handler
  FormHandler.initSubmission(form, selectedMod, issueTypeConfig);
}
