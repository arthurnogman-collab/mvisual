import * as THREE from 'three';
import { getModel, getScene } from '../preloader.js';
import { SectionBase } from './section-base.js';
import { TRACKS } from '../midi-data.js';

/**
 * SECTION 4 — "The Drop" (2:00 – 3:26)
 *
 * The drop hits — everything becomes bright and alive.
 * Bright magical forest, blue sky, sun, brown road.
 * Ninja as main character with Run/Jump/Weapon animations.
 * Monsters as enemies synced to beat rhythm.
 * No bloom, no CRT — clean bright rendering.
 */

const BEAT = 60 / 128;       // 0.46875s
const BAR = BEAT * 4;        // 1.875s
const START = 120;
const END = 206;

// Extract MIDI events for this section
function extractEvents() {
  const kick = (TRACKS['707 Kick'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const serum4 = (TRACKS['Serum #4'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const musicBox = (TRACKS['Music box'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const serum3 = (TRACKS['Serum #3'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const snare = (TRACKS['SC Snare 3'] || TRACKS['Snare'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);

  // Dedupe kick — only keep events > 0.3s apart
  const dedupedKick = [];
  for (const ev of kick) {
    if (dedupedKick.length === 0 || ev[0] - dedupedKick[dedupedKick.length - 1][0] > 0.3) {
      dedupedKick.push(ev);
    }
  }

  // Dedupe serum4
  const dedupedS4 = [];
  for (const ev of serum4) {
    if (dedupedS4.length === 0 || ev[0] - dedupedS4[dedupedS4.length - 1][0] > 0.3) {
      dedupedS4.push(ev);
    }
  }

  return { kick: dedupedKick, serum4: dedupedS4, musicBox, serum3, snare };
}

// Monster types — different models with different behaviors
const MONSTER_DEFS = [
  { file: 'Demon.glb', scale: 0.45, yOffset: 0, type: 'ground', color: 0xff4444 },
  { file: 'Dragon.glb', scale: 0.5, yOffset: 0, type: 'ground', color: 0x44ff44 },
  { file: 'Alien.glb', scale: 0.5, yOffset: 0, type: 'ground', color: 0x4444ff },
  { file: 'Orc.glb', scale: 0.5, yOffset: 0, type: 'ground', color: 0xff8800 },
  { file: 'Ghost.glb', scale: 0.5, yOffset: 1.2, type: 'flying', color: 0xaa44ff },
  { file: 'Mushroom King.glb', scale: 0.5, yOffset: 0, type: 'ground', color: 0xff44aa },
];

export class Section4 extends SectionBase {
  constructor() {
    super('the-drop', START, END);
    this.scrollSpeed = 14;
    this.laneWidth = 2.5;
    this.playerLane = 0;
    this.playerTargetX = 0;
    this.playerY = 0;
    this.jumpVelY = 0;
    this.isGrounded = true;
    this.jumpsLeft = 2;

    // Ninja model
    this.ninjaModel = null;
    this.ninjaMixer = null;
    this.ninjaActions = {};
    this.ninjaCurrentAction = null;
    this._ninjaLoaded = false;
    this._attackCooldown = 0;

    // Monster system
    this._monsterTemplates = [];  // preloaded GLTFs
    this._monstersLoaded = 0;
    this.monsters = [];           // active monsters on field
    this._monsterPool = [];       // reusable monster objects

    // Environment
    this.envTrees = [];
    this.gridLines = [];
    this.roadGroup = null;

    // MIDI tracking
    this.events = extractEvents();
    this.lastKickIndex = -1;
    this.lastMelodyIndex = -1;
    this.lastBassIndex = -1;

    // Beat tracking
    this._lastBeatNum = -1;

    // Transition flash
    this._flashOverlay = null;
  }

  enter(ctx) {
    super.enter(ctx);

    // ── HYPER-BRIGHT DREAM WORLD — venomous Nintendo colors ──
    ctx.renderer.setClearColor(0x44ccff); // vivid sky blue
    ctx.scene.fog = new THREE.FogExp2(0x66ddff, 0.0015); // light fog so forest is visible
    ctx.renderer.toneMappingExposure = 1.8; // crank exposure for brightness

    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 0.4; // gentle bloom for dreamy glow
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

    // Hide player ball — Ninja takes over
    ctx.player.group.visible = false;
    ctx.player.speed = 0;
    ctx.player.posY = 0;
    ctx.player.laneX = 0;
    ctx.player.forwardZ = 0;
    ctx.player.boundsMode = 'rect';
    ctx.player.boundsX = [0, 0];
    ctx.player.boundsY = [0, 0];

    // Road group
    this.roadGroup = new THREE.Group();
    ctx.scene.add(this.roadGroup);
    this.objects.push(this.roadGroup);

    // Lighting — BLINDING bright, dream-like
    this.sunLight = new THREE.DirectionalLight(0xffffee, 3.0);
    this.sunLight.position.set(5, 25, 15);
    this.add(this.sunLight, ctx);

    this.fillLight = new THREE.DirectionalLight(0x88ddff, 1.2);
    this.fillLight.position.set(-5, 10, -20);
    this.add(this.fillLight, ctx);

    // Strong ambient so NOTHING is dark
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.add(this.ambientLight, ctx);

    // Hemisphere light for sky/ground color bleed
    this.hemiLight = new THREE.HemisphereLight(0x88eeff, 0x44ff44, 1.0);
    this.add(this.hemiLight, ctx);

    // Big glowing sun
    const sunGeo = new THREE.SphereGeometry(5, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffff44 });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.sun.position.set(15, 35, -80);
    this.add(this.sun, ctx);

    // Story
    ctx.story.clear();
    ctx.story.schedule('THE DROP', START + 0.5, 2, 'bright');
    ctx.story.schedule('fight through the forest', START + 4, 3);
    ctx.story.schedule('click to jump // right-click to attack', START + 8, 3);

    ctx.score.show();

    this._buildRoad(ctx);
    this._buildSky(ctx);
    this._buildEnvironment(ctx);
    this._loadNinja(ctx);
    this._loadMonsterTemplates(ctx);
    this._createFlashOverlay(ctx);
  }

  _createFlashOverlay(ctx) {
    // White flash that fades out at start of section (transition from Section 3)
    const geo = new THREE.PlaneGeometry(100, 100);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1, depthTest: false,
    });
    this._flashOverlay = new THREE.Mesh(geo, mat);
    this._flashOverlay.position.set(0, 0, -1);
    this._flashOverlay.renderOrder = 999;
    ctx.camera.add(this._flashOverlay);
    // Don't add camera to objects — we'll clean up the overlay manually in exit()
  }

  _buildRoad(ctx) {
    // Vivid golden-brown dirt road
    const roadGeo = new THREE.PlaneGeometry(10, 800);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0xcc8822, roughness: 0.7, metalness: 0,
      emissive: 0x442200, emissiveIntensity: 0.3,
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.01, -300);
    this.roadGroup.add(road);

    // VIVID green grass — Nintendo bright
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

    // Bright road edge markings
    for (const x of [-5, 5]) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.01, 50), new THREE.Vector3(x, 0.01, -600),
      ]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffaa44 });
      this.roadGroup.add(new THREE.Line(geo, mat));
    }
  }

  _buildSky(ctx) {
    // Gradient sky — simple hemisphere light + colored background
    // Add subtle clouds as particles
    const count = 60;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = 20 + Math.random() * 30;
      positions[i * 3 + 2] = -Math.random() * 200 - 20;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const clouds = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 4, color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false,
    }));
    this.add(clouds, ctx);
  }

  // Supersaturate a model's materials — venomous dream colors
  _saturateModel(model, boostFactor = 1.5) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        const c = child.material.color;
        // Push saturation to max — extract HSL, crank S, boost L
        const hsl = {};
        c.getHSL(hsl);
        c.setHSL(hsl.h, Math.min(1, hsl.s * boostFactor * 1.8), Math.min(0.85, hsl.l * boostFactor));
        // Emissive glow so nothing is grey
        child.material.emissive = c.clone().multiplyScalar(0.35);
        child.material.emissiveIntensity = 0.6;
        child.material.metalness = 0;
        child.material.roughness = 0.5;
      }
    });
  }

  _buildEnvironment(ctx) {
    const treeFiles = [
      '/models/environment/Trees.glb',
      '/models/environment/Pine Trees.glb',
      '/models/environment/Birch Trees.glb',
      '/models/environment/Maple Trees.glb',
    ];
    const decorFiles = [
      '/models/environment/Bushes.glb',
      '/models/environment/Flowers.glb',
      '/models/environment/Flower Bushes.glb',
      '/models/environment/Grass.glb',
    ];

    const treeCount = 50;
    const spacing = 8;

    for (let i = 0; i < treeCount; i++) {
      const file = treeFiles[i % treeFiles.length];
      const scene = getScene(file);
      if (!scene) continue;
      const model = scene.clone();
      const z = -i * spacing - 5;
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

    for (let i = 0; i < 30; i++) {
      const file = decorFiles[i % decorFiles.length];
      const scene = getScene(file);
      if (!scene) continue;
      const model = scene.clone();
      const z = -i * spacing * 0.7 - 3;
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
      const runAction = this.ninjaActions['Run'];
      runAction.play();
      const clip = runAction.getClip();
      runAction.timeScale = clip.duration / (BEAT * 2);
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

  _loadMonsterTemplates(ctx) {
    for (const def of MONSTER_DEFS) {
      const gltf = getModel(`/models/monsters/${def.file}`);
      if (!gltf) continue;
      this._monsterTemplates.push({ gltf, def });
      this._monstersLoaded++;
    }
  }

  _spawnMonster(songTime, lane) {
    if (this._monsterTemplates.length === 0) return;

    const template = this._monsterTemplates[Math.floor(Math.random() * this._monsterTemplates.length)];
    const { gltf, def } = template;

    const model = gltf.scene.clone();
    model.scale.setScalar(def.scale);
    model.rotation.y = 0; // face player (toward camera)

    // Saturate monster — vivid dream colors
    this._saturateModel(model, 1.8);

    // Spawn far ahead in WORLD space — monsters approach via world scroll + their own walk speed
    const SPAWN_AHEAD = 80;
    const x = lane * this.laneWidth;

    // Store position relative to player (negative = ahead)
    // Monster starts at -SPAWN_AHEAD in player-relative space
    model.position.set(x, def.yOffset, -SPAWN_AHEAD);

    this.roadGroup.add(model);

    // Animation mixer for this monster
    const mixer = new THREE.AnimationMixer(model);
    let walkAction = null;
    let deathAction = null;

    for (const clip of gltf.animations) {
      const name = clip.name.replace('CharacterArmature|', '');
      if (name === 'Walk' || name === 'Flying_Idle' || name === 'Idle') {
        walkAction = mixer.clipAction(clip);
      }
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

    this.monsters.push({
      model, mixer, x, lane, def,
      relZ: -SPAWN_AHEAD, // position relative to player, approaches 0
      approachSpeed: 4 + Math.random() * 3, // monsters walk toward player
      alive: true, dying: false, deathTimer: 0,
      walkAction, deathAction,
    });
  }

  // Particle explosion when monster is killed
  _spawnExplosion(position, color) {
    const count = 30;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y + 0.5;
      positions[i * 3 + 2] = position.z;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        Math.random() * 8 + 2,
        (Math.random() - 0.5) * 12,
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
    const intensity = this.progress;
    const GRAVITY = -25;

    // ── Flash fade-in ──
    if (this._flashOverlay) {
      if (t < 2) {
        this._flashOverlay.material.opacity = Math.max(0, 1 - t / 1.5);
      } else {
        this._flashOverlay.material.opacity = 0;
        this._flashOverlay.visible = false;
      }
    }

    // ── Camera ──
    const targetCamPos = new THREE.Vector3(
      this.playerTargetX * 0.3, 4.5 + this.playerY * 0.15, 8
    );
    const targetLookAt = new THREE.Vector3(this.playerTargetX * 0.15, 1.5, -15);

    if (t < 3) {
      const ease = t / 3;
      ctx.camera.position.lerp(targetCamPos, dt * (1 + ease * 4));
      ctx.camera.fov = THREE.MathUtils.lerp(60, 55, ease);
      ctx.camera.updateProjectionMatrix();
    } else {
      ctx.camera.position.lerp(targetCamPos, dt * 3);
    }
    ctx.camera.lookAt(targetLookAt.x, targetLookAt.y, targetLookAt.z);

    // ── World scrolling ──
    this.scrollSpeed = 14 + intensity * 4;
    const worldOffset = (songTime - START) * this.scrollSpeed;

    // Scroll environment trees
    for (const tree of this.envTrees) {
      const wz = tree.baseZ + worldOffset;
      tree.model.position.z = wz;
      if (wz > 20) tree.baseZ -= 400; // recycle trees far ahead
    }

    // ═══════════════════════════════════
    // MIDI EVENTS — monster spawning
    // ═══════════════════════════════════

    // Beat tracking — spawn monsters on beats
    const beatNum = Math.floor(songTime / BEAT);
    if (beatNum > this._lastBeatNum) {
      this._lastBeatNum = beatNum;

      // Spawn monster every 2 beats from 120-150s, every beat from 150+
      const spawnInterval = songTime < 150 ? 2 : 1;
      if (beatNum % spawnInterval === 0 && this._monsterTemplates.length > 0) {
        // Random lane, biased toward center
        const lane = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
        this._spawnMonster(songTime, lane);
      }
    }

    // Serum #3 (bass) — road pulse/shake
    for (let i = this.lastBassIndex + 1; i < this.events.serum3.length; i++) {
      const [noteTime] = this.events.serum3[i];
      if (songTime >= noteTime) {
        this.lastBassIndex = i;
        // Subtle camera shake on bass
        ctx.camera.position.x += (Math.random() - 0.5) * 0.15;
        ctx.camera.position.y += (Math.random() - 0.5) * 0.1;
      } else break;
    }

    // Music box (melody) — collectible orbs (not implemented yet, just score on melody)
    for (let i = this.lastMelodyIndex + 1; i < this.events.musicBox.length; i++) {
      const [noteTime] = this.events.musicBox[i];
      if (songTime >= noteTime) {
        this.lastMelodyIndex = i;
      } else break;
    }

    // ═══════════════════════════════════
    // PLAYER (Ninja)
    // ═══════════════════════════════════

    // Lane switching (mouse)
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

    // Jump
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

    // Attack (right-click)
    this._attackCooldown = Math.max(0, this._attackCooldown - dt);
    if (ctx.input.attackDown && this._attackCooldown <= 0 && this._ninjaLoaded) {
      this._attackCooldown = 0.5; // half second cooldown
      this._switchNinjaAction('Weapon', 0.1);
      // Return to Run after weapon animation
      setTimeout(() => {
        if (this.active && this.isGrounded) {
          this._switchNinjaAction('Run', 0.15);
        }
      }, 400);
    }

    // Position ninja model
    if (this._ninjaLoaded && this.ninjaModel) {
      this.ninjaModel.position.set(newX, this.playerY, 0);

      // Update mixer
      this.ninjaMixer.update(dt);
    }

    // Also keep hidden player group at same position (for section chain)
    ctx.player.group.position.set(newX, this.playerY + 0.5, 0);

    // ═══════════════════════════════════
    // MONSTERS — approach player, collide, die/explode
    // ═══════════════════════════════════
    const isAttacking = this.ninjaCurrentAction === 'Weapon';

    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];

      // Monster approaches player — relZ increases toward 0
      if (m.alive && !m.dying) {
        m.relZ += m.approachSpeed * dt;
      }

      // Position in road group — relZ is player-relative
      m.model.position.z = m.relZ;

      // Update monster animation
      m.mixer.update(dt);

      // Dying — countdown and remove
      if (m.dying) {
        m.deathTimer -= dt;
        if (m.deathTimer <= 0) {
          this.roadGroup.remove(m.model);
          this.monsters.splice(i, 1);
        }
        continue;
      }

      if (!m.alive) continue;

      // Collision check — monster is near player (z=0)
      const dz = Math.abs(m.relZ);
      const dx = Math.abs(m.x - newX);
      const closeEnough = dz < 2.0 && dx < 1.5;

      if (closeEnough) {
        if (isAttacking) {
          // Kill monster — explosion!
          m.alive = false;
          m.dying = true;
          m.deathTimer = 1.0;
          if (m.walkAction) m.walkAction.fadeOut(0.2);
          if (m.deathAction) {
            m.deathAction.reset().fadeIn(0.1).play();
          }
          this._spawnExplosion(m.model.position, m.def.color);
          ctx.score.add(100);
        } else if (this.playerY < (m.def.type === 'flying' ? 2.5 : 1.0)) {
          // Hit by monster
          m.alive = false;
          m.dying = true;
          m.deathTimer = 0.5;
          ctx.score.breakCombo();
          this._switchNinjaAction('HitReact', 0.1);
          setTimeout(() => {
            if (this.active && this.isGrounded) {
              this._switchNinjaAction('Run', 0.2);
            }
          }, 500);
        }
      }

      // Passed player — dodged
      if (m.relZ > 3 && m.alive) {
        m.alive = false;
        ctx.score.add(50);
        this.roadGroup.remove(m.model);
        this.monsters.splice(i, 1);
        continue;
      }

      // Way behind — cleanup
      if (m.relZ > 20) {
        this.roadGroup.remove(m.model);
        this.monsters.splice(i, 1);
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
          ex.velocities[j].y -= 15 * dt; // gravity
          pos.array[j * 3] += ex.velocities[j].x * dt;
          pos.array[j * 3 + 1] += ex.velocities[j].y * dt;
          pos.array[j * 3 + 2] += ex.velocities[j].z * dt;
        }
        pos.needsUpdate = true;
        ex.particles.material.opacity = ex.life;
      }
    }

    // ── Ambient intensity build ──
    if (this.sunLight) {
      this.sunLight.intensity = 1.8 + Math.sin(songTime * 0.5) * 0.2;
    }
  }

  exit(ctx) {
    ctx.player.group.visible = true;

    // Clean up monsters
    for (const m of this.monsters) {
      this.roadGroup.remove(m.model);
    }
    this.monsters = [];
    this._monsterTemplates = [];

    // Clean up explosions
    if (this._explosions) {
      for (const ex of this._explosions) {
        this.roadGroup.remove(ex.particles);
        ex.particles.geometry.dispose();
        ex.particles.material.dispose();
      }
      this._explosions = [];
    }

    // Clean up ninja
    if (this.ninjaModel) {
      this.roadGroup.remove(this.ninjaModel);
      this.ninjaModel = null;
    }
    if (this.ninjaMixer) {
      this.ninjaMixer.stopAllAction();
      this.ninjaMixer = null;
    }
    this.ninjaActions = {};

    // Clean up flash overlay
    if (this._flashOverlay) {
      ctx.camera.remove(this._flashOverlay);
      this._flashOverlay = null;
    }

    this.envTrees = [];
    this.roadGroup = null;

    // Restore exposure
    ctx.renderer.toneMappingExposure = 1.0;

    // Restore CRT and bloom for later sections
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
