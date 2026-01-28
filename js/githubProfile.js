fetch('https://api.github.com/users/Chuckleberry-Finn')
  .then(r => r.ok ? r.json() : Promise.reject('Failed'))
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
  .catch(() => {
    const el = document.getElementById('github-profile');
    if (el) el.innerHTML = '<p style="color:#ff9500;text-align:center;font-size:0.85em;">Could not load profile</p>';
  });
