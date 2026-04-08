/**
 * Section chain — manages the ordered list of sections,
 * handles transitions based on song time.
 *
 * Each section only knows about itself.
 * The chain handles enter/exit sequencing.
 */
export class SectionChain {
  constructor() {
    this.sections = [];
    this.currentIndex = -1;
    this.current = null;
  }

  /** Register a section. Must be added in chronological order. */
  add(section) {
    this.sections.push(section);
  }

  /** Call every frame with current song time */
  update(dt, ctx) {
    const songTime = ctx.audio.currentTime;

    // Find which section we should be in
    let targetIndex = -1;
    for (let i = 0; i < this.sections.length; i++) {
      if (songTime >= this.sections[i].startTime && songTime < this.sections[i].endTime) {
        targetIndex = i;
        break;
      }
    }

    // Transition if needed
    if (targetIndex !== this.currentIndex) {
      if (this.current) {
        this.current.exit(ctx);
      }
      this.currentIndex = targetIndex;
      if (targetIndex >= 0) {
        this.current = this.sections[targetIndex];
        this.current.enter(ctx);
      } else {
        this.current = null;
      }
    }

    // Update active section
    if (this.current) {
      this.current.update(dt, ctx);
    }
  }
}
