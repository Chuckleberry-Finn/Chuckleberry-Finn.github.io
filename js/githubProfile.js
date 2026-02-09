// Fallback static profile data (used when GitHub API is unavailable/rate-limited)
const fallbackProfile = {
  name: 'Chuckleberry Finn',
  login: 'Chuckleberry-Finn',
  bio: 'Project Zomboid modder',
  avatar_url: 'https://avatars.githubusercontent.com/u/50658419?v=4',
  html_url: 'https://github.com/Chuckleberry-Finn',
  followers: 50 // Approximate - will be updated if API works
};

// Try to fetch from GitHub API with timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

fetch('https://api.github.com/users/Chuckleberry-Finn', { 
  signal: controller.signal,
  headers: {
    'Accept': 'application/vnd.github.v3+json'
  }
})
  .then(r => {
    clearTimeout(timeoutId);
    if (r.ok) return r.json();
    // If rate limited or other error, use fallback
    console.warn('GitHub API returned status:', r.status);
    return fallbackProfile;
  })
  .then(user => {
    const el = document.getElementById('github-profile');
    if (!el) return;
    
    const fmt = n => n >= 1000 ? (n/1000).toFixed(1).replace(/\.0$/,'') + 'K' : n;
    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    
    el.innerHTML = `
      <div style="text-align:center;color:#f5e6c8;">
        <img src="${user.avatar_url}" alt="${user.login}" style="width:70px;border-radius:50%;border:2px solid #ffbf47;" loading="lazy"/>
        <h2 style="margin:0.4em 0 0.2em;font-size:1.1em;color:#ffbf47;">${esc(user.name || user.login)}</h2>
        <p style="margin:0;font-size:0.8em;opacity:0.8;line-height:1.3;">${esc(user.bio || '')}</p>
        <p style="margin:0.5em 0;font-size:0.7em;opacity:0.5;">${fmt(user.followers)} followers</p>
        <a href="${user.html_url}" target="_blank" rel="noopener" style="color:#ffbf47;font-size:0.8em;text-decoration:none;">GitHub →</a>
      </div>
    `;
  })
  .catch(err => {
    clearTimeout(timeoutId);
    console.warn('GitHub API fetch failed, using fallback profile:', err.message);
    
    // Use fallback profile instead of error message
    const el = document.getElementById('github-profile');
    if (!el) return;
    
    const fmt = n => n >= 1000 ? (n/1000).toFixed(1).replace(/\.0$/,'') + 'K' : n;
    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    
    el.innerHTML = `
      <div style="text-align:center;color:#f5e6c8;">
        <img src="${fallbackProfile.avatar_url}" alt="${fallbackProfile.login}" style="width:70px;border-radius:50%;border:2px solid #ffbf47;" loading="lazy"/>
        <h2 style="margin:0.4em 0 0.2em;font-size:1.1em;color:#ffbf47;">${esc(fallbackProfile.name || fallbackProfile.login)}</h2>
        <p style="margin:0;font-size:0.8em;opacity:0.8;line-height:1.3;">${esc(fallbackProfile.bio || '')}</p>
        <p style="margin:0.5em 0;font-size:0.7em;opacity:0.5;">${fmt(fallbackProfile.followers)} followers</p>
        <a href="${fallbackProfile.html_url}" target="_blank" rel="noopener" style="color:#ffbf47;font-size:0.8em;text-decoration:none;">GitHub →</a>
      </div>
    `;
  });
