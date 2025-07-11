fetch('mods.json')
  .then(res => res.json())
  .then(mods => {
    const container = document.getElementById('modStack');
    mods.forEach(mod => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.backgroundImage = `url(${mod.banner})`;

      card.innerHTML = `
        <div class="info-panel">
          <strong>${mod.name}</strong><br>
          Subs: ${mod.subs}<br>
          <a href="${mod.steam_url}" target="_blank">Steam</a> ·
          <a href="${mod.repo_url}" target="_blank">Repo</a>
        </div>
      `;

      container.appendChild(card);
    });
  });

document.getElementById('toggleSpread').addEventListener('click', () => {
  document.getElementById('modStack').classList.toggle('spread');
});