import * as THREE from 'three';
import { SectionBase } from './section-base.js';

/**
 * SECTION 2 — "The Awakening" (0:30 – 1:00)
 *
 * 2D side-scrolling platformer. The ball rolls on a ground line.
 * Each melody note spawns a glowing neon orb exactly on beat.
 * Collect orbs by steering into them. Pure sync, pure neon.
 */

// Music box notes — MIDI timings confirmed perfectly synced with MP3
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

// Higher pitch = higher Y position above ground
function noteToHeight(note) {
  return 0.8 + ((note - 70) / 25) * 4;
}

// Spread notes laterally — each note gets a position ahead
function noteToAheadDist(index, total) {
  // Notes within a phrase cluster together, phrases are spaced by silence
  return 8 + index * 1.2;
}

// ─── Neon orb glow shader ───
const orbVertShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const orbFragShader = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPulse;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - abs(dot(viewDir, vNormal));
    rim = pow(rim, 1.5);

    // Pulsing core
    float core = 0.6 + sin(uTime * 4.0) * 0.1 + uPulse * 0.3;

    // Neon glow = bright center + rim glow
    float glow = core + rim * 1.2;
    vec3 col = uColor * glow;

    // Hot white center
    col = mix(col, vec3(1.0), core * 0.3);

    float alpha = clamp(glow * 0.8, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Section2 extends SectionBase {
  constructor() {
    super('the-awakening', 30, 60);
    this.orbs = [];
    this.triggered = new Set();
    this.collectEffects = [];
    this.groundSegments = [];
    this.explosionLife = 0;
    this.explosionParticles = null;
    this.explosionVelocities = null;
    this.scrollSpeed = 8; // units per second the world scrolls
  }

  enter(ctx) {
    super.enter(ctx);

    // Start from white (inherited from S1 whiteout)
    ctx.renderer.setClearColor(0xffffff);
    ctx.scene.fog = new THREE.FogExp2(0x000005, 0.012);

    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 4.0;
      ctx.bloomPass.radius = 1.0;
      ctx.bloomPass.threshold = 0.05;
    }

    // Reset player
    ctx.player.mesh.material.color.setRGB(1, 1, 1);
    ctx.player.glowMat.uniforms.uColor.value.set(1.0, 0.95, 0.85);
    ctx.player.light.intensity = 5;
    ctx.player.speed = 0; // we scroll the world instead
    ctx.player.posY = 0;
    ctx.player.laneX = 0;
    ctx.player.forwardZ = 0;
    ctx.player.boundsMode = 'rect';
    ctx.player.boundsX = [-0.5, 0.5]; // minimal lateral movement
    ctx.player.boundsY = [0, 5];

    // Fix player at a position — world moves past it
    ctx.player.group.position.set(0, 0.5, 0);

    // Side-view camera for 2D feel
    ctx.camera.position.set(0, 3, 14);
    ctx.camera.fov = 45;
    ctx.camera.updateProjectionMatrix();
    ctx.camera.lookAt(0, 2, 0);

    // Ambient
    this.ambient = new THREE.AmbientLight(0x222244, 0.5);
    this.add(this.ambient, ctx);

    // Story
    ctx.story.clear();
    ctx.story.schedule('you made it through', 31, 3, 'bright');
    ctx.story.schedule('collect the melody', 36, 3);

    ctx.score.show();

    this._buildExplosion(ctx);
    this._buildGround(ctx);
    this._buildBackground(ctx);
    this._prepareOrbs(ctx);
  }

  _buildExplosion(ctx) {
    const count = 300;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 1;
      positions[i * 3 + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 3 + Math.random() * 12;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed;

      colors[i * 3] = 1;
      colors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.7 + Math.random() * 0.3;
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
    this.explosionLife = 2.5;
  }

  _buildGround(ctx) {
    // Glowing ground line — a long thin bright line
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.PlaneGeometry(80, 0.04);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x4466aa,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const line = new THREE.Mesh(geo, mat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.01, -i * 80);
      this.groundSegments.push(this.add(line, ctx));
    }

    // Subtle grid lines on ground for motion feel
    for (let i = 0; i < 60; i++) {
      const geo = new THREE.PlaneGeometry(6, 0.01);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x223355,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const tick = new THREE.Mesh(geo, mat);
      tick.rotation.x = -Math.PI / 2;
      tick.rotation.z = Math.PI / 2;
      tick.position.set(0, 0.01, -i * 4);
      tick.userData.isGridTick = true;
      this.groundSegments.push(this.add(tick, ctx));
    }
  }

  _buildBackground(ctx) {
    // Distant particle layers for parallax depth
    const count = 400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = Math.random() * 15 + 1;
      positions[i * 3 + 2] = -Math.random() * 100;

      const hue = Math.random();
      const c = new THREE.Color().setHSL(hue, 0.3, 0.25 + Math.random() * 0.15);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.bgStars = this.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })), ctx);
  }

  _prepareOrbs(ctx) {
    // Pre-create ALL orbs at their correct positions
    // The world scrolls toward the player, so orb Z = -(noteTime - 30) * scrollSpeed
    // This way when worldOffset reaches that Z, the orb is at the player

    this.orbs = MELODY_NOTES.map(([time, note], index) => {
      const hue = noteToHue(note);
      const color = new THREE.Color().setHSL(hue, 0.9, 0.6);
      const height = noteToHeight(note);

      // Position in world: Z based on time, Y based on pitch
      const z = -((time - 30) * this.scrollSpeed);

      // Neon orb with custom shader
      const orbGeo = new THREE.IcosahedronGeometry(0.3, 3);
      const orbMat = new THREE.ShaderMaterial({
        vertexShader: orbVertShader,
        fragmentShader: orbFragShader,
        uniforms: {
          uColor: { value: color },
          uTime: { value: 0 },
          uPulse: { value: 0 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const group = new THREE.Group();
      const orbMesh = new THREE.Mesh(orbGeo, orbMat);
      group.add(orbMesh);

      // Outer glow halo
      const haloGeo = new THREE.IcosahedronGeometry(0.55, 2);
      const haloMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      group.add(halo);

      // Point light
      const light = new THREE.PointLight(color, 2, 6);
      group.add(light);

      group.position.set(0, height, z);
      group.visible = false; // hidden until note triggers

      this.add(group, ctx);

      return {
        time,
        note,
        index,
        z,
        height,
        color,
        group,
        orbMesh,
        orbMat,
        halo,
        light,
        triggered: false,
        collected: false,
        triggerAge: 0,
      };
    });
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const songTime = ctx.audio.currentTime;
    const audio = ctx.audio;

    // ── Explosion phase (first 2.5s) ──
    if (this.explosionLife > 0) {
      this.explosionLife -= dt;
      const ep = 1 - this.explosionLife / 2.5;

      if (this.explosionParticles) {
        const pos = this.explosionParticles.geometry.attributes.position.array;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += this.explosionVelocities[i] * dt;
          pos[i + 1] += this.explosionVelocities[i + 1] * dt;
          pos[i + 2] += this.explosionVelocities[i + 2] * dt;
          this.explosionVelocities[i] *= 0.97;
          this.explosionVelocities[i + 1] *= 0.97;
          this.explosionVelocities[i + 2] *= 0.97;
        }
        this.explosionParticles.geometry.attributes.position.needsUpdate = true;
        this.explosionParticles.material.opacity = Math.max(0, 1 - ep * 1.5);
      }

      // White → dark transition
      const fade = Math.min(ep * 2, 1);
      const bg = 1 - fade;
      ctx.renderer.setClearColor(new THREE.Color(bg * 0.9, bg * 0.9, bg));
      ctx.scene.fog.color.setRGB(bg * 0.1, bg * 0.1, bg * 0.1);

      if (ctx.bloomPass) {
        ctx.bloomPass.strength = 4.0 - fade * 2.2;
        ctx.bloomPass.radius = 1.0 - fade * 0.5;
        ctx.bloomPass.threshold = 0.05 + fade * 0.1;
      }

      if (this.explosionLife <= 0 && this.explosionParticles) {
        ctx.scene.remove(this.explosionParticles);
      }
    }

    // ── World scrolling ──
    // Everything moves toward the player (positive Z direction)
    const worldOffset = (songTime - 30) * this.scrollSpeed;

    // Scroll ground
    for (const seg of this.groundSegments) {
      const scrolledZ = seg.position.z + worldOffset;
      // Recycle segments that pass behind camera
      if (seg.userData.isGridTick) {
        // Just update visual position via group or offset
      }
    }

    // Move all orb groups by world offset (orbs were placed at absolute positions)
    for (const orb of this.orbs) {
      orb.group.position.z = orb.z + worldOffset;
    }

    // Move ground segments
    for (const seg of this.groundSegments) {
      // Shift everything so the player stays at Z=0
      // Ground was placed at various -Z; add worldOffset to scroll it
    }

    // Actually, simpler: put everything in a world group
    // But since we already placed things, let's just move the camera approach:
    // Player is at Z=0, orbs have their Z. We add worldOffset to orb Z.
    // Ground needs to tile. Let's just scroll ground segments too.

    // Scroll background
    if (this.bgStars) {
      this.bgStars.position.z = worldOffset * 0.3; // parallax
    }

    // ── Player rolling on ground ──
    // Ball spins based on scroll speed
    ctx.player.mesh.rotation.x -= dt * this.scrollSpeed * 2;
    ctx.player.glowMesh.rotation.x -= dt * this.scrollSpeed * 1.5;
    ctx.player.group.position.y = 0.5; // on the ground

    // Camera: side-ish view
    ctx.camera.position.lerp(
      new THREE.Vector3(ctx.player.laneX * 0.5, 3, 14),
      dt * 3
    );
    ctx.camera.lookAt(0, 1.5, 0);

    // ── Trigger orbs on beat ──
    for (const orb of this.orbs) {
      if (!orb.triggered && songTime >= orb.time) {
        orb.triggered = true;
        orb.group.visible = true;
        orb.triggerAge = 0;
      }

      if (orb.triggered && !orb.collected) {
        orb.triggerAge += dt;

        // Animate: scale up from 0 on trigger (pop in)
        const popScale = Math.min(orb.triggerAge * 6, 1);
        const eased = 1 - Math.pow(1 - popScale, 3); // ease out cubic
        orb.orbMesh.scale.setScalar(eased);
        orb.halo.scale.setScalar(eased * 1.3 + Math.sin(songTime * 5 + orb.index) * 0.1);

        // Update shader
        orb.orbMat.uniforms.uTime.value = songTime;
        orb.orbMat.uniforms.uPulse.value = audio.mid;

        // Light pulses
        orb.light.intensity = 1.5 + audio.mid * 2;

        // Rotation
        orb.orbMesh.rotation.y += dt * 3;
        orb.orbMesh.rotation.z += dt * 1.5;

        // ── Collection check ──
        const orbWorldPos = new THREE.Vector3();
        orb.group.getWorldPosition(orbWorldPos);
        const playerPos = ctx.player.group.position;
        const dist = orbWorldPos.distanceTo(playerPos);

        if (dist < 1.3) {
          this._collectOrb(orb, ctx);
        }

        // Missed — scrolled past player
        if (orb.group.position.z > 4) {
          this._missOrb(orb, ctx);
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
      fx.particles.material.opacity = (1 - p) * 0.9;
      fx.particles.material.size = 0.1 + p * 0.05;
      const pos = fx.particles.geometry.attributes.position.array;
      for (let j = 0; j < pos.length; j += 3) {
        pos[j] += fx.velocities[j] * dt;
        fx.velocities[j + 1] -= 4 * dt; // gravity
        pos[j + 1] += fx.velocities[j + 1] * dt;
        pos[j + 2] += fx.velocities[j + 2] * dt;
      }
      fx.particles.geometry.attributes.position.needsUpdate = true;
    }

    // Scroll speed stays constant for clean sync
    this.scrollSpeed = 8;
  }

  _collectOrb(orb, ctx) {
    orb.collected = true;
    orb.group.visible = false;
    ctx.score.add(100);

    // Neon burst — particles fly up and out in the orb's color
    const count = 35;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const wp = new THREE.Vector3();
    orb.group.getWorldPosition(wp);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = wp.x;
      positions[i * 3 + 1] = wp.y;
      positions[i * 3 + 2] = wp.z;
      const a = Math.random() * Math.PI * 2;
      const upBias = 2 + Math.random() * 4;
      velocities[i * 3] = Math.cos(a) * (1 + Math.random() * 3);
      velocities[i * 3 + 1] = upBias;
      velocities[i * 3 + 2] = Math.sin(a) * (1 + Math.random() * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.1,
      color: orb.color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(geo, mat);
    ctx.scene.add(particles);
    this.collectEffects.push({ particles, velocities, life: 1.2, maxLife: 1.2 });
  }

  _missOrb(orb, ctx) {
    orb.collected = true;
    orb.group.visible = false;
    ctx.score.breakCombo();
  }

  exit(ctx) {
    for (const fx of this.collectEffects) {
      ctx.scene.remove(fx.particles);
    }
    this.collectEffects = [];
    this.orbs = [];
    this.groundSegments = [];
    this.explosionParticles = null;
    this.bgStars = null;
    super.exit(ctx);
  }
}
