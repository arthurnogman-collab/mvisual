/**
 * Score system + HUD — the player ball IS the score feedback.
 * When scoring, the ball pulses bigger and shifts color.
 * Sections read score.flash to drive player ball visuals.
 * Score number rolls up in the HUD with a satisfying counter effect.
 */
export class Score {
  constructor() {
    this.value = 0;
    this.displayValue = 0;
    this.combo = 0;
    this.maxCombo = 0;

    // Flash state — sections read these to drive ball visuals
    this.flash = 0;          // 0-1, decays each frame. Sections scale ball by this.
    this.flashHue = 0.5;     // hue of the current flash color
    this.hitFlash = 0;       // 0-1, red flash on miss
    this.lastEarned = 0;     // last points earned (for display)

    // Create HUD
    this.container = document.createElement('div');
    this.container.id = 'hud';
    this.container.innerHTML = `
      <div id="hud-score">0</div>
      <div id="hud-combo"></div>
    `;
    document.body.appendChild(this.container);

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
        font-family: 'Orbitron', monospace;
        font-size: 1.8rem;
        font-weight: 700;
        color: #0ff;
        opacity: 0;
        letter-spacing: 0.15em;
        text-shadow: 0 0 10px rgba(0,255,255,0.5), 0 0 30px rgba(0,255,255,0.2);
        transition: opacity 1s ease;
      }
      #hud-score.visible { opacity: 0.85; }
      #hud-combo {
        font-family: 'Orbitron', monospace;
        font-size: 0.9rem;
        color: rgba(0,255,200,0.8);
        letter-spacing: 0.15em;
        margin-top: 4px;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      #hud-combo.visible { opacity: 1; }
      #hud-score.pulse {
        color: #fff;
        text-shadow: 0 0 15px rgba(0,255,255,0.9), 0 0 40px rgba(0,255,255,0.5), 0 0 80px rgba(0,100,255,0.3);
        transform: scale(1.15);
        transition: transform 0.1s ease-out, color 0.1s, text-shadow 0.1s;
      }
      #hud-score.hit {
        color: #f44;
        text-shadow: 0 0 15px rgba(255,50,50,0.8), 0 0 40px rgba(255,0,0,0.3);
        transform: scale(0.95);
        transition: transform 0.05s, color 0.05s, text-shadow 0.05s;
      }
    `;
    document.head.appendChild(style);

    this.scoreEl = document.getElementById('hud-score');
    this.comboEl = document.getElementById('hud-combo');
    this.visible = false;
  }

  show() {
    if (!this.visible) {
      this.visible = true;
      this.scoreEl.classList.add('visible');
    }
  }

  hide() {
    this.visible = false;
    this.scoreEl.classList.remove('visible');
    this.comboEl.classList.remove('visible');
  }

  /** Add points — triggers ball flash + score pulse + floating number */
  add(points) {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const multiplier = Math.min(1 + Math.floor(this.combo / 5) * 0.5, 4);
    const earned = Math.round(points * multiplier);
    this.value += earned;
    this.lastEarned = earned;

    // Ball flash — intensity scales with combo
    this.flash = Math.min(0.5 + this.combo * 0.05, 1.0);
    // Hue cycles through the rainbow as combo builds
    this.flashHue = (this.flashHue + 0.08) % 1.0;

    // Score text pulse
    this.scoreEl.classList.remove('hit');
    this.scoreEl.classList.add('pulse');
    setTimeout(() => this.scoreEl.classList.remove('pulse'), 150);

    // Show combo
    if (this.combo >= 3) {
      this.comboEl.textContent = `${this.combo}x`;
      this.comboEl.classList.add('visible');
    }

    // Floating score number
    this._spawnFloatingScore(`+${earned}`, earned >= 100 ? 'big' : 'normal');
  }

  /** Spawn a floating score number that rises and fades */
  _spawnFloatingScore(text, size) {
    const el = document.createElement('div');
    el.className = 'float-score ' + size;
    el.textContent = text;
    // Random horizontal offset so they don't stack
    const xOff = (Math.random() - 0.5) * 120;
    el.style.left = `calc(50% + ${xOff}px)`;
    document.body.appendChild(el);
    // Force reflow then animate
    el.offsetHeight;
    el.classList.add('go');
    setTimeout(() => el.remove(), 1200);
  }

  /** Break combo — red flash on ball, lose points */
  breakCombo() {
    const penalty = -50 - Math.min(this.combo * 10, 200); // bigger penalty if combo was high
    this.value = Math.max(0, this.value + penalty);
    this.hitFlash = 1.0;
    this.scoreEl.classList.remove('pulse');
    this.scoreEl.classList.add('hit');
    setTimeout(() => this.scoreEl.classList.remove('hit'), 300);

    // Show negative floating number
    this._spawnFloatingScore(`${penalty}`, 'bad');

    this.combo = 0;
    this.comboEl.classList.remove('visible');
  }

  /** Call every frame */
  update(dt) {
    // Smooth score counter — rolls up fast then slows
    this.displayValue += (this.value - this.displayValue) * dt * 8;
    if (Math.abs(this.displayValue - this.value) < 1) this.displayValue = this.value;

    if (this.visible) {
      this.scoreEl.textContent = Math.round(this.displayValue).toLocaleString();
    }

    // Decay flash states
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
    }
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    }
  }
}
