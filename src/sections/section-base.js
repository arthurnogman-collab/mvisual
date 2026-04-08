/**
 * Base class for all sections.
 * Each section owns its own scene objects and cleans up after itself.
 *
 * Lifecycle:
 *   enter(ctx)          — called when this section becomes active
 *   update(dt, ctx)     — called every frame while active
 *   exit(ctx)           — called when transitioning out, must clean up scene objects
 *
 * ctx = { scene, camera, renderer, player, audio, input, clock }
 */
export class SectionBase {
  constructor(id, startTime, endTime) {
    this.id = id;
    this.startTime = startTime;
    this.endTime = endTime;
    this.objects = [];    // track added scene objects for cleanup
    this.active = false;
    this.localTime = 0;  // time since section started
    this.progress = 0;   // 0..1 progress through section
  }

  /** Add an object to the scene and track it for cleanup */
  add(obj, ctx) {
    ctx.scene.add(obj);
    this.objects.push(obj);
    return obj;
  }

  /** Override in subclass — set up scene objects */
  enter(ctx) {
    this.active = true;
    this.localTime = 0;
  }

  /** Override in subclass — per-frame logic */
  update(dt, ctx) {
    const songTime = ctx.audio.currentTime;
    this.localTime = songTime - this.startTime;
    this.progress = Math.min(this.localTime / (this.endTime - this.startTime), 1);
  }

  /** Override in subclass — clean up. Always call super.exit() */
  exit(ctx) {
    this.active = false;
    for (const obj of this.objects) {
      ctx.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    this.objects = [];
  }

  /** Transition progress: 0 at start of transition, 1 when fully transitioned out.
   *  Last 2 seconds of section are transition time. */
  get transitionOut() {
    const transTime = 2;
    const remaining = this.endTime - this.startTime - this.localTime;
    if (remaining > transTime) return 0;
    return 1 - (remaining / transTime);
  }
}
