// FLIPSIDE — first-run tutorial overlay + settings persistence. LANE O2.
// Owns its own DOM (a coach card appended to #ui), removed when finished.
// Visually consistent with the .screen / .btn classes from style.css, but the
// card is non-blocking: only its buttons take pointer events so the player can
// keep playing (and touching the board) while being taught.

const TUT_KEY = 'flipside.tut';
const SETTINGS_KEY = 'flipside.settings';

const DEFAULT_SETTINGS = { muted: false, music: true, sfx: true };
let tutorialCompletedInMemory = false;

/* ------------------------------------------------------------------ */
/* settings persistence                                                */
/* ------------------------------------------------------------------ */

function safeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val); } catch (e) { /* private mode */ }
}

/** Load {muted,music,sfx}; always returns a complete object with safe defaults. */
export function loadSettings() {
  const s = Object.assign({}, DEFAULT_SETTINGS);
  const raw = safeGet(SETTINGS_KEY);
  if (!raw) return s;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  if (!parsed || typeof parsed !== 'object') return s;
  if (typeof parsed.muted === 'boolean') s.muted = parsed.muted;
  if (typeof parsed.music === 'boolean') s.music = parsed.music;
  if (typeof parsed.sfx === 'boolean') s.sfx = parsed.sfx;
  return s;
}

/** Persist {muted,music,sfx}. Ignores extra keys; never throws. */
export function saveSettings(s) {
  const src = (s && typeof s === 'object') ? s : {};
  const out = {
    muted: typeof src.muted === 'boolean' ? src.muted : DEFAULT_SETTINGS.muted,
    music: typeof src.music === 'boolean' ? src.music : DEFAULT_SETTINGS.music,
    sfx: typeof src.sfx === 'boolean' ? src.sfx : DEFAULT_SETTINGS.sfx,
  };
  safeSet(SETTINGS_KEY, JSON.stringify(out));
  return out;
}

export function tutorialSeen() {
  return tutorialCompletedInMemory || safeGet(TUT_KEY) === '1';
}
export function markTutorialSeen() {
  tutorialCompletedInMemory = true;
  safeSet(TUT_KEY, '1');
}
export function resetTutorial() {
  tutorialCompletedInMemory = false;
  try { localStorage.removeItem(TUT_KEY); } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* tutorial steps                                                      */
/* ------------------------------------------------------------------ */

const isTouch = (() => {
  try {
    return (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  } catch (e) { return false; }
})();

// Each step: {id, title, body, ready(G,S), done(G,S), timeout}
// ready() gates when the step may begin (used to stage the FLIP lesson until
// the far world actually festers). done() completes it. timeout is a fallback
// in ms of game time so nobody gets stuck.
const STEPS = [
  {
    id: 'move',
    title: 'Move the piece',
    body: isTouch
      ? 'Drag your thumb across the paper. The piece follows your finger.'
      : 'Use ← and → to slide the falling piece.',
    ready: () => true,
    done: (G, S) => S.moved >= 3,
    timeout: 14000,
  },
  {
    id: 'rotate',
    title: 'Turn it',
    body: isTouch
      ? 'Tap the board to rotate, or use the ⟲ / ⟳ buttons below.'
      : 'Press ↑ or X to rotate clockwise, Z for counter-clockwise.',
    ready: () => true,
    done: (G, S) => S.rotated >= 2,
    timeout: 14000,
  },
  {
    id: 'drop',
    title: 'Drop it',
    body: isTouch
      ? 'Flick down fast to slam the piece home. Drag down slowly to soft drop.'
      : 'Space hard-drops, ↓ soft-drops. C holds a piece for later.',
    ready: () => true,
    done: (G, S) => S.locked >= 2,
    timeout: 16000,
  },
  {
    id: 'flip',
    title: 'The other side is filling up',
    body: 'Junk paper is stacking on the side you are not playing. Press FLIP ' +
      'to turn the page and clear it. Each fold costs one gold pip.',
    // staged: only appears once the far world has actually festered
    ready: (G, S) => S.sawGarbage,
    done: (G, S) => S.flips >= 1,
    timeout: 26000,
    hero: true,
  },
  {
    id: 'goal',
    title: 'Play both sides',
    body: 'If either side tops out, the run ends. Clear 2+ lines at once to ' +
      'burn junk off the far side. Mend the golden Seam on both sides to win.',
    ready: () => true,
    done: (G, S) => S.stepAge > 5200,
    timeout: 6000,
    final: true,
  },
];

/* ------------------------------------------------------------------ */
/* overlay                                                             */
/* ------------------------------------------------------------------ */

let active = null; // single live instance guard

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function hasGarbage(board) {
  if (!board || !board.grid) return false;
  const grid = board.grid;
  for (let y = grid.length - 1; y >= 0; y--) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c && (c.t === 'G' || c.t === 'SEAM')) return true;
    }
  }
  return false;
}

/**
 * Run the first-run tutorial. No-op if already seen, already running, or if
 * there is no DOM. Watches game state each frame (rAF) and advances through
 * staged coaching cards, cleaning up all of its DOM when finished.
 */
export function maybeRunTutorial(G, hud) {
  if (typeof document === 'undefined' || !G) return;
  if (active) return;
  if (tutorialSeen()) return;

  const host = document.getElementById('ui') || document.body;
  if (!host) return;

  const root = el('div', 'screen tutorial');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  // Non-blocking overlay: the player keeps full control of the board.
  root.style.pointerEvents = 'none';
  root.style.background = 'none';
  root.style.justifyContent = 'flex-start';
  root.style.zIndex = '40';

  const card = el('div', 'tut-card');
  card.style.pointerEvents = 'auto';
  card.style.opacity = '0';
  card.style.transition = 'opacity 160ms ease-out, transform 160ms cubic-bezier(.34,1.56,.64,1)';
  card.style.transform = 'translateY(-8px)';

  const step = el('div', 'tut-step');
  const title = el('h2', 'tut-title');
  const body = el('p', 'tut-body');
  const row = el('div', 'tut-actions');
  const nextBtn = el('button', 'btn btn-primary tut-next', 'Got it');
  const skipBtn = el('button', 'btn tut-skip', 'Skip');
  nextBtn.type = 'button';
  skipBtn.type = 'button';
  row.appendChild(nextBtn);
  row.appendChild(skipBtn);
  card.appendChild(step);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(row);
  root.appendChild(card);
  host.appendChild(root);

  // Minimal inline positioning only (style.css owns the look); these fall back
  // gracefully if .tut-card has no stylesheet rules yet.
  card.style.maxWidth = 'min(92vw, 30rem)';
  card.style.margin = 'max(0.75rem, env(safe-area-inset-top)) auto 0';
  card.style.padding = '0.85rem 1rem';
  card.style.textAlign = 'center';

  const S = {
    moved: 0, rotated: 0, locked: 0, flips: 0,
    sawGarbage: false, stepAge: 0, prevX: null, prevRot: null,
    prevPieces: 0, prevFlips: 0,
  };

  let idx = 0;
  let raf = 0;
  let last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let finished = false;
  let visible = false;

  function show(s) {
    step.textContent = 'Step ' + (idx + 1) + ' of ' + STEPS.length;
    title.textContent = s.title;
    body.textContent = s.body;
    nextBtn.textContent = s.final ? 'Fold on' : 'Got it';
    card.classList.toggle('tut-hero', !!s.hero);
    visible = true;
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  }
  function hide() {
    visible = false;
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
  }

  function advance() {
    S.stepAge = 0;
    idx++;
    if (idx >= STEPS.length) { finish(); return; }
    const s = STEPS[idx];
    if (s.ready(G, S)) show(s); else hide();
  }

  function finish() {
    if (finished) return;
    finished = true;
    markTutorialSeen();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    nextBtn.removeEventListener('click', onNext);
    skipBtn.removeEventListener('click', onSkip);
    card.style.opacity = '0';
    const kill = () => { if (root.parentNode) root.parentNode.removeChild(root); };
    if (typeof setTimeout === 'function') setTimeout(kill, 200); else kill();
    active = null;
  }

  function onNext(e) { e.preventDefault(); advance(); }
  function onSkip(e) { e.preventDefault(); finish(); }
  nextBtn.addEventListener('click', onNext);
  skipBtn.addEventListener('click', onSkip);

  function observe(dt) {
    // Accumulate the distance between observations. A drag can cross several
    // cells between animation frames, and rotation wraps from 3 back to 0.
    const p = G.piece;
    const st = G.stats || {};
    const pieces = st.pieces | 0;
    const samePiece = pieces === S.prevPieces;
    if (p) {
      if (samePiece && S.prevX != null && Number.isFinite(p.x) && Number.isFinite(S.prevX)) {
        S.moved += Math.abs(p.x - S.prevX);
      }
      if (samePiece && S.prevRot != null && Number.isFinite(p.rot) && Number.isFinite(S.prevRot)) {
        const rotationDelta = Math.abs(p.rot - S.prevRot) % 4;
        S.rotated += Math.min(rotationDelta, 4 - rotationDelta);
      }
      S.prevX = p.x;
      S.prevRot = p.rot;
    } else {
      S.prevX = null; S.prevRot = null;
    }
    if (pieces > S.prevPieces) { S.locked += pieces - S.prevPieces; }
    S.prevPieces = pieces;
    const flips = st.flips | 0;
    if (flips > S.prevFlips) { S.flips += flips - S.prevFlips; }
    S.prevFlips = flips;

    if (!S.sawGarbage && G.boards) {
      if (hasGarbage(G.boards.sun) || hasGarbage(G.boards.ink)) S.sawGarbage = true;
    }
    S.stepAge += dt;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(50, now - last);
    last = now;

    if (finished) return;
    // Abandoned run: never nag across a game over or back at the title.
    if (G.status === 'gameover' || G.status === 'won' || G.status === 'title') {
      finish();
      return;
    }
    if (G.status === 'paused') { if (visible) hide(); return; }

    observe(dt);

    const s = STEPS[idx];
    if (!s) { finish(); return; }

    if (!visible) {
      if (s.ready(G, S)) { S.stepAge = 0; show(s); }
      return;
    }
    if (s.done(G, S) || S.stepAge > s.timeout) advance();
  }

  active = { destroy: finish };
  // hud is accepted for contract compatibility; the tutorial owns its own DOM
  // and only uses hud defensively if it exposes a coach hook.
  if (hud && typeof hud.setCoach === 'function') {
    try { hud.setCoach(root); } catch (e) { /* optional */ }
  }

  const first = STEPS[0];
  if (first.ready(G, S)) show(first);
  raf = requestAnimationFrame(tick);
}

/** Force-remove any live tutorial overlay (used by restart paths). */
export function stopTutorial() {
  if (active && typeof active.destroy === 'function') active.destroy();
  active = null;
}
