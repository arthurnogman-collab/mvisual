import * as THREE from 'three';
import { getModel, getScene } from '../preloader.js';
import { SectionBase } from './section-base.js';
import { TRACKS } from '../midi-data.js';

/**
 * SECTION 5 — "The Breakdown" (3:26 – 5:00)
 *
 * Drums cut out (206-240s) — peaceful forest interlude.
 * Monsters stop attacking, dance on the roadside.
 * 240-300s: tension builds, monsters gradually reappear.
 * Snare fill at 299.5s triggers transition flash to Section 6.
 *
 * Same bright forest aesthetic as Section 4.
 * Ninja auto-runs, player can still move/jump.
 */

const BEAT = 60 / 128;
const START = 206;
const END = 300;

// Monsters that dance on the roadside
const DANCER_MODELS = [
  'Dragon.glb', 'Alien.glb', 'Bunny.glb', 'Cat.glb',
  'Frog.glb', 'Mushroom King.glb', 'Orc.glb', 'Dino.glb',
];

// Monster types for the build section (240+)
const ENEMY_DEFS = [
  { file: 'Demon.glb', scale: 0.45, yOffset: 0 },
  { file: 'Ghost.glb', scale: 0.5, yOffset: 1.2 },
  { file: 'Green Blob.glb', scale: 0.5, yOffset: 0 },
  { file: 'Orc Enemy.glb', scale: 0.5, yOffset: 0 },
];

function extractEvents() {
  const musicBox = (TRACKS['Music box'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const serum2 = (TRACKS['Serum #2'] || []).filter(([t, , v]) => t >= 240 && t < END && v > 0);
  const serum3 = (TRACKS['Serum #3'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);

  const dedupedS2 = [];
  for (const ev of serum2) {
    if (dedupedS2.length === 0 || ev[0] - dedupedS2[dedupedS2.length - 1][0] > 0.4) {
      dedupedS2.push(ev);
    }
  }
  return { musicBox, serum2: dedupedS2, serum3 };
}

export class Section5 extends SectionBase {
  constructor() {
    super('the-breakdown', START, END);
    this.scrollSpeed = 10;
    this.laneWidth = 2.5;
    this.playerLane = 0;
    this.playerTargetX = 0;
    this.playerY = 0;
    this.jumpVelY = 0;
    this.isGrounded = true;
    this.jumpsLeft = 2;

    // Ninja model (reloaded per section)
    this.ninjaModel = null;
    this.ninjaMixer = null;
    this.ninjaActions = {};
    this.ninjaCurrentAction = null;
    this._ninjaLoaded = false;
    this._attackCooldown = 0;

    // Dancing monsters along roadside
    this.dancers = [];
    this._dancersSpawned = false;

    // Enemy monsters (build phase 240+)
    this._enemyTemplates = [];
    this.enemies = [];

    // Environment
    this.envTrees = [];
    this.roadGroup = null;

    // MIDI tracking
    this.events = extractEvents();
    this.lastMelodyIndex = -1;
    this.lastEnemyIndex = -1;

    this._lastBeatNum = -1;

    // Firefly particles
    this.fireflies = null;

    // Sunset color transition
    this.skyHue = 0.55; // starts blue, shifts to golden
  }

  enter(ctx) {
    super.enter(ctx);

    ctx.renderer.setClearColor(0x55ccff);
    ctx.scene.fog = new THREE.FogExp2(0x66ddff, 0.0015);
    ctx.renderer.toneMappingExposure = 1.8;

    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 0.4;
      ctx.bloomPass.radius = 0.3;
      ctx.bloomPass.threshold = 0.6;
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
    ctx.player.boundsMode = 'rect';
    ctx.player.boundsX = [0, 0];
    ctx.player.boundsY = [0, 0];

    this.roadGroup = new THREE.Group();
    ctx.scene.add(this.roadGroup);
    this.objects.push(this.roadGroup);

    // Golden hour lighting — warm and BRIGHT
    this.sunLight = new THREE.DirectionalLight(0xffee88, 3.0);
    this.sunLight.position.set(-5, 20, 15);
    this.add(this.sunLight, ctx);

    this.fillLight = new THREE.DirectionalLight(0xffaa44, 1.0);
    this.fillLight.position.set(5, 10, -15);
    this.add(this.fillLight, ctx);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.add(this.ambientLight, ctx);

    this.hemiLight = new THREE.HemisphereLight(0xffdd88, 0x44ff44, 0.8);
    this.add(this.hemiLight, ctx);

    // Story
    ctx.story.clear();
    ctx.story.schedule('breathe', START + 1, 3, 'bright');
    ctx.story.schedule('the forest dances', START + 6, 3);
    ctx.story.schedule('something stirs', 245, 3);
    ctx.story.schedule('prepare yourself', 280, 3, 'bright');

    ctx.score.show();

    this._buildRoad(ctx);
    this._buildEnvironment(ctx);
    this._loadNinja(ctx);
    this._spawnDancers(ctx);
    this._buildFireflies(ctx);
    this._loadEnemyTemplates(ctx);
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

  _buildRoad(ctx) {
    const roadGeo = new THREE.PlaneGeometry(10, 800);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0xcc8822, roughness: 0.7, metalness: 0,
      emissive: 0x442200, emissiveIntensity: 0.3,
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.01, -300);
    this.roadGroup.add(road);

    for (const side of [-1, 1]) {
      const grassGeo = new THREE.PlaneGeometry(50, 800);
      const grassMat = new THREE.MeshStandardMaterial({
        color: 0x22ee22, roughness: 0.6, metalness: 0,
        emissive: 0x115511, emissiveIntensity: 0.5,
      });
      const grass = new THREE.Mesh(grassGeo, grassMat);
      grass.rotation.x = -Math.PI / 2;
      grass.position.set(side * 30, -0.02, -300);
      this.roadGroup.add(grass);
    }
  }

  _buildEnvironment(ctx) {
    const treeFiles = [
      '/models/environment/Trees.glb',
      '/models/environment/Pine Trees.glb',
      '/models/environment/Birch Trees.glb',
      '/models/environment/Maple Trees.glb',
    ];
    const decorFiles = [
      '/models/environment/Flowers.glb',
      '/models/environment/Bushes.glb',
      '/models/environment/Flower Bushes.glb',
    ];

    for (let i = 0; i < 50; i++) {
      const file = treeFiles[i % treeFiles.length];
      const scene = getScene(file);
      if (!scene) continue;
      const model = scene.clone();
      const z = -i * 8 - 5;
      const side = (i % 2 === 0) ? -1 : 1;
      const row = (i % 4 < 2) ? 0 : 1;
      const sideX = row === 0 ? (5.2 + Math.random() * 0.8) : (7.5 + Math.random() * 2);
      model.scale.setScalar(3.0 + Math.random() * 2.5);
      model.position.set(side * sideX, 0, z);
      model.rotation.y = Math.random() * Math.PI * 2;
      this._saturateModel(model, 1.8);
      this.roadGroup.add(model);
      this.envTrees.push({ model, baseZ: z });
    }

    for (let i = 0; i < 24; i++) {
      const file = decorFiles[i % decorFiles.length];
      const scene = getScene(file);
      if (!scene) continue;
      const model = scene.clone();
      const z = -i * 7 - 3;
      const side = (i % 2 === 0) ? -1 : 1;
      model.scale.setScalar(2.0 + Math.random() * 2.0);
      model.position.set(side * (5.2 + Math.random()), 0, z);
      model.rotation.y = Math.random() * Math.PI * 2;
      this._saturateModel(model, 2.0);
      this.roadGroup.add(model);
      this.envTrees.push({ model, baseZ: z });
    }
  }

  _loadNinja(ctx) {
    const gltf = getModel('/models/monsters/Ninja-xGYmeDpfTu.glb');
    if (!gltf) return;

    const model = gltf.scene.clone();
    model.scale.setScalar(0.55);
    model.rotation.y = Math.PI;

    this._saturateModel(model, 1.5);

    this.ninjaModel = model;
    this.roadGroup.add(model);

    this.ninjaMixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const name = clip.name.replace('CharacterArmature|', '');
      this.ninjaActions[name] = this.ninjaMixer.clipAction(clip);
    }

    if (this.ninjaActions['Run']) {
      this.ninjaActions['Run'].play();
      const clip = this.ninjaActions['Run'].getClip();
      this.ninjaActions['Run'].timeScale = clip.duration / (BEAT * 2);
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

  _spawnDancers(ctx) {
    const count = 12;
    const spacing = 16;

    for (let i = 0; i < count; i++) {
      const file = DANCER_MODELS[i % DANCER_MODELS.length];
      const gltf = getModel(`/models/monsters/${file}`);
      if (!gltf) continue;

      const model = gltf.scene.clone();
      const z = -i * spacing - 10;
      const side = (i % 2 === 0) ? -1 : 1;
      model.scale.setScalar(0.6 + Math.random() * 0.4);
      model.position.set(side * (4.5 + Math.random() * 1.5), 0, z);
      model.rotation.y = side > 0 ? -Math.PI / 3 : Math.PI / 3;
      this._saturateModel(model, 1.8);

      this.roadGroup.add(model);

      const mixer = new THREE.AnimationMixer(model);
      let danceAction = null;
      for (const clip of gltf.animations) {
        const name = clip.name.replace('CharacterArmature|', '');
        if (name === 'Dance' || name === 'Yes' || name === 'Wave' || name === 'Idle') {
          danceAction = mixer.clipAction(clip);
        }
      }
      if (danceAction) {
        danceAction.play();
        danceAction.timeScale = danceAction.getClip().duration / (BEAT * 4);
      }

      this.dancers.push({ model, mixer, baseZ: z });
    }
    this._dancersSpawned = true;
  }

  _buildFireflies(ctx) {
    const count = 80;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = 0.5 + Math.random() * 5;
      positions[i * 3 + 2] = -Math.random() * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.15, color: 0xffff88, transparent: true, opacity: 0.6, depthWrite: false,
    }));
    this.roadGroup.add(this.fireflies);
  }

  _loadEnemyTemplates(ctx) {
    for (const def of ENEMY_DEFS) {
      const gltf = getModel(`/models/monsters/${def.file}`);
      if (!gltf) continue;
      this._enemyTemplates.push({ gltf, def });
    }
  }

  _spawnEnemy(songTime, lane) {
    if (this._enemyTemplates.length === 0) return;
    const template = this._enemyTemplates[Math.floor(Math.random() * this._enemyTemplates.length)];
    const { gltf, def } = template;

    const model = gltf.scene.clone();
    model.scale.setScalar(def.scale);
    model.rotation.y = 0;

    this._saturateModel(model, 1.8);

    const SPAWN_AHEAD = 70;
    const x = lane * this.laneWidth;
    model.position.set(x, def.yOffset, -SPAWN_AHEAD);

    this.roadGroup.add(model);

    const mixer = new THREE.AnimationMixer(model);
    let walkAction = null;
    let deathAction = null;
    for (const clip of gltf.animations) {
      const name = clip.name.replace('CharacterArmature|', '');
      if (name === 'Walk' || name === 'Idle') walkAction = mixer.clipAction(clip);
      if (name === 'Death') {
        deathAction = mixer.clipAction(clip);
        deathAction.setLoop(THREE.LoopOnce);
        deathAction.clampWhenFinished = true;
      }
    }
    if (walkAction) {
      walkAction.play();
      walkAction.timeScale = walkAction.getClip().duration / (BEAT * 2);
    }

    this.enemies.push({
      model, mixer, x, lane, def,
      relZ: -SPAWN_AHEAD,
      approachSpeed: 3.5 + Math.random() * 3,
      alive: true, dying: false, deathTimer: 0,
      walkAction, deathAction,
    });
  }

  _spawnExplosion(position, color) {
    const count = 30;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y + 0.5;
      positions[i * 3 + 2] = position.z;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 12, Math.random() * 8 + 2, (Math.random() - 0.5) * 12,
      ));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.4, color, transparent: true, opacity: 1, depthWrite: false,
    });
    const particles = new THREE.Points(geo, mat);
    this.roadGroup.add(particles);
    this._explosions = this._explosions || [];
    this._explosions.push({ particles, velocities, life: 1.0 });
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const songTime = ctx.audio.currentTime;
    const GRAVITY = -25;

    // ── Sky color transition: blue → golden (sunset) → blue again (build) ──
    const breakdownPhase = Math.min(t / (240 - START), 1); // 0-1 during calm
    const buildPhase = songTime >= 240 ? Math.min((songTime - 240) / 60, 1) : 0;

    if (buildPhase > 0) {
      // Build: sky goes darker, more dramatic
      const r = 0.53 - buildPhase * 0.2;
      const g = 0.81 - buildPhase * 0.3;
      const b = 0.92 - buildPhase * 0.3;
      ctx.renderer.setClearColor(new THREE.Color(r, g, b));
    } else {
      // Breakdown: warm golden sunset
      const r = 0.53 + breakdownPhase * 0.2;
      const g = 0.81 - breakdownPhase * 0.05;
      const b = 0.92 - breakdownPhase * 0.15;
      ctx.renderer.setClearColor(new THREE.Color(r, g, b));
    }

    // ── Camera ──
    const camBack = songTime < 240 ? 10 : 8; // closer during build
    const targetCamPos = new THREE.Vector3(
      this.playerTargetX * 0.25, 4 + this.playerY * 0.15, camBack
    );
    ctx.camera.position.lerp(targetCamPos, dt * 3);
    ctx.camera.lookAt(this.playerTargetX * 0.1, 1.5, -15);

    // ── World scrolling ──
    this.scrollSpeed = songTime < 240 ? 10 : 10 + (songTime - 240) / 60 * 6; // accelerates in build
    const worldOffset = (songTime - START) * this.scrollSpeed;

    for (const tree of this.envTrees) {
      const wz = tree.baseZ + worldOffset;
      tree.model.position.z = wz;
      if (wz > 30) tree.baseZ -= 400;
    }

    // Update dancers
    for (const d of this.dancers) {
      d.mixer.update(dt);
      const wz = d.baseZ + worldOffset;
      d.model.position.z = wz;
      if (wz > 30) d.baseZ -= 192; // 12 * 16
    }

    // Fireflies bob
    if (this.fireflies) {
      const pos = this.fireflies.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += Math.sin(songTime + i) * dt * 0.3;
        pos[i + 1] += Math.sin(songTime * 2 + i * 0.5) * dt * 0.2;
        const wz = pos[i + 2] + worldOffset;
        if (wz > 20) pos[i + 2] -= 100;
      }
      this.fireflies.geometry.attributes.position.needsUpdate = true;
      // Pulse brightness with melody
      this.fireflies.material.opacity = 0.4 + ctx.audio.energy * 0.4;
    }

    // ═══════════════════════════════════
    // ENEMY SPAWNING (240s+ build phase)
    // ═══════════════════════════════════
    if (songTime >= 240) {
      const beatNum = Math.floor(songTime / BEAT);
      if (beatNum > this._lastBeatNum) {
        this._lastBeatNum = beatNum;

        // Gradually increase spawn rate: every 4 beats at 240s → every 2 at 280s → every beat at 295s
        let spawnInterval = 4;
        if (songTime > 280) spawnInterval = 2;
        if (songTime > 295) spawnInterval = 1;

        if (beatNum % spawnInterval === 0 && this._enemyTemplates.length > 0) {
          const lane = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
          this._spawnEnemy(songTime, lane);
        }
      }
    }

    // ═══════════════════════════════════
    // PLAYER
    // ═══════════════════════════════════
    const mx = ctx.input.mouseX;
    if (Math.abs(mx) > 0.05) {
      this.playerLane = mx < -0.25 ? -1 : mx > 0.25 ? 1 : 0;
    } else {
      if (ctx.input.left && this.playerLane > -1) {
        if (!this._lanePressed) { this.playerLane--; this._lanePressed = true; }
      } else if (ctx.input.right && this.playerLane < 1) {
        if (!this._lanePressed) { this.playerLane++; this._lanePressed = true; }
      } else if (!ctx.input.left && !ctx.input.right) {
        this._lanePressed = false;
      }
    }

    this.playerTargetX = this.playerLane * this.laneWidth;
    const currentX = this.ninjaModel ? this.ninjaModel.position.x : 0;
    const newX = currentX + (this.playerTargetX - currentX) * dt * 12;

    if ((ctx.input.jumpDown) && this.jumpsLeft > 0) {
      this.jumpVelY = 12;
      this.isGrounded = false;
      this.jumpsLeft--;
      this._switchNinjaAction('Jump', 0.1);
    }
    if (!this.isGrounded) {
      this.jumpVelY += GRAVITY * dt;
      this.playerY += this.jumpVelY * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.jumpVelY = 0;
        this.isGrounded = true;
        this.jumpsLeft = 2;
        this._switchNinjaAction('Run', 0.15);
      }
    }

    // Attack
    this._attackCooldown = Math.max(0, this._attackCooldown - dt);
    if (ctx.input.attackDown && this._attackCooldown <= 0 && this._ninjaLoaded) {
      this._attackCooldown = 0.5;
      this._switchNinjaAction('Weapon', 0.1);
      setTimeout(() => {
        if (this.active && this.isGrounded) this._switchNinjaAction('Run', 0.15);
      }, 400);
    }

    if (this._ninjaLoaded && this.ninjaModel) {
      this.ninjaModel.position.set(newX, this.playerY, 0);
      this.ninjaMixer.update(dt);
    }
    ctx.player.group.position.set(newX, this.playerY + 0.5, 0);

    // ═══════════════════════════════════
    // ENEMIES — approach, collide, explode
    // ═══════════════════════════════════
    const isAttacking = this.ninjaCurrentAction === 'Weapon';

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const m = this.enemies[i];

      if (m.alive && !m.dying) {
        m.relZ += m.approachSpeed * dt;
      }
      m.model.position.z = m.relZ;
      m.mixer.update(dt);

      if (m.dying) {
        m.deathTimer -= dt;
        if (m.deathTimer <= 0) {
          this.roadGroup.remove(m.model);
          this.enemies.splice(i, 1);
        }
        continue;
      }
      if (!m.alive) continue;

      const dz = Math.abs(m.relZ);
      const dx = Math.abs(m.x - newX);
      if (dz < 2.0 && dx < 1.5) {
        if (isAttacking) {
          m.alive = false; m.dying = true; m.deathTimer = 1.0;
          if (m.walkAction) m.walkAction.fadeOut(0.2);
          if (m.deathAction) m.deathAction.reset().fadeIn(0.1).play();
          this._spawnExplosion(m.model.position, m.def.color);
          ctx.score.add(100);
        } else if (this.playerY < 1.0) {
          m.alive = false; m.dying = true; m.deathTimer = 0.5;
          ctx.score.breakCombo();
          this._switchNinjaAction('HitReact', 0.1);
          setTimeout(() => {
            if (this.active && this.isGrounded) this._switchNinjaAction('Run', 0.2);
          }, 500);
        }
      }

      if (m.relZ > 3 && m.alive) {
        m.alive = false;
        ctx.score.add(50);
        this.roadGroup.remove(m.model);
        this.enemies.splice(i, 1);
        continue;
      }
      if (m.relZ > 20) {
        this.roadGroup.remove(m.model);
        this.enemies.splice(i, 1);
      }
    }

    // Update explosions
    if (this._explosions) {
      for (let i = this._explosions.length - 1; i >= 0; i--) {
        const ex = this._explosions[i];
        ex.life -= dt * 2;
        if (ex.life <= 0) {
          this.roadGroup.remove(ex.particles);
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
    }

    // Transition flash near end (snare fill at ~299.5s)
    if (songTime > 298) {
      const flash = Math.min((songTime - 298) / 2, 1);
      if (ctx.bloomPass) ctx.bloomPass.strength = flash * 2;
    }
  }

  exit(ctx) {
    ctx.player.group.visible = true;
    ctx.renderer.toneMappingExposure = 1.0;

    for (const m of this.enemies) this.roadGroup.remove(m.model);
    this.enemies = [];
    if (this._explosions) {
      for (const ex of this._explosions) {
        this.roadGroup.remove(ex.particles);
        ex.particles.geometry.dispose();
        ex.particles.material.dispose();
      }
      this._explosions = [];
    }
    for (const d of this.dancers) this.roadGroup.remove(d.model);
    this.dancers = [];

    if (this.ninjaModel) {
      this.roadGroup.remove(this.ninjaModel);
      this.ninjaModel = null;
    }
    if (this.ninjaMixer) {
      this.ninjaMixer.stopAllAction();
      this.ninjaMixer = null;
    }
    this.ninjaActions = {};
    this.envTrees = [];
    this._enemyTemplates = [];
    this.roadGroup = null;

    super.exit(ctx);
  }
}
