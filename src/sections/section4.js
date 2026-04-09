import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getModel, getScene } from '../preloader.js';
import { SectionBase } from './section-base.js';
import { TRACKS } from '../midi-data.js';

const BEAT = 60 / 128;
const START = 120;
const END = 206;

function extractEvents() {
  const kick = (TRACKS['707 Kick'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const serum3 = (TRACKS['Serum #3'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const melody = (TRACKS['Music box'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const dedupedKick = [];
  for (const ev of kick) {
    if (dedupedKick.length === 0 || ev[0] - dedupedKick[dedupedKick.length - 1][0] > 0.3)
      dedupedKick.push(ev);
  }
  const dedupedMelody = [];
  for (const ev of melody) {
    if (dedupedMelody.length === 0 || ev[0] - dedupedMelody[dedupedMelody.length - 1][0] > 0.4)
      dedupedMelody.push(ev);
  }
  return { kick: dedupedKick, serum3, melody: dedupedMelody };
}

const MONSTER_DEFS = [
  { file: 'Demon.glb',         baseScale: 0.5,  color: 0xff4444, type: 'ground' },
  { file: 'Dragon.glb',        baseScale: 0.5,  color: 0x44ff44, type: 'ground' },
  { file: 'Alien.glb',         baseScale: 0.5,  color: 0x4444ff, type: 'ground' },
  { file: 'Orc.glb',           baseScale: 0.5,  color: 0xff8800, type: 'ground' },
  { file: 'Ghost.glb',         baseScale: 0.5,  color: 0xaa44ff, type: 'flying' },
  { file: 'Mushroom King.glb', baseScale: 0.5,  color: 0xff44aa, type: 'ground' },
  { file: 'Dino.glb',          baseScale: 0.5,  color: 0x44ffaa, type: 'ground' },
  { file: 'Frog.glb',          baseScale: 0.45, color: 0x88ff44, type: 'ground' },
  { file: 'Blue Demon.glb',    baseScale: 0.5,  color: 0x4488ff, type: 'ground' },
  { file: 'Bunny.glb',         baseScale: 0.45, color: 0xffaacc, type: 'ground' },
];

const ALL_TREE_FILES = [
  '/models/environment/Trees.glb',
  '/models/environment/Pine Trees.glb',
  '/models/environment/Birch Trees.glb',
  '/models/environment/Maple Trees.glb',
  '/models/environment/Palm Trees.glb',
  '/models/environment/Dead Trees.glb',
];
const ALL_DECOR_FILES = [
  '/models/environment/Flowers.glb',
  '/models/environment/Flower Bushes.glb',
  '/models/environment/Bushes.glb',
  '/models/environment/Grass.glb',
  '/models/environment/Rocks.glb',
];

function terrainHeight() {
  return 0;
}

function debugLog(msg) {
  fetch('/debug-log', { method: 'POST', body: msg }).catch(() => {});
}

export class Section4 extends SectionBase {
  constructor() {
    super('the-drop', START, END);

    this.playerX = 0;
    this.playerZ = 0;
    this.playerAngle = 0;
    this._cameraAngle = 0;
    this.playerY = 0;
    this.jumpVelY = 0;
    this.isGrounded = true;
    this.jumpsLeft = 3;
    this.runSpeed = 12;
    this._logCounter = 0;

    this.ninjaModel = null;
    this.ninjaMixer = null;
    this.ninjaActions = {};
    this.ninjaCurrentAction = null;
    this._ninjaLoaded = false;
    this._attackCooldown = 0;

    this._monsterTemplates = [];
    this.monsters = [];

    this.envObjects = [];
    this._envMaterials = [];

    this.events = extractEvents();
    this.lastKickIndex = -1;
    this.lastBassIndex = -1;
    this._kickBounce = 0;
    this._lastBeatNum = -1;

    this._sunRiseProgress = 0;
    this._flashOverlay = null;
    this._explosions = [];
    this._stars = null;
    this._starMat = null;
    this._shootingStars = [];
    this._colorWaves = [];
    this._lastMelodyIndex = -1;
    this._lastWaveKickIndex = -1;
    this._waveKickCount = 0;
  }

  enter(ctx) {
    super.enter(ctx);

    ctx.renderer.setClearColor(0x020208);
    ctx.scene.fog = new THREE.FogExp2(0x020208, 0.008);
    ctx.renderer.toneMappingExposure = 0.8;

    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 1.2;
      ctx.bloomPass.radius = 0.5;
      ctx.bloomPass.threshold = 0.25;
    }
    if (ctx.crtPass) {
      ctx.crtPass.uniforms.scanlineWeight.value = 0;
      ctx.crtPass.uniforms.noiseAmount.value = 0;
      ctx.crtPass.uniforms.rgbShift.value = 0;
      ctx.crtPass.uniforms.curvature.value = 0;
      ctx.crtPass.uniforms.vignette.value = 0;
      ctx.crtPass.uniforms.interlace.value = 0;
    }

    ctx.player.group.visible = false;
    ctx.player.speed = 0;

    this.playerX = 0;
    this.playerZ = 0;
    this.playerAngle = 0;
    this._cameraAngle = 0;
    this.playerY = 0;
    this.jumpVelY = 0;
    this.isGrounded = true;
    this.jumpsLeft = 3;
    this.lastKickIndex = -1;
    this.lastBassIndex = -1;
    this._kickBounce = 0;
    this._lastBeatNum = -1;
    this._sunRiseProgress = 0;
    this._attackCooldown = 0;
    this.monsters = [];
    this._explosions = [];
    this._envMaterials = [];
    this.envObjects = [];
    this._shootingStars = [];
    this._colorWaves = [];
    this._lastMelodyIndex = -1;
    this._lastWaveKickIndex = -1;
    this._waveKickCount = 0;

    this.worldGroup = new THREE.Group();
    ctx.scene.add(this.worldGroup);
    this.objects.push(this.worldGroup);

    this.sunLight = new THREE.DirectionalLight(0xffeecc, 0.15);
    this.sunLight.position.set(5, 25, 15);
    this.add(this.sunLight, ctx);

    this.fillLight = new THREE.DirectionalLight(0x4466aa, 0.15);
    this.fillLight.position.set(-5, 10, -20);
    this.add(this.fillLight, ctx);

    this.ambientLight = new THREE.AmbientLight(0x2a2840, 0.6);
    this.add(this.ambientLight, ctx);

    this.hemiLight = new THREE.HemisphereLight(0x2a2840, 0x1a4020, 0.45);
    this.add(this.hemiLight, ctx);

    const sunGeo = new THREE.SphereGeometry(8, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xff8833 });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.sun.position.set(40, -15, -120);
    this.add(this.sun, ctx);

    const haloGeo = new THREE.SphereGeometry(14, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffcc66, transparent: true, opacity: 0.15,
    });
    this.sunHalo = new THREE.Mesh(haloGeo, haloMat);
    this.sun.add(this.sunHalo);

    ctx.story.clear();
    ctx.story.schedule('KILL THE MONSTERS', START + 1, 4, 'bright');

    ctx.score.show();

    this._buildTerrain(ctx);
    this._buildForest(ctx);
    this._buildStars(ctx);
    this._loadNinja(ctx);
    this._loadMonsterTemplates(ctx);
    this._createFlashOverlay(ctx);
  }

  _createFlashOverlay(ctx) {
    const geo = new THREE.PlaneGeometry(100, 100);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1, depthTest: false,
    });
    this._flashOverlay = new THREE.Mesh(geo, mat);
    this._flashOverlay.position.set(0, 0, -1);
    this._flashOverlay.renderOrder = 999;
    ctx.camera.add(this._flashOverlay);
  }

  _buildTerrain(ctx) {
    const size = 2000;
    const groundGeo = new THREE.PlaneGeometry(size, size, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2a7740, roughness: 0.85, metalness: 0,
      emissive: 0x155520, emissiveIntensity: 0.5,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    this.worldGroup.add(ground);
    this._groundMat = groundMat;
    this._ground = ground;
  }

  _buildStars(ctx) {
    const count = 600;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.8 + 0.2);
      const r = 400 + Math.random() * 200;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._starMat = new THREE.PointsMaterial({
      size: 4.0, color: 0xffffff, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this._stars = new THREE.Points(geo, this._starMat);
    ctx.scene.add(this._stars);
    this.objects.push(this._stars);
  }

  _saturateModel(model, boostFactor = 1.5) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        const c = child.material.color;
        const hsl = {};
        c.getHSL(hsl);
        c.setHSL(hsl.h, Math.min(1, hsl.s * boostFactor * 1.8), Math.min(0.85, hsl.l * boostFactor));
        child.material.emissive = c.clone().multiplyScalar(0.35);
        child.material.emissiveIntensity = 0.6;
        child.material.metalness = 0;
        child.material.roughness = 0.5;
      }
    });
  }

  _buildForest(ctx) {
    this._envMaterials = [];
    const TREE_RADIUS = 200;

    for (let i = 0; i < 200; i++) {
      const file = ALL_TREE_FILES[i % ALL_TREE_FILES.length];
      const scene = getScene(file);
      if (!scene) continue;
      const model = scene.clone();

      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * TREE_RADIUS;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      model.scale.setScalar(4.0 + Math.random() * 8.0);
      model.position.set(x, 0, z);
      model.rotation.y = Math.random() * Math.PI * 2;

      this._psychedelicModel(model);
      this._collectMaterials(model);
      this.worldGroup.add(model);
      this.envObjects.push({ model, isTree: true });
    }

    for (let i = 0; i < 500; i++) {
      const file = ALL_DECOR_FILES[i % ALL_DECOR_FILES.length];
      const scene = getScene(file);
      if (!scene) continue;
      const model = scene.clone();

      const angle = Math.random() * Math.PI * 2;
      const dist = 1 + Math.random() * TREE_RADIUS;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      const sizeRoll = Math.random();
      let scale;
      if (sizeRoll < 0.3) scale = 0.4 + Math.random() * 0.8;
      else if (sizeRoll < 0.6) scale = 1.2 + Math.random() * 1.5;
      else if (sizeRoll < 0.85) scale = 2.5 + Math.random() * 2.5;
      else scale = 5.0 + Math.random() * 3.0;

      model.scale.setScalar(scale);
      model.position.set(x, 0, z);
      model.rotation.y = Math.random() * Math.PI * 2;

      this._psychedelicModel(model);
      this._collectMaterials(model);
      this.worldGroup.add(model);
      this.envObjects.push({ model, isTree: false });
    }
  }

  _psychedelicModel(model) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.wireframe = false;
        child.material.transparent = false;
        child.material.opacity = 1;
        const c = child.material.color;
        const hsl = {};
        c.getHSL(hsl);
        c.setHSL(hsl.h, 1.0, Math.min(0.5, hsl.l * 1.1 + 0.1));
        child.material.emissive = new THREE.Color().setHSL(hsl.h, 1.0, 0.15);
        child.material.emissiveIntensity = 0.4;
        child.material.metalness = 0.05;
        child.material.roughness = 0.5;
      }
    });
  }

  _collectMaterials(model) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const hsl = {};
        child.material.color.getHSL(hsl);
        this._envMaterials.push({ mat: child.material, solidHSL: { ...hsl } });
      }
    });
  }

  _loadNinja(ctx) {
    const gltf = getModel('/models/monsters/Ninja-xGYmeDpfTu.glb');
    if (!gltf) return;

    const model = SkeletonUtils.clone(gltf.scene);
    model.scale.setScalar(0.55);

    this._saturateModel(model, 1.5);
    this.ninjaModel = model;
    this.worldGroup.add(model);

    this.ninjaMixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const name = clip.name.replace('CharacterArmature|', '');
      this.ninjaActions[name] = this.ninjaMixer.clipAction(clip);
    }

    if (this.ninjaActions['Run']) {
      const a = this.ninjaActions['Run'];
      a.play();
      a.timeScale = a.getClip().duration / (BEAT * 2);
      this.ninjaCurrentAction = 'Run';
    }
    this._ninjaLoaded = true;
  }

  _switchNinjaAction(name, duration = 0.2) {
    if (!this._ninjaLoaded || this.ninjaCurrentAction === name) return;
    if (!this.ninjaActions[name]) return;
    const prev = this.ninjaActions[this.ninjaCurrentAction];
    const next = this.ninjaActions[name];
    if (prev) prev.fadeOut(duration);
    next.reset().fadeIn(duration).play();
    this.ninjaCurrentAction = name;
  }

  _loadMonsterTemplates() {
    for (const def of MONSTER_DEFS) {
      const gltf = getModel(`/models/monsters/${def.file}`);
      if (!gltf) continue;
      this._monsterTemplates.push({ gltf, def });
    }
  }

  _spawnMonster() {
    if (this._monsterTemplates.length === 0) return;
    const { gltf, def } = this._monsterTemplates[
      Math.floor(Math.random() * this._monsterTemplates.length)
    ];
    const model = SkeletonUtils.clone(gltf.scene);

    const roll = Math.random();
    let sz;
    if (roll < 0.1)       sz = 0.2 + Math.random() * 0.3;
    else if (roll < 0.3)  sz = 0.5 + Math.random() * 0.5;
    else if (roll < 0.5)  sz = 1.0 + Math.random() * 0.5;
    else if (roll < 0.65) sz = 2.0 + Math.random() * 2.0;
    else if (roll < 0.8)  sz = 5.0 + Math.random() * 4.0;
    else if (roll < 0.92) sz = 10.0 + Math.random() * 6.0;
    else                  sz = 18.0 + Math.random() * 10.0;

    model.scale.setScalar(def.baseScale * sz);
    this._saturateModel(model, 1.8);

    // Spawn mostly ahead, sometimes from sides — bigger monsters spawn further
    const offsetAngle = (Math.random() - 0.5) * Math.PI * 1.2;
    const spawnAngle = this.playerAngle + offsetAngle;
    const spawnDist = 20 + Math.random() * 25 + sz * 3;
    const wx = this.playerX + Math.sin(spawnAngle) * spawnDist;
    const wz = this.playerZ - Math.cos(spawnAngle) * spawnDist;
    const yOff = def.type === 'flying' ? 1.0 + sz * 0.5 : 0;
    const groundY = terrainHeight(wx, -wz);

    model.position.set(wx, groundY + yOff, wz);
    this.worldGroup.add(model);

    const mixer = new THREE.AnimationMixer(model);
    let walkAction = null;
    let deathAction = null;
    for (const clip of gltf.animations) {
      const name = clip.name.replace('CharacterArmature|', '');
      if ((name === 'Walk' || name === 'Run' || name === 'Idle') && !walkAction)
        walkAction = mixer.clipAction(clip);
      if (name === 'Death') {
        deathAction = mixer.clipAction(clip);
        deathAction.setLoop(THREE.LoopOnce);
        deathAction.clampWhenFinished = true;
      }
    }
    if (walkAction) {
      walkAction.play();
      walkAction.timeScale = 0.7 + Math.random() * 0.6;
    }

    this.monsters.push({
      model, mixer, def, sz,
      wx, wz, yOff, groundY,
      approachSpeed: 4 + Math.random() * 5,
      alive: true, dying: false, deathTimer: 0,
      walkAction, deathAction,
      baseY: groundY + yOff,
    });
  }

  _spawnExplosion(position, color, sz) {
    const count = Math.floor(20 + sz * 12);
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const spread = 1 + sz * 0.4;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y + 0.5;
      positions[i * 3 + 2] = position.z;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 12 * spread,
        Math.random() * 8 * spread + 2,
        (Math.random() - 0.5) * 12 * spread,
      ));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.3 + sz * 0.15, color, transparent: true, opacity: 1, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    this.worldGroup.add(pts);
    this._explosions.push({ particles: pts, velocities, life: 1.0 });
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const songTime = ctx.audio.currentTime;
    const GRAVITY = -25;

    // ── Flash ──
    if (this._flashOverlay) {
      if (t < 2) {
        this._flashOverlay.material.opacity = Math.max(0, 1 - t / 1.5);
      } else {
        this._flashOverlay.material.opacity = 0;
        this._flashOverlay.visible = false;
      }
    }

    // ═══════════════════════════════════
    // PLAYER — mouse position controls turn RATE
    // ═══════════════════════════════════

    const mx = ctx.input.mouseX;

    // Mouse position drives turn rate: right side → turn right, left → turn left
    // Dead zone near center so tiny mouse movements don't steer
    const deadZone = 0.05;
    const steerInput = Math.abs(mx) < deadZone ? 0 : (mx - Math.sign(mx) * deadZone) / (1 - deadZone);
    const maxTurnSpeed = 2.5;
    this.playerAngle += steerInput * maxTurnSpeed * dt;

    // Auto-run forward in character's facing direction
    const speed = this.runSpeed + (songTime > 150 ? 4 : 0);
    this.playerX += Math.sin(this.playerAngle) * speed * dt;
    this.playerZ -= Math.cos(this.playerAngle) * speed * dt;

    // Ground height under player
    const groundUnderPlayer = terrainHeight(this.playerX, -this.playerZ);

    // Jump (left-click or space) — triple jump, high arc
    const jumpPressed = ctx.input._mouseJustClicked
      || ctx.input._justPressed['Space']
      || ctx.input._justPressed['ArrowUp'];
    if (jumpPressed && this.jumpsLeft > 0) {
      this.jumpVelY = 16;
      this.isGrounded = false;
      this.jumpsLeft--;
      this._switchNinjaAction('Jump', 0.1);
    }
    if (!this.isGrounded) {
      this.jumpVelY += GRAVITY * dt;
      this.playerY += this.jumpVelY * dt;
      if (this.playerY <= groundUnderPlayer) {
        this.playerY = groundUnderPlayer;
        this.jumpVelY = 0;
        this.isGrounded = true;
        this.jumpsLeft = 3;
        this._switchNinjaAction('Run', 0.15);
      }
    } else {
      this.playerY += (groundUnderPlayer - this.playerY) * dt * 8;
    }

    // Attack (right-click or F)
    this._attackCooldown = Math.max(0, this._attackCooldown - dt);
    if (ctx.input.attackDown && this._attackCooldown <= 0 && this._ninjaLoaded) {
      this._attackCooldown = 0.5;
      this._switchNinjaAction('Weapon', 0.1);
      setTimeout(() => {
        if (this.active && this.isGrounded) this._switchNinjaAction('Run', 0.15);
      }, 450);
    }

    // Position ninja — mixer first, then override position/rotation
    if (this._ninjaLoaded && this.ninjaModel) {
      this.ninjaMixer.update(dt);
      this.ninjaModel.position.set(this.playerX, this.playerY, this.playerZ);
      this.ninjaModel.rotation.y = Math.PI - this.playerAngle;
    }

    // ── Camera — follows behind character with visible lag ──
    if (t < 1.5) {
      this._cameraAngle = this.playerAngle;
    } else {
      let angleDiff = this.playerAngle - this._cameraAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      this._cameraAngle += angleDiff * Math.min(1, dt * 1.8);
    }

    const camDist = 6;
    const camHeight = 2.5;
    const camX = this.playerX - Math.sin(this._cameraAngle) * camDist;
    const camZ = this.playerZ + Math.cos(this._cameraAngle) * camDist;
    const camY = camHeight + this.playerY * 0.3;

    const targetCamPos = new THREE.Vector3(camX, camY, camZ);
    const camPosLerp = t < 1.5 ? 1 : Math.min(1, dt * 3);
    ctx.camera.position.lerp(targetCamPos, camPosLerp);

    const lookAhead = 10;
    ctx.camera.lookAt(
      this.playerX + Math.sin(this._cameraAngle) * lookAhead,
      this.playerY + 1.0,
      this.playerZ - Math.cos(this._cameraAngle) * lookAhead,
    );
    ctx.camera.fov = 60;
    ctx.camera.updateProjectionMatrix();

    // ── DEBUG LOG every 10 frames ──
    this._logCounter++;
    if (this._logCounter % 10 === 0) {
      const cp = ctx.camera.position;
      const camDir = new THREE.Vector3();
      ctx.camera.getWorldDirection(camDir);
      let rawAngleDiff = this.playerAngle - this._cameraAngle;
      while (rawAngleDiff > Math.PI) rawAngleDiff -= Math.PI * 2;
      while (rawAngleDiff < -Math.PI) rawAngleDiff += Math.PI * 2;
      let ninjaInfo = 'N/A';
      if (this.ninjaModel) {
        const nr = this.ninjaModel.rotation;
        const nq = new THREE.Quaternion();
        this.ninjaModel.getWorldQuaternion(nq);
        const nfwd = new THREE.Vector3(0, 0, 1).applyQuaternion(nq);
        ninjaInfo = `rotY=${nr.y.toFixed(3)} worldFwd=(${nfwd.x.toFixed(3)},${nfwd.y.toFixed(3)},${nfwd.z.toFixed(3)})`;
      }
      const moveDir = `(${Math.sin(this.playerAngle).toFixed(3)}, ${(-Math.cos(this.playerAngle)).toFixed(3)})`;
      debugLog(
        `[S4 f${this._logCounter}] `
        + `steer=${steerInput.toFixed(3)} `
        + `| pAngle=${this.playerAngle.toFixed(3)} camAngle=${this._cameraAngle.toFixed(3)} diff=${rawAngleDiff.toFixed(3)} `
        + `| moveDir=${moveDir} `
        + `| ninja: ${ninjaInfo} `
        + `| camDir=(${camDir.x.toFixed(3)},${camDir.y.toFixed(3)},${camDir.z.toFixed(3)}) `
        + `| camPos=(${cp.x.toFixed(1)},${cp.y.toFixed(1)},${cp.z.toFixed(1)}) pPos=(${this.playerX.toFixed(1)},${this.playerY.toFixed(1)},${this.playerZ.toFixed(1)})`
      );
    }

    // Move ground to follow player (it's 2000x2000 so just re-center)
    if (this._ground) {
      this._ground.position.x = this.playerX;
      this._ground.position.z = this.playerZ;
    }

    // ── Recycle environment — only recycle objects that are BEHIND the character ──
    const fwdX = Math.sin(this.playerAngle);
    const fwdZ = -Math.cos(this.playerAngle);
    for (const obj of this.envObjects) {
      const dx = obj.model.position.x - this.playerX;
      const dz = obj.model.position.z - this.playerZ;
      const distSq = dx * dx + dz * dz;
      // dot product with forward: negative = behind
      const dot = dx * fwdX + dz * fwdZ;
      // Only recycle if far away AND behind the character
      if (distSq > 120 * 120 && dot < -10) {
        const a = this.playerAngle + (Math.random() - 0.5) * Math.PI * 1.4;
        const d = 20 + Math.random() * 200;
        const nx = this.playerX + Math.sin(a) * d;
        const nz = this.playerZ - Math.cos(a) * d;
        obj.model.position.x = nx;
        obj.model.position.z = nz;
        obj.model.position.y = 0;
        obj.model.rotation.y = Math.random() * Math.PI * 2;
      }
    }

    // ═══════════════════════════════════
    // MONSTERS — more frequent
    // ═══════════════════════════════════
    const beatNum = Math.floor(songTime / BEAT);
    if (beatNum > this._lastBeatNum) {
      this._lastBeatNum = beatNum;
      const interval = songTime < 135 ? 2 : 1;
      if (beatNum % interval === 0 && this._monsterTemplates.length > 0) {
        this._spawnMonster();
        if (Math.random() < 0.35) this._spawnMonster();
      }
    }

    // Bass shake
    for (let i = this.lastBassIndex + 1; i < this.events.serum3.length; i++) {
      const [nt] = this.events.serum3[i];
      if (songTime >= nt) {
        this.lastBassIndex = i;
        ctx.camera.position.x += (Math.random() - 0.5) * 0.12;
        ctx.camera.position.y += (Math.random() - 0.5) * 0.08;
      } else break;
    }

    // Kick bounce
    for (let i = this.lastKickIndex + 1; i < this.events.kick.length; i++) {
      const [kt] = this.events.kick[i];
      if (songTime >= kt) {
        this.lastKickIndex = i;
        this._kickBounce = 1.0;
      } else break;
    }
    if (this._kickBounce > 0) this._kickBounce = Math.max(0, this._kickBounce - dt * 4);
    const bounce = Math.sin(this._kickBounce * Math.PI) * 1.5;

    // ═══════════════════════════════════
    // MONSTERS — move, bounce, collide
    // ═══════════════════════════════════
    const isAttacking = this.ninjaCurrentAction === 'Weapon';

    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];

      if (m.alive && !m.dying) {
        const dx = this.playerX - m.wx;
        const dz = this.playerZ - m.wz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.5) {
          m.wx += (dx / dist) * m.approachSpeed * dt;
          m.wz += (dz / dist) * m.approachSpeed * dt;
          m.model.rotation.y = Math.atan2(dx / dist, dz / dist);
        }
        m.groundY = terrainHeight(m.wx, -m.wz);
        m.model.position.set(m.wx, m.groundY + m.yOff + bounce, m.wz);
      }

      m.mixer.update(dt);

      if (m.dying) {
        m.deathTimer -= dt;
        m.model.position.y += dt * 2;
        if (m.deathTimer <= 0) {
          this.worldGroup.remove(m.model);
          this.monsters.splice(i, 1);
        }
        continue;
      }
      if (!m.alive) continue;

      const cdx = m.wx - this.playerX;
      const cdz = m.wz - this.playerZ;
      const cDist = Math.sqrt(cdx * cdx + cdz * cdz);
      const hitRange = 1.5 + m.sz * 0.3;

      if (cDist < hitRange) {
        if (isAttacking) {
          m.alive = false;
          m.dying = true;
          m.deathTimer = 1.0;
          if (m.walkAction) m.walkAction.fadeOut(0.2);
          if (m.deathAction) m.deathAction.reset().fadeIn(0.1).play();
          this._spawnExplosion(m.model.position, m.def.color, m.sz);
          ctx.score.add(Math.floor(50 + m.sz * 50));
        } else {
          m.alive = false;
          m.dying = true;
          m.deathTimer = 0.5;
          ctx.score.breakCombo();
          this._switchNinjaAction('HitReact', 0.1);
          setTimeout(() => {
            if (this.active && this.isGrounded) this._switchNinjaAction('Run', 0.2);
          }, 500);
        }
      }

      if (cDist > 70) {
        this.worldGroup.remove(m.model);
        this.monsters.splice(i, 1);
      }
    }

    // Explosions
    for (let i = this._explosions.length - 1; i >= 0; i--) {
      const ex = this._explosions[i];
      ex.life -= dt * 2;
      if (ex.life <= 0) {
        this.worldGroup.remove(ex.particles);
        ex.particles.geometry.dispose();
        ex.particles.material.dispose();
        this._explosions.splice(i, 1);
        continue;
      }
      const pos = ex.particles.geometry.attributes.position;
      for (let j = 0; j < ex.velocities.length; j++) {
        ex.velocities[j].y -= 15 * dt;
        pos.array[j * 3] += ex.velocities[j].x * dt;
        pos.array[j * 3 + 1] += ex.velocities[j].y * dt;
        pos.array[j * 3 + 2] += ex.velocities[j].z * dt;
      }
      pos.needsUpdate = true;
      ex.particles.material.opacity = ex.life;
    }

    // ═══════════════════════════════════
    // NIGHT → SUNRISE → DAY  (p: 0→1 over ~40s)
    // 0.0-0.3 = dark night, 0.3-0.7 = orange sunrise, 0.7-1.0 = blue day
    // ═══════════════════════════════════
    const elapsed = songTime - START;
    const sunTgt = Math.min(1.0, elapsed / 40);
    this._sunRiseProgress += (sunTgt - this._sunRiseProgress) * dt * 2;
    const p = this._sunRiseProgress;

    // ── Shooting stars synced to melody (only during dark phase p<0.6) ──
    if (p < 0.6) {
      for (let i = this._lastMelodyIndex + 1; i < this.events.melody.length; i++) {
        const [mt] = this.events.melody[i];
        if (songTime >= mt) {
          this._lastMelodyIndex = i;
          const angle = Math.random() * Math.PI * 2;
          const elev = 0.3 + Math.random() * 0.5;
          const r = 300;
          const sx = this.playerX + Math.cos(angle) * r * Math.cos(elev);
          const sy = r * Math.sin(elev) + 50;
          const sz = this.playerZ + Math.sin(angle) * r * Math.cos(elev);
          const vel = new THREE.Vector3(
            -Math.cos(angle) * (80 + Math.random() * 60),
            -(20 + Math.random() * 30),
            -Math.sin(angle) * (80 + Math.random() * 60),
          );
          const hue = Math.random();
          const trailCount = 12;
          const trailPositions = new Float32Array(trailCount * 3);
          for (let j = 0; j < trailCount; j++) {
            trailPositions[j * 3] = sx;
            trailPositions[j * 3 + 1] = sy;
            trailPositions[j * 3 + 2] = sz;
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
          const mat = new THREE.PointsMaterial({
            size: 5 + Math.random() * 4, transparent: true, opacity: 1,
            color: new THREE.Color().setHSL(hue, 1, 0.8),
            blending: THREE.AdditiveBlending, depthWrite: false,
          });
          const pts = new THREE.Points(geo, mat);
          ctx.scene.add(pts);
          this._shootingStars.push({
            mesh: pts, pos: new THREE.Vector3(sx, sy, sz), vel, life: 1.5, maxLife: 1.5,
          });
        } else break;
      }
    }

    // Update shooting stars
    for (let i = this._shootingStars.length - 1; i >= 0; i--) {
      const ss = this._shootingStars[i];
      ss.life -= dt;
      if (ss.life <= 0) {
        ctx.scene.remove(ss.mesh);
        ss.mesh.geometry.dispose();
        ss.mesh.material.dispose();
        this._shootingStars.splice(i, 1);
        continue;
      }
      ss.pos.add(ss.vel.clone().multiplyScalar(dt));
      const arr = ss.mesh.geometry.attributes.position.array;
      for (let j = arr.length / 3 - 1; j > 0; j--) {
        arr[j * 3] = arr[(j - 1) * 3];
        arr[j * 3 + 1] = arr[(j - 1) * 3 + 1];
        arr[j * 3 + 2] = arr[(j - 1) * 3 + 2];
      }
      arr[0] = ss.pos.x; arr[1] = ss.pos.y; arr[2] = ss.pos.z;
      ss.mesh.geometry.attributes.position.needsUpdate = true;
      ss.mesh.material.opacity = ss.life / ss.maxLife;
    }

    // ── Color waves on every 2nd kick (during dark phase) ──
    if (p < 0.7) {
      for (let i = this._lastWaveKickIndex + 1; i < this.events.kick.length; i++) {
        const [kt] = this.events.kick[i];
        if (songTime >= kt) {
          this._lastWaveKickIndex = i;
          this._waveKickCount++;
          if (this._waveKickCount % 2 === 0) {
            const waveGeo = new THREE.RingGeometry(0.5, 2, 32);
            const waveMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color().setHSL(Math.random(), 1, 0.6),
              transparent: true, opacity: 1.0, side: THREE.DoubleSide,
              blending: THREE.AdditiveBlending, depthWrite: false,
            });
            const wave = new THREE.Mesh(waveGeo, waveMat);
            wave.position.set(
              this.playerX + (Math.random() - 0.5) * 50,
              12 + Math.random() * 40,
              this.playerZ + (Math.random() - 0.5) * 50,
            );
            wave.lookAt(ctx.camera.position);
            ctx.scene.add(wave);
            this._colorWaves.push({ mesh: wave, life: 1.5, maxLife: 1.5 });
          }
        } else break;
      }
    }

    // Update color waves — expand and fade
    for (let i = this._colorWaves.length - 1; i >= 0; i--) {
      const cw = this._colorWaves[i];
      cw.life -= dt;
      if (cw.life <= 0) {
        ctx.scene.remove(cw.mesh);
        cw.mesh.geometry.dispose();
        cw.mesh.material.dispose();
        this._colorWaves.splice(i, 1);
        continue;
      }
      const age = 1 - cw.life / cw.maxLife;
      cw.mesh.scale.setScalar(1 + age * 25);
      cw.mesh.material.opacity = (1 - age) * 0.8;
      const hsl = {};
      cw.mesh.material.color.getHSL(hsl);
      cw.mesh.material.color.setHSL((hsl.h + dt * 0.3) % 1, 1, 0.5);
    }

    // ── Stars — pulse with kick, bright in dark, fade during sunrise ──
    if (this._stars && this._starMat) {
      this._stars.position.set(this.playerX, 0, this.playerZ);
      const starPulse = 1.0 + this._kickBounce * 1.5;
      this._starMat.size = 4.0 * starPulse;
      this._starMat.opacity = p < 0.3 ? 1.0 : Math.max(0, 1.0 - (p - 0.3) * 2.5);
      this._stars.visible = p < 0.7;
    }

    // ── Sun position and color ──
    // Sun stays below horizon until p>0.2, then rises through orange → yellow
    const sunVisible = p > 0.15;
    if (this.sun) {
      this.sun.visible = sunVisible;
      this.sun.position.set(
        this.playerX + 50,
        THREE.MathUtils.lerp(-30, 55, Math.max(0, (p - 0.15) / 0.85)),
        this.playerZ - 140,
      );
      // Sun color: deep red → orange → warm yellow
      const sunP = Math.max(0, (p - 0.15) / 0.85);
      const sunHue = THREE.MathUtils.lerp(0.02, 0.12, sunP);
      this.sun.material.color.setHSL(sunHue, 1, 0.5 + sunP * 0.2);
      if (this.sunHalo) {
        this.sunHalo.material.opacity = THREE.MathUtils.lerp(0, 0.5, sunP);
        this.sunHalo.material.color.setHSL(sunHue, 0.8, 0.6);
      }
    }

    // ── Lights — visible at start, strong saturated daylight at end ──
    if (this.sunLight) {
      this.sunLight.intensity = THREE.MathUtils.lerp(0.15, 1.8, p);
      const lH = p < 0.5 ? 0.06 : THREE.MathUtils.lerp(0.06, 0.14, (p - 0.5) / 0.5);
      this.sunLight.color.setHSL(lH, 1.0, 0.5);
    }
    if (this.ambientLight) this.ambientLight.intensity = THREE.MathUtils.lerp(0.6, 1.2, p);
    if (this.hemiLight) this.hemiLight.intensity = THREE.MathUtils.lerp(0.45, 0.9, p);

    // ── Sky color: dark purple → warm orange → vivid blue (saturated, not white) ──
    let skyH, skyS, skyL;
    if (p < 0.3) {
      skyH = 0.72; skyS = 0.4; skyL = THREE.MathUtils.lerp(0.02, 0.05, p / 0.3);
    } else if (p < 0.6) {
      const t2 = (p - 0.3) / 0.3;
      skyH = THREE.MathUtils.lerp(0.72, 0.07, t2);
      skyS = THREE.MathUtils.lerp(0.4, 1.0, t2);
      skyL = THREE.MathUtils.lerp(0.05, 0.2, t2);
    } else {
      const t3 = (p - 0.6) / 0.4;
      skyH = THREE.MathUtils.lerp(0.07, 0.58, t3);
      skyS = THREE.MathUtils.lerp(1.0, 0.9, t3);
      skyL = THREE.MathUtils.lerp(0.2, 0.4, t3);
    }
    ctx.renderer.setClearColor(new THREE.Color().setHSL(skyH, skyS, skyL));
    if (ctx.scene.fog) {
      ctx.scene.fog.color.setHSL(skyH, skyS * 0.8, skyL * 0.6);
      ctx.scene.fog.density = THREE.MathUtils.lerp(0.006, 0.001, p);
    }
    ctx.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.9, 1.1, p);

    // ── Ground: saturated green, ACID bright at end ──
    if (this._groundMat) {
      this._groundMat.color.setHSL(0.33, THREE.MathUtils.lerp(0.7, 1.0, p), THREE.MathUtils.lerp(0.18, 0.5, p));
      this._groundMat.emissive.setHSL(0.33, 1.0, THREE.MathUtils.lerp(0.06, 0.15, p));
      this._groundMat.emissiveIntensity = THREE.MathUtils.lerp(0.3, 0.6, p);
    }

    // ── Environment: dark silhouettes → ACID neon psychedelic colors ──
    const hueShift = Math.sin(songTime * 0.3) * 0.08;
    for (const em of this._envMaterials) {
      const s = THREE.MathUtils.lerp(0.5, 1.0, p);
      const l = THREE.MathUtils.lerp(0.14, Math.min(0.55, em.solidHSL.l * 1.3 + 0.2), p);
      em.mat.color.setHSL((em.solidHSL.h + hueShift + 1) % 1, s, l);
      em.mat.emissiveIntensity = THREE.MathUtils.lerp(0.2, 0.7, p);
      if (em.mat.emissive) {
        em.mat.emissive.setHSL((em.solidHSL.h + hueShift + 1) % 1, 1.0, l * 0.4);
      }
    }

    // ── Bloom — glow in dark, moderate acid glow in day ──
    if (ctx.bloomPass) {
      ctx.bloomPass.strength = THREE.MathUtils.lerp(1.0, 0.5, p);
      ctx.bloomPass.threshold = THREE.MathUtils.lerp(0.3, 0.4, p);
      ctx.bloomPass.radius = THREE.MathUtils.lerp(0.4, 0.3, p);
    }
  }

  exit(ctx) {
    ctx.player.group.visible = true;
    for (const m of this.monsters) this.worldGroup.remove(m.model);
    this.monsters = [];
    this._monsterTemplates = [];
    for (const ex of this._explosions) {
      this.worldGroup.remove(ex.particles);
      ex.particles.geometry.dispose();
      ex.particles.material.dispose();
    }
    this._explosions = [];
    if (this.ninjaModel) { this.worldGroup.remove(this.ninjaModel); this.ninjaModel = null; }
    if (this.ninjaMixer) { this.ninjaMixer.stopAllAction(); this.ninjaMixer = null; }
    this.ninjaActions = {};
    if (this._flashOverlay) { ctx.camera.remove(this._flashOverlay); this._flashOverlay = null; }
    this.envObjects = [];
    this._envMaterials = [];
    this.worldGroup = null;
    this.sun = null;
    this.sunHalo = null;
    this._ground = null;
    this._groundMat = null;
    this._stars = null;
    this._starMat = null;
    for (const ss of this._shootingStars) {
      ctx.scene.remove(ss.mesh);
      ss.mesh.geometry.dispose();
      ss.mesh.material.dispose();
    }
    this._shootingStars = [];
    for (const cw of this._colorWaves) {
      ctx.scene.remove(cw.mesh);
      cw.mesh.geometry.dispose();
      cw.mesh.material.dispose();
    }
    this._colorWaves = [];
    ctx.renderer.toneMappingExposure = 1.0;
    if (ctx.crtPass) {
      ctx.crtPass.uniforms.scanlineWeight.value = 0.18;
      ctx.crtPass.uniforms.noiseAmount.value = 0.04;
      ctx.crtPass.uniforms.rgbShift.value = 0.003;
      ctx.crtPass.uniforms.curvature.value = 0.03;
      ctx.crtPass.uniforms.vignette.value = 0.4;
      ctx.crtPass.uniforms.interlace.value = 1.0;
    }
    super.exit(ctx);
  }
}
