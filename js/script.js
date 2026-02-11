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
  .then(res => {
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return res.json();
  })
  .then(data => {
    console.log('Loaded mods:', data.length);
    
    // Calculate total subs from ALL mods
    const totalSubs = data.reduce((sum, mod) => sum + (mod.subs || 0), 0);
    const totalSubsEl = document.getElementById('totalSubsCount');
    if (totalSubsEl) {
      totalSubsEl.textContent = formatNumber(totalSubs);
    }
    
    // Filter to only show highlights
    const highlightedMods = data.filter(mod => mod.highlight === true);
    console.log('Highlighted mods:', highlightedMods.length);
    
    if (highlightedMods.length === 0) {
      console.error('No highlighted mods found!');
      document.getElementById('modName').textContent = 'No mods available';
      return;
    }
    
    initModCarousel(highlightedMods);
  })
  .catch(err => {
    console.error("Failed to load mods.json", err);
    document.getElementById('modName').textContent = 'Error loading mods';
    document.getElementById('modStats').innerHTML = '<div class="stat-item"><div class="stat-label">Error</div><div class="stat-value">Could not load data</div></div>';
  });

function initModCarousel(mods) {
  console.log('Initializing carousel with', mods.length, 'mods');
  
  const stack = document.getElementById('cardStack');
  const modName = document.getElementById('modName');
  const modStats = document.getElementById('modStats');
  const modLinks = document.getElementById('modLinks');
  const modVideo = document.getElementById('modVideo');

  if (!stack) {
    console.error('cardStack element not found!');
    return;
  }

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

  console.log('Created', cards.length, 'cards');

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

    // Update background vinyl label
    const bgModPreview = document.getElementById('bgModPreview');
    if (bgModPreview) {
      bgModPreview.src = mod.banner || '';
      bgModPreview.alt = mod.name;
    }

    // Clear stats - we'll show them under the buttons instead
    modStats.innerHTML = '';

    // Build links with stats underneath
    const linksHTML = [];
    
    // Steam Workshop link with subscribers
    const steamStats = mod.subs !== undefined 
      ? `<div class="link-stats">${formatNumber(mod.subs)} subscribers</div>` 
      : '';
    
    linksHTML.push(`
      <div class="link-with-stats">
        <a href="${mod.steam_url}" target="_blank" rel="noopener" class="mod-link">
          <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor">
            <path d="M127.999,0C57.421,0,0,57.42,0,127.999c0,63.795,46.718,116.633,107.559,126.196l28.001-40.368 c-8.689-2.494-16.306-7.662-21.842-14.667l-34.382,14.127c-16.743,6.875-35.898-1.245-42.774-18.095 c-6.876-16.743,1.245-35.898,18.095-42.774l35.459-14.565c5.162-12.042,15.715-21.623,29.121-25.308V85.416h-0.001 c0-21.134,17.181-38.316,38.316-38.316c21.134,0,38.316,17.181,38.316,38.316v0.002l-0.001,36.847 c12.836,3.655,23.028,13.036,27.924,25.36l35.039,14.393c16.85,6.876,24.971,26.03,18.095,42.774 c-6.876,16.85-26.031,24.971-42.774,18.095l-33.964-13.951c-5.522,6.944-13.097,12.074-21.723,14.556l27.784,40.052 C209.281,244.632,256,191.794,256,127.999C256,57.42,198.579,0,127.999,0z M89.389,183.612l13.604-5.588 c2.564,1.691,5.34,3.087,8.313,4.123l-12.69,18.286C94.443,197.271,90.915,190.78,89.389,183.612z M157.684,85.416 c0-16.382-13.303-29.684-29.684-29.684c-16.382,0-29.684,13.303-29.684,29.684v21.949c9.332-3.635,19.588-5.652,30.316-5.652 c10.202,0,19.985,1.851,29.053,5.214V85.416z"/>
          </svg>
          View on Steam Workshop
        </a>
        ${steamStats}
      </div>
    `);

    // GitHub Repository link with stats
    const githubStatsHTML = [];
    if (mod.github) {
      if (mod.github.stars !== undefined) {
        githubStatsHTML.push(`<span class="gh-stat">★ ${formatNumber(mod.github.stars)} stars</span>`);
      }
      if (mod.github.forks !== undefined) {
        githubStatsHTML.push(`<span class="gh-stat">⑂ ${formatNumber(mod.github.forks)} forks</span>`);
      }
      if (mod.github.openIssues !== undefined) {
        githubStatsHTML.push(`<span class="gh-stat">⚠ ${mod.github.openIssues} issues</span>`);
      }
    }
    
    const githubStats = githubStatsHTML.length > 0
      ? `<div class="link-stats">${githubStatsHTML.join(' · ')}</div>`
      : '';

    linksHTML.push(`
      <div class="link-with-stats">
        <a href="${mod.repo_url}" target="_blank" rel="noopener" class="mod-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
          </svg>
          View GitHub Repository
        </a>
        ${githubStats}
      </div>
    `);

    modLinks.innerHTML = linksHTML.join('');

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
