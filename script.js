fetch('mods.json')
  .then(response => response.json())
  .then(mods => {
    const gallery = document.getElementById('modGallery');
    mods.forEach(mod => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <img src="${mod.image}" alt="${mod.name}">
        <h3>${mod.name}</h3>
        <a href="${mod.link}" target="_blank">View on Steam</a>
      `;
      gallery.appendChild(card);
    });
  });
