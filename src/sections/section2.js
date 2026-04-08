import * as THREE from 'three';
import { SectionBase } from './section-base.js';

/**
 * SECTION 2 — "The Awakening" (0:30 – 1:00)
 *
 * TRUE 2D side-scrolling platformer.
 * Camera from the SIDE. Ball rolls on the ground.
 * Each melody note = a neon orb falling from the sky, bouncing on the ground.
 * Press SPACE to jump over them. They're obstacles, not collectibles.
 */

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

// ─── Neon orb shader ───
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
    float core = 0.6 + sin(uTime * 4.0) * 0.1 + uPulse * 0.3;
    float glow = core + rim * 1.2;
    vec3 col = uColor * glow;
    col = mix(col, vec3(1.0), core * 0.3);
    float alpha = clamp(glow * 0.8, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Section2 extends SectionBase {
  constructor() {
    super('the-awakening', 30, 60);
    this.orbs = [];
    this.impactEffects = [];
    this.groundSegments = [];
    this.explosionLife = 0;
    this.explosionParticles = null;
    this.explosionVelocities = null;
    this.scrollSpeed = 6;

    // Jump state
    this.jumpVelY = 0;
    this.playerY = 0;
    this.isGrounded = true;
    this.jumpsLeft = 2; // double jump

    // Score tracking
    this.dodged = 0;
    this.hit = 0;
  }

  enter(ctx) {
    super.enter(ctx);

    // Dark background — explosion particles provide the white flash
    ctx.renderer.setClearColor(0x000000);
    ctx.scene.fog = new THREE.FogExp2(0x000005, 0.008);

    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 2.0;
      ctx.bloomPass.radius = 0.6;
      ctx.bloomPass.threshold = 0.1;
    }

    // Reset player
    ctx.player.mesh.material.color.setRGB(1, 1, 1);
    ctx.player.glowMat.uniforms.uColor.value.set(1.0, 0.95, 0.85);
    ctx.player.light.intensity = 5;
    ctx.player.speed = 0;        // world scrolls, player stays
    ctx.player.posY = 0;
    ctx.player.laneX = 0;
    ctx.player.forwardZ = 0;
    ctx.player.boundsMode = 'rect';
    ctx.player.boundsX = [0, 0]; // locked X
    ctx.player.boundsY = [0, 0]; // we handle Y with jump physics

    // Player position — on ground, left-ish side of screen
    ctx.player.group.position.set(0, 0.5, 0);
    this.playerY = 0;

    // TRUE side-view camera — looking from the side (along X axis)
    // Player at Z=0, camera centered slightly ahead so player is ~1/3 from left
    ctx.camera.position.set(16, 4, -4);
    ctx.camera.fov = 55;
    ctx.camera.updateProjectionMatrix();
    ctx.camera.lookAt(0, 1, -4);

    // Ambient
    this.ambient = new THREE.AmbientLight(0x222244, 0.5);
    this.add(this.ambient, ctx);

    // Story — "press space" shows IMMEDIATELY so player knows before orbs arrive
    ctx.story.clear();
    ctx.story.schedule('press up to jump', 30, 4);
    ctx.story.schedule('avoid the obstacles', 35, 3);

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
    this.explosionLife = 1.5;
  }

  _buildGround(ctx) {
    // Main ground line — thin neon strip facing the camera, extending along Z
    // PlaneGeometry(width=X, height=Y) then rotate 90° around Y so X→Z (long axis), Y stays (thin axis)
    const groundGeo = new THREE.PlaneGeometry(600, 0.06);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x4488cc,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.groundLine = new THREE.Mesh(groundGeo, groundMat);
    this.groundLine.rotation.y = Math.PI / 2; // face camera (rotates X→Z)
    this.groundLine.position.set(0, 0, 0);
    this.add(this.groundLine, ctx);

    // Secondary wider glow behind the ground line
    const glowGeo = new THREE.PlaneGeometry(600, 0.25);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x2244aa,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glowLine = new THREE.Mesh(glowGeo, glowMat);
    glowLine.rotation.y = Math.PI / 2;
    glowLine.position.set(0, 0, 0);
    this.add(glowLine, ctx);

    // Grid ticks — vertical bars on the ground, scroll to show movement
    for (let i = 0; i < 60; i++) {
      const tickGeo = new THREE.PlaneGeometry(0.03, 0.5);
      const tickMat = new THREE.MeshBasicMaterial({
        color: 0x335577,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const tick = new THREE.Mesh(tickGeo, tickMat);
      tick.position.set(0, 0.25, -i * 4);
      tick.userData.isGridTick = true;
      tick.userData.baseZ = -i * 4;
      this.groundSegments.push(this.add(tick, ctx));
    }
  }

  _buildBackground(ctx) {
    const count = 400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20 - 10; // behind the scene
      positions[i * 3 + 1] = Math.random() * 20 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;

      const hue = Math.random();
      const c = new THREE.Color().setHSL(hue, 0.3, 0.2 + Math.random() * 0.15);
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
    // Each orb placed along Z axis. In side view, Z = left-right.
    // Orb starts high (y=12), falls with gravity, bounces on ground.
    // Player is at Z=0, orbs scroll toward them.

    this.orbs = MELODY_NOTES.map(([time, note], index) => {
      const hue = noteToHue(note);
      const color = new THREE.Color().setHSL(hue, 0.9, 0.6);

      // Z position: placed so that at trigger time (songTime=time), orb appears
      // SPAWN_AHEAD units to the right of player, then scrolls toward them
      const SPAWN_AHEAD = 10;
      const z = -((time - 30) * this.scrollSpeed) - SPAWN_AHEAD;

      // Orb mesh with neon shader
      const orbGeo = new THREE.IcosahedronGeometry(0.35, 3);
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

      // Glow halo
      const haloGeo = new THREE.IcosahedronGeometry(0.6, 2);
      const haloMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      group.add(halo);

      // Point light
      const light = new THREE.PointLight(color, 2, 8);
      group.add(light);

      // Start high up — will fall with physics
      group.position.set(0, 8, z);
      group.visible = false;

      this.add(group, ctx);

      return {
        time,
        note,
        index,
        z,             // world Z position
        color,
        group,
        orbMesh,
        orbMat,
        halo,
        light,
        triggered: false,
        collected: false,   // hit or passed
        // Physics
        velY: 0,
        posY: 8,            // starts above screen
        onGround: false,
        bounceCount: 0,
        orbRadius: 0.35,
      };
    });
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const songTime = ctx.audio.currentTime;
    const audio = ctx.audio;
    const GRAVITY = -25;
    const GROUND_Y = 0.35; // orb radius — sits on ground
    const PLAYER_RADIUS = 0.4;

    // ── Explosion (first 2.5s) ──
    if (this.explosionLife > 0) {
      this.explosionLife -= dt;
      const ep = 1 - this.explosionLife / 1.5;

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

      // Bloom ramps down as explosion fades
      if (ctx.bloomPass) {
        ctx.bloomPass.strength = 2.0 - ep * 0.5;
        ctx.bloomPass.radius = 0.6;
        ctx.bloomPass.threshold = 0.1 + ep * 0.05;
      }

      if (this.explosionLife <= 0 && this.explosionParticles) {
        ctx.scene.remove(this.explosionParticles);
        this.explosionParticles = null;
      }
    }

    // ── Steady-state bloom (after explosion) ──
    if (this.explosionLife <= 0 && ctx.bloomPass) {
      ctx.bloomPass.strength = 1.2;
      ctx.bloomPass.radius = 0.4;
      ctx.bloomPass.threshold = 0.2;
    }

    // ── World scrolling — everything along Z ──
    const worldOffset = (songTime - 30) * this.scrollSpeed;

    // Scroll orbs
    for (const orb of this.orbs) {
      orb.group.position.z = orb.z + worldOffset;
    }

    // Scroll ground — move each segment with world offset, recycle when past camera
    for (const seg of this.groundSegments) {
      const worldZ = seg.userData.baseZ + worldOffset;
      seg.position.z = worldZ;

      // Recycle segments that scroll past the camera (off-screen right)
      if (seg.userData.isGridTick) {
        if (worldZ > 15) seg.userData.baseZ -= 240;
      } else {
        if (worldZ > 60) seg.userData.baseZ -= 480;
      }
    }

    // BG parallax
    if (this.bgStars) {
      this.bgStars.position.z = worldOffset * 0.15;
    }

    // ── Player jump physics ──
    // Up arrow or space to jump (edge-detected for double jump)
    if ((ctx.input.upDown || ctx.input.spaceDown) && this.jumpsLeft > 0) {
      this.jumpVelY = 14;
      this.isGrounded = false;
      this.jumpsLeft--;
    }

    // Gravity
    if (!this.isGrounded) {
      this.jumpVelY += GRAVITY * dt;
      this.playerY += this.jumpVelY * dt;

      if (this.playerY <= 0) {
        this.playerY = 0;
        this.jumpVelY = 0;
        this.isGrounded = true;
        this.jumpsLeft = 2; // reset double jump on landing
      }
    }

    // Left/right movement (small lateral drift)
    const lateralSpeed = 4;
    if (ctx.input.left) this.playerX = Math.max((this.playerX || 0) - lateralSpeed * dt, -2);
    if (ctx.input.right) this.playerX = Math.min((this.playerX || 0) + lateralSpeed * dt, 2);
    if (!this.playerX) this.playerX = 0;

    // Apply player position
    ctx.player.group.position.set(this.playerX, this.playerY + 0.5, 0);

    // Ball rolling spin (visual — around Z axis since we see from side)
    ctx.player.mesh.rotation.z -= dt * this.scrollSpeed * 2;
    ctx.player.glowMesh.rotation.z -= dt * this.scrollSpeed * 1.5;

    // ── Side-view camera — smoothly follow player vertically ──
    ctx.camera.position.lerp(
      new THREE.Vector3(16, 3.5 + this.playerY * 0.3, -4),
      dt * 4
    );
    ctx.camera.lookAt(0, 1 + this.playerY * 0.2, -4);

    // ── Trigger orbs — drop EXACTLY on the beat, spawn ahead of player ──
    for (const orb of this.orbs) {
      // Trigger: orb appears and drops exactly when the note plays
      if (!orb.triggered && songTime >= orb.time) {
        orb.triggered = true;
        orb.group.visible = true;
        orb.posY = 8; // drop from above
        orb.velY = 0;
      }

      if (!orb.triggered) continue;

      // ── Orb falling physics — always runs, even after collected ──
      orb.velY += GRAVITY * dt;
      orb.posY += orb.velY * dt;

      // Bounce off ground
      if (orb.posY <= GROUND_Y) {
        orb.posY = GROUND_Y;
        orb.bounceCount++;
        // Damped bounce — each bounce lower
        orb.velY = Math.abs(orb.velY) * Math.max(0.5 - orb.bounceCount * 0.1, 0.1);

        // Impact flash effect on first bounce
        if (orb.bounceCount === 1) {
          this._spawnImpact(orb, ctx);
        }

        // Stop bouncing after enough bounces
        if (orb.bounceCount > 4) {
          orb.velY = 0;
          orb.posY = GROUND_Y;
        }
      }

      // Apply Y
      orb.group.position.y = orb.posY;

      // Visuals
      orb.orbMat.uniforms.uTime.value = songTime;
      orb.orbMat.uniforms.uPulse.value = audio.mid;
      orb.orbMesh.rotation.y += dt * 3;
      orb.orbMesh.rotation.x += dt * 2;
      orb.halo.scale.setScalar(1.2 + Math.sin(songTime * 5 + orb.index) * 0.15);
      orb.light.intensity = 1.5 + audio.mid * 2;

      // Skip collision/scoring for already collected orbs
      if (orb.collected) {
        // Cleanup — far behind camera
        if (orb.group.position.z > 20) {
          orb.group.visible = false;
        }
        continue;
      }

      // ── Collision with player — only when orb is near the ground ──
      const orbScreenZ = orb.group.position.z;
      const playerZ = 0;
      const dz = Math.abs(orbScreenZ - playerZ);
      const dy = Math.abs(orb.posY - (this.playerY + 0.5)); // player Y includes the +0.5 offset
      const collisionDist = PLAYER_RADIUS + orb.orbRadius;

      // Only check collision when orb has bounced at least once (is near ground)
      if (orb.bounceCount >= 1 && dz < collisionDist && dy < collisionDist) {
        // HIT! Player didn't jump in time
        this._hitByOrb(orb, ctx);
      }

      // Passed player — dodged successfully (only count after orb has landed)
      if (orbScreenZ > 2 && !orb.collected && orb.bounceCount >= 1) {
        orb.collected = true;
        this.dodged++;
        ctx.score.add(50); // reward for dodging
      }

      // Also mark as collected if orb went way past without landing (edge case)
      if (orbScreenZ > 10 && !orb.collected) {
        orb.collected = true;
      }
    }

    // ── Impact effects ──
    for (let i = this.impactEffects.length - 1; i >= 0; i--) {
      const fx = this.impactEffects[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        ctx.scene.remove(fx.particles);
        this.impactEffects.splice(i, 1);
        continue;
      }
      const p = 1 - fx.life / fx.maxLife;
      fx.particles.material.opacity = (1 - p) * 0.8;
      const pos = fx.particles.geometry.attributes.position.array;
      for (let j = 0; j < pos.length; j += 3) {
        pos[j] += fx.velocities[j] * dt;
        fx.velocities[j + 1] -= 8 * dt;
        pos[j + 1] += fx.velocities[j + 1] * dt;
        pos[j + 2] += fx.velocities[j + 2] * dt;
        if (pos[j + 1] < 0.02) {
          pos[j + 1] = 0.02;
          fx.velocities[j + 1] *= -0.2;
        }
      }
      fx.particles.geometry.attributes.position.needsUpdate = true;
    }
  }

  _spawnImpact(orb, ctx) {
    // Ground impact burst when orb first hits the floor
    const count = 25;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const z = orb.group.position.z;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0.1;
      positions[i * 3 + 2] = z;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      velocities[i * 3] = Math.cos(angle) * speed * 0.5;
      velocities[i * 3 + 1] = 1 + Math.random() * 3; // upward spray
      velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.08,
      color: orb.color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(geo, mat);
    ctx.scene.add(particles);
    this.impactEffects.push({ particles, velocities, life: 0.8, maxLife: 0.8 });
  }

  _hitByOrb(orb, ctx) {
    orb.collected = true;
    this.hit++;
    ctx.score.breakCombo();

    // Flash the player red briefly
    ctx.player.mesh.material.color.setRGB(1, 0.2, 0.2);
    setTimeout(() => {
      ctx.player.mesh.material.color.setRGB(1, 1, 1);
    }, 200);

    // Small burst
    this._spawnImpact(orb, ctx);
  }

  exit(ctx) {
    for (const fx of this.impactEffects) {
      ctx.scene.remove(fx.particles);
    }
    this.impactEffects = [];
    this.orbs = [];
    this.groundSegments = [];
    this.explosionParticles = null;
    this.bgStars = null;
    super.exit(ctx);
  }
}
