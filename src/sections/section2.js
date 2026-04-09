import * as THREE from 'three';
import { SectionBase } from './section-base.js';
import { getScene } from '../preloader.js';

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
    super('the-awakening', 27, 60);
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
    this.jumpsLeft = 3; // triple jump

    // Score tracking
    this.dodged = 0;
    this.hit = 0;

    // Melody blink state
    this.lastNoteIndex = -1;
    this.blinkFlash = 0; // 0-1, decays each frame

    // Camera transition (tunnel → side view)
    this.cameraTransitionDone = false;
  }

  enter(ctx) {
    super.enter(ctx);

    // Start with white (continuing from Section 1 whiteout) — transition fades to dark
    ctx.renderer.setClearColor(0xe5e5e5);
    ctx.scene.fog = new THREE.FogExp2(0x888888, 0.025);

    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 2.5;
      ctx.bloomPass.radius = 0.5;
      ctx.bloomPass.threshold = 0.4;
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

    // Camera starts where Section 1 left off (behind player, tunnel view)
    // Will transition to side view in the first ~3 seconds
    // Don't override camera here — transition handles it in update()

    // Ambient
    this.ambient = new THREE.AmbientLight(0x222244, 0.5);
    this.add(this.ambient, ctx);

    // Story — instructions show during the camera transition, before orbs arrive
    ctx.story.clear();
    ctx.story.schedule('click to jump', 28, 3);
    ctx.story.schedule('avoid the obstacles', 31, 3);

    ctx.score.show();

    this._buildExplosion(ctx);
    this._buildGround(ctx);
    this._buildBackground(ctx);
    this._buildTrees(ctx);
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
    // ── Synthwave wireframe grid ground ──
    // Wide flat plane with grid lines extending to the horizon

    // Solid dark ground plane
    const floorGeo = new THREE.PlaneGeometry(40, 600);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x050510,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.01, 0);
    this.add(floor, ctx);

    // Wireframe grid overlay — synthwave style, bright and visible
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });

    // Z-lines (running along the road) — perspective lines
    const zLineSpacing = 2;
    const zLineCount = 21; // -20 to +20
    for (let i = 0; i < zLineCount; i++) {
      const x = (i - Math.floor(zLineCount / 2)) * zLineSpacing;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, 100),
        new THREE.Vector3(x, 0, -300),
      ]);
      this.add(new THREE.Line(geo, gridMat), ctx);
    }

    // X-lines (cross lines, scroll with world) — the moving grid ticks
    const xLineSpacing = 3;
    const xLineCount = 120;
    this.gridLines = [];
    const xLineMat = new THREE.LineBasicMaterial({
      color: 0x6699ff,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < xLineCount; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-20, 0, 0),
        new THREE.Vector3(20, 0, 0),
      ]);
      const line = new THREE.Line(geo, xLineMat.clone());
      line.position.z = -i * xLineSpacing;
      line.userData.baseZ = -i * xLineSpacing;
      this.gridLines.push(this.add(line, ctx));
    }

    // Center neon line — the main ground line
    const centerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.01, 100),
      new THREE.Vector3(0, 0.01, -300),
    ]);
    const centerMat = new THREE.LineBasicMaterial({
      color: 0x00ccff,
      transparent: true,
      opacity: 0.9,
    });
    this.groundLine = this.add(new THREE.Line(centerGeo, centerMat), ctx);
    this.groundLine.visible = false; // fades in during camera transition

    // Horizon glow
    const horizonGeo = new THREE.PlaneGeometry(60, 0.5);
    const horizonMat = new THREE.MeshBasicMaterial({
      color: 0xff2266,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const horizon = new THREE.Mesh(horizonGeo, horizonMat);
    horizon.position.set(0, 0.5, -200);
    this.add(horizon, ctx);

    // Keep groundSegments for scroll recycling compatibility
    this.groundSegments = this.gridLines;
  }

  _buildTrees(ctx) {
    this.trees = [];

    const modelPaths = [
      '/models/environment/Trees.glb',
      '/models/environment/Pine Trees.glb',
      '/models/environment/Birch Trees.glb',
      '/models/environment/Dead Trees.glb',
      '/models/environment/Maple Trees.glb',
    ];

    const templateData = [];
    for (const p of modelPaths) {
      const s = getScene(p);
      if (!s) continue;
      const box = new THREE.Box3().setFromObject(s);
      const center = new THREE.Vector3();
      box.getCenter(center);
      templateData.push({ scene: s, center, minY: box.min.y });
    }
    if (templateData.length === 0) return;

    const TREE_COUNT = 6;
    const SPAN = 50;
    const spacing = SPAN / TREE_COUNT;

    for (let i = 0; i < TREE_COUNT; i++) {
      const td = templateData[i % templateData.length];
      const inner = td.scene.clone();

      inner.position.set(-td.center.x, -td.minY, -td.center.z);

      const group = new THREE.Group();
      group.add(inner);

      const baseZ = -(SPAN / 2) + (i + 0.5) * spacing + (Math.random() - 0.5) * spacing * 0.3;
      const x = -1 - Math.random() * 2;
      const scale = 1.0 + Math.random() * 0.8;

      group.scale.setScalar(scale);
      group.position.set(x, 0, baseZ);
      group.rotation.y = Math.random() * Math.PI * 2;

      inner.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({
            color: 0x5599dd, wireframe: true,
            transparent: true, opacity: 0.75,
          });
        }
      });

      this.add(group, ctx);
      this.trees.push({ model: group, baseZ, span: SPAN });
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

      // Glow halo (no point light — perf)
      const haloGeo = new THREE.IcosahedronGeometry(0.6, 1);
      const haloMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      group.add(halo);

      // Vary drop height and initial force per orb
      const dropHeight = 6 + Math.random() * 6;        // 6-12 units high
      const throwForce = -2 + Math.random() * 4;        // slight random initial Y velocity
      const sizeVariation = 0.8 + Math.random() * 0.5;  // 0.8x - 1.3x size

      group.position.set(0, dropHeight, z);
      group.visible = false;
      group.scale.setScalar(sizeVariation);

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
        triggered: false,
        collected: false,   // hit or passed
        // Physics — varied per orb
        velY: throwForce,
        posY: dropHeight,
        dropHeight,
        onGround: false,
        bounceCount: 0,
        orbRadius: 0.35 * sizeVariation,
        restitution: 0.75 + Math.random() * 0.2, // 0.75-0.95 bounciness
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
      ctx.bloomPass.strength = 0.8;
      ctx.bloomPass.radius = 0.3;
      ctx.bloomPass.threshold = 0.3;
    }

    // ── World scrolling — everything along Z ──
    const worldOffset = (songTime - 30) * this.scrollSpeed;

    // Scroll orbs
    for (const orb of this.orbs) {
      orb.group.position.z = orb.z + worldOffset;
    }

    // Scroll grid cross-lines with world offset, recycle when past camera
    for (const line of this.groundSegments) {
      const worldZ = line.userData.baseZ + worldOffset;
      line.position.z = worldZ;
      if (worldZ > 15) line.userData.baseZ -= 360; // recycle far ahead
    }

    // Scroll trees with world — same speed as ground so they stay planted
    for (const tree of this.trees || []) {
      let worldZ = tree.baseZ + worldOffset;
      while (worldZ > 30) { tree.baseZ -= tree.span; worldZ -= tree.span; }
      while (worldZ < -30) { tree.baseZ += tree.span; worldZ += tree.span; }
      tree.model.position.z = worldZ;
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
        this.jumpsLeft = 3; // reset triple jump on landing
      }
    }

    // Left/right movement (analog mouse or keyboard)
    const lateralSpeed = 4;
    const move = ctx.input.moveAmount;
    if (move !== 0) {
      this.playerX = Math.max(-2, Math.min(2, (this.playerX || 0) + move * lateralSpeed * dt));
    } else {
      if (ctx.input.left) this.playerX = Math.max((this.playerX || 0) - lateralSpeed * dt, -2);
      if (ctx.input.right) this.playerX = Math.min((this.playerX || 0) + lateralSpeed * dt, 2);
    }
    if (!this.playerX) this.playerX = 0;

    // Apply player position
    ctx.player.group.position.set(this.playerX, this.playerY + 0.5, 0);

    // Ball rolling spin (visual — around Z axis since we see from side)
    ctx.player.mesh.rotation.z -= dt * this.scrollSpeed * 2;
    ctx.player.glowMesh.rotation.z -= dt * this.scrollSpeed * 1.5;

    // ── Melody blink — flash the ball on each note ──
    // Find if a new note just triggered
    for (let i = this.lastNoteIndex + 1; i < MELODY_NOTES.length; i++) {
      if (songTime >= MELODY_NOTES[i][0]) {
        this.lastNoteIndex = i;
        this.blinkFlash = 1.0; // full flash
      } else {
        break;
      }
    }
    // Decay the flash
    if (this.blinkFlash > 0) {
      this.blinkFlash = Math.max(0, this.blinkFlash - dt * 6); // fast decay ~0.17s
      const b = this.blinkFlash;
      // Scale up the player ball on flash
      const pulseScale = 1 + b * 0.8;
      ctx.player.mesh.scale.setScalar(pulseScale);
      ctx.player.glowMesh.scale.setScalar(pulseScale * 1.1);
      // Brighten the glow
      ctx.player.light.intensity = 3 + b * 12;
      ctx.player.glowMat.uniforms.uEnergy.value = 0.3 + b;
      // Tint slightly toward the note color
      const noteHue = this.lastNoteIndex >= 0 ? noteToHue(MELODY_NOTES[this.lastNoteIndex][1]) : 0;
      const flashColor = new THREE.Color().setHSL(noteHue, 0.5, 0.8 + b * 0.2);
      ctx.player.glowMat.uniforms.uColor.value.lerp(flashColor, b * 0.6);
    } else {
      ctx.player.mesh.scale.setScalar(1);
      ctx.player.glowMesh.scale.setScalar(1);
      ctx.player.light.intensity = 3;
      ctx.player.glowMat.uniforms.uColor.value.lerp(new THREE.Color(1, 0.95, 0.85), dt * 3);
    }

    // ── Camera: transition from whited-out tunnel → side view (27s-30s, before melody) ──
    const TRANSITION_TIME = 3;
    const targetPos = new THREE.Vector3(16, 3.5 + this.playerY * 0.3, -4);
    const targetLook = new THREE.Vector3(0, 1 + this.playerY * 0.2, -4);

    if (t < TRANSITION_TIME) {
      // Smooth transition: tunnel (behind) → side view
      const p = t / TRANSITION_TIME;
      const ease = p * p * (3 - 2 * p); // smoothstep

      // White background fades to black during transition
      const whiteFade = 1 - ease;
      ctx.renderer.setClearColor(new THREE.Color(whiteFade * 0.9, whiteFade * 0.9, whiteFade * 0.9));
      ctx.scene.fog = new THREE.FogExp2(
        new THREE.Color(whiteFade * 0.5, whiteFade * 0.5, whiteFade * 0.5 + (1 - whiteFade) * 0.02),
        0.008 + whiteFade * 0.02
      );

      // Bloom comes down from the whiteout
      if (ctx.bloomPass) {
        ctx.bloomPass.strength = 2.5 - ease * 1.7; // 2.5 → 0.8
        ctx.bloomPass.radius = 0.5 - ease * 0.2;
        ctx.bloomPass.threshold = 0.4 - ease * 0.1;
      }

      // FOV narrows from wide tunnel (70) to platformer (55)
      ctx.camera.fov = 70 - ease * 15;
      ctx.camera.updateProjectionMatrix();
      // Lerp faster as transition progresses
      ctx.camera.position.lerp(targetPos, dt * (1 + ease * 5));

      // Player restores from dark silhouette back to bright
      const restoreP = Math.min(p * 2, 1); // restore in first half of transition
      ctx.player.mesh.material.color.setRGB(restoreP, restoreP, restoreP);
      ctx.player.mesh.scale.setScalar(1.5 - restoreP * 0.5);
      ctx.player.light.intensity = restoreP * 5;

      // Fade in ground after halfway through transition
      if (ease > 0.3 && this.groundLine) {
        this.groundLine.visible = true;
        this.groundLine.material.opacity = (ease - 0.3) / 0.7 * 0.9;
        // Also fade in the grid cross-lines
        for (const line of this.gridLines || []) {
          line.material.opacity = (ease - 0.3) / 0.7 * 0.4;
        }
      }
    } else {
      if (!this.cameraTransitionDone) {
        this.cameraTransitionDone = true;
        ctx.camera.fov = 55;
        ctx.camera.updateProjectionMatrix();
        ctx.renderer.setClearColor(0x000000);
        ctx.scene.fog = new THREE.FogExp2(0x000005, 0.008);
        // Ensure ground is visible (in case we skipped the transition)
        if (this.groundLine) {
          this.groundLine.visible = true;
          this.groundLine.material.opacity = 0.9;
        }
        for (const line of this.gridLines || []) {
          line.material.opacity = 0.4;
        }
        // Ensure player is restored
        ctx.player.mesh.material.color.setRGB(1, 1, 1);
        ctx.player.mesh.scale.setScalar(1);
        ctx.player.light.intensity = 5;
        // Snap camera if we jumped past transition
        if (t > TRANSITION_TIME + 1) {
          ctx.camera.position.copy(targetPos);
        }
      }
      ctx.camera.position.lerp(targetPos, dt * 4);
    }
    ctx.camera.lookAt(targetLook.x, targetLook.y, targetLook.z);

    // ── Trigger orbs — drop EXACTLY on the beat, spawn ahead of player ──
    for (const orb of this.orbs) {
      // Trigger: orb appears and drops exactly when the note plays
      if (!orb.triggered && songTime >= orb.time) {
        orb.triggered = true;
        orb.group.visible = true;
        orb.posY = orb.dropHeight;
        // Keep the pre-assigned varied velY (throwForce)
      }

      if (!orb.triggered) continue;

      // ── Orb falling physics — always runs, even after collected ──
      orb.velY += GRAVITY * dt;
      orb.posY += orb.velY * dt;

      // Bounce off ground — dense, energetic material, keeps bouncing
      if (orb.posY <= GROUND_Y) {
        orb.posY = GROUND_Y;
        orb.bounceCount++;
        // Per-orb restitution — some bounce higher than others
        orb.velY = Math.abs(orb.velY) * Math.max(orb.restitution - orb.bounceCount * 0.03, 0.4);

        // Impact flash effect on first bounce
        if (orb.bounceCount === 1) {
          this._spawnImpact(orb, ctx);
        }

        // Never fully settle — minimum bounce velocity varies by orb
        const minBounce = 3 + orb.restitution * 3; // 5.25 - 5.85
        if (orb.velY < minBounce) orb.velY = minBounce;

        // After many bounces, steady rhythmic bounce
        if (orb.bounceCount > 8) {
          orb.velY = minBounce + 1;
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
      // Pulse halo opacity with audio
      orb.halo.material.opacity = 0.2 + audio.mid * 0.15;

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

    // Red flash handled by score.hitFlash → player.update

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
    this.gridLines = [];
    this.explosionParticles = null;
    this.bgStars = null;
    super.exit(ctx);
  }
}
