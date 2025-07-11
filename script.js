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
    const baseSpacing = 8; // Minimum visible portion when overlapped

    let hoveredIndex = -1;

    // Create mod cards
    mods.forEach((mod, index) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.backgroundImage = `url(${mod.banner})`;
      card.style.setProperty('--stack-index', index);
      stack.appendChild(card);
      cards.push(card);
    });

    // Set default preview to the first mod
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

    // After the preview image loads, adjust the stack height and layout
    modPreview.onload = () => {
      matchStackHeight();
      updatePositions(null);
    };

    // On click, select the mod based on the hovered (i.e. visually pulled-out) card
    stack.addEventListener('click', () => {
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
      }
    });

    // Helper: Get the index of the card closest to the mouse Y position
    function getClosestCardIndex(mouseY) {
      let minDist = Infinity;
      let closest = -1;
      for (let i = 0; i < cards.length; i++) {
        const top = parseFloat(cards[i].style.top) || 0;
        const centerY = top + cardHeight / 2;
        const dist = Math.abs(mouseY - centerY);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      return closest;
    }

    // Set the height of the stack to match the preview panel
    function matchStackHeight() {
      const height = previewPanel.offsetHeight;
      stack.style.height = `${height}px`;
    }

    // Dynamically calculate positions and apply a rotation to the card closest to the mouse
    function updatePositions(mouseY = null) {
      const stackHeight = stack.offsetHeight;
      const influenceRadius = stackHeight / 2;
      const positions = [];
      let closestIndex = -1;
      let closestDist = Infinity;

      // Determine base positions and closest card
      for (let i = 0; i < total; i++) {
        const pct = i / (total - 1);
        const baseY = pct * (stackHeight - cardHeight);
        positions[i] = baseY;

        if (mouseY !== null) {
          const center = baseY + cardHeight / 2;
          const dist = Math.abs(center - mouseY);
          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = i;
          }
        }
      }

      // Apply additional spread based on mouse position
      if (mouseY !== null) {
        for (let i = 0; i < total; i++) {
          const center = positions[i] + cardHeight / 2;
          const dist = Math.abs(center - mouseY);
          const influence = Math.max(0, 1 - dist / influenceRadius);
          const boost = influence * 20;  // controls spread strength
          positions[i] += boost * (i - total / 2) * 0.2;
        }
      }

      // Apply calculated positions and reset transform for all cards
      for (let i = 0; i < total; i++) {
        const minTop = 0;
        const maxTop = stackHeight - cardHeight;
        const clampedTop = Math.max(minTop, Math.min(maxTop, positions[i]));
        cards[i].style.top = `${clampedTop}px`;

        cards[i].style.transform = 'translateX(0) translateX(0) rotate(0deg) scale(1)';
      }

      // For the card closest to the mouse, apply a rotated (2D) transform and higher z-index
      if (closestIndex !== -1) {
        const card = cards[closestIndex];
        // Adjust values as needed:
        // translateX(64px) pushes it out; rotate(40deg) rotates it in the plane; scale(1.05) slightly enlarges it
        card.style.transform = 'translateX(64px) translateY(-64px) rotate(30deg) scale(1.05)';
        hoveredIndex = closestIndex;
      }
    }

    // Mouse move event to dynamically update positions based on the cursor's Y position
    stack.addEventListener('mousemove', (e) => {
      const rect = stack.getBoundingClientRect();
      const y = e.clientY - rect.top;
      hoveredIndex = getClosestCardIndex(y);
      updatePositions(y);
    });

    // Reset positions when the mouse leaves the stack
    stack.addEventListener('mouseleave', () => {
      updatePositions(null);
    });

    // Update layout on window resize
    window.addEventListener('resize', () => {
      matchStackHeight();
      updatePositions(null);
    });
  });