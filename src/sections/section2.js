import * as THREE from 'three';
import { SectionBase } from './section-base.js';

/**
 * SECTION 2 — "The Awakening" (0:30 – 1:00)
 *
 * Music: Music box melody enters (F# minor arpeggios), Serum #5 pad continues.
 *
 * Concept: You passed through the light → explosion → world snaps to a
 *          2D side-scrolling platformer. Each melody note erupts as a
 *          particle fountain you collect by running through it.
 *
 * Visual shift: 3D tunnel → 2D platformer is the dramatic section change.
 */

// Music box note timings from MIDI
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

function noteToHue(note) {
  return (note % 12) / 12;
}

// Map note to Y in 2D space (higher pitch = higher platform)
function noteToY(note) {
  return ((note - 72) / 20) * 4 + 2; // range roughly 0.5 to 5
}

export class Section2 extends SectionBase {
  constructor() {
    super('the-awakening', 30, 60);
    this.explosionParticles = null;
    this.explosionLife = 0;
    this.noteFountains = [];    // active particle fountains from notes
    this.noteQueue = [];        // prepared note data
    this.groundSegments = [];
    this.bgLayers = [];
    this.collectEffects = [];
    this.platformerStarted = false;
  }

  enter(ctx) {
    super.enter(ctx);

    // Start from white (inherited from Section 1's whiteout), fade to dark
    ctx.renderer.setClearColor(0xffffff);
    ctx.scene.fog = new THREE.FogExp2(0xffffff, 0.01);

    // Bloom — bright from the explosion, will settle
    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 4.0;
      ctx.bloomPass.radius = 1.0;
      ctx.bloomPass.threshold = 0.05;
    }

    // Reset player to bright again (was dark from Section 1 inversion)
    ctx.player.mesh.material.color.setRGB(1, 1, 1);
    ctx.player.glowMat.uniforms.uColor.value.set(1.0, 0.95, 0.85);
    ctx.player.light.intensity = 5;
    ctx.player.speed = 6;
    ctx.player.posY = 0;
    ctx.player.laneX = 0;
    ctx.player.boundsMode = 'rect';
    ctx.player.boundsX = [-4, 4];
    ctx.player.boundsY = [0, 5];

    // Ambient
    this.ambient = new THREE.AmbientLight(0x334466, 0.6);
    this.add(this.ambient, ctx);

    // Story
    ctx.story.clear();
    ctx.story.schedule('you made it through', 31, 3, 'bright');
    ctx.story.schedule('collect the melody', 36, 3);
    ctx.story.schedule('each note is a gift', 44, 3);

    // Score
    ctx.score.show();

    // Build explosion first, then platformer elements
    this._buildExplosion(ctx);
    this._prepareNotes();
    this._buildGround(ctx);
    this._buildBackground(ctx);
  }

  _buildExplosion(ctx) {
    // Big white explosion burst — particles fly outward from center
    const count = 300;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const pPos = ctx.player.group.position;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pPos.x;
      positions[i * 3 + 1] = pPos.y + 0.5;
      positions[i * 3 + 2] = pPos.z;

      // Outward velocity — sphere burst
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 3 + Math.random() * 12;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed;

      // White to warm gold
      const warmth = Math.random();
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 0.9 + warmth * 0.1;
      colors[i * 3 + 2] = 0.7 + warmth * 0.3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.explosionParticles = this.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })), ctx);

    this.explosionVelocities = velocities;
    this.explosionLife = 3.0; // lasts 3 seconds
  }

  _buildGround(ctx) {
    // 2D platformer ground — a long flat surface at y=0
    // Made of segments that recycle
    const segLength = 40;
    const pPos = ctx.player.group.position;

    for (let i = 0; i < 5; i++) {
      // Ground line — glowing horizontal line
      const geo = new THREE.PlaneGeometry(segLength, 0.05);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x445566,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ground = new THREE.Mesh(geo, mat);
      ground.position.set(0, 0, pPos.z - i * segLength - segLength / 2);
      ground.rotation.x = -Math.PI / 2;
      this.groundSegments.push(this.add(ground, ctx));

      // Ground grid lines for depth
      for (let g = 0; g < 8; g++) {
        const gLineGeo = new THREE.PlaneGeometry(0.01, 3);
        const gLineMat = new THREE.MeshBasicMaterial({
          color: 0x334455,
          transparent: true,
          opacity: 0.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const gLine = new THREE.Mesh(gLineGeo, gLineMat);
        gLine.position.set(0, 1.5, pPos.z - i * segLength - g * 5);
        gLine.rotation.x = 0;
        this.groundSegments.push(this.add(gLine, ctx));
      }
    }
  }

  _buildBackground(ctx) {
    // Parallax star layers for 2D feel
    for (let layer = 0; layer < 3; layer++) {
      const count = 200;
      const positions = new Float32Array(count * 3);
      const depth = 20 + layer * 30;

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 80;
        positions[i * 3 + 1] = Math.random() * 20;
        positions[i * 3 + 2] = -depth + (Math.random() - 0.5) * 10;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const brightness = 0.3 + (2 - layer) * 0.15;
      const stars = this.add(new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.05 + (2 - layer) * 0.04,
        color: new THREE.Color(brightness, brightness, brightness * 1.2),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })), ctx);

      this.bgLayers.push({ mesh: stars, speed: 0.1 + layer * 0.05 });
    }
  }

  _prepareNotes() {
    this.noteQueue = MELODY_NOTES.map(([time, note], index) => ({
      time,
      note,
      index,
      x: 0, // will be set relative to player Z when spawned
      y: noteToY(note),
      hue: noteToHue(note),
      spawned: false,
      collected: false,
      fountain: null,
    }));
  }

  _spawnNoteFountain(noteData, ctx) {
    const pPos = ctx.player.group.position;
    const songTime = ctx.audio.currentTime;
    const color = new THREE.Color().setHSL(noteData.hue, 0.7, 0.6);

    // Calculate where the player will BE when this note hits
    // so the orb arrives at the player position exactly on beat
    const timeUntilNote = noteData.time - songTime;
    const currentSpeed = ctx.player.speed;
    const distancePlayerWillTravel = currentSpeed * timeUntilNote;

    // Each fountain is a particle system that erupts upward then falls
    const count = 40;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const spawnX = (Math.sin(noteData.index * 1.7 + noteData.note * 0.4) * 3);
    const spawnZ = pPos.z - distancePlayerWillTravel; // player will be here on beat
    const spawnY = 0.2;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = spawnX + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = spawnY;
      positions[i * 3 + 2] = spawnZ + (Math.random() - 0.5) * 0.3;

      // Upward fountain with spread
      velocities[i * 3] = (Math.random() - 0.5) * 2;
      velocities[i * 3 + 1] = 3 + Math.random() * 5; // upward burst
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.1,
      color: color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geo, mat);
    ctx.scene.add(particles);

    // Core collectible orb at the center
    const orbGeo = new THREE.IcosahedronGeometry(0.22, 2);
    const orbMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const orbMesh = new THREE.Mesh(orbGeo, orbMat);
    orbMesh.position.set(spawnX, noteData.y, spawnZ);
    ctx.scene.add(orbMesh);

    // Orb glow
    const orbGlowGeo = new THREE.IcosahedronGeometry(0.4, 2);
    const orbGlowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });
    const orbGlow = new THREE.Mesh(orbGlowGeo, orbGlowMat);
    orbMesh.add(orbGlow);

    // Small light
    const light = new THREE.PointLight(color, 1.5, 6);
    orbMesh.add(light);

    const fountain = {
      particles,
      velocities,
      positions: positions,
      orbMesh,
      orbGlow,
      light,
      spawnX,
      spawnY,
      spawnZ,
      noteTime: noteData.time, // exact beat time
      erupted: false,          // fountain starts when beat hits
      age: 0,
      color,
      collected: false,
      gravity: -8,
    };

    // Hide fountain particles until the beat actually hits
    particles.visible = false;

    noteData.fountain = fountain;
    noteData.spawned = true;
    this.noteFountains.push(fountain);
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const songTime = ctx.audio.currentTime;
    const audio = ctx.audio;
    const pPos = ctx.player.group.position;

    // ── Phase 1: Explosion (first ~2 seconds) ──
    if (this.explosionLife > 0) {
      this.explosionLife -= dt;
      const explProgress = 1 - (this.explosionLife / 3.0);

      // Move explosion particles
      if (this.explosionParticles) {
        const pos = this.explosionParticles.geometry.attributes.position.array;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += this.explosionVelocities[i] * dt;
          pos[i + 1] += this.explosionVelocities[i + 1] * dt;
          pos[i + 2] += this.explosionVelocities[i + 2] * dt;
          // Slow down
          this.explosionVelocities[i] *= 0.98;
          this.explosionVelocities[i + 1] *= 0.98;
          this.explosionVelocities[i + 2] *= 0.98;
        }
        this.explosionParticles.geometry.attributes.position.needsUpdate = true;
        this.explosionParticles.material.opacity = Math.max(0, 1 - explProgress * 1.5);
      }

      // Transition from white to dark
      const fadeToDark = Math.min(explProgress * 1.5, 1);
      const bg = 1 - fadeToDark;
      ctx.renderer.setClearColor(new THREE.Color(bg * 0.8, bg * 0.8, bg));
      ctx.scene.fog.color.setRGB(bg, bg, bg);
      ctx.scene.fog.density = 0.01 + fadeToDark * 0.02;

      // Bloom settles down
      if (ctx.bloomPass) {
        ctx.bloomPass.strength = 4.0 - fadeToDark * 2.0;
        ctx.bloomPass.radius = 1.0 - fadeToDark * 0.4;
      }

      // Remove explosion when done
      if (this.explosionLife <= 0 && this.explosionParticles) {
        ctx.scene.remove(this.explosionParticles);
      }
    }

    // ── 2D Platformer camera ──
    // Side-scrolling: camera looks from the side, orthographic feel
    if (t > 1.5) {
      if (!this.platformerStarted) {
        this.platformerStarted = true;
        // Switch to side view
        ctx.camera.fov = 50;
        ctx.camera.updateProjectionMatrix();
      }

      // 2D side-scroll camera: X tracks player's forward Z, Y tracks player Y
      // Camera is off to the side looking at the player
      const targetCam = new THREE.Vector3(
        pPos.x,          // follow lateral
        pPos.y + 3,      // above
        pPos.z + 12      // behind
      );
      ctx.camera.position.lerp(targetCam, dt * 3);
      ctx.camera.lookAt(pPos.x, pPos.y + 1, pPos.z - 5);
    } else {
      // During explosion — camera stays put, dramatic
      ctx.camera.lookAt(pPos.x, pPos.y + 0.5, pPos.z);
    }

    // ── Spawn note fountains ──
    for (const nd of this.noteQueue) {
      if (!nd.spawned && songTime >= nd.time - 3) {
        this._spawnNoteFountain(nd, ctx);
      }
    }

    // ── Update note fountains ──
    for (const f of this.noteFountains) {
      // Fountain erupts exactly when the beat hits
      if (!f.erupted && songTime >= f.noteTime) {
        f.erupted = true;
        f.particles.visible = true;
        f.age = 0;
      }

      // Only animate particles after eruption
      if (f.erupted) {
        f.age += dt;

        // Animate fountain particles — gravity pulls them down
        const pos = f.particles.geometry.attributes.position.array;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += f.velocities[i] * dt;
          f.velocities[i + 1] += f.gravity * dt; // gravity
          pos[i + 1] += f.velocities[i + 1] * dt;
          pos[i + 2] += f.velocities[i + 2] * dt;

          // Particles that hit "ground" bounce slightly
          if (pos[i + 1] < 0.05) {
            pos[i + 1] = 0.05;
            f.velocities[i + 1] *= -0.3; // damped bounce
          }
        }
        f.particles.geometry.attributes.position.needsUpdate = true;

        // Fountain particles fade over time
        f.particles.material.opacity = Math.max(0, 0.9 - f.age * 0.25);
      }

      // Orb floats and pulses
      if (!f.collected && f.orbMesh) {
        f.orbMesh.position.y += Math.sin(songTime * 3 + f.spawnX) * dt * 0.3;
        f.orbMesh.rotation.y += dt * 2;

        // Pulse glow with audio
        const pulse = 1 + audio.mid * 0.4;
        f.orbGlow.scale.setScalar(pulse);

        // Check collection
        const dist = f.orbMesh.position.distanceTo(pPos);
        if (dist < 1.5) {
          this._collectFountain(f, ctx);
        }

        // Missed — passed behind player
        if (f.orbMesh.position.z > pPos.z + 5) {
          this._missFountain(f, ctx);
        }
      }
    }

    // ── Update collect effects ──
    for (let i = this.collectEffects.length - 1; i >= 0; i--) {
      const fx = this.collectEffects[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        ctx.scene.remove(fx.particles);
        this.collectEffects.splice(i, 1);
        continue;
      }
      const p = 1 - fx.life / fx.maxLife;
      fx.particles.material.opacity = (1 - p) * 0.8;
      const fxPos = fx.particles.geometry.attributes.position.array;
      for (let j = 0; j < fxPos.length; j += 3) {
        fxPos[j] += fx.velocities[j] * dt;
        fxPos[j + 1] += fx.velocities[j + 1] * dt;
        fxPos[j + 2] += fx.velocities[j + 2] * dt;
        fx.velocities[j + 1] -= 3 * dt; // gravity on collect particles too
      }
      fx.particles.geometry.attributes.position.needsUpdate = true;
    }

    // ── Recycle ground segments ──
    for (const seg of this.groundSegments) {
      if (seg.position.z > pPos.z + 25) {
        let minZ = Infinity;
        for (const s of this.groundSegments) minZ = Math.min(minZ, s.position.z);
        seg.position.z = minZ - 40;
      }
    }

    // ── Parallax background ──
    for (const layer of this.bgLayers) {
      layer.mesh.position.z = pPos.z * layer.speed;
    }

    // Speed
    ctx.player.speed = 6 + this.progress * 2;
  }

  _collectFountain(fountain, ctx) {
    fountain.collected = true;
    ctx.score.add(100);

    const pos = fountain.orbMesh.position.clone();
    const color = fountain.color;

    // Remove orb
    ctx.scene.remove(fountain.orbMesh);

    // Sparkle burst effect
    const count = 30;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      velocities[i * 3] = Math.cos(a) * s * (Math.random());
      velocities[i * 3 + 1] = 2 + Math.random() * 4;
      velocities[i * 3 + 2] = Math.sin(a) * s * (Math.random());
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.1,
      color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(geo, mat);
    ctx.scene.add(particles);

    this.collectEffects.push({
      particles, velocities, life: 1.0, maxLife: 1.0,
    });
  }

  _missFountain(fountain, ctx) {
    fountain.collected = true;
    ctx.score.breakCombo();
    if (fountain.orbMesh) ctx.scene.remove(fountain.orbMesh);
  }

  exit(ctx) {
    // Clean up fountains
    for (const f of this.noteFountains) {
      ctx.scene.remove(f.particles);
      if (!f.collected && f.orbMesh) ctx.scene.remove(f.orbMesh);
    }
    for (const fx of this.collectEffects) {
      ctx.scene.remove(fx.particles);
    }
    this.noteFountains = [];
    this.noteQueue = [];
    this.collectEffects = [];
    this.groundSegments = [];
    this.bgLayers = [];
    this.explosionParticles = null;
    super.exit(ctx);
  }
}
