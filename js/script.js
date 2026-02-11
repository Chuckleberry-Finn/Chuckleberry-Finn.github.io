// Utility function to format subscriber numbers
function formatSubs(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

// Utility function to format timestamp for watermark
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return '1 day ago';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Fetch and display last update time
// Add timestamp to URL to prevent caching
fetch(`github_stats_queue.json?t=${Date.now()}`)
  .then(res => {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  })
  .then(data => {
    const watermarkEl = document.getElementById('watermark-text');
    if (watermarkEl && data.timestamp) {
      watermarkEl.textContent = `Data updated ${formatTimestamp(data.timestamp)}`;
      console.log('Watermark updated:', data.timestamp);
    } else {
      console.warn('Timestamp data missing:', data);
    }
  })
  .catch(err => {
    console.warn('Could not load timestamp:', err);
    const watermarkEl = document.getElementById('watermark-text');
    if (watermarkEl) {
      watermarkEl.textContent = 'Data updated recently';
    }
  });

fetch(`mods.json?t=${Date.now()}`)
  .then(res => res.json())
  .then(data => {
    // Calculate total subs from ALL mods (highlighted and non-highlighted)
    const totalSubs = data.reduce((sum, mod) => sum + (mod.subs || 0), 0);
    const totalSubsEl = document.getElementById('totalSubsCount');
    if (totalSubsEl) {
      totalSubsEl.textContent = formatSubs(totalSubs);
    }
    
    // Filter to only show highlights on main page
    const highlightedMods = data.filter(mod => mod.highlight === true);
    initModUI(highlightedMods);
  })
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
    card.style.opacity = '1'; // Show immediately instead of fade-in
    card.style.transition = 'all 0.3s ease';
    
    stack.appendChild(card);
    cards.push(card);
  });

  // Select first mod immediately
  selectMod(0);
  if (!isMobile) {
    updateStackPositions(null);
  } else {
    updateCarouselPositions();
  }

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
    
    // Only play sound on actual selection (click/tap/keyboard), not hover
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
    modTitle.style.opacity = '1'; // Always visible, no fade
    modPreview.src = mod.banner || "";
    modPreview.alt = mod.name;

    // Only show subscriber count if we have that data
    const subsHtml = mod.subs !== undefined 
      ? `<span class="subs">${formatSubs(mod.subs)} subscribers</span> · ` 
      : '';
    
    modInfo.innerHTML = `
      <p>
        ${subsHtml}
        <a href="${mod.steam_url}" target="_blank" rel="noopener">Steam</a> · 
        <a href="${mod.repo_url}" target="_blank" rel="noopener">Repo</a>
      </p>
    `;
    updateVideo(mod);
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

    hoveredIndex = closestIndex;
  }

  function updateCarouselPositions(drag = 0) {
    if (!isMobile) return;
    const center = window.innerWidth / 2; // Use viewport width instead of stack width
    const mobileCardWidth = 90; // Updated to match smaller mobile card size
    const spacing = 75; // Tighter spacing for smaller cards

    cards.forEach((card, i) => {
      const offset = i - selectedIndex;
      const x = center - mobileCardWidth / 2 + offset * spacing + drag;
      const dist = Math.abs(offset * spacing + drag);
      const scale = 1 - Math.min(dist / (spacing * 2), 1) * 0.15;
      // Removed opacity fade - all cards now fully opaque
      
      card.style.top = '5px'; // Reduced from 15px to center better in smaller container
      card.style.left = `${x}px`;
      card.style.transform = `scale(${scale})`;
      card.style.opacity = '1'; // Always fully opaque
      card.style.zIndex = 100 - Math.abs(offset);
    });
  }

  // Initialize mobile carousel immediately if on mobile
  if (isMobile) {
    updateCarouselPositions();
  }
}
