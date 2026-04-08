/**
 * Story — manages text overlays that fade in/out over the visuals.
 * Sections schedule messages with timing.
 */
export class Story {
  constructor() {
    this.el = document.getElementById('story-text');
    this.queue = [];
    this.currentMsg = null;
    this.hideTimer = null;
  }

  /**
   * Show a message at a specific song time.
   * @param {string} text - The message
   * @param {number} showAt - Song time to show (seconds)
   * @param {number} duration - How long to show (seconds)
   * @param {string} style - 'normal' or 'bright'
   */
  schedule(text, showAt, duration = 4, style = 'normal') {
    this.queue.push({ text, showAt, hideAt: showAt + duration, style, shown: false, hidden: false });
  }

  /** Clear all scheduled messages */
  clear() {
    this.queue = [];
    this.hide();
  }

  /** Call every frame with current song time */
  update(songTime) {
    for (const msg of this.queue) {
      if (!msg.shown && songTime >= msg.showAt) {
        msg.shown = true;
        this.show(msg.text, msg.style);
      }
      if (!msg.hidden && songTime >= msg.hideAt) {
        msg.hidden = true;
        this.hide();
      }
    }
  }

  show(text, style = 'normal') {
    this.el.textContent = text;
    this.el.className = style === 'bright' ? 'bright' : 'visible';
  }

  hide() {
    this.el.className = '';
  }
}
