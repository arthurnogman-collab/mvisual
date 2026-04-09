import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getModel, getScene } from '../preloader.js';
import { SectionBase } from './section-base.js';
import { TRACKS } from '../midi-data.js';

/**
 * SECTION 5 — "The Meditation" (3:26 – 5:00)
 *
 * Breakdown: drums cut out, everything becomes ethereal.
 * The ninja stops running and meditates at center.
 * All the creatures from the journey appear as glowing spirits,
 * peacefully orbiting in concentric rings.
 * The forest fragments and floats upward.
 * Camera slowly orbits and rises for a panoramic view.
 * Fireflies, aurora sky, luminous pulse rings on melody notes.
 *
 * Build-up phase (240s+): spirits orbit faster, particles multiply,
 * sky darkens, energy intensifies.
 * 298s: climactic flash to Section 6.
 */

const BEAT = 60 / 128;
const START = 206;
const END = 240;

function extractEvents() {
  const musicBox = (TRACKS['Music box'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const serum3 = (TRACKS['Serum #3'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const serum2 = (TRACKS['Serum #2'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  return { musicBox, serum3, serum2 };
}

const SPIRIT_MODELS = [
  'Dragon.glb', 'Demon.glb', 'Alien.glb', 'Ghost.glb',
  'Mushroom King.glb', 'Orc.glb', 'Dino.glb', 'Frog.glb',
  'Bunny.glb', 'Cat.glb', 'Blue Demon.glb', 'Squidle.glb',
];

const SPIRIT_COLORS = [
  0x66ffff, 0xff66ff, 0x66ff66, 0xffff66,
  0xff8866, 0x6688ff, 0xff66aa, 0x88ffaa,
  0xaa66ff, 0x66ffaa, 0xff88ff, 0xaaffff,
];

export class Section5 extends SectionBase {
  constructor() {
    super('the-breakdown', START, END);

    this.ninjaModel = null;
    this.ninjaMixer = null;
    this.ninjaActions = {};
    this._ninjaLoaded = false;

    this.spirits = [];
    this.floatingTrees = [];
    this._envMaterials = [];

    this.events = extractEvents();
    this.lastMelodyIndex = -1;
    this.lastBassIndex = -1;

    this._cameraOrbitAngle = 0;
    this._pulseRings = [];
    this._fireflies = null;
    this._auroraParticles = null;
    this._endShown = false;
    this._endOverlay = null;
  }

  enter(ctx) {
    super.enter(ctx);

    ctx.renderer.setClearColor(0x0a0a20);
    ctx.scene.fog = new THREE.FogExp2(0x101030, 0.004);
    ctx.renderer.toneMappingExposure = 0.85;

    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 0.6;
      ctx.bloomPass.radius = 0.4;
      ctx.bloomPass.threshold = 0.4;
    }
    if (ctx.crtPass) {
      ctx.crtPass.uniforms.scanlineWeight.value = 0;
      ctx.crtPass.uniforms.noiseAmount.value = 0.02;
      ctx.crtPass.uniforms.rgbShift.value = 0.001;
      ctx.crtPass.uniforms.curvature.value = 0;
      ctx.crtPass.uniforms.vignette.value = 0.3;
      ctx.crtPass.uniforms.interlace.value = 0;
    }

    ctx.player.group.visible = false;
    ctx.player.speed = 0;

    this.spirits = [];
    this.floatingTrees = [];
    this._envMaterials = [];
    this._pulseRings = [];
    this._cameraOrbitAngle = 0;
    this.lastMelodyIndex = -1;
    this.lastBassIndex = -1;
    this._endShown = false;

    this.worldGroup = new THREE.Group();
    ctx.scene.add(this.worldGroup);
    this.objects.push(this.worldGroup);

    // Soft ethereal lighting
    this.ambientLight = new THREE.AmbientLight(0x223355, 1.0);
    this.add(this.ambientLight, ctx);

    this.pointLight = new THREE.PointLight(0x4488ff, 1.5, 60);
    this.pointLight.position.set(0, 5, 0);
    this.add(this.pointLight, ctx);

    const spotLight = new THREE.SpotLight(0xff44aa, 1.0, 80, Math.PI / 4);
    spotLight.position.set(0, 30, 0);
    spotLight.target.position.set(0, 0, 0);
    this.add(spotLight, ctx);
    ctx.scene.add(spotLight.target);

    // Reflective ground
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x112244, roughness: 0.1, metalness: 0.8,
      emissive: 0x0a0a20, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.7,
    });
    this._ground = new THREE.Mesh(groundGeo, groundMat);
    this._ground.rotation.x = -Math.PI / 2;
    this._ground.position.y = -0.5;
    this.worldGroup.add(this._ground);

    ctx.story.clear();
    ctx.story.schedule('breathe', START + 1, 4, 'bright');
    ctx.story.schedule('the forest remembers', START + 8, 4);

    ctx.score.show();

    this._loadNinja(ctx);
    this._spawnSpirits(ctx);
    this._buildFloatingForest(ctx);
    this._buildFireflies(ctx);
    this._buildAurora(ctx);
  }

  _loadNinja(ctx) {
    const gltf = getModel('/models/monsters/Ninja-xGYmeDpfTu.glb');
    if (!gltf) return;

    const model = SkeletonUtils.clone(gltf.scene);
    model.scale.setScalar(0.6);
    model.position.set(0, 0, 0);

    // Ethereal glow material
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.emissive = new THREE.Color(0x4488ff);
        child.material.emissiveIntensity = 0.8;
        child.material.transparent = true;
        child.material.opacity = 0.9;
      }
    });

    this.ninjaModel = model;
    this.worldGroup.add(model);

    this.ninjaMixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const name = clip.name.replace('CharacterArmature|', '');
      this.ninjaActions[name] = this.ninjaMixer.clipAction(clip);
    }

    // Start with Idle (meditative)
    if (this.ninjaActions['Idle']) {
      this.ninjaActions['Idle'].play();
      this.ninjaActions['Idle'].timeScale = 0.4;
    }
    this._ninjaLoaded = true;
  }

  _spawnSpirits(ctx) {
    const ringCount = 3;
    const perRing = [5, 8, 12];
    const ringRadii = [6, 12, 20];
    const ringHeights = [1.5, 3.0, 5.0];
    let spiritIdx = 0;

    for (let ring = 0; ring < ringCount; ring++) {
      const count = perRing[ring];
      const radius = ringRadii[ring];
      const baseHeight = ringHeights[ring];

      for (let i = 0; i < count; i++) {
        const file = SPIRIT_MODELS[spiritIdx % SPIRIT_MODELS.length];
        const color = SPIRIT_COLORS[spiritIdx % SPIRIT_COLORS.length];
        spiritIdx++;

        const gltf = getModel(`/models/monsters/${file}`);
        if (!gltf) continue;

        const model = SkeletonUtils.clone(gltf.scene);
        const scale = 0.3 + Math.random() * 0.4;
        model.scale.setScalar(scale);

        // Ghostly glowing material
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.color.set(color);
            child.material.emissive = new THREE.Color(color);
            child.material.emissiveIntensity = 1.2;
            child.material.transparent = true;
            child.material.opacity = 0.6;
            child.material.wireframe = Math.random() > 0.5;
          }
        });

        this.worldGroup.add(model);

        // Animation
        const mixer = new THREE.AnimationMixer(model);
        let anim = null;
        for (const clip of gltf.animations) {
          const name = clip.name.replace('CharacterArmature|', '');
          if (name === 'Dance' || name === 'Wave' || name === 'Yes' || name === 'Idle') {
            anim = mixer.clipAction(clip);
          }
        }
        if (anim) {
          anim.play();
          anim.timeScale = 0.3 + Math.random() * 0.4;
        }

        const orbitAngle = (i / count) * Math.PI * 2;
        this.spirits.push({
          model, mixer, ring, radius, baseHeight,
          orbitAngle,
          orbitSpeed: (0.15 + Math.random() * 0.1) * (ring % 2 === 0 ? 1 : -1),
          bobPhase: Math.random() * Math.PI * 2,
          bobAmp: 0.3 + Math.random() * 0.5,
          color,
        });
      }
    }
  }

  _buildFloatingForest(ctx) {
    const treeFiles = [
      '/models/environment/Trees.glb',
      '/models/environment/Pine Trees.glb',
      '/models/environment/Birch Trees.glb',
      '/models/environment/Maple Trees.glb',
    ];
    const decorFiles = [
      '/models/environment/Flowers.glb',
      '/models/environment/Flower Bushes.glb',
      '/models/environment/Bushes.glb',
    ];

    // Trees that will float upward during the section
    for (let i = 0; i < 40; i++) {
      const file = (i < 20 ? treeFiles : decorFiles)[i % (i < 20 ? treeFiles.length : decorFiles.length)];
      const scene = getScene(file);
      if (!scene) continue;
      const model = scene.clone();

      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 60;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      model.scale.setScalar(1.5 + Math.random() * 3);
      model.position.set(x, 0, z);
      model.rotation.y = Math.random() * Math.PI * 2;

      // Ethereal materials
      model.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          const hsl = {};
          child.material.color.getHSL(hsl);
          child.material.color.setHSL(hsl.h, hsl.s * 0.6, hsl.l * 0.5);
          child.material.emissive = new THREE.Color().setHSL(hsl.h, 0.6, 0.3);
          child.material.emissiveIntensity = 0.8;
          child.material.transparent = true;
          child.material.opacity = 0.4;
          child.material.wireframe = true;
        }
      });

      this.worldGroup.add(model);
      this.floatingTrees.push({
        model, baseX: x, baseZ: z, baseY: 0,
        floatSpeed: 0.3 + Math.random() * 0.6,
        floatDelay: Math.random() * 20,
        rotSpeed: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  _buildFireflies(ctx) {
    const count = 300;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 40;
      positions[i * 3] = Math.cos(angle) * dist;
      positions[i * 3 + 1] = 0.5 + Math.random() * 12;
      positions[i * 3 + 2] = Math.sin(angle) * dist;

      const c = new THREE.Color().setHSL(Math.random(), 0.8, 0.7);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this._fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    this.worldGroup.add(this._fireflies);
  }

  _buildAurora(ctx) {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = 25 + Math.random() * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;

      const hue = 0.45 + Math.random() * 0.3;
      const c = new THREE.Color().setHSL(hue, 0.9, 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this._auroraParticles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2.0, vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false,
    }));
    this.worldGroup.add(this._auroraParticles);
  }

  _spawnPulseRing(note) {
    const hue = (note % 12) / 12;
    const color = new THREE.Color().setHSL(hue, 0.9, 0.7);

    for (let j = 0; j < 2; j++) {
      const geo = new THREE.RingGeometry(0.3, 0.5, 32);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.position.set(0, 2 + j * 0.5, 0);
      ring.rotation.x = -Math.PI / 2;
      this.worldGroup.add(ring);
      this._pulseRings.push({
        mesh: ring, life: 2.0, maxLife: 2.0, speed: 3 + j * 2,
      });
    }
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const songTime = ctx.audio.currentTime;
    const buildPhase = Math.min(t / 30, 1);

    // ── Camera — slow orbit, rising during section ──
    const orbitSpeed = 0.12 + buildPhase * 0.3;
    this._cameraOrbitAngle += orbitSpeed * dt;
    const camRadius = THREE.MathUtils.lerp(18, 12, buildPhase);
    const camHeight = THREE.MathUtils.lerp(4, 15 + buildPhase * 10, Math.min(t / 30, 1));

    const camX = Math.cos(this._cameraOrbitAngle) * camRadius;
    const camZ = Math.sin(this._cameraOrbitAngle) * camRadius;
    const targetPos = new THREE.Vector3(camX, camHeight, camZ);
    ctx.camera.position.lerp(targetPos, dt * 2);
    ctx.camera.lookAt(0, 1 + buildPhase * 3, 0);
    ctx.camera.fov = THREE.MathUtils.lerp(55, 45, buildPhase);
    ctx.camera.updateProjectionMatrix();

    // ── Ninja ──
    if (this._ninjaLoaded && this.ninjaModel) {
      // Slowly rotate to face camera
      this.ninjaModel.rotation.y = -this._cameraOrbitAngle + Math.PI;
      // Float upward slightly during build
      this.ninjaModel.position.y = Math.sin(songTime * 0.5) * 0.2 + buildPhase * 2;
      this.ninjaMixer.update(dt);
    }

    // ── Spirits orbit ──
    const spiritSpeedMult = 1 + buildPhase * 3;
    for (const s of this.spirits) {
      s.orbitAngle += s.orbitSpeed * spiritSpeedMult * dt;
      const x = Math.cos(s.orbitAngle) * s.radius;
      const z = Math.sin(s.orbitAngle) * s.radius;
      const bob = Math.sin(songTime * 1.5 + s.bobPhase) * s.bobAmp;
      const flyUp = buildPhase * s.ring * 2;
      s.model.position.set(x, s.baseHeight + bob + flyUp, z);
      s.model.rotation.y = s.orbitAngle + Math.PI;

      // Pulse opacity with music
      s.model.traverse((c) => {
        if (c.isMesh && c.material && c.material.transparent) {
          c.material.opacity = 0.4 + Math.sin(songTime * 2 + s.bobPhase) * 0.1 + buildPhase * 0.1;
          c.material.emissiveIntensity = 0.6 + buildPhase * 0.3;
        }
      });

      s.mixer.update(dt);
    }

    // ── Floating trees ──
    for (const ft of this.floatingTrees) {
      const elapsed = Math.max(0, t - ft.floatDelay);
      if (elapsed > 0) {
        ft.baseY += ft.floatSpeed * dt * (0.5 + buildPhase * 2);
        ft.model.rotation.y += ft.rotSpeed * dt;
      }
      ft.model.position.y = ft.baseY + Math.sin(songTime * 0.3 + ft.floatDelay) * 0.3;

      // Fade out as they float high
      const fadeStart = 20;
      if (ft.baseY > fadeStart) {
        ft.model.traverse((c) => {
          if (c.isMesh && c.material && c.material.transparent) {
            c.material.opacity = Math.max(0.05, 0.4 - (ft.baseY - fadeStart) * 0.02);
          }
        });
      }
    }

    // ── Fireflies ──
    if (this._fireflies) {
      const pos = this._fireflies.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += Math.sin(songTime * 0.7 + i) * dt * 0.4;
        pos[i + 1] += Math.sin(songTime * 1.3 + i * 0.3) * dt * 0.3;
        pos[i + 2] += Math.cos(songTime * 0.9 + i * 0.2) * dt * 0.4;
      }
      this._fireflies.geometry.attributes.position.needsUpdate = true;
      this._fireflies.material.opacity = 0.5 + Math.sin(songTime * 2) * 0.15 + buildPhase * 0.3;
    }

    // ── Aurora ──
    if (this._auroraParticles) {
      const pos = this._auroraParticles.geometry.attributes.position.array;
      const col = this._auroraParticles.geometry.attributes.color.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += Math.sin(songTime * 0.2 + i * 0.01) * dt * 2;
        pos[i + 1] += Math.sin(songTime * 0.15 + i * 0.02) * dt * 0.5;

        // Shift colors slowly
        const idx = i / 3;
        const hue = (0.45 + Math.sin(songTime * 0.1 + idx * 0.05) * 0.2) % 1;
        const c = new THREE.Color().setHSL(hue, 0.9, 0.4 + buildPhase * 0.1);
        col[i] = c.r;
        col[i + 1] = c.g;
        col[i + 2] = c.b;
      }
      this._auroraParticles.geometry.attributes.position.needsUpdate = true;
      this._auroraParticles.geometry.attributes.color.needsUpdate = true;
      this._auroraParticles.material.opacity = 0.2 + buildPhase * 0.3;
    }

    // ── MIDI: pulse rings on melody ──
    for (let i = this.lastMelodyIndex + 1; i < this.events.musicBox.length; i++) {
      const [noteTime, note] = this.events.musicBox[i];
      if (songTime >= noteTime) {
        this.lastMelodyIndex = i;
        this._spawnPulseRing(note);
      } else break;
    }

    // Bass: light pulse
    for (let i = this.lastBassIndex + 1; i < this.events.serum3.length; i++) {
      const [nt] = this.events.serum3[i];
      if (songTime >= nt) {
        this.lastBassIndex = i;
        if (this.pointLight) this.pointLight.intensity = 3;
      } else break;
    }
    if (this.pointLight) {
      this.pointLight.intensity += (1.5 - this.pointLight.intensity) * dt * 4;
      this.pointLight.color.setHSL((songTime * 0.05) % 1, 0.8, 0.6);
    }

    // ── Pulse rings ──
    for (let i = this._pulseRings.length - 1; i >= 0; i--) {
      const pr = this._pulseRings[i];
      pr.life -= dt;
      const progress = 1 - pr.life / pr.maxLife;
      const scale = 1 + progress * pr.speed * 4;
      pr.mesh.scale.setScalar(scale);
      pr.mesh.material.opacity = Math.max(0, 0.9 * (1 - progress));
      pr.mesh.position.y += dt * 0.5;

      if (pr.life <= 0) {
        this.worldGroup.remove(pr.mesh);
        pr.mesh.geometry.dispose();
        pr.mesh.material.dispose();
        this._pulseRings.splice(i, 1);
      }
    }

    // ── Sky ──
    const skyHue = THREE.MathUtils.lerp(0.65, 0.75, buildPhase);
    const skyLit = THREE.MathUtils.lerp(0.08, 0.04, buildPhase);
    ctx.renderer.setClearColor(new THREE.Color().setHSL(skyHue, 0.5, skyLit));
    if (ctx.scene.fog) {
      ctx.scene.fog.color.setHSL(skyHue, 0.3, skyLit + 0.02);
    }

    // ── Build-up bloom (subtle) ──
    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 0.6 + buildPhase * 0.2;
      ctx.bloomPass.threshold = 0.4;
    }

    // ── Gentle fade to ending ──
    if (songTime > 218) {
      const fadeP = Math.min((songTime - 218) / 18, 1);
      ctx.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.85, 0.4, fadeP);
      if (ctx.bloomPass) ctx.bloomPass.strength = THREE.MathUtils.lerp(0.6, 0.3, fadeP);

      const skyFade = THREE.MathUtils.lerp(0.08, 0.01, fadeP);
      ctx.renderer.setClearColor(new THREE.Color().setHSL(0.7, 0.4, skyFade));

      for (const s of this.spirits) {
        s.model.traverse((c) => {
          if (c.isMesh && c.material && c.material.transparent) {
            c.material.opacity = Math.max(0.05, (1 - fadeP) * 0.5);
          }
        });
      }
    }

    // ── Show final score + THE END ──
    if (songTime > 224 && !this._endShown) {
      this._endShown = true;
      this._showFinalScreen(ctx);
      ctx.audio.fadeOut(10);
    }
  }

  _showFinalScreen(ctx) {
    if (this._endOverlay) return;

    const score = ctx.score.value;
    const maxCombo = ctx.score.maxCombo;

    let grade = 'C';
    if (score > 50000) grade = 'S';
    else if (score > 30000) grade = 'A';
    else if (score > 15000) grade = 'B';
    const gradeColors = { S: '#ffdd00', A: '#00ff88', B: '#0088ff', C: '#ff4488' };

    this._endOverlay = document.createElement('div');
    this._endOverlay.innerHTML = `
      <div class="end-score">${score.toLocaleString()}</div>
      <div class="end-combo">MAX COMBO: ${maxCombo}x</div>
      <div class="end-grade" style="color:${gradeColors[grade]}">${grade}</div>
      <div class="end-title">THE END</div>
    `;
    this._endOverlay.style.cssText = `
      position:fixed; inset:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; z-index:50;
      pointer-events:none; opacity:0;
      transition: opacity 4s ease;
    `;

    const style = document.createElement('style');
    style.id = 'end-screen-style';
    style.textContent = `
      .end-score {
        font-family: 'Orbitron', monospace; font-size: 3.5rem; font-weight: 700;
        color: #fff; letter-spacing: 0.2em; margin-bottom: 10px;
        text-shadow: 0 0 20px rgba(0,255,255,0.6), 0 0 60px rgba(0,200,255,0.3);
      }
      .end-combo {
        font-family: 'Orbitron', monospace; font-size: 1rem;
        color: rgba(0,255,200,0.8); letter-spacing: 0.15em; margin-bottom: 25px;
      }
      .end-grade {
        font-family: 'Orbitron', monospace; font-size: 5rem; font-weight: 900;
        letter-spacing: 0.1em; margin-bottom: 40px;
        text-shadow: 0 0 30px currentColor;
      }
      .end-title {
        font-family: 'Orbitron', monospace; font-size: 2rem; font-weight: 300;
        color: rgba(255,255,255,0.7); letter-spacing: 1em;
        text-shadow: 0 0 15px rgba(255,255,255,0.3);
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this._endOverlay);

    ctx.score.hide();

    requestAnimationFrame(() => {
      this._endOverlay.style.opacity = '1';
    });
  }

  exit(ctx) {
    ctx.player.group.visible = true;
    ctx.renderer.toneMappingExposure = 1.0;

    for (const s of this.spirits) {
      this.worldGroup.remove(s.model);
      s.mixer.stopAllAction();
    }
    this.spirits = [];

    for (const pr of this._pulseRings) {
      this.worldGroup.remove(pr.mesh);
      pr.mesh.geometry.dispose();
      pr.mesh.material.dispose();
    }
    this._pulseRings = [];

    if (this.ninjaModel) {
      this.worldGroup.remove(this.ninjaModel);
      this.ninjaModel = null;
    }
    if (this.ninjaMixer) {
      this.ninjaMixer.stopAllAction();
      this.ninjaMixer = null;
    }
    this.ninjaActions = {};

    this.floatingTrees = [];
    this._envMaterials = [];
    this.worldGroup = null;
    this._fireflies = null;
    this._auroraParticles = null;

    if (this._endOverlay) {
      this._endOverlay.remove();
      this._endOverlay = null;
    }
    const endStyle = document.getElementById('end-screen-style');
    if (endStyle) endStyle.remove();

    super.exit(ctx);
  }
}
