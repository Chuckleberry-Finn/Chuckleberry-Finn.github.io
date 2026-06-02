function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function formatTimeAgo(isoString) {
  const diffMs    = Date.now() - new Date(isoString);
  const diffMins  = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays  = Math.floor(diffHours / 24);

  if (diffMins  <  1) return 'just now';
  if (diffMins  < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays  ===1) return '1 day ago';
  if (diffDays  <  7) return `${diffDays} days ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

fetch(`github_stats_queue.json?t=${Date.now()}`)
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(data => {
    const el = document.getElementById('watermark-text');
    if (el && data.timestamp) el.textContent = `Data updated ${formatTimeAgo(data.timestamp)}`;
  })
  .catch(() => {
    const el = document.getElementById('watermark-text');
    if (el) el.textContent = 'Data updated recently';
  });

fetch(`mods.json?t=${Date.now()}`)
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(data => {
    const totalSubs = data.reduce((sum, mod) => sum + (mod.subs || 0), 0);
    const totalEl = document.getElementById('totalSubsCount');
    if (totalEl) totalEl.textContent = formatNumber(totalSubs);

    const highlighted = data.filter(mod => mod.highlight === true);
    if (!highlighted.length) {
      document.getElementById('modName').textContent = 'No mods available';
      return;
    }
    initModCarousel(highlighted);
  })
  .catch(() => {
    document.getElementById('modName').textContent = 'Error loading mods';
  });

function initModCarousel(mods) {
  const stack   = document.getElementById('cardStack');
  const modName = document.getElementById('modName');
  const modStats = document.getElementById('modStats');
  const modLinks = document.getElementById('modLinks');
  const modVideo = document.getElementById('modVideo');

  if (!stack) return;

  const cards = [];
  let selectedIndex = 0;
  let isMobile = window.innerWidth <= 700;
  let touchStartX = 0;
  let touchDeltaX = 0;
  let isDragging  = false;

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

  selectMod(0);
  updatePositions();

  // Expose API for scrollbar and other consumers
  window.carouselAPI = {
    getIndex: () => selectedIndex,
    getTotal: () => mods.length,
    selectMod,
  };

  stack.addEventListener('click', e => {
    const card = e.target.closest('.mod-card');
    if (card) selectMod(parseInt(card.dataset.index));
  });

  stack.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      selectMod((selectedIndex - 1 + mods.length) % mods.length);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      selectMod((selectedIndex + 1) % mods.length);
    }
  });

  let lastWheel = 0;
  const carousel = document.querySelector('.card-carousel');
  if (carousel && window.innerWidth > 700) {
    carousel.addEventListener('wheel', e => {
      const now = Date.now();
      if (now - lastWheel < 200) { e.preventDefault(); return; }
      e.preventDefault();
      lastWheel = now;
      selectMod((selectedIndex + (e.deltaY > 0 ? 1 : -1) + mods.length) % mods.length);
    }, { passive: false });
  }

  stack.addEventListener('touchstart', e => {
    isDragging  = true;
    touchStartX = e.touches[0].clientX;
    touchDeltaX = 0;
  }, { passive: true });

  stack.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const delta = e.touches[0].clientX - touchStartX;
    if (Math.abs(delta) > 10) {
      touchDeltaX = delta;
      updatePositions(touchDeltaX);
    }
  }, { passive: true });

  stack.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    if      (touchDeltaX < -40 && selectedIndex < mods.length - 1) selectMod(selectedIndex + 1);
    else if (touchDeltaX >  40 && selectedIndex > 0)                selectMod(selectedIndex - 1);
    touchDeltaX = 0;
    updatePositions();
  }, { passive: true });

  window.addEventListener('resize', () => {
    const was = isMobile;
    isMobile = window.innerWidth <= 700;
    if (isMobile !== was) updatePositions();
  });

  function selectMod(index) {
    selectedIndex = index;
    updateDetails(mods[index]);
    updatePositions();
    document.dispatchEvent(new CustomEvent('carouselChange', { detail: { index } }));
  }

  function updateDetails(mod) {
    modName.textContent = mod.name;

    const descEl = document.getElementById('modDescription');
    if (descEl) {
      if (mod.github?.description) {
        descEl.textContent = mod.github.description;
        descEl.style.display = 'block';
      } else {
        descEl.style.display = 'none';
      }
    }

    const bgPreview = document.getElementById('bgModPreview');
    if (bgPreview) { bgPreview.src = mod.banner || ''; bgPreview.alt = mod.name; }

    modStats.innerHTML = '';

    const steamStats = mod.subs !== undefined
      ? `<div class="link-stats">${formatNumber(mod.subs)} subscribers</div>`
      : '';

    const ghParts = [];
    if (mod.github?.stars    !== undefined) ghParts.push(`<span class="gh-stat">★ ${formatNumber(mod.github.stars)} stars</span>`);
    if (mod.github?.forks    !== undefined) ghParts.push(`<span class="gh-stat">⑂ ${formatNumber(mod.github.forks)} forks</span>`);
    if (mod.github?.openIssues !== undefined) ghParts.push(`<span class="gh-stat">⚠ ${mod.github.openIssues} issues</span>`);
    const ghStats = ghParts.length ? `<div class="link-stats">${ghParts.join(' · ')}</div>` : '';

    modLinks.innerHTML = `
      <div class="link-with-stats">
        <a href="${mod.steam_url}" target="_blank" rel="noopener" class="mod-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663.001 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/></svg>
          Steam Workshop
        </a>
        ${steamStats}
      </div>
      <div class="link-with-stats">
        <a href="${mod.repo_url}" target="_blank" rel="noopener" class="mod-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
          GitHub Repository
        </a>
        ${ghStats}
      </div>
    `;

    updateVideo(mod);
  }

  function updateVideo(mod) {
    const videos = mod.videos || [];
    modVideo.innerHTML = '';
    if (!videos.length) return;

    let currentIndex = 0;
    const container  = document.createElement('div');
    container.className = 'video-container';

    const makeArrow = (label, symbol) => {
      const btn = document.createElement('button');
      btn.className = `video-arrow${videos.length <= 1 ? ' hidden' : ''}`;
      btn.textContent = symbol;
      btn.setAttribute('aria-label', label);
      return btn;
    };

    const left   = makeArrow('Previous video', '◀');
    const iframe = document.createElement('iframe');
    const right  = makeArrow('Next video', '▶');

    iframe.src = videos[0].replace('watch?v=', 'embed/');
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';

    left.onclick  = () => { currentIndex = (currentIndex - 1 + videos.length) % videos.length; iframe.src = videos[currentIndex].replace('watch?v=', 'embed/'); };
    right.onclick = () => { currentIndex = (currentIndex + 1) % videos.length; iframe.src = videos[currentIndex].replace('watch?v=', 'embed/'); };

    container.append(left, iframe, right);
    modVideo.appendChild(container);
  }

  function updatePositions(drag = 0) {
    const center    = isMobile ? window.innerWidth / 2 : stack.offsetWidth / 2;
    const cardWidth = isMobile ? 90 : 110;
    const spacing   = isMobile ? 75 : 95;

    cards.forEach((card, i) => {
      const offset  = i - selectedIndex;
      const x       = center - cardWidth / 2 + offset * spacing + drag;
      const dist    = Math.abs(offset * spacing + drag);
      const scale   = 1 - Math.min(dist / (spacing * 3), 1) * 0.2;
      const opacity = 1 - Math.min(dist / (spacing * 2), 1) * 0.5;

      card.style.top       = '10px';
      card.style.left      = `${x}px`;
      card.style.transform = `scale(${scale})`;
      card.style.opacity   = opacity;
      card.style.zIndex    = 100 - Math.abs(offset);

      if (i === selectedIndex) {
        card.style.borderColor = 'rgba(126, 206, 196, 0.6)';
        card.style.boxShadow   = '0 6px 20px rgba(126, 206, 196, 0.3)';
      } else {
        card.style.borderColor = 'rgba(126, 206, 196, 0.15)';
        card.style.boxShadow   = '0 4px 15px rgba(0,0,0,0.6)';
      }
    });
  }
}
