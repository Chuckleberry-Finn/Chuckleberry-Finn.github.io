fetch('mods.json')
  .then(res => res.json())
  .then(mods => {
    const stack = document.getElementById('modStack');
    const modPreview = document.getElementById('modPreview');
    const modInfo = document.getElementById('modInfo');
    const previewPanel = document.querySelector('.mod-detail');
    const cards = [];
    const cardHeight = 128;
    const total = mods.length;
    const baseSpacing = 8;

    const shuffleSound = new Audio('sounds/shuffle.mp3');
    const selectSound = new Audio('sounds/select.mp3');


    let touchStartY = 0;

    stack.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      touchStartY = touch.clientY;
    });

    stack.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      const rect = stack.getBoundingClientRect();
      const y = touch.clientY - rect.top;
      hoveredIndex = getClosestCardIndex(y);
      updatePositions(y);
    });

    stack.addEventListener('touchend', (e) => {
      if (hoveredIndex >= 0 && hoveredIndex < mods.length) {
        const mod = mods[hoveredIndex];
        modPreview.src = mod.banner;
        modInfo.innerHTML = `
          <h3>${mod.name}</h3>
          <p><strong>Subscribers:</strong> ${mod.subs.toLocaleString()}</p>
          <p>
            <a href="${mod.steam_url}" target="_blank">Steam</a> ·
            <a href="${mod.repo_url}" target="_blank">Repo</a>
          </p>
        `;
        selectSound.play();
      }
    });



    let hoveredIndex = -1;
    let lastHovered = -1;


    mods.forEach((mod, index) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.backgroundImage = `url(${mod.banner})`;
      card.style.setProperty('--stack-index', index);
      stack.appendChild(card);
      cards.push(card);
    });


    const defaultMod = mods[0];
    modPreview.src = defaultMod.banner;
    modInfo.innerHTML = `
      <h3>${defaultMod.name}</h3>
      <p><strong>Subscribers:</strong> ${defaultMod.subs.toLocaleString()}</p>
      <p>
        <a href="${defaultMod.steam_url}" target="_blank">Steam</a> ·
        <a href="${defaultMod.repo_url}" target="_blank">Repo</a>
      </p>
    `;


    modPreview.onload = () => {
      matchStackHeight();
      updatePositions(null);
    };


    stack.addEventListener('click', () => {
      if (hoveredIndex >= 0 && hoveredIndex < mods.length) {
        selectSound.currentTime = 0;
        selectSound.play();
        const mod = mods[hoveredIndex];
        modPreview.src = mod.banner;
        modInfo.innerHTML = `
          <h3>${mod.name}</h3>
          <p><strong>Subscribers:</strong> ${mod.subs.toLocaleString()}</p>
          <p>
            <a href="${mod.steam_url}" target="_blank">Steam</a> ·
            <a href="${mod.repo_url}" target="_blank">Repo</a>
          </p>
        `;
      }
    });


    function getClosestCardIndex(mouseY) {
      let minDist = Infinity;
      let closest = -1;

      for (let i = 0; i < cards.length; i++) {
        const top = parseFloat(cards[i].style.top) || 0;
        const edgeY = top - 8;
        const dist = Math.abs(mouseY - edgeY);

        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }

      return closest;
    }


    function matchStackHeight() {
      const height = previewPanel.offsetHeight;
      stack.style.height = `${height}px`;
    }

    function updatePositions(mouseY = null) {
      const stackHeight = stack.offsetHeight;
      const spacing = Math.max(baseSpacing, (stackHeight - cardHeight) / (total - 1));
      const influenceRadius = stackHeight / 2;
      const positions = [];
      let closestIndex = -1;
      let closestDist = Infinity;

      for (let i = 0; i < total; i++) {
        const baseY = i * spacing;
        positions[i] = baseY;

        if (mouseY !== null) {
          const dist = Math.abs(mouseY - baseY);
          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = i;
          }
        }
      }

      if (mouseY !== null) {
        for (let i = 0; i < total; i++) {
          const dist = Math.abs(mouseY - positions[i]);
          const influence = Math.max(0, 1 - dist / influenceRadius);
          const boost = influence * 20;
          positions[i] += boost * (i - total / 2) * 0.2;
        }
      }

      for (let i = 0; i < total; i++) {
        const clampedTop = Math.max(0, Math.min(stackHeight - cardHeight, positions[i]));
        cards[i].style.top = `${clampedTop}px`;
        cards[i].style.transform = 'translateX(0) rotate(0deg) scale(1)';
      }

      if (closestIndex !== -1) {
        const card = cards[closestIndex];
        card.style.transform = 'translateX(64px) translateY(-64px) rotate(30deg) scale(1.05)';
        if (closestIndex !== -1 && closestIndex !== lastHovered) {
          shuffleSound.currentTime = 0;
          shuffleSound.play();
          lastHovered = closestIndex;
        }
        hoveredIndex = closestIndex;
      }
    }

    stack.addEventListener('mousemove', (e) => {
      const rect = stack.getBoundingClientRect();
      const y = e.clientY - rect.top;
      hoveredIndex = getClosestCardIndex(y);
      updatePositions(y);
    });

    stack.addEventListener('mouseleave', () => {
      updatePositions(null);
    });

    window.addEventListener('resize', () => {
      matchStackHeight();
      updatePositions(null);
    });
  });