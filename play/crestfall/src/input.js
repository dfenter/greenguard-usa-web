// Input adapter backed entirely by GGKit's keyboard and pointer registry.
// Controls claim a pointer at pointerdown so multi-touch ownership is stable.

export class Input {
  constructor(kit) {
    this.kit = kit;
    this._previous = {};
    this._pulses = new Set();
    this._cleanups = [];
    this._buttonOwners = [];
    this._stickPointer = null;
    this._previousDirection = { up: false, down: false, left: false, right: false };
  }

  _touchHeld(code) {
    for (const pointer of this.kit.input.pointers.values()) {
      if (pointer.zone === code) return true;
    }
    return false;
  }

  held(code) {
    if (code.startsWith('Touch')) return this._touchHeld(code);
    if (code.startsWith('Pad')) return this._padHeld(code);
    return this.kit.input.keyDown(code);
  }

  pressed(code) {
    return this._pulses.has(code) || (this.held(code) && !this._previous[code]);
  }

  endStep() {
    const codes = [
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA',
      'KeyS', 'KeyD', 'KeyZ', 'Space', 'KeyX', 'Enter', 'Escape', 'KeyP',
      'Tab', 'KeyQ', 'TouchJump', 'TouchAttack', 'TouchMenu',
      'PadA', 'PadB', 'PadStart', 'PadSelect',
    ];
    this._previous = Object.fromEntries(codes.map((code) => [code, this.held(code)]));
    this._previousDirection = {
      up: this.up, down: this.down, left: this.left, right: this.right,
    };
    this._pulses.clear();
  }

  get left() { return this.held('ArrowLeft') || this.held('KeyA') || this._axis().x < -0.25; }
  get right() { return this.held('ArrowRight') || this.held('KeyD') || this._axis().x > 0.25; }
  get up() { return this.held('ArrowUp') || this.held('KeyW') || this._axis().y < -0.25; }
  get down() { return this.held('ArrowDown') || this.held('KeyS') || this._axis().y > 0.25; }

  get A() { return this.held('KeyZ') || this.held('Space') || this.held('TouchJump') || this.held('PadA'); }
  get pressA() { return this.pressed('KeyZ') || this.pressed('Space') || this.pressed('TouchJump') || this.pressed('PadA'); }
  get B() { return this.held('KeyX') || this.held('Enter') || this.held('TouchAttack') || this.held('PadB'); }
  get pressB() { return this.pressed('KeyX') || this.pressed('Enter') || this.pressed('TouchAttack') || this.pressed('PadB'); }
  get start() { return this.pressed('Escape') || this.pressed('KeyP') || this.pressed('TouchMenu') || this.pressed('PadStart'); }
  get select() { return this.pressed('Tab') || this.pressed('KeyQ') || this.pressed('PadSelect'); }

  directionPressed(direction) {
    return this[direction] && !this._previousDirection[direction];
  }

  _gamepad() {
    try {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
      return Array.from(navigator.getGamepads()).find((pad) => pad && pad.connected) || null;
    } catch (_error) {
      return null;
    }
  }

  _padHeld(code) {
    const pad = this._gamepad();
    if (!pad) return false;
    const buttons = pad.buttons || [];
    const pressed = (index) => !!buttons[index]?.pressed;
    if (code === 'PadA') return pressed(0);
    if (code === 'PadB') return pressed(1);
    if (code === 'PadSelect') return pressed(8);
    if (code === 'PadStart') return pressed(9);
    return false;
  }

  _padAxis() {
    const pad = this._gamepad();
    if (!pad) return { x: 0, y: 0 };
    const buttons = pad.buttons || [];
    const axisX = Number(pad.axes?.[0]) || 0;
    const axisY = Number(pad.axes?.[1]) || 0;
    return {
      x: (buttons[14]?.pressed ? -1 : 0) + (buttons[15]?.pressed ? 1 : 0) || axisX,
      y: (buttons[12]?.pressed ? -1 : 0) + (buttons[13]?.pressed ? 1 : 0) || axisY,
    };
  }

  _axis() {
    let stick = { x: 0, y: 0 };
    if (this._stickPointer !== null) {
      const pointer = this.kit.input.pointers.get(this._stickPointer);
      const element = this._stickElement;
      if (pointer && element) {
        const rect = element.getBoundingClientRect();
        stick = {
          x: Math.max(-1, Math.min(1, (pointer.x - (rect.left + rect.width / 2)) / (rect.width * 0.34))),
          y: Math.max(-1, Math.min(1, (pointer.y - (rect.top + rect.height / 2)) / (rect.height * 0.34))),
        };
      }
    }
    const pad = this._padAxis();
    return {
      x: Math.abs(stick.x) >= Math.abs(pad.x) ? stick.x : pad.x,
      y: Math.abs(stick.y) >= Math.abs(pad.y) ? stick.y : pad.y,
    };
  }

  _claim(pointerId, x, y, zone) {
    const pointer = this.kit.input.pointers.get(pointerId) || {
      x, y, startX: x, startY: y, downAt: performance.now(), zone: null,
    };
    pointer.x = x;
    pointer.y = y;
    pointer.zone = zone;
    this.kit.input.pointers.set(pointerId, pointer);
  }

  attachTouchControls({ stick, knob, jump, attack, menu }) {
    this._stickElement = stick || null;

    const bindButton = (element, code) => {
      if (!element) return;
      const pointers = new Set();
      const down = (event) => {
        event.preventDefault();
        pointers.add(event.pointerId);
        this._claim(event.pointerId, event.clientX, event.clientY, code);
        this._pulses.add(code);
        element.classList.add('active');
        element.setPointerCapture?.(event.pointerId);
      };
      const up = (event) => {
        event.preventDefault();
        pointers.delete(event.pointerId);
        const pointer = this.kit.input.pointers.get(event.pointerId);
        if (pointer?.zone === code) this.kit.input.pointers.delete(event.pointerId);
        if (!pointers.size) element.classList.remove('active');
      };
      element.addEventListener('pointerdown', down, { passive: false });
      element.addEventListener('pointerup', up, { passive: false });
      element.addEventListener('pointercancel', up, { passive: false });
      element.addEventListener('lostpointercapture', up, { passive: false });
      this._buttonOwners.push({ pointers, element, code });
      this._cleanups.push(() => {
        element.removeEventListener('pointerdown', down);
        element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', up);
        element.removeEventListener('lostpointercapture', up);
      });
    };

    if (stick) {
      const move = (event) => {
        if (this._stickPointer !== event.pointerId) return;
        event.preventDefault();
        this._claim(event.pointerId, event.clientX, event.clientY, 'stick');
        const rect = stick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const distance = Math.hypot(event.clientX - cx, event.clientY - cy) || 1;
        const scale = Math.min(1, rect.width * 0.34 / distance);
        if (knob) knob.style.transform = `translate(calc(-50% + ${(event.clientX - cx) * scale}px), calc(-50% + ${(event.clientY - cy) * scale}px))`;
      };
      const down = (event) => {
        event.preventDefault();
        if (this._stickPointer !== null) return;
        this._stickPointer = event.pointerId;
        this._claim(event.pointerId, event.clientX, event.clientY, 'stick');
        stick.setPointerCapture?.(event.pointerId);
        move(event);
      };
      const up = (event) => {
        if (this._stickPointer !== event.pointerId) return;
        event.preventDefault();
        this.kit.input.pointers.delete(event.pointerId);
        this._stickPointer = null;
        if (knob) knob.style.transform = 'translate(-50%, -50%)';
      };
      stick.addEventListener('pointerdown', down, { passive: false });
      stick.addEventListener('pointermove', move, { passive: false });
      stick.addEventListener('pointerup', up, { passive: false });
      stick.addEventListener('pointercancel', up, { passive: false });
      stick.addEventListener('lostpointercapture', up, { passive: false });
      this._cleanups.push(() => {
        stick.removeEventListener('pointerdown', down);
        stick.removeEventListener('pointermove', move);
        stick.removeEventListener('pointerup', up);
        stick.removeEventListener('pointercancel', up);
        stick.removeEventListener('lostpointercapture', up);
      });
    }

    bindButton(jump, 'TouchJump');
    bindButton(attack, 'TouchAttack');
    bindButton(menu, 'TouchMenu');
  }

  clear() {
    this.kit.input.clearAll();
    this._previous = {};
    this._pulses.clear();
    this._previousDirection = { up: false, down: false, left: false, right: false };
    this._stickPointer = null;
    for (const owner of this._buttonOwners) {
      owner.pointers.clear();
      owner.element.classList.remove('active');
    }
    const knob = document.getElementById('stick-knob');
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
  }

  destroy() {
    for (const cleanup of this._cleanups) cleanup();
    this._cleanups = [];
    this.clear();
  }
}
