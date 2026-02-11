// Utility function to format subscriber numbers
function formatNumber(n) {
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
fetch(`github_stats_queue.json?t=${Date.now()}`)
  .then(res => res.ok ? res.json() : Promise.reject())
  .then(data => {
    const watermarkEl = document.getElementById('watermark-text');
    if (watermarkEl && data.timestamp) {
      watermarkEl.textContent = `Data updated ${formatTimestamp(data.timestamp)}`;
    }
  })
  .catch(() => {
    const watermarkEl = document.getElementById('watermark-text');
    if (watermarkEl) {
      watermarkEl.textContent = 'Data updated recently';
    }
  });

// Load and display mods
fetch(`mods.json?t=${Date.now()}`)
  .then(res => res.json())
  .then(data => {
    // Calculate total subs from ALL mods
    const totalSubs = data.reduce((sum, mod) => sum + (mod.subs || 0), 0);
    const totalSubsEl = document.getElementById('totalSubsCount');
    if (totalSubsEl) {
      totalSubsEl.textContent = formatNumber(totalSubs);
    }
    
    // Filter to only show highlights
    const highlightedMods = data.filter(mod => mod.highlight === true);
    initModCarousel(highlightedMods);
  })
  .catch(err => console.error("Failed to load mods.json", err));

function initModCarousel(mods) {
  const stack = document.getElementById('cardStack');
  const modName = document.getElementById('modName');
  const modStats = document.getElementById('modStats');
  const modLinks = document.getElementById('modLinks');
  const modVideo = document.getElementById('modVideo');

  const cards = [];
  let selectedIndex = 0;
  let isMobile = window.innerWidth <= 700;

  let touchStartX = 0;
  let touchDeltaX = 0;
  let isDragging = false;

  // Create cards
  mods.forEach((mod, index) => {
    const card = document.createElement('div');
    card.className = 'mod-card';
    card.style.backgroundImage = `url(${mod.banner})`;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-label', mod.name);
    card.dataset.index = index;
    
    stack.appendChild(card);
    cards.push(card);
  });

  // Select first mod immediately
  selectMod(0);
  updateCarouselPositions();

  // Click handler
  stack.addEventListener('click', (e) => {
    const card = e.target.closest('.mod-card');
    if (card) {
      const index = parseInt(card.dataset.index);
      selectMod(index);
    }
  });

  // Keyboard navigation
  stack.addEventListener('keydown', (e) => {
    let newIndex = selectedIndex;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = (selectedIndex - 1 + mods.length) % mods.length;
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        newIndex = (selectedIndex + 1) % mods.length;
        break;
      default:
        return;
    }
    selectMod(newIndex);
  });

  // Touch handlers
  stack.addEventListener('touchstart', (e) => {
    isDragging = true;
    touchStartX = e.touches[0].clientX;
    touchDeltaX = 0;
  }, { passive: true });

  stack.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaX = e.touches[0].clientX - touchStartX;
    if (Math.abs(deltaX) > 10) {
      touchDeltaX = deltaX;
      updateCarouselPositions(touchDeltaX);
    }
  }, { passive: true });

  stack.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    const threshold = 40;
    if (touchDeltaX < -threshold && selectedIndex < mods.length - 1) {
      selectMod(selectedIndex + 1);
    } else if (touchDeltaX > threshold && selectedIndex > 0) {
      selectMod(selectedIndex - 1);
    }
    touchDeltaX = 0;
    updateCarouselPositions();
  }, { passive: true });

  // Resize handler
  window.addEventListener('resize', () => {
    const wasMobile = isMobile;
    isMobile = window.innerWidth <= 700;
    if (isMobile !== wasMobile) {
      updateCarouselPositions();
    }
  });

  function selectMod(index) {
    selectedIndex = index;
    updateModDetails(mods[index]);
    updateCarouselPositions();
  }

  function updateModDetails(mod) {
    // Update name
    modName.textContent = mod.name;

    // Build stats HTML with both Steam and GitHub data
    const statsHTML = [];
    
    // Steam subscribers
    if (mod.subs !== undefined) {
      statsHTML.push(`
        <div class="stat-item">
          <div class="stat-label">Steam Subscribers</div>
          <div class="stat-value">
            <span class="stat-icon">🎮</span>${formatNumber(mod.subs)}
          </div>
        </div>
      `);
    }

    // GitHub stars
    if (mod.github && mod.github.stars !== undefined) {
      statsHTML.push(`
        <div class="stat-item">
          <div class="stat-label">GitHub Stars</div>
          <div class="stat-value">
            <span class="stat-icon">⭐</span>${formatNumber(mod.github.stars)}
          </div>
        </div>
      `);
    }

    // GitHub forks
    if (mod.github && mod.github.forks !== undefined) {
      statsHTML.push(`
        <div class="stat-item">
          <div class="stat-label">Forks</div>
          <div class="stat-value">
            <span class="stat-icon">🔱</span>${formatNumber(mod.github.forks)}
          </div>
        </div>
      `);
    }

    // Open issues
    if (mod.github && mod.github.openIssues !== undefined) {
      statsHTML.push(`
        <div class="stat-item">
          <div class="stat-label">Open Issues</div>
          <div class="stat-value">
            <span class="stat-icon">🐛</span>${mod.github.openIssues}
          </div>
        </div>
      `);
    }

    modStats.innerHTML = statsHTML.join('');

    // Update links
    modLinks.innerHTML = `
      <a href="${mod.steam_url}" target="_blank" rel="noopener" class="mod-link">
        <span>🎮</span> View on Steam Workshop
      </a>
      <a href="${mod.repo_url}" target="_blank" rel="noopener" class="mod-link">
        <span>💻</span> View Repository
      </a>
    `;

    // Update video
    updateVideo(mod);
  }

  function updateVideo(mod) {
    const videos = mod.videos || [];
    
    if (videos.length === 0) {
      modVideo.innerHTML = '';
      return;
    }

    let currentVideoIndex = 0;

    const container = document.createElement('div');
    container.className = 'video-container';

    // Left arrow
    const leftArrow = document.createElement('button');
    leftArrow.className = 'video-arrow' + (videos.length <= 1 ? ' hidden' : '');
    leftArrow.textContent = '◀';
    leftArrow.setAttribute('aria-label', 'Previous video');

    // Video iframe
    const iframe = document.createElement('iframe');
    iframe.src = videos[0].replace('watch?v=', 'embed/');
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';

    // Right arrow
    const rightArrow = document.createElement('button');
    rightArrow.className = 'video-arrow' + (videos.length <= 1 ? ' hidden' : '');
    rightArrow.textContent = '▶';
    rightArrow.setAttribute('aria-label', 'Next video');

    // Arrow handlers
    leftArrow.onclick = () => {
      currentVideoIndex = (currentVideoIndex - 1 + videos.length) % videos.length;
      iframe.src = videos[currentVideoIndex].replace('watch?v=', 'embed/');
    };

    rightArrow.onclick = () => {
      currentVideoIndex = (currentVideoIndex + 1) % videos.length;
      iframe.src = videos[currentVideoIndex].replace('watch?v=', 'embed/');
    };

    container.appendChild(leftArrow);
    container.appendChild(iframe);
    container.appendChild(rightArrow);
    modVideo.innerHTML = '';
    modVideo.appendChild(container);
  }

  function updateCarouselPositions(drag = 0) {
    const center = window.innerWidth <= 700 
      ? window.innerWidth / 2 
      : stack.offsetWidth / 2;
    const cardWidth = isMobile ? 90 : 110;
    const spacing = isMobile ? 75 : 95;

    cards.forEach((card, i) => {
      const offset = i - selectedIndex;
      const x = center - cardWidth / 2 + offset * spacing + drag;
      const dist = Math.abs(offset * spacing + drag);
      const scale = 1 - Math.min(dist / (spacing * 3), 1) * 0.2;
      const opacity = 1 - Math.min(dist / (spacing * 2), 1) * 0.5;
      
      card.style.top = '10px';
      card.style.left = `${x}px`;
      card.style.transform = `scale(${scale})`;
      card.style.opacity = opacity;
      card.style.zIndex = 100 - Math.abs(offset);

      // Highlight selected card
      if (i === selectedIndex) {
        card.style.borderColor = 'rgba(255, 191, 71, 0.6)';
        card.style.boxShadow = '0 6px 20px rgba(255, 191, 71, 0.3)';
      } else {
        card.style.borderColor = 'rgba(255, 191, 71, 0.15)';
        card.style.boxShadow = '0 4px 15px rgba(0,0,0,0.6)';
      }
    });
  }
}
