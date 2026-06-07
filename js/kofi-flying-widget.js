(function () {
  const wrapper  = document.getElementById('kofi-flying-wrapper');
  const inner    = document.getElementById('kofi-flying-inner');
  const closeBtn = document.getElementById('kofi-flying-close');
  if (!wrapper || !inner) return;

  const SPEED_NORMAL  = 2.2;
  const SPEED_HOVER   = 0.55;
  const INACTIVITY_MS = 3000;
  const MERGE_OVERLAP = 0.5;
  const SIZE_BONUS    = 0.10;
  const EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];

  // ── Widget registry ──────────────────────────────────────
  // Each entry: { el, x, y, vx, vy, scale, isHovered, dead }
  const widgets = [];

  let inactivityTimer = null;
  let rafId           = null;

  // ── Inactivity → launch first widget ─────────────────────
  function resetTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(launch, INACTIVITY_MS);
  }
  EVENTS.forEach(ev => document.addEventListener(ev, resetTimer, { passive: true }));
  resetTimer();

  function launch() {
    EVENTS.forEach(ev => document.removeEventListener(ev, resetTimer));
    wrapper.classList.add('active');
    // Reuse the existing wrapper as the first widget entry
    const startX = Math.random() * (window.innerWidth  - 240);
    const startY = Math.random() * (window.innerHeight - 100);
    const angle  = Math.random() * Math.PI * 2;
    wrapper.style.left = startX + 'px';
    wrapper.style.top  = startY + 'px';
    wrapper.style.transformOrigin = 'top left';

    const state = {
      el:        wrapper,
      x:         startX,
      y:         startY,
      vx:        Math.cos(angle) * SPEED_NORMAL,
      vy:        Math.sin(angle) * SPEED_NORMAL,
      scale:     1.0,
      isHovered: false,
      dead:      false,
    };
    widgets.push(state);

    wrapper.addEventListener('mouseenter', () => { state.isHovered = true;  });
    wrapper.addEventListener('mouseleave', () => { state.isHovered = false; });

    // ── X button → CLONE, don't close ──────────────────────
    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      spawnClone(state);
    });

    if (!rafId) startLoop();
  }

  // ── Spawn a clone of an existing widget ───────────────────
  function spawnClone(source) {
    const clone = source.el.cloneNode(true);
    clone.style.left  = (source.x + 50) + 'px';
    clone.style.top   = (source.y - 30) + 'px';
    document.body.appendChild(clone);

    const angle = Math.random() * Math.PI * 2;
    const state = {
      el:        clone,
      x:         source.x + 50,
      y:         source.y - 30,
      vx:        Math.cos(angle) * SPEED_NORMAL,
      vy:        Math.sin(angle) * SPEED_NORMAL,
      scale:     source.scale,
      isHovered: false,
      dead:      false,
    };
    widgets.push(state);

    clone.style.transformOrigin = 'top left';
    applyScale(state);

    clone.addEventListener('mouseenter', () => { state.isHovered = true;  });
    clone.addEventListener('mouseleave', () => { state.isHovered = false; });

    // Wire up the cloned X button
    const cloneClose = clone.querySelector('#kofi-flying-close') || clone.querySelector('.kofi-flying-close');
    if (cloneClose) {
      // Remove id to avoid duplicate IDs, switch to class
      cloneClose.removeAttribute('id');
      cloneClose.classList.add('kofi-flying-close');
      cloneClose.addEventListener('click', e => {
        e.stopPropagation();
        spawnClone(state);
      });
    }
  }

  // ── Animation loop ────────────────────────────────────────
  function startLoop() {
    function tick() {
      step();
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function step() {
    const W = window.innerWidth;
    const H = window.innerHeight;

    for (const w of widgets) {
      if (w.dead) continue;

      const speed = w.isHovered ? SPEED_HOVER : SPEED_NORMAL;
      const mag   = Math.sqrt(w.vx * w.vx + w.vy * w.vy) || 1;
      w.vx = (w.vx / mag) * speed;
      w.vy = (w.vy / mag) * speed;

      w.x += w.vx;
      w.y += w.vy;

      const rect = w.el.getBoundingClientRect();
      const elW  = rect.width  || 200;
      const elH  = rect.height || 70;

      if (w.x < 0)       { w.x = 0;       w.vx =  Math.abs(w.vx); }
      if (w.y < 0)       { w.y = 0;       w.vy =  Math.abs(w.vy); }
      if (w.x + elW > W) { w.x = W - elW; w.vx = -Math.abs(w.vx); }
      if (w.y + elH > H) { w.y = H - elH; w.vy = -Math.abs(w.vy); }

      w.el.style.left = w.x + 'px';
      w.el.style.top  = w.y + 'px';
    }

    // Collision / merge check
    for (let i = 0; i < widgets.length; i++) {
      for (let j = i + 1; j < widgets.length; j++) {
        if (widgets[i].dead || widgets[j].dead) continue;
        if (overlapping(widgets[i], widgets[j])) {
          mergeWidgets(widgets[i], widgets[j]);
          break;
        }
      }
    }

    // Remove dead
    for (let i = widgets.length - 1; i >= 0; i--) {
      if (widgets[i].dead) {
        widgets[i].el.remove();
        widgets.splice(i, 1);
      }
    }
  }

  function overlapping(a, b) {
    const ra = a.el.getBoundingClientRect();
    const rb = b.el.getBoundingClientRect();
    const ox = Math.max(0, Math.min(ra.right, rb.right)   - Math.max(ra.left, rb.left));
    const oy = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top,  rb.top));
    const overlap = ox * oy;
    const minArea = Math.min(ra.width * ra.height, rb.width * rb.height);
    return minArea > 0 && (overlap / minArea) >= MERGE_OVERLAP;
  }

  function mergeWidgets(a, b) {
    const combined   = a.scale + b.scale;
    const newScale   = combined * (1 + SIZE_BONUS);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;

    a.dead = true;
    b.dead = true;

    // Spawn merged clone from whichever isn't the original wrapper
    const src = (b.el !== wrapper) ? b : a;
    const merged = src.el.cloneNode(true);
    merged.style.left = mx + 'px';
    merged.style.top  = my + 'px';
    merged.style.transformOrigin = 'top left';
    document.body.appendChild(merged);

    const state = {
      el:        merged,
      x:         mx,
      y:         my,
      vx:        (a.vx + b.vx) / 2,
      vy:        (a.vy + b.vy) / 2,
      scale:     newScale,
      isHovered: false,
      dead:      false,
    };
    widgets.push(state);
    applyScale(state);

    merged.addEventListener('mouseenter', () => { state.isHovered = true;  });
    merged.addEventListener('mouseleave', () => { state.isHovered = false; });

    const mc = merged.querySelector('#kofi-flying-close') || merged.querySelector('.kofi-flying-close');
    if (mc) {
      mc.removeAttribute('id');
      mc.classList.add('kofi-flying-close');
      mc.addEventListener('click', e => { e.stopPropagation(); spawnClone(state); });
    }

    // Merge flash
    merged.style.transition = 'transform 0.25s ease-out';
    merged.style.transform  = `scale(${newScale * 1.3})`;
    setTimeout(() => {
      merged.style.transform = `scale(${newScale})`;
    }, 250);
  }

  function applyScale(w) {
    w.el.style.transform = `scale(${w.scale})`;
  }
})();
