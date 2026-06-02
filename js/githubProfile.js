const FALLBACK_PROFILE = {
  name:       'Chuckleberry Finn',
  login:      'Chuckleberry-Finn',
  bio:        'Project Zomboid modder',
  avatar_url: 'https://avatars.githubusercontent.com/u/50658419?v=4&size=200',
  html_url:   'https://github.com/Chuckleberry-Finn',
  followers:  50,
};

function renderProfile(user) {
  const el = document.getElementById('github-profile');
  if (!el) return;

  const fmt = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : n;
  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  el.innerHTML = `
    <div class="github-profile">
      <img src="${user.avatar_url}" alt="${esc(user.login)}" class="github-profile-avatar" loading="lazy">
      <h2 class="github-profile-name">${esc(user.name || user.login)}</h2>
      <p class="github-profile-bio">${esc(user.bio || '')}</p>
      <p class="github-profile-followers">${fmt(user.followers)} followers</p>
      <a href="${user.html_url}" target="_blank" rel="noopener" class="github-profile-link">GitHub →</a>
    </div>
  `;
}

const controller = new AbortController();
const timeout    = setTimeout(() => controller.abort(), 10000);

fetch('https://api.github.com/users/Chuckleberry-Finn', {
  signal:  controller.signal,
  headers: { 'Accept': 'application/vnd.github.v3+json' },
})
  .then(r => {
    clearTimeout(timeout);
    return r.ok ? r.json() : FALLBACK_PROFILE;
  })
  .then(renderProfile)
  .catch(() => {
    clearTimeout(timeout);
    renderProfile(FALLBACK_PROFILE);
  });
