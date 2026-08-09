// Keyboard and pointer input. Pointer events cover both touch and mouse,
// while each control keeps its own pointer so multi-touch remains independent.

export class Input {
  constructor() {
    this.keys = {};
    this.prev = {};
    this._pressedPulses = new Set();
    this._cleanups = [];
    this._stickPointer = null;
    this._buttonOwners = [];
    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onBlur = this.clear.bind(this);
    this._onVisibility = () => { if (document.hidden) this.clear(); };
    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  _onDown(e) {
    this.keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }

  _onUp(e) {
    this.keys[e.code] = false;
  }

  // Called after the first simulation step that can consume a press edge.
  consumePressed() {
    this._pressedPulses.clear();
  }

  // Is key currently held?
  held(code) { return !!this.keys[code]; }

  // Just pressed this frame, including a very quick pointer tap.
  pressed(code) {
    return (!!this.keys[code] && !this.prev[code]) || this._pressedPulses.has(code);
  }

  released(code) { return !this.keys[code] && !!this.prev[code]; }

  // D-pad / virtual stick
  get left()  { return this.held('ArrowLeft') || this.held('KeyA') || this.held('TouchLeft'); }
  get right() { return this.held('ArrowRight') || this.held('KeyD') || this.held('TouchRight'); }
  get up()    { return this.held('ArrowUp') || this.held('KeyW') || this.held('TouchUp'); }
  get down()  { return this.held('ArrowDown') || this.held('KeyS') || this.held('TouchDown'); }

  // A button = jump (Z / Space / left virtual button)
  get A()      { return this.held('KeyZ') || this.held('Space') || this.held('TouchJump'); }
  get pressA() { return this.pressed('KeyZ') || this.pressed('Space') || this.pressed('TouchJump'); }

  // B button = attack (X / Enter / right virtual button)
  get B()      { return this.held('KeyX') || this.held('Enter') || this.held('TouchAttack'); }
  get pressB() { return this.pressed('KeyX') || this.pressed('Enter') || this.pressed('TouchAttack'); }

  // Start = pause/rune select
  get start() { return this.pressed('Escape') || this.pressed('KeyP') || this.pressed('TouchMenu'); }
  get select() { return this.pressed('Tab') || this.pressed('KeyQ'); }

  attachTouchControls({ stick, knob, jump, attack, menu }) {
    if (!stick) return;

    const button = (element, code) => {
      if (!element) return;
      const pointers = new Set();
      this._buttonOwners.push({ pointers, element, code });
      const down = (e) => {
        e.preventDefault();
        pointers.add(e.pointerId);
        this.keys[code] = true;
        this._pressedPulses.add(code);
        element.classList.add('active');
        if (element.setPointerCapture) element.setPointerCapture(e.pointerId);
      };
      const up = (e) => {
        e.preventDefault();
        pointers.delete(e.pointerId);
        if (pointers.size === 0) {
          this.keys[code] = false;
          element.classList.remove('active');
        }
      };
      element.addEventListener('pointerdown', down, { passive: false });
      element.addEventListener('pointerup', up, { passive: false });
      element.addEventListener('pointercancel', up, { passive: false });
      element.addEventListener('lostpointercapture', up, { passive: false });
      this._cleanups.push(() => {
        element.removeEventListener('pointerdown', down);
        element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', up);
        element.removeEventListener('lostpointercapture', up);
      });
    };

    const stickMove = (e) => {
      if (this._stickPointer !== e.pointerId) return;
      e.preventDefault();
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width * 0.34;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const distance = Math.hypot(dx, dy) || 1;
      const scale = Math.min(1, max / distance);
      const knobX = dx * scale;
      const knobY = dy * scale;
      if (knob) knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
      const dead = Math.max(8, rect.width * 0.12);
      this.keys.TouchLeft = dx < -dead;
      this.keys.TouchRight = dx > dead;
      this.keys.TouchUp = dy < -dead;
      this.keys.TouchDown = dy > dead;
    };
    const stickDown = (e) => {
      e.preventDefault();
      if (this._stickPointer !== null) return;
      this._stickPointer = e.pointerId;
      if (stick.setPointerCapture) stick.setPointerCapture(e.pointerId);
      stickMove(e);
    };
    const stickUp = (e) => {
      if (this._stickPointer !== e.pointerId) return;
      e.preventDefault();
      this._stickPointer = null;
      this.keys.TouchLeft = false;
      this.keys.TouchRight = false;
      this.keys.TouchUp = false;
      this.keys.TouchDown = false;
      if (knob) knob.style.transform = 'translate(-50%, -50%)';
    };

    stick.addEventListener('pointerdown', stickDown, { passive: false });
    stick.addEventListener('pointermove', stickMove, { passive: false });
    stick.addEventListener('pointerup', stickUp, { passive: false });
    stick.addEventListener('pointercancel', stickUp, { passive: false });
    stick.addEventListener('lostpointercapture', stickUp, { passive: false });
    this._cleanups.push(() => {
      stick.removeEventListener('pointerdown', stickDown);
      stick.removeEventListener('pointermove', stickMove);
      stick.removeEventListener('pointerup', stickUp);
      stick.removeEventListener('pointercancel', stickUp);
      stick.removeEventListener('lostpointercapture', stickUp);
    });

    button(jump, 'TouchJump');
    button(attack, 'TouchAttack');
    button(menu, 'TouchMenu');
  }

  destroy() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibility);
    for (const cleanup of this._cleanups) cleanup();
    this._cleanups = [];
  }

  clear() {
    for (const owner of this._buttonOwners) {
      owner.pointers.clear();
      owner.element.classList.remove('active');
      this.keys[owner.code] = false;
    }
    this._stickPointer = null;
    this.keys.TouchLeft = false;
    this.keys.TouchRight = false;
    this.keys.TouchUp = false;
    this.keys.TouchDown = false;
    this.prev = {};
    this._pressedPulses.clear();
    const knob = document.getElementById('stick-knob');
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
  }
}
