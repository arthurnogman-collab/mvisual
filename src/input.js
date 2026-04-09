/**
 * Input — tracks mouse + keyboard for movement and jump.
 * Mouse X controls left/right, mouse click = jump.
 * Keyboard still works as fallback.
 */
export class Input {
  constructor() {
    // Keyboard state
    this.keys = {};
    this._justPressed = {};

    // Mouse state
    this.mouseX = 0;          // normalized -1 (left) to +1 (right)
    this.mouseY = 0;          // normalized -1 (bottom) to +1 (top)
    this._mouseJustClicked = false;
    this._mouseDown = false;
    this._rightJustClicked = false; // right-click for attack

    // Dead zone — mouse near center doesn't trigger left/right
    this.deadZone = 0.08;

    // ── Keyboard listeners ──
    window.addEventListener('keydown', (e) => {
      if (!this.keys[e.code]) {
        this._justPressed[e.code] = true;
      }
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // ── Mouse listeners ──
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        // Pointer locked: accumulate deltas into virtual position
        this.mouseX += e.movementX / (window.innerWidth * 0.5);
        this.mouseY -= e.movementY / (window.innerHeight * 0.5);
        this.mouseX = Math.max(-1, Math.min(1, this.mouseX));
        this.mouseY = Math.max(-1, Math.min(1, this.mouseY));
      } else {
        this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseY = -((e.clientY / window.innerHeight) * 2 - 1);
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // left click = jump
        this._mouseJustClicked = true;
        this._mouseDown = true;
      }
      if (e.button === 2) { // right click = attack
        this._rightJustClicked = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this._mouseDown = false;
      }
    });

    // Prevent context menu on right-click during gameplay
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Call once per frame at the END of your update to clear just-pressed flags */
  flush() {
    this._justPressed = {};
    this._mouseJustClicked = false;
    this._rightJustClicked = false;
  }

  // ── Movement (combines keyboard + mouse) ──

  get left() {
    return this.keys['ArrowLeft'] || this.keys['KeyA'] || this.mouseX < -this.deadZone;
  }

  get right() {
    return this.keys['ArrowRight'] || this.keys['KeyD'] || this.mouseX > this.deadZone;
  }

  /** How far left/right the mouse is (-1 to +1), for smooth analog movement */
  get moveAmount() {
    const raw = this.mouseX;
    if (Math.abs(raw) < this.deadZone) return 0;
    // Remap dead-zone..1 to 0..1, preserve sign
    const sign = Math.sign(raw);
    return sign * Math.min(1, (Math.abs(raw) - this.deadZone) / (1 - this.deadZone));
  }

  get up() {
    return this.keys['ArrowUp'] || this.keys['KeyW'] || false;
  }

  get down() {
    return this.keys['ArrowDown'] || this.keys['KeyS'] || false;
  }

  get space() { return this.keys['Space'] || false; }

  // ── Jump (edge-detected: true only on frame of press/click) ──

  get spaceDown() {
    return this._justPressed['Space'] || this._mouseJustClicked || false;
  }

  get upDown() {
    return this._justPressed['ArrowUp'] || this._justPressed['KeyW'] || this._mouseJustClicked || false;
  }

  /** Generic "jump pressed this frame" — use this in sections */
  get jumpDown() {
    return this._justPressed['Space'] || this._justPressed['ArrowUp']
      || this._justPressed['KeyW'] || this._mouseJustClicked || false;
  }

  /** Attack pressed this frame (right-click or F key) */
  get attackDown() {
    return this._rightJustClicked || this._justPressed['KeyF'] || false;
  }
}
