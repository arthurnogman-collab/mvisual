/**
 * Keyboard input — tracks left/right, up/down, space
 */
export class Input {
  constructor() {
    this.keys = {};
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  get left()  { return this.keys['ArrowLeft']  || this.keys['KeyA'] || false; }
  get right() { return this.keys['ArrowRight'] || this.keys['KeyD'] || false; }
  get up()    { return this.keys['ArrowUp']    || this.keys['KeyW'] || false; }
  get down()  { return this.keys['ArrowDown']  || this.keys['KeyS'] || false; }
  get space() { return this.keys['Space'] || false; }
}
