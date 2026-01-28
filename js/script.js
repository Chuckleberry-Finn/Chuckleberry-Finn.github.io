fetch('mods.json')
  .then(res => res.json())
  .then(initModUI)
  .catch(err => console.error("Failed to load mods.json", err));

function initModUI(mods) {
  const stack = document.getElementById('modStack');
  const modTitle = document.getElementById('modTitle');
  const modPreview = document.getElementById('modPreview');
  const modInfo = document.getElementById('modInfo');
  const videoContainer = document.getElementById("modVideoContainer");
  const mobileHint = document.getElementById('mobileHint');
  const vinylRecord = document.getElementById('vinylRecord');
  const tonearm = document.getElementById('tonearm');

  const cards = [];
  const cardHeight = 226;
  const cardWidth = 226;
  const total = mods.length;

  let hoveredIndex = -1;
  let selectedIndex = 0;
  let lastHovered = -1;
  let isMobile = window.innerWidth <= 700;

  let touchStartX = 0;
  let touchDeltaX = 0;
  let isDragging = false;

  const shuffleSound = new Audio('sounds/shuffle.mp3');
  const selectSound = new Audio('sounds/select.mp3');

  // Create cards - z-index: bottom cards have HIGHER z-index (on top)
  mods.forEach((mod, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.backgroundImage = `url(${mod.banner})`;
    // Bottom of stack (higher index) = higher z-index = on top visually
    card.style.zIndex = index + 1;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-label', mod.name);
    card.dataset.index = index;
    card.style.opacity = '0';
    
    stack.appendChild(card);
    cards.push(card);

    setTimeout(() => {
      card.style.transition = 'all 0.3s ease';
      card.style.opacity = '1';
    }, 50 + index * 30);
  });

  setTimeout(() => {
    selectMod(0);
    if (!isMobile) {
      updateStackPositions(null);
    }
  }, 50 + total * 30 + 100);

  // Desktop events
  stack.addEventListener('mousemove', (e) => {
    if (isMobile) return;
    const rect = stack.getBoundingClientRect();
    const y = e.clientY - rect.top;
    hoveredIndex = getClosestCardIndex(y);
    updateStackPositions(y);
  });

  stack.addEventListener('mouseleave', () => {
    if (isMobile) return;
    updateStackPositions(null);
  });

  stack.addEventListener('click', () => {
    if (isMobile) return;
    if (hoveredIndex >= 0 && hoveredIndex < total) {
      selectMod(hoveredIndex);
    }
  });

  // Keyboard
  stack.addEventListener('keydown', (e) => {
    let newIndex = selectedIndex;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = (selectedIndex - 1 + total) % total;
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        newIndex = (selectedIndex + 1) % total;
        break;
      default:
        return;
    }
    if (newIndex !== selectedIndex) {
      selectMod(newIndex);
      if (isMobile) updateCarouselPositions();
    }
  });

  // Mobile touch
  stack.addEventListener('touchstart', (e) => {
    if (!isMobile) return;
    isDragging = true;
    touchStartX = e.touches[0].clientX;
    touchDeltaX = 0;
  }, { passive: true });

  stack.addEventListener('touchmove', (e) => {
    if (!isMobile || !isDragging) return;
    const deltaX = e.touches[0].clientX - touchStartX;
    if (Math.abs(deltaX) > 10) {
      e.preventDefault();
      touchDeltaX = deltaX;
      updateCarouselPositions(touchDeltaX);
    }
  }, { passive: false });

  stack.addEventListener('touchend', () => {
    if (!isMobile || !isDragging) return;
    isDragging = false;
    const threshold = 40;
    if (touchDeltaX < -threshold && selectedIndex < total - 1) {
      selectMod(selectedIndex + 1);
    } else if (touchDeltaX > threshold && selectedIndex > 0) {
      selectMod(selectedIndex - 1);
    }
    touchDeltaX = 0;
    updateCarouselPositions();
  }, { passive: true });

  // Resize
  window.addEventListener('resize', () => {
    const wasMobile = isMobile;
    isMobile = window.innerWidth <= 700;
    if (isMobile !== wasMobile) {
      isMobile ? updateCarouselPositions() : updateStackPositions(null);
    }
  });

  // Hide hint
  if (mobileHint) {
    stack.addEventListener('touchstart', () => {
      mobileHint.style.display = 'none';
    }, { once: true });
  }

  function selectMod(index) {
    selectedIndex = index;
    hoveredIndex = index;
    
    if (lastHovered !== index) {
      shuffleSound.currentTime = 0;
      shuffleSound.play().catch(() => {});
      lastHovered = index;
    }
    
    selectSound.currentTime = 0;
    selectSound.play().catch(() => {});
    
    vinylRecord.classList.add('spinning');
    tonearm?.classList.add('playing');
    
    updatePreview(mods[index]);
    if (isMobile) updateCarouselPositions();
  }

  function updatePreview(mod) {
    modTitle.textContent = mod.name;
    modTitle.title = mod.name;
    modPreview.src = mod.banner || "";
    modPreview.alt = mod.name;

    const subs = formatSubs(mod.subs);
    modInfo.innerHTML = `
      <p><span class="subs">${subs} subscribers</span></p>
      <p>
        <a href="${mod.steam_url}" target="_blank" rel="noopener">Steam</a> · 
        <a href="${mod.repo_url}" target="_blank" rel="noopener">Repo</a>
      </p>
    `;
    updateVideo(mod);
  }

  function formatSubs(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  }

  function updateVideo(mod) {
    videoContainer.innerHTML = "";
    const videos = mod.videos || [];

    const wrap = document.createElement("div");
    wrap.className = "video-slideshow";

    // Left arrow (always present)
    const left = document.createElement("button");
    left.className = "arrow arrow-left";
    left.textContent = "◀";
    if (videos.length <= 1) {
      left.style.visibility = "hidden";
      left.style.pointerEvents = "none";
    }
    wrap.appendChild(left);

    // Video iframe or placeholder
    if (videos.length > 0) {
      let idx = 0;
      const iframe = document.createElement("iframe");
      iframe.src = videos[0].replace("watch?v=", "embed/");
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      
      left.onclick = () => {
        idx = (idx - 1 + videos.length) % videos.length;
        iframe.src = videos[idx].replace("watch?v=", "embed/");
      };
      
      wrap.appendChild(iframe);
      
      // Right arrow
      const right = document.createElement("button");
      right.className = "arrow arrow-right";
      right.textContent = "▶";
      if (videos.length <= 1) {
        right.style.visibility = "hidden";
        right.style.pointerEvents = "none";
      }
      right.onclick = () => {
        idx = (idx + 1) % videos.length;
        iframe.src = videos[idx].replace("watch?v=", "embed/");
      };
      wrap.appendChild(right);
    } else {
      // No video - create empty placeholder with same dimensions
      const placeholder = document.createElement("div");
      placeholder.style.width = "438px";
      placeholder.style.height = "246px";
      placeholder.style.borderRadius = "6px";
      placeholder.style.visibility = "hidden";
      wrap.appendChild(placeholder);
      
      // Right arrow (invisible)
      const right = document.createElement("button");
      right.className = "arrow arrow-right";
      right.textContent = "▶";
      right.style.visibility = "hidden";
      right.style.pointerEvents = "none";
      wrap.appendChild(right);
    }

    videoContainer.appendChild(wrap);
  }

  function getClosestCardIndex(mouseY) {
    let minDist = Infinity, closest = -1;
    cards.forEach((card, i) => {
      const top = parseFloat(card.style.top) || 0;
      const dist = Math.abs(mouseY - (top + cardHeight / 2));
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    return closest;
  }

  function updateStackPositions(mouseY = null) {
    if (isMobile) return;
    
    const stackHeight = stack.offsetHeight || 580;
    const spacing = Math.max(8, (stackHeight - cardHeight) / (total - 1));
    let closestIndex = -1;
    let closestDist = Infinity;
    const positions = [];

    for (let i = 0; i < total; i++) {
      positions[i] = i * spacing;
      if (mouseY !== null) {
        const dist = Math.abs(mouseY - (positions[i] + cardHeight / 2));
        if (dist < closestDist) { closestDist = dist; closestIndex = i; }
      }
    }

    // Spread cards when hovering
    if (mouseY !== null && closestIndex !== -1) {
      for (let i = 0; i < total; i++) {
        const d = Math.abs(i - closestIndex);
        if (d > 0) positions[i] += (i < closestIndex ? -1 : 1) * Math.max(0, 15 - d * 2);
      }
    }

    cards.forEach((card, i) => {
      const top = Math.max(0, Math.min(stackHeight - cardHeight, positions[i]));
      card.style.top = `${top}px`;
      card.style.left = '8px';
      
      if (i === closestIndex && mouseY !== null) {
        card.style.transform = 'translateX(80px) scale(1.05)';
        card.style.zIndex = '200';
        card.style.boxShadow = '5px 5px 18px rgba(0,0,0,0.6)';
      } else {
        card.style.transform = 'none';
        // Bottom cards (higher index) have higher z-index = on top
        card.style.zIndex = i + 1;
        card.style.boxShadow = '2px 2px 10px rgba(0,0,0,0.6)';
      }
    });

    if (closestIndex !== -1 && closestIndex !== lastHovered) {
      shuffleSound.currentTime = 0;
      shuffleSound.play().catch(() => {});
      lastHovered = closestIndex;
    }
    hoveredIndex = closestIndex;
  }

  function updateCarouselPositions(drag = 0) {
    if (!isMobile) return;
    const center = stack.offsetWidth / 2;
    const mobileCardWidth = 143;
    const spacing = 99;

    cards.forEach((card, i) => {
      const offset = i - selectedIndex;
      const x = center - mobileCardWidth / 2 + offset * spacing + drag;
      const dist = Math.abs(offset * spacing + drag);
      const scale = 1 - Math.min(dist / (spacing * 2), 1) * 0.15;
      const opacity = 1 - Math.min(dist / (spacing * 2), 1) * 0.4;

      card.style.top = '15px';
      card.style.left = `${x}px`;
      card.style.transform = `scale(${scale})`;
      card.style.opacity = Math.max(0.4, opacity);
      card.style.zIndex = 100 - Math.abs(offset);
    });
  }

  if (isMobile) {
    setTimeout(updateCarouselPositions, 50 + total * 30 + 150);
  }
}
