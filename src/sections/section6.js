import * as THREE from 'three';
import { getModel, getScene } from '../preloader.js';
import { SectionBase } from './section-base.js';
import { TRACKS } from '../midi-data.js';

/**
 * SECTION 6 — "The Final Push" (5:00 – 8:24)
 *
 * 300-390s: Drop 2 — full intensity, all enemy types, faster spawns
 * 390-480s: 3x Osc arp enters — max density, dramatic lighting
 * 480-504s: Outro — drums only, victory lap, score tally
 *
 * Same bright forest but more dramatic. Lightning flashes on snare.
 * Wider road, multiple enemy waves. Score tally at the end.
 */

const BEAT = 60 / 128;
const START = 300;
const END = 504;

const MONSTER_DEFS = [
  { file: 'Demon.glb', scale: 0.45, yOffset: 0, type: 'ground' },
  { file: 'Dragon.glb', scale: 0.5, yOffset: 0, type: 'ground' },
  { file: 'Alien.glb', scale: 0.5, yOffset: 0, type: 'ground' },
  { file: 'Orc Enemy.glb', scale: 0.5, yOffset: 0, type: 'ground' },
  { file: 'Ghost.glb', scale: 0.5, yOffset: 1.2, type: 'flying' },
  { file: 'Ghost Skull.glb', scale: 0.5, yOffset: 1.0, type: 'flying' },
  { file: 'Mushroom King.glb', scale: 0.5, yOffset: 0, type: 'ground' },
  { file: 'Green Blob.glb', scale: 0.5, yOffset: 0, type: 'ground' },
];

function extractEvents() {
  const kick = (TRACKS['707 Kick'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);
  const snare = (TRACKS['FPC Snare 1'] || TRACKS['SC Snare 3'] || TRACKS['Snare'] || [])
    .filter(([t, , v]) => t >= START && t < END && v > 0);
  const serum3 = (TRACKS['Serum #3'] || []).filter(([t, , v]) => t >= START && t < END && v > 0);

  const dedupedSnare = [];
  for (const ev of snare) {
    if (dedupedSnare.length === 0 || ev[0] - dedupedSnare[dedupedSnare.length - 1][0] > 0.3) {
      dedupedSnare.push(ev);
    }
  }
  return { kick, snare: dedupedSnare, serum3 };
}

export class Section6 extends SectionBase {
  constructor() {
    super('the-final-push', START, END);
    this.scrollSpeed = 16;
    this.laneWidth = 2.5;
    this.playerLane = 0;
    this.playerTargetX = 0;
    this.playerY = 0;
    this.jumpVelY = 0;
    this.isGrounded = true;
    this.jumpsLeft = 2;

    // Ninja
    this.ninjaModel = null;
    this.ninjaMixer = null;
    this.ninjaActions = {};
    this.ninjaCurrentAction = null;
    this._ninjaLoaded = false;
    this._attackCooldown = 0;

    // Monsters
    this._monsterTemplates = [];
    this.monsters = [];

    // Environment
    this.envTrees = [];
    this.roadGroup = null;

    // MIDI
    this.events = extractEvents();
    this.lastSnareIndex = -1;
    this.lastBassIndex = -1;
    this._lastBeatNum = -1;

    // Lightning flash
    this._lightningFlash = 0;

    // Outro state
    this._outroStarted = false;
    this._scoreTally = null;

    // Victory lap
    this._victoryStarted = false;
  }

  enter(ctx) {
    super.enter(ctx);

    ctx.renderer.setClearColor(0x44bbff);
    ctx.scene.fog = new THREE.FogExp2(0x55ccff, 0.0015);
    ctx.renderer.toneMappingExposure = 1.8;

    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 0.5;
      ctx.bloomPass.radius = 0.3;
      ctx.bloomPass.threshold = 0.5;
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

    // BLINDING lighting
    this.sunLight = new THREE.DirectionalLight(0xffffee, 3.0);
    this.sunLight.position.set(5, 25, 15);
    this.add(this.sunLight, ctx);

    this.fillLight = new THREE.DirectionalLight(0x88ddff, 1.2);
    this.fillLight.position.set(-5, 10, -15);
    this.add(this.fillLight, ctx);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.add(this.ambientLight, ctx);

    this.hemiLight = new THREE.HemisphereLight(0x88eeff, 0x44ff44, 1.0);
    this.add(this.hemiLight, ctx);

    // Lightning light (off by default)
    this.lightningLight = new THREE.PointLight(0xffffff, 0, 200);
    this.lightningLight.position.set(0, 30, -20);
    this.add(this.lightningLight, ctx);

    // Story
    ctx.story.clear();
    ctx.story.schedule('DROP 2', START + 0.5, 2, 'bright');
    ctx.story.schedule('everything you\'ve got', START + 4, 3);
    ctx.story.schedule('FINAL PUSH', 390, 2, 'bright');

    ctx.score.show();

    this._buildRoad(ctx);
    this._buildEnvironment(ctx);
    this._loadNinja(ctx);
    this._loadMonsterTemplates(ctx);
    this._createScoreTally();
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
    const roadGeo = new THREE.PlaneGeometry(12, 800);
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
      grass.position.set(side * 31, -0.02, -300);
      this.roadGroup.add(grass);
    }
  }

  _buildEnvironment(ctx) {
    const treeFiles = [
      '/models/environment/Trees.glb',
      '/models/environment/Pine Trees.glb',
      '/models/environment/Maple Trees.glb',
      '/models/environment/Birch Trees.glb',
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

  _loadMonsterTemplates(ctx) {
    for (const def of MONSTER_DEFS) {
      const gltf = getModel(`/models/monsters/${def.file}`);
      if (!gltf) continue;
      this._monsterTemplates.push({ gltf, def });
    }
  }

  _spawnMonster(songTime, lane) {
    if (this._monsterTemplates.length === 0) return;
    const template = this._monsterTemplates[Math.floor(Math.random() * this._monsterTemplates.length)];
    const { gltf, def } = template;

    const model = gltf.scene.clone();
    model.scale.setScalar(def.scale);
    model.rotation.y = 0;

    this._saturateModel(model, 1.8);

    const SPAWN_AHEAD = 80;
    const x = lane * this.laneWidth;
    model.position.set(x, def.yOffset, -SPAWN_AHEAD);
    this.roadGroup.add(model);

    const mixer = new THREE.AnimationMixer(model);
    let walkAction = null, deathAction = null;
    for (const clip of gltf.animations) {
      const name = clip.name.replace('CharacterArmature|', '');
      if (name === 'Walk' || name === 'Flying_Idle' || name === 'Idle') walkAction = mixer.clipAction(clip);
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
      relZ: -SPAWN_AHEAD,
      approachSpeed: 5 + Math.random() * 4, // faster in final section
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

  _createScoreTally() {
    // Score tally overlay (hidden until outro)
    this._scoreTally = document.createElement('div');
    this._scoreTally.id = 'score-tally';
    this._scoreTally.innerHTML = `
      <div class="tally-title">JOURNEY COMPLETE</div>
      <div class="tally-score"></div>
      <div class="tally-combo"></div>
      <div class="tally-grade"></div>
    `;
    this._scoreTally.style.cssText = `
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 20;
      pointer-events: none; opacity: 0; transition: opacity 2s ease;
      font-family: 'Orbitron', monospace; color: #0ff;
      text-shadow: 0 0 15px rgba(0,255,255,0.8), 0 0 40px rgba(0,255,255,0.4);
    `;

    const style = document.createElement('style');
    style.textContent = `
      .tally-title { font-size: 2.5rem; font-weight: 900; letter-spacing: 0.3em; margin-bottom: 30px; }
      .tally-score { font-size: 3rem; font-weight: 700; letter-spacing: 0.2em; color: #fff; margin-bottom: 15px; }
      .tally-combo { font-size: 1.2rem; letter-spacing: 0.15em; color: rgba(0,255,200,0.8); margin-bottom: 20px; }
      .tally-grade { font-size: 4rem; font-weight: 900; letter-spacing: 0.1em; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this._scoreTally);
  }

  _showScoreTally(ctx) {
    if (!this._scoreTally) return;
    const score = ctx.score.value;
    const maxCombo = ctx.score.maxCombo;

    // Grade based on score
    let grade = 'C';
    if (score > 50000) grade = 'S';
    else if (score > 30000) grade = 'A';
    else if (score > 15000) grade = 'B';

    const gradeColors = { S: '#ffdd00', A: '#00ff88', B: '#0088ff', C: '#ff4488' };

    this._scoreTally.querySelector('.tally-score').textContent = score.toLocaleString();
    this._scoreTally.querySelector('.tally-combo').textContent = `MAX COMBO: ${maxCombo}x`;
    this._scoreTally.querySelector('.tally-grade').textContent = grade;
    this._scoreTally.querySelector('.tally-grade').style.color = gradeColors[grade] || '#0ff';
    this._scoreTally.style.opacity = '1';
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const songTime = ctx.audio.currentTime;
    const t = this.localTime;
    const GRAVITY = -25;

    // Phase detection
    const isDrop2 = songTime < 390;
    const isFinalPush = songTime >= 390 && songTime < 480;
    const isOutro = songTime >= 480;

    // ── Intensity-based visuals ──
    if (isFinalPush) {
      // Dramatic sky darkening for final push
      const fp = (songTime - 390) / 90;
      ctx.renderer.setClearColor(new THREE.Color(0.3 - fp * 0.1, 0.5 - fp * 0.1, 0.7 + fp * 0.1));
      if (ctx.bloomPass) {
        ctx.bloomPass.strength = 0.3 + fp * 0.8;
        ctx.bloomPass.threshold = 0.5 - fp * 0.3;
      }
      // Subtle CRT returns for dramatic effect
      if (ctx.crtPass && songTime > 420) {
        const crtAmt = (songTime - 420) / 60;
        ctx.crtPass.uniforms.scanlineWeight.value = crtAmt * 0.1;
        ctx.crtPass.uniforms.rgbShift.value = crtAmt * 0.002;
        ctx.crtPass.uniforms.vignette.value = crtAmt * 0.3;
      }
    }

    // ── Lightning flash on snare ──
    for (let i = this.lastSnareIndex + 1; i < this.events.snare.length; i++) {
      const [noteTime] = this.events.snare[i];
      if (songTime >= noteTime) {
        this.lastSnareIndex = i;
        this._lightningFlash = 1.0;
      } else break;
    }
    if (this._lightningFlash > 0) {
      this._lightningFlash = Math.max(0, this._lightningFlash - dt * 8);
      this.lightningLight.intensity = this._lightningFlash * 15;
      this.ambientLight.intensity = 0.7 + this._lightningFlash * 1.5;
    } else {
      this.lightningLight.intensity = 0;
      this.ambientLight.intensity = 0.7;
    }

    // ── Camera ──
    const targetCamPos = new THREE.Vector3(
      this.playerTargetX * 0.3, 4.5 + this.playerY * 0.15, 8
    );
    ctx.camera.position.lerp(targetCamPos, dt * 3);
    ctx.camera.lookAt(this.playerTargetX * 0.15, 1.5, -15);

    // Camera shake on bass
    for (let i = this.lastBassIndex + 1; i < this.events.serum3.length; i++) {
      const [noteTime] = this.events.serum3[i];
      if (songTime >= noteTime) {
        this.lastBassIndex = i;
        ctx.camera.position.x += (Math.random() - 0.5) * 0.2;
        ctx.camera.position.y += (Math.random() - 0.5) * 0.15;
      } else break;
    }

    // ── World scrolling ──
    this.scrollSpeed = isDrop2 ? 16 : isFinalPush ? 18 : 8; // slow for outro
    const worldOffset = (songTime - START) * this.scrollSpeed;

    for (const tree of this.envTrees) {
      const wz = tree.baseZ + worldOffset;
      tree.model.position.z = wz;
      if (wz > 30) tree.baseZ -= 440;
    }

    // ═══════════════════════════════════
    // MONSTER SPAWNING
    // ═══════════════════════════════════
    if (!isOutro) {
      const beatNum = Math.floor(songTime / BEAT);
      if (beatNum > this._lastBeatNum) {
        this._lastBeatNum = beatNum;

        let spawnInterval = 1; // every beat during drop 2
        if (isFinalPush) {
          // Even denser during final push
          spawnInterval = 1;
          // Spawn extra monsters on every other beat for waves
          if (beatNum % 2 === 0 && this._monsterTemplates.length > 0) {
            this._spawnMonster(songTime, -1);
            this._spawnMonster(songTime, 1);
          }
        }

        if (beatNum % spawnInterval === 0 && this._monsterTemplates.length > 0) {
          const lane = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
          this._spawnMonster(songTime, lane);
        }
      }
    }

    // ═══════════════════════════════════
    // OUTRO — victory lap + score tally
    // ═══════════════════════════════════
    if (isOutro && !this._outroStarted) {
      this._outroStarted = true;
      // Clear remaining monsters
      for (const m of this.monsters) this.roadGroup.remove(m.model);
      this.monsters = [];
      // Ninja victory dance
      this._switchNinjaAction('Wave', 0.3);
    }

    if (isOutro && !this._victoryStarted && songTime > 485) {
      this._victoryStarted = true;
      this._showScoreTally(ctx);
      // Switch to Dance if available, else keep Wave
      if (this.ninjaActions['Dance']) {
        this._switchNinjaAction('Dance', 0.5);
      }
    }

    // Outro camera — pull back and circle
    if (isOutro && this._ninjaLoaded) {
      const outroT = songTime - 480;
      const angle = outroT * 0.3;
      const radius = 6;
      ctx.camera.position.set(
        Math.sin(angle) * radius,
        3 + Math.sin(outroT * 0.5) * 0.5,
        Math.cos(angle) * radius
      );
      ctx.camera.lookAt(0, 1, 0);
    }

    // ═══════════════════════════════════
    // PLAYER
    // ═══════════════════════════════════
    if (!isOutro) {
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
          this.playerY = 0; this.jumpVelY = 0;
          this.isGrounded = true; this.jumpsLeft = 2;
          this._switchNinjaAction('Run', 0.15);
        }
      }

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
      }
      ctx.player.group.position.set(newX, this.playerY + 0.5, 0);
    }

    // Update ninja mixer always
    if (this._ninjaLoaded && this.ninjaMixer) {
      this.ninjaMixer.update(dt);
    }

    // ═══════════════════════════════════
    // MONSTERS — approach, collide, explode
    // ═══════════════════════════════════
    const isAttacking = this.ninjaCurrentAction === 'Weapon';
    const playerX = this.ninjaModel ? this.ninjaModel.position.x : 0;

    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];

      if (m.alive && !m.dying) {
        m.relZ += m.approachSpeed * dt;
      }
      m.model.position.z = m.relZ;
      m.mixer.update(dt);

      if (m.dying) {
        m.deathTimer -= dt;
        if (m.deathTimer <= 0) {
          this.roadGroup.remove(m.model);
          this.monsters.splice(i, 1);
        }
        continue;
      }
      if (!m.alive) continue;

      const dz = Math.abs(m.relZ);
      const dx = Math.abs(m.x - playerX);
      if (dz < 2.0 && dx < 1.5) {
        if (isAttacking) {
          m.alive = false; m.dying = true; m.deathTimer = 1.0;
          if (m.walkAction) m.walkAction.fadeOut(0.2);
          if (m.deathAction) m.deathAction.reset().fadeIn(0.1).play();
          this._spawnExplosion(m.model.position, m.def.color);
          ctx.score.add(100);
        } else if (this.playerY < (m.def.type === 'flying' ? 2.5 : 1.0)) {
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
        this.monsters.splice(i, 1);
        continue;
      }
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
          ex.velocities[j].y -= 15 * dt;
          pos.array[j * 3] += ex.velocities[j].x * dt;
          pos.array[j * 3 + 1] += ex.velocities[j].y * dt;
          pos.array[j * 3 + 2] += ex.velocities[j].z * dt;
        }
        pos.needsUpdate = true;
        ex.particles.material.opacity = ex.life;
      }
    }
  }

  exit(ctx) {
    ctx.player.group.visible = true;
    ctx.renderer.toneMappingExposure = 1.0;

    for (const m of this.monsters) this.roadGroup.remove(m.model);
    this.monsters = [];
    this._monsterTemplates = [];
    if (this._explosions) {
      for (const ex of this._explosions) {
        this.roadGroup.remove(ex.particles);
        ex.particles.geometry.dispose();
        ex.particles.material.dispose();
      }
      this._explosions = [];
    }

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
    this.roadGroup = null;

    // Clean up score tally
    if (this._scoreTally) {
      this._scoreTally.remove();
      this._scoreTally = null;
    }

    // Restore CRT
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
