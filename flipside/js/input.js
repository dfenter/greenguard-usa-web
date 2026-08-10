import { ARR_MS, COLS, DAS_MS, KEYS } from './config.js';

const POINTER_SLOP_PX = 12;
const SOFT_DRAG_DISTANCE_PX = 22;
const FAST_FLICK_DISTANCE_PX = 48;
const FAST_FLICK_MAX_MS = 240;
const FAST_FLICK_MIN_PX_PER_MS = 0.65;
const MAX_POINTER_ACTIONS_PER_MOVE = COLS;
const MAX_KEY_REPEAT_ACTIONS_PER_POLL = COLS;
const MAX_ACTION_QUEUE = 32;

let latestReset = () => {};

const BUTTON_SPECS = [
  {
    id: 'btn-rot-ccw',
    action: 'rotccw',
    label: '↺',
    ariaLabel: 'Rotate counter-clockwise',
    classes: ['tc-btn--rot-ccw', 'tc-rot-ccw'],
  },
  {
    id: 'btn-hold',
    action: 'hold',
    label: 'HOLD',
    ariaLabel: 'Hold piece',
    classes: ['tc-btn--hold', 'tc-hold'],
  },
  {
    id: 'btn-fold-left',
    action: 'flip_left',
    label: '↶',
    ariaLabel: 'Fold left around the cube',
    classes: ['tc-btn--fold-left', 'tc-fold-left', 'fold-left'],
  },
  {
    id: 'btn-fold-right',
    action: 'flip_right',
    label: '↷',
    ariaLabel: 'Fold right around the cube',
    classes: ['tc-btn--fold-right', 'tc-fold-right', 'fold-right'],
  },
  {
    id: 'btn-rot-cw',
    action: 'rotcw',
    label: '↻',
    ariaLabel: 'Rotate clockwise',
    classes: ['tc-btn--rot-cw', 'tc-rot-cw'],
  },
];

function monotonicNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function eventTime(event) {
  return Number.isFinite(event?.timeStamp) && event.timeStamp > 0
    ? event.timeStamp
    : monotonicNow();
}

function isElementLike(value) {
  return value != null && typeof value === 'object';
}

function isTextInput(value) {
  if (!isElementLike(value)) return false;

  const tagName = typeof value.tagName === 'string' ? value.tagName.toLowerCase() : '';
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || tagName === 'option') {
    return true;
  }

  if (value.isContentEditable === true) return true;
  if (typeof value.getAttribute === 'function') {
    const editable = value.getAttribute('contenteditable');
    if (editable != null && editable.toLowerCase() !== 'false') return true;
  }

  if (typeof value.closest === 'function') {
    return value.closest('input, textarea, select, option, [contenteditable="true"], [contenteditable=""]') != null;
  }
  return false;
}

function eventTargetIsTextInput(event, owner) {
  if (isTextInput(event?.target)) return true;

  const document = owner?.document || (typeof globalThis !== 'undefined' ? globalThis.document : null);
  return isTextInput(document?.activeElement);
}

function preventDefault(event) {
  if (typeof event?.preventDefault === 'function') event.preventDefault();
}

function closestElement(value) {
  if (typeof value?.closest === 'function') return value.closest('button, [role="button"]');
  return null;
}

function buttonAction(value) {
  const button = closestElement(value);
  if (!button) return null;

  const id = typeof button.id === 'string' ? button.id : '';
  if (id === 'btn-pause') return 'pause';
  if (id === 'btn-fold-left') return 'flip_left';
  if (id === 'btn-fold-right') return 'flip_right';
  if (id === 'btn-hold') return 'hold';
  if (id === 'btn-rot-ccw') return 'rotccw';
  if (id === 'btn-rot-cw') return 'rotcw';

  const dataAction = typeof button.getAttribute === 'function'
    ? button.getAttribute('data-input-action') || button.getAttribute('data-action')
    : null;
  if (dataAction === 'pause' || dataAction === 'flip_left' || dataAction === 'flip_right' ||
      dataAction === 'fold-left' || dataAction === 'fold-right' || dataAction === 'hold' ||
      dataAction === 'rotccw' || dataAction === 'rotcw' || dataAction === 'rot-ccw' ||
      dataAction === 'rot-cw') {
    if (dataAction === 'rot-ccw') return 'rotccw';
    if (dataAction === 'rot-cw') return 'rotcw';
    if (dataAction === 'fold-left') return 'flip_left';
    if (dataAction === 'fold-right') return 'flip_right';
    return dataAction;
  }

  const classes = button.classList;
  if (classes?.contains('rot-ccw') || classes?.contains('tc-rot-ccw')) return 'rotccw';
  if (classes?.contains('rot-cw') || classes?.contains('tc-rot-cw')) return 'rotcw';
  if (classes?.contains('hold') || classes?.contains('tc-hold')) return 'hold';
  if (classes?.contains('fold-left') || classes?.contains('tc-fold-left')) return 'flip_left';
  if (classes?.contains('fold-right') || classes?.contains('tc-fold-right')) return 'flip_right';
  if (classes?.contains('pause') || classes?.contains('tc-pause')) return 'pause';
  return null;
}

function findButton(root, spec) {
  if (!root || typeof root.querySelector !== 'function') return null;

  const selectors = [
    `#${spec.id}`,
    `[data-input-action="${spec.action}"]`,
    `[data-action="${spec.action}"]`,
    ...spec.classes.map((className) => `.${className}`),
  ];
  for (const selector of selectors) {
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}

function ensureTouchButtons(root) {
  const document = root?.ownerDocument || (typeof globalThis !== 'undefined' ? globalThis.document : null);
  if (!root || typeof root.appendChild !== 'function' || !document || typeof document.createElement !== 'function') return;

  for (const spec of BUTTON_SPECS) {
    if (findButton(root, spec)) continue;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = spec.id;
    button.className = ['tc-btn', ...spec.classes].join(' ');
    button.textContent = spec.label;
    button.setAttribute('aria-label', spec.ariaLabel);
    button.setAttribute('data-input-action', spec.action);
    root.appendChild(button);
  }
}

function cellWidthFor(canvas) {
  if (!canvas) return 1;

  let width = 0;
  if (typeof canvas.getBoundingClientRect === 'function') {
    width = Number(canvas.getBoundingClientRect()?.width);
  }
  if (!Number.isFinite(width) || width <= 0) width = Number(canvas.clientWidth);
  if (!Number.isFinite(width) || width <= 0) {
    const ratio = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const pixelWidth = Number(canvas.width);
    width = (Number.isFinite(pixelWidth) && pixelWidth > 0 ? pixelWidth : COLS) / ratio;
  }
  return Math.max(1, width / COLS);
}

function coordinate(value, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function truncCellDelta(delta, cellWidth) {
  const cells = delta / Math.max(1, cellWidth);
  return cells < 0 ? Math.ceil(cells) : Math.floor(cells);
}

export function createInput(target = typeof window !== 'undefined' ? window : globalThis) {
  const actionQueue = [];
  const pressedKeys = new Set();
  const heldHorizontal = new Map();
  let pointerButtonTimes = new WeakMap();

  let destroyed = false;
  let boardEl = null;
  let boardTouchAction = null;
  let touchRoot = null;
  let boardPointer = null;
  let activeHorizontalCode = null;
  let horizontalOrder = 0;
  let softOnAwaitingPoll = false;
  let softOffPending = false;

  const queueAction = (action) => {
    if (destroyed || !action) return false;

    if (actionQueue.length >= MAX_ACTION_QUEUE) {
      const directional = action === 'left' || action === 'right';
      if (!directional) return false;

      // Preserve the newest direction while coalescing an older repeated
      // left/right action. Non-directional actions are never silently evicted.
      const older = actionQueue.lastIndexOf(action);
      if (older < 0) return false;
      actionQueue.splice(older, 1);
    }
    actionQueue.push(action);
    return true;
  };

  const queueSoftOn = () => {
    const queued = queueAction('soft_on');
    if (queued) softOnAwaitingPoll = true;
    return queued;
  };

  const requestSoftOff = () => {
    if (softOnAwaitingPoll) {
      softOffPending = true;
      return;
    }
    queueAction('soft_off');
  };

  const keyForEvent = (event) => {
    if (!event) return '';
    return event.code || event.key || '';
  };

  const actionForKey = (event) => {
    const code = keyForEvent(event);
    return KEYS[code] || KEYS[event?.key] || null;
  };

  const activeElementForEvent = (event) => {
    const button = closestElement(event?.target);
    if (button) return true;

    const document = target?.document || (typeof globalThis !== 'undefined' ? globalThis.document : null);
    return closestElement(document?.activeElement) != null;
  };

  const mostRecentHorizontal = () => {
    let recent = null;
    for (const [code, held] of heldHorizontal) {
      if (!recent || held.order > recent.order) recent = { code, ...held };
    }
    return recent;
  };

  const selectHorizontal = (code, emitImmediately = false) => {
    const held = heldHorizontal.get(code);
    if (!held) return;
    activeHorizontalCode = code;
    held.nextAt = monotonicNow() + DAS_MS;
    if (emitImmediately) queueAction(held.action);
  };

  const onKeyDown = (event) => {
    if (destroyed || eventTargetIsTextInput(event, target)) return;

    const code = keyForEvent(event);
    const action = actionForKey(event);
    if (!code || !action || activeElementForEvent(event)) return;

    preventDefault(event);
    if (pressedKeys.has(code)) return;
    pressedKeys.add(code);

    if (action === 'left' || action === 'right') {
      heldHorizontal.set(code, {
        action,
        order: ++horizontalOrder,
        nextAt: monotonicNow() + DAS_MS,
      });
      selectHorizontal(code, true);
      return;
    }

    if (action === 'soft') {
      queueSoftOn();
      return;
    }
    queueAction(action);
  };

  const onKeyUp = (event) => {
    if (destroyed) return;

    const code = keyForEvent(event);
    const action = actionForKey(event);
    if (!code || !action) return;

    const wasPressed = pressedKeys.delete(code);
    if (eventTargetIsTextInput(event, target)) {
      heldHorizontal.delete(code);
      if (activeHorizontalCode === code) {
        const fallback = mostRecentHorizontal();
        activeHorizontalCode = fallback?.code || null;
      }
      return;
    }

    preventDefault(event);
    if (!wasPressed) return;

    if (action === 'left' || action === 'right') {
      heldHorizontal.delete(code);
      if (activeHorizontalCode === code) {
        const fallback = mostRecentHorizontal();
        activeHorizontalCode = fallback?.code || null;
        if (fallback) selectHorizontal(fallback.code);
      }
      return;
    }
    if (action === 'soft') requestSoftOff();
  };

  const onBoardPointerDown = (event) => {
    if (destroyed || boardPointer || event?.isPrimary === false) return;

    preventDefault(event);
    boardPointer = {
      id: event.pointerId,
      startX: coordinate(event.clientX, 0),
      startY: coordinate(event.clientY, 0),
      cellWidth: cellWidthFor(boardEl),
      lastCells: 0,
      startAt: eventTime(event),
      gesture: null,
      softActive: false,
      fastFlick: false,
      cancelled: false,
    };
    if (typeof boardEl.setPointerCapture === 'function' && event.pointerId != null) {
      try {
        boardEl.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional and may fail after a browser cancellation.
      }
    }
  };

  const updateBoardGesture = (event) => {
    const pointer = boardPointer;
    if (!pointer || event.pointerId !== pointer.id || pointer.cancelled) return;

    preventDefault(event);
    // A resize/orientation change can happen while the finger is down.
    pointer.cellWidth = cellWidthFor(boardEl);
    const x = coordinate(event.clientX, pointer.startX);
    const y = coordinate(event.clientY, pointer.startY);
    const dx = x - pointer.startX;
    const dy = y - pointer.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!pointer.gesture && Math.max(absX, absY) > POINTER_SLOP_PX) {
      pointer.gesture = absX >= absY ? 'horizontal' : 'vertical';
    }
    if (pointer.gesture === 'horizontal') {
      const cells = truncCellDelta(dx, pointer.cellWidth);
      let delta = cells - pointer.lastCells;
      if (delta > MAX_POINTER_ACTIONS_PER_MOVE) delta = MAX_POINTER_ACTIONS_PER_MOVE;
      if (delta < -MAX_POINTER_ACTIONS_PER_MOVE) delta = -MAX_POINTER_ACTIONS_PER_MOVE;
      if (delta > 0) {
        for (let i = 0; i < delta; i += 1) queueAction('right');
      } else if (delta < 0) {
        for (let i = 0; i > delta; i -= 1) queueAction('left');
      }
      pointer.lastCells = cells;
      return;
    }

    if (pointer.gesture !== 'vertical' || dy <= SOFT_DRAG_DISTANCE_PX || dy <= absX) return;
    const elapsed = Math.max(1, eventTime(event) - pointer.startAt);
    const velocity = dy / elapsed;
    const looksFast = dy >= FAST_FLICK_DISTANCE_PX &&
      (elapsed <= FAST_FLICK_MAX_MS || velocity >= FAST_FLICK_MIN_PX_PER_MS);
    if (looksFast) pointer.fastFlick = true;
    if (!looksFast && !pointer.softActive) {
      pointer.softActive = queueSoftOn();
    }
  };

  const finishBoardPointer = (event, cancelled = false) => {
    const pointer = boardPointer;
    if (!pointer || event?.pointerId !== pointer.id) return;

    if (event && !cancelled) preventDefault(event);
    const x = coordinate(event?.clientX, pointer.startX);
    const y = coordinate(event?.clientY, pointer.startY);
    const dx = x - pointer.startX;
    const dy = y - pointer.startY;
    const elapsed = Math.max(1, eventTime(event || {} ) - pointer.startAt);

    const velocity = dy / elapsed;
    const isFast = pointer.fastFlick || (dy >= FAST_FLICK_DISTANCE_PX &&
      (elapsed <= FAST_FLICK_MAX_MS || velocity >= FAST_FLICK_MIN_PX_PER_MS));

    if (pointer.softActive) {
      requestSoftOff();
      if (!cancelled && isFast && pointer.gesture === 'vertical' && dy > Math.abs(dx)) {
        queueAction('hard');
      }
    } else if (!cancelled && pointer.gesture === 'vertical' && dy > SOFT_DRAG_DISTANCE_PX && dy > Math.abs(dx)) {
      if (isFast) {
        queueAction('hard');
      } else {
        if (queueSoftOn()) requestSoftOff();
      }
    } else if (!cancelled && !pointer.gesture &&
        Math.abs(dx) <= POINTER_SLOP_PX && Math.abs(dy) <= POINTER_SLOP_PX) {
      queueAction('rotcw');
    }

    boardPointer = null;
  };

  const onBoardPointerMove = (event) => updateBoardGesture(event);
  const onBoardPointerUp = (event) => {
    updateBoardGesture(event);
    finishBoardPointer(event, false);
  };
  const onBoardPointerCancel = (event) => finishBoardPointer(event, true);

  const rootContains = (element) => {
    if (!touchRoot || !element) return false;
    if (typeof touchRoot.contains === 'function') return touchRoot.contains(element);
    return element === touchRoot;
  };

  const activateControl = (event, source) => {
    const button = closestElement(event?.target);
    const action = buttonAction(event?.target);
    if (!button || !action) return false;
    if (source === 'root' && typeof touchRoot?.contains === 'function' && !rootContains(button)) return false;
    if ((source === 'target' || source === 'click-target') && rootContains(button)) return false;

    preventDefault(event);
    if (source === 'pointer' || source === 'target') pointerButtonTimes.set(button, monotonicNow());
    if (source === 'click' || source === 'click-target') {
      const pointerAt = pointerButtonTimes.get(button);
      if (pointerAt != null && monotonicNow() - pointerAt < 700) {
        pointerButtonTimes.delete(button);
        return true;
      }
    }
    queueAction(action);
    return true;
  };

  const onRootPointerDown = (event) => {
    if (!destroyed) activateControl(event, 'pointer');
  };

  const onRootClick = (event) => {
    if (!destroyed) activateControl(event, 'click');
  };

  const onTargetPointerDown = (event) => {
    if (!destroyed) activateControl(event, 'target');
  };

  const onTargetClick = (event) => {
    if (!destroyed) activateControl(event, 'click-target');
  };

  const attachBoard = (element) => {
    if (!element || typeof element.addEventListener !== 'function') return;
    element.addEventListener('pointerdown', onBoardPointerDown, { passive: false });
    element.addEventListener('pointermove', onBoardPointerMove, { passive: false });
    element.addEventListener('pointerup', onBoardPointerUp, { passive: false });
    element.addEventListener('pointercancel', onBoardPointerCancel, { passive: false });
    element.addEventListener('lostpointercapture', onBoardPointerCancel, { passive: false });
    if (element.style) {
      boardTouchAction = element.style.touchAction;
      element.style.touchAction = 'none';
    }
  };

  const detachBoard = (element) => {
    if (!element || typeof element.removeEventListener !== 'function') return;
    element.removeEventListener('pointerdown', onBoardPointerDown);
    element.removeEventListener('pointermove', onBoardPointerMove);
    element.removeEventListener('pointerup', onBoardPointerUp);
    element.removeEventListener('pointercancel', onBoardPointerCancel);
    element.removeEventListener('lostpointercapture', onBoardPointerCancel);
    if (element.style && boardTouchAction != null) element.style.touchAction = boardTouchAction;
    boardTouchAction = null;
  };

  const attachRoot = (element) => {
    if (!element || typeof element.addEventListener !== 'function') return;
    ensureTouchButtons(element);
    element.addEventListener('pointerdown', onRootPointerDown, { passive: false });
    element.addEventListener('click', onRootClick);
  };

  const detachRoot = (element) => {
    if (!element || typeof element.removeEventListener !== 'function') return;
    element.removeEventListener('pointerdown', onRootPointerDown);
    element.removeEventListener('click', onRootClick);
  };

  if (target && typeof target.addEventListener === 'function') {
    target.addEventListener('keydown', onKeyDown, { passive: false });
    target.addEventListener('keyup', onKeyUp, { passive: false });
    target.addEventListener('pointerdown', onTargetPointerDown, { passive: false });
    target.addEventListener('click', onTargetClick);
  }

  const setTouchRoot = (element) => {
    if (destroyed || touchRoot === element) {
      if (element && touchRoot === element) ensureTouchButtons(element);
      return;
    }
    detachRoot(touchRoot);
    touchRoot = element || null;
    attachRoot(touchRoot);
  };

  const setBoardEl = (element) => {
    if (destroyed || boardEl === element) return;
    detachBoard(boardEl);
    boardEl = element || null;
    boardPointer = null;
    attachBoard(boardEl);
  };

  const resetInputState = () => {
    actionQueue.length = 0;
    pressedKeys.clear();
    heldHorizontal.clear();
    pointerButtonTimes = new WeakMap();
    activeHorizontalCode = null;
    horizontalOrder = 0;
    softOnAwaitingPoll = false;
    softOffPending = false;

    const pointer = boardPointer;
    boardPointer = null;
    if (pointer && boardEl && typeof boardEl.releasePointerCapture === 'function' && pointer.id != null) {
      try {
        boardEl.releasePointerCapture(pointer.id);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    }
  };

  latestReset = resetInputState;

  const updateKeyboardRepeats = (now) => {
    if (!activeHorizontalCode) return;
    const held = heldHorizontal.get(activeHorizontalCode);
    if (!held) {
      activeHorizontalCode = null;
      return;
    }

    let emitted = 0;
    while (now >= held.nextAt && emitted < MAX_KEY_REPEAT_ACTIONS_PER_POLL) {
      queueAction(held.action);
      held.nextAt += ARR_MS;
      emitted += 1;
    }
    if (now >= held.nextAt) held.nextAt = now + ARR_MS;
  };

  const poll = () => {
    if (destroyed) return [];
    if (softOffPending && !softOnAwaitingPoll) {
      softOffPending = false;
      queueAction('soft_off');
    }
    updateKeyboardRepeats(monotonicNow());
    const events = actionQueue.slice();
    actionQueue.length = 0;
    softOnAwaitingPoll = false;
    return events;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    detachBoard(boardEl);
    detachRoot(touchRoot);
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('pointerdown', onTargetPointerDown);
      target.removeEventListener('click', onTargetClick);
      target.removeEventListener('blur', resetInputState);
      target.removeEventListener('pagehide', resetInputState);
      target.removeEventListener('visibilitychange', resetInputState);
    }
    const document = target?.document;
    if (document && document !== target && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', resetInputState);
    }
    resetInputState();
    if (latestReset === resetInputState) latestReset = () => {};
  };

  if (target && typeof target.addEventListener === 'function') {
    target.addEventListener('blur', resetInputState);
    target.addEventListener('pagehide', resetInputState);
    target.addEventListener('visibilitychange', resetInputState);
  }
  const document = target?.document;
  if (document && document !== target && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', resetInputState);
  }

  return { poll, reset: resetInputState, setTouchRoot, setBoardEl, destroy };
}

// Also expose a module-level reset for orchestrators that import the helper
// directly; the factory method remains the instance-safe API.
export function reset() {
  latestReset();
}
