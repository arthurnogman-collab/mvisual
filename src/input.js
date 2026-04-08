/**
 * Keyboard input — tracks left/right, up/down, space
 * Supports both held state and just-pressed detection for actions like double jump.
 */
export class Input {
  constructor() {
    this.keys = {};
    this._justPressed = {};
    window.addEventListener('keydown', (e) => {
      if (!this.keys[e.code]) {
        this._justPressed[e.code] = true;
      }
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  /** Call once per frame at the END of your update to clear just-pressed flags */
  flush() {
    this._justPressed = {};
  }

  get left()  { return this.keys['ArrowLeft']  || this.keys['KeyA'] || false; }
  get right() { return this.keys['ArrowRight'] || this.keys['KeyD'] || false; }
  get up()    { return this.keys['ArrowUp']    || this.keys['KeyW'] || false; }
  get down()  { return this.keys['ArrowDown']  || this.keys['KeyS'] || false; }
  get space() { return this.keys['Space'] || false; }

  /** True only on the frame the key was first pressed */
  get spaceDown() { return this._justPressed['Space'] || false; }
  get upDown() { return this._justPressed['ArrowUp'] || this._justPressed['KeyW'] || false; }
}
