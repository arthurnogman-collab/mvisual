/**
 * Score system + HUD — tracks points, displays score with style.
 * Includes floating "+50" popups that animate upward and fade.
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

    // Floating popup container
    this.popupContainer = document.createElement('div');
    this.popupContainer.id = 'score-popups';
    document.body.appendChild(this.popupContainer);

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
      #score-popups {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 6;
        overflow: hidden;
      }
      .score-popup {
        position: absolute;
        font-family: 'Georgia', serif;
        font-size: 1.2rem;
        letter-spacing: 0.1em;
        color: #fff;
        text-shadow: 0 0 10px rgba(255,255,255,0.5), 0 0 20px rgba(100,200,255,0.3);
        animation: scoreFloat 1.2s ease-out forwards;
        pointer-events: none;
      }
      .score-popup.hit {
        color: #ff4444;
        text-shadow: 0 0 10px rgba(255,50,50,0.5);
      }
      @keyframes scoreFloat {
        0% {
          opacity: 1;
          transform: translateY(0) scale(1.2);
        }
        30% {
          opacity: 1;
          transform: translateY(-20px) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateY(-60px) scale(0.8);
        }
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

  /** Add points (with combo multiplier) — spawns floating popup */
  add(points) {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const multiplier = Math.min(1 + Math.floor(this.combo / 5) * 0.5, 4);
    const earned = Math.round(points * multiplier);
    this.value += earned;

    // Flash effect
    this.scoreEl.classList.add('flash');
    setTimeout(() => this.scoreEl.classList.remove('flash'), 200);

    // Show combo
    if (this.combo >= 3) {
      this.comboEl.textContent = `${this.combo}x`;
      this.comboEl.classList.add('visible');
    }

    // Floating popup
    this._spawnPopup(`+${earned}`, false);
  }

  /** Break combo (missed something or hit obstacle) */
  breakCombo() {
    if (this.combo > 0) {
      this._spawnPopup('MISS', true);
    }
    this.combo = 0;
    this.comboEl.classList.remove('visible');
  }

  /** Spawn a floating score popup at a semi-random position */
  _spawnPopup(text, isHit) {
    const popup = document.createElement('div');
    popup.className = 'score-popup' + (isHit ? ' hit' : '');
    popup.textContent = text;
    // Random horizontal position near center-left of screen
    const x = 15 + Math.random() * 25; // 15-40% from left
    const y = 40 + Math.random() * 20; // 40-60% from top
    popup.style.left = x + '%';
    popup.style.top = y + '%';
    this.popupContainer.appendChild(popup);
    // Remove after animation
    setTimeout(() => popup.remove(), 1300);
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
