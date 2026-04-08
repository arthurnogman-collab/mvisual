import * as THREE from 'three';
import { SectionBase } from './section-base.js';

/**
 * SECTION 2 — "The Awakening" (0:30 – 1:00)
 *
 * Music: Music box melody enters (F# minor arpeggios), Serum #5 pad continues.
 *        No drums, no bass. Pure melody — a gift after the tunnel.
 *
 * Concept: You broke through the light. The tunnel is gone.
 *          You're floating in an infinite open space — the other side.
 *          The melody is being born, and each note manifests as a glowing orb
 *          you can collect. The world is waking up around you.
 *
 * Gameplay: Collect melody orbs for score. First taste of gamification.
 *           No obstacles yet — just rewards.
 */

// Pre-baked music box note timings from MIDI (Section 2: 30s-60s)
// Each entry: [time, midiNote] — only unique onsets, no simultaneous duplicates
const MELODY_NOTES = [
  [30.000, 81], [30.234, 83], [30.469, 85], [30.703, 80],
  [33.750, 81], [33.984, 80], [34.219, 76], [34.453, 81],
  [37.031, 76], [37.266, 78], [37.500, 81], [37.734, 83],
  [37.969, 85], [38.203, 80],
  [40.781, 76], [41.016, 78], [41.250, 90], [41.484, 88],
  [41.719, 83], [41.953, 78],
  [44.531, 76], [44.766, 78], [45.000, 81], [45.234, 83],
  [45.469, 85], [45.703, 80],
  [48.750, 81], [48.984, 80], [49.219, 76], [49.453, 81],
  [52.031, 76], [52.266, 78], [52.500, 81], [52.734, 83],
  [52.969, 85], [53.203, 80],
  [55.781, 76], [56.016, 78], [56.250, 81],
  [57.656, 88], [57.891, 90],
  [59.531, 88], [59.766, 87],
];

// Map MIDI note to a vertical position (higher note = higher in space)
function noteToY(note) {
  return ((note - 60) / 30) * 3 + 1; // roughly 0-3 range
}

// Map MIDI note to a hue (each pitch class gets a color)
function noteToHue(note) {
  const pc = note % 12;
  return pc / 12;
}

// Map MIDI note to lateral spread (alternating left/right based on phrase position)
function noteToX(note, index) {
  const spread = 2.5;
  // Use note pitch to create gentle lateral spread
  return Math.sin(index * 0.7 + note * 0.3) * spread;
}

export class Section2 extends SectionBase {
  constructor() {
    super('the-awakening', 30, 60);
    this.orbs = [];           // { mesh, glowMesh, time, note, collected, spawned }
    this.orbPool = [];
    this.trailParticles = null;
    this.backgroundStars = null;
    this.groundPlane = null;
    this.mandala = null;
    this.collectEffects = [];
  }

  enter(ctx) {
    super.enter(ctx);

    // Open space — the other side
    ctx.scene.fog = new THREE.FogExp2(0x020208, 0.015);
    ctx.renderer.setClearColor(0x010105);

    // Bloom — warm and dreamy
    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 2.0;
      ctx.bloomPass.radius = 0.8;
      ctx.bloomPass.threshold = 0.1;
    }

    // Player — now slightly warmer
    ctx.player.speed = 5;
    ctx.player.glowMat.uniforms.uColor.value.set(1.0, 0.95, 0.85);

    // Camera — wider, pulled back to show the space
    ctx.camera.fov = 80;
    ctx.camera.updateProjectionMatrix();

    // Ambient — slightly brighter than the tunnel
    this.ambient = new THREE.AmbientLight(0x1a1a2e, 0.4);
    this.add(this.ambient, ctx);

    // Directional light from above — subtle warmth
    this.dirLight = new THREE.DirectionalLight(0xffeedd, 0.3);
    this.dirLight.position.set(0, 10, -5);
    this.add(this.dirLight, ctx);

    // Story
    ctx.story.clear();
    ctx.story.schedule('you made it', 31, 3, 'bright');
    ctx.story.schedule('the melody is yours', 37, 3);
    ctx.story.schedule('collect the light', 44, 3);

    // Show score HUD
    ctx.score.show();

    this._buildBackground(ctx);
    this._buildGroundMandala(ctx);
    this._prepareOrbs(ctx);
    this._buildPlayerTrail(ctx);
  }

  _buildBackground(ctx) {
    // Distant stars — we're in a vast cosmic space now
    const count = 800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Sphere distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 80 + Math.random() * 40;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Warm/cool mix
      const warm = Math.random() > 0.5;
      const c = new THREE.Color().setHSL(
        warm ? 0.08 + Math.random() * 0.05 : 0.6 + Math.random() * 0.1,
        0.3,
        0.4 + Math.random() * 0.4
      );
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.backgroundStars = this.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })), ctx);
  }

  _buildGroundMandala(ctx) {
    // A sacred geometry mandala that slowly forms below as the melody plays
    // It's a flat disc on the ground with concentric rings
    const group = new THREE.Group();

    // Concentric rings
    for (let i = 0; i < 8; i++) {
      const radius = 5 + i * 4;
      const segments = 6 * (i + 1); // increasingly detailed
      const geo = new THREE.RingGeometry(radius - 0.03, radius + 0.03, segments);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.08 + i * 0.02, 0.4, 0.3),
        transparent: true,
        opacity: 0,  // starts invisible, revealed by melody
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.userData.targetOpacity = 0.2;
      ring.userData.ringIndex = i;
      group.add(ring);
    }

    // Radial lines
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(angle) * 35, 0, Math.sin(angle) * 35),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xddaa66,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.userData.targetOpacity = 0.1;
      group.add(line);
    }

    group.rotation.x = -Math.PI / 2; // lay flat
    group.position.y = -1;
    this.mandala = this.add(group, ctx);
  }

  _prepareOrbs(ctx) {
    // Pre-create orb data from melody notes
    this.orbs = MELODY_NOTES.map(([time, note], index) => ({
      time,
      note,
      index,
      x: noteToX(note, index),
      y: noteToY(note),
      spawned: false,
      collected: false,
      mesh: null,
      glowMesh: null,
      light: null,
    }));
  }

  _spawnOrb(orb, ctx) {
    const hue = noteToHue(orb.note);
    const color = new THREE.Color().setHSL(hue, 0.6, 0.6);

    // Core sphere
    const geo = new THREE.IcosahedronGeometry(0.18, 2);
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
    });
    orb.mesh = new THREE.Mesh(geo, mat);

    // Glow shell
    const glowGeo = new THREE.IcosahedronGeometry(0.35, 2);
    const glowMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    orb.glowMesh = new THREE.Mesh(glowGeo, glowMat);

    // Small point light
    orb.light = new THREE.PointLight(color, 1, 5);

    // Group
    const group = new THREE.Group();
    group.add(orb.mesh);
    group.add(orb.glowMesh);
    group.add(orb.light);

    // Position: ahead of player, at the note-determined x/y
    const pPos = ctx.player.group.position;
    group.position.set(orb.x, orb.y, pPos.z - 25);

    orb.group = this.add(group, ctx);
    orb.spawned = true;
    orb.spawnZ = group.position.z;
  }

  _buildPlayerTrail(ctx) {
    // Soft trailing particles behind the player
    const count = 60;
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.trailParticles = this.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.08,
      color: 0xffeedd,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })), ctx);
    this.trailIndex = 0;
    this.trailCount = count;
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const songTime = ctx.audio.currentTime;
    const audio = ctx.audio;
    const pPos = ctx.player.group.position;

    // Camera — wider view, floating behind
    const targetCam = new THREE.Vector3(
      pPos.x * 0.25,
      pPos.y + 2.5,
      pPos.z + 6
    );
    ctx.camera.position.lerp(targetCam, dt * 2.5);
    ctx.camera.lookAt(pPos.x * 0.3, pPos.y + 0.3, pPos.z - 12);

    // Background stars follow player loosely
    if (this.backgroundStars) {
      this.backgroundStars.position.z = pPos.z;
      this.backgroundStars.rotation.y += dt * 0.005;
    }

    // Ground mandala follows and reveals over time
    if (this.mandala) {
      this.mandala.position.z = pPos.z;
      this.mandala.rotation.z += dt * 0.02;

      // Reveal rings progressively as melody plays
      const revealProgress = this.progress;
      this.mandala.children.forEach(child => {
        if (child.userData.ringIndex !== undefined) {
          const ringRevealAt = child.userData.ringIndex / 8;
          if (revealProgress > ringRevealAt) {
            const fadeIn = Math.min((revealProgress - ringRevealAt) * 4, 1);
            child.material.opacity = child.userData.targetOpacity * fadeIn;
          }
        } else if (child.material) {
          child.material.opacity = child.userData.targetOpacity * revealProgress;
        }
      });
    }

    // Spawn orbs ahead of time (2 seconds before their beat)
    for (const orb of this.orbs) {
      if (!orb.spawned && songTime >= orb.time - 2) {
        this._spawnOrb(orb, ctx);
      }
    }

    // Update orbs — check collection, animate
    for (const orb of this.orbs) {
      if (!orb.spawned || orb.collected) continue;

      const group = orb.group;

      // Float animation
      group.position.y = orb.y + Math.sin(songTime * 2 + orb.index) * 0.15;
      group.rotation.y += dt * 1.5;

      // Pulse with audio
      const pulse = 1 + audio.mid * 0.3;
      orb.glowMesh.scale.setScalar(pulse);

      // Collision detection with player
      const dist = group.position.distanceTo(pPos);
      if (dist < 1.2) {
        this._collectOrb(orb, ctx);
        continue;
      }

      // If orb passed behind player, it's missed
      if (group.position.z > pPos.z + 3) {
        this._missOrb(orb, ctx);
      }
    }

    // Update collection effects
    for (let i = this.collectEffects.length - 1; i >= 0; i--) {
      const fx = this.collectEffects[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        ctx.scene.remove(fx.particles);
        this.collectEffects.splice(i, 1);
        continue;
      }
      // Expand and fade
      const progress = 1 - fx.life / fx.maxLife;
      fx.particles.material.opacity = (1 - progress) * 0.6;
      const positions = fx.particles.geometry.attributes.position.array;
      for (let j = 0; j < positions.length; j += 3) {
        positions[j] += fx.velocities[j] * dt;
        positions[j + 1] += fx.velocities[j + 1] * dt;
        positions[j + 2] += fx.velocities[j + 2] * dt;
      }
      fx.particles.geometry.attributes.position.needsUpdate = true;
    }

    // Player trail
    if (this.trailParticles) {
      const positions = this.trailParticles.geometry.attributes.position.array;
      // Add current player position
      const idx = (this.trailIndex % this.trailCount) * 3;
      positions[idx] = pPos.x + (Math.random() - 0.5) * 0.2;
      positions[idx + 1] = pPos.y + (Math.random() - 0.5) * 0.2;
      positions[idx + 2] = pPos.z + (Math.random() - 0.5) * 0.2;
      this.trailIndex++;
      this.trailParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Speed ramps gently
    ctx.player.speed = 5 + this.progress * 2;

    // Warm color shift on player over time
    const warmth = this.progress * 0.2;
    ctx.player.glowMat.uniforms.uColor.value.set(1.0, 0.92 + warmth * 0.08, 0.8 + warmth * 0.15);
  }

  _collectOrb(orb, ctx) {
    orb.collected = true;
    ctx.score.add(100);

    // Burst effect — small particle explosion in the orb's color
    const color = orb.mesh.material.color;
    const count = 20;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const pos = orb.group.position;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      // Random outward velocity
      velocities[i * 3] = (Math.random() - 0.5) * 4;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 4;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.08,
      color: color,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(geo, mat);
    ctx.scene.add(particles);

    this.collectEffects.push({
      particles,
      velocities,
      life: 0.8,
      maxLife: 0.8,
    });

    // Remove the orb
    ctx.scene.remove(orb.group);
  }

  _missOrb(orb, ctx) {
    orb.collected = true; // mark as done
    ctx.score.breakCombo();

    // Fade out quietly
    ctx.scene.remove(orb.group);
  }

  exit(ctx) {
    // Cleanup collect effects
    for (const fx of this.collectEffects) {
      ctx.scene.remove(fx.particles);
    }
    this.collectEffects = [];
    this.orbs = [];
    this.mandala = null;
    this.backgroundStars = null;
    this.trailParticles = null;
    super.exit(ctx);
  }
}
