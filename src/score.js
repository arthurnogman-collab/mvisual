/**
 * Score system + HUD — tracks points, displays score with style.
 */
export class Score {
  constructor() {
    this.value = 0;
    this.displayValue = 0; // smoothly animates toward value
    this.combo = 0;
    this.maxCombo = 0;

    // Create HUD elements
    this.container = document.createElement('div');
    this.container.id = 'hud';
    this.container.innerHTML = `
      <div id="hud-score">0</div>
      <div id="hud-combo"></div>
    `;
    document.body.appendChild(this.container);

    // Style
    const style = document.createElement('style');
    style.textContent = `
      #hud {
        position: fixed;
        top: 30px;
        right: 40px;
        z-index: 5;
        pointer-events: none;
        text-align: right;
      }
      #hud-score {
        font-family: 'Georgia', serif;
        font-size: 1.8rem;
        color: #fff;
        opacity: 0;
        letter-spacing: 0.1em;
        text-shadow: 0 0 15px rgba(255,255,255,0.3);
        transition: opacity 1s ease;
      }
      #hud-score.visible { opacity: 0.7; }
      #hud-combo {
        font-family: 'Georgia', serif;
        font-size: 0.9rem;
        color: rgba(255,220,150,0.8);
        letter-spacing: 0.15em;
        margin-top: 4px;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      #hud-combo.visible { opacity: 1; }
      #hud-score.flash {
        text-shadow: 0 0 30px rgba(255,255,255,0.8), 0 0 60px rgba(255,200,100,0.4);
      }
    `;
    document.head.appendChild(style);

    this.scoreEl = document.getElementById('hud-score');
    this.comboEl = document.getElementById('hud-combo');
    this.visible = false;
  }

  /** Show the HUD (called when gameplay starts) */
  show() {
    if (!this.visible) {
      this.visible = true;
      this.scoreEl.classList.add('visible');
    }
  }

  /** Hide the HUD */
  hide() {
    this.visible = false;
    this.scoreEl.classList.remove('visible');
    this.comboEl.classList.remove('visible');
  }

  /** Add points (with combo multiplier) */
  add(points) {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const multiplier = Math.min(1 + Math.floor(this.combo / 5) * 0.5, 4);
    this.value += Math.round(points * multiplier);

    // Flash effect
    this.scoreEl.classList.add('flash');
    setTimeout(() => this.scoreEl.classList.remove('flash'), 200);

    // Show combo
    if (this.combo >= 3) {
      this.comboEl.textContent = `${this.combo}x`;
      this.comboEl.classList.add('visible');
    }
  }

  /** Break combo (missed something or hit obstacle) */
  breakCombo() {
    this.combo = 0;
    this.comboEl.classList.remove('visible');
  }

  /** Call every frame */
  update(dt) {
    // Smooth score display
    this.displayValue += (this.value - this.displayValue) * dt * 8;
    if (Math.abs(this.displayValue - this.value) < 1) this.displayValue = this.value;

    if (this.visible) {
      this.scoreEl.textContent = Math.round(this.displayValue).toLocaleString();
    }
  }
}
