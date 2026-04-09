import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getModel, getScene } from '../preloader.js';
import { SectionBase } from './section-base.js';
import { TRACKS } from '../midi-data.js';

/**
 * SECTION 3 — "The Path" (1:00 – 2:00)
 *
 * Squidle ("bat") flies forward on a wireframe road.
 * Tree obstacles approach synced to Serum #3 bass notes.
 * Player dodges through gaps between trees via mouse/keyboard.
 * Collision → tree turns red & blinks, bat plays Death, falls, respawns.
 */

const BEAT = 60 / 128;

function extractBassEvents() {
  const raw = (TRACKS['Serum #3'] || []).filter(([t, , v]) => t >= 60 && t < 120 && v > 0);
  const deduped = [];
  for (const ev of raw) {
    if (deduped.length === 0 || ev[0] - deduped[deduped.length - 1][0] > 0.5) {
      deduped.push(ev);
    }
  }
  return deduped;
}

function extractMelodyEvents() {
  return (TRACKS['Music box'] || []).filter(([t, , v]) => t >= 60 && t < 120 && v > 0);
}

function extractFlyerEvents() {
  const raw = (TRACKS['Music box'] || []).filter(([t, , v]) => t >= 60 && t < 120 && v > 0);
  const deduped = [];
  for (const ev of raw) {
    if (deduped.length === 0 || ev[0] - deduped[deduped.length - 1][0] > 0.9) {
      deduped.push(ev);
    }
  }
  return deduped;
}

export class Section3 extends SectionBase {
  constructor() {
    super('the-path', 60, 120);
    this.scrollSpeed = 12;
    this.laneWidth = 2.5;
    this.playerTargetX = 0;
    this.playerY = 0;
    this.jumpVelY = 0;
    this.isGrounded = true;
    this.jumpsLeft = 3;
    this.cameraTransitionDone = false;

    this.roadGroup = null;
    this.gridLines = [];
    this.treeObstacles = [];
    this.sceneryTrees = [];
    this.pulseRings = [];

    this.bassEvents = extractBassEvents();
    this.melodyEvents = extractMelodyEvents();
    this.lastBassIndex = -1;
    this.lastMelodyIndex = -1;
    this.blinkFlash = 0;

    this.sceneHue = 0.6;

    // Bat (Squidle)
    this.batModel = null;
    this.batMixer = null;
    this.batActions = {};
    this.batCurrentAction = null;
    this._batLoaded = false;
    this._batX = 0;
    this._batDead = false;
    this._batDeadTimer = 0;
    this._batFallVel = 0;
    this._batDeathElapsed = 0;
    this._batTumbleSpin = 0;

    this._respawning = false;
    this._respawnTimer = 0;
    this._respawnDuration = 1.2;
    this._cameraShake = 0;

    // Flying monster obstacles
    this.flyerEvents = extractFlyerEvents();
    this.lastFlyerIndex = -1;
    this.flyerObstacles = [];
    this._flyerTemplates = [];

    // Tree template data (with bbox centering info)
    this._treeTemplates = [];
  }

  enter(ctx) {
    super.enter(ctx);

    ctx.renderer.setClearColor(0x020208);
    ctx.scene.fog = new THREE.FogExp2(0x040410, 0.006);

    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 0.8;
      ctx.bloomPass.radius = 0.3;
      ctx.bloomPass.threshold = 0.3;
    }

    ctx.player.speed = 0;
    ctx.player.boundsMode = 'rect';
    ctx.player.boundsX = [-8, 8];
    ctx.player.boundsY = [0, 0];
    ctx.player.group.visible = false;
    ctx.player.group.position.set(0, 0.5, 0);

    this.playerY = 0;
    this.playerTargetX = 0;
    this._batX = 0;
    this._batDead = false;
    this._batDeadTimer = 0;
    this._batFallVel = 0;
    this._batDeathElapsed = 0;
    this._batTumbleSpin = 0;
    this._respawning = false;
    this._respawnTimer = 0;
    this._cameraShake = 0;

    this.roadGroup = new THREE.Group();
    ctx.scene.add(this.roadGroup);
    this.objects.push(this.roadGroup);

    this.ambient = new THREE.AmbientLight(0x111133, 0.4);
    this.add(this.ambient, ctx);

    ctx.story.clear();
    ctx.story.schedule('Avoid the trees', 60.5, 3, 'bright');

    ctx.score.show();

    this.lastFlyerIndex = -1;
    this.flyerObstacles = [];

    this._buildRoad(ctx);
    this._buildSky(ctx);
    this._loadTreeTemplates();
    this._buildSceneryTrees(ctx);
    this._loadBat(ctx);
    this._loadFlyerTemplates();
  }

  _buildRoad(ctx) {
    const floorGeo = new THREE.PlaneGeometry(30, 600);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x050510, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.01, -200);
    this.roadGroup.add(floor);

    const gridMat = new THREE.LineBasicMaterial({
      color: 0x3366aa, transparent: true, opacity: 0.4,
    });
    for (let i = -8; i <= 8; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i * 2, 0, 50), new THREE.Vector3(i * 2, 0, -400),
      ]);
      this.roadGroup.add(new THREE.Line(geo, gridMat));
    }

    const xMat = new THREE.LineBasicMaterial({
      color: 0x4477bb, transparent: true, opacity: 0.35,
    });
    for (let i = 0; i < 80; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-16, 0, 0), new THREE.Vector3(16, 0, 0),
      ]);
      const line = new THREE.Line(geo, xMat.clone());
      line.position.z = -i * 5;
      line.userData.baseZ = -i * 5;
      this.gridLines.push(line);
      this.roadGroup.add(line);
    }

    const centerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.02, 50), new THREE.Vector3(0, 0.02, -400),
    ]);
    this.roadGroup.add(new THREE.Line(centerGeo, new THREE.LineBasicMaterial({
      color: 0x00ccff, transparent: true, opacity: 0.8,
    })));

    for (const x of [-this.laneWidth, this.laneWidth]) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.01, 50), new THREE.Vector3(x, 0.01, -400),
      ]);
      this.roadGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x334488, transparent: true, opacity: 0.3,
      })));
    }
  }

  _buildSky(ctx) {
    const count = 500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45;
      const r = 60 + Math.random() * 40;
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.cos(phi) * r + 5;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, color: 0x6688cc, transparent: true, opacity: 0.5,
    })), ctx);
  }

  _loadTreeTemplates() {
    const files = [
      '/models/environment/Dead Trees.glb',
      '/models/environment/Pine Trees.glb',
      '/models/environment/Trees.glb',
    ];
    for (const file of files) {
      const scene = getScene(file);
      if (!scene) continue;
      const box = new THREE.Box3().setFromObject(scene);
      const center = new THREE.Vector3();
      box.getCenter(center);
      this._treeTemplates.push({ scene, center, minY: box.min.y });
    }
  }

  _buildSceneryTrees(ctx) {
    if (this._treeTemplates.length === 0) return;

    for (let i = 0; i < 20; i++) {
      const td = this._treeTemplates[i % this._treeTemplates.length];
      const inner = td.scene.clone();
      inner.position.set(-td.center.x, -td.minY, -td.center.z);

      const group = new THREE.Group();
      group.add(inner);

      const side = (i % 2 === 0) ? -1 : 1;
      const x = side * (5 + Math.random() * 4);
      const z = -i * 10 - 8;
      const scale = 0.6 + Math.random() * 0.5;

      group.scale.setScalar(scale);
      group.position.set(x, 0, z);
      group.rotation.y = Math.random() * Math.PI * 2;

      inner.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({
            color: 0x2255aa, wireframe: true,
            transparent: true, opacity: 0.35,
          });
        }
      });

      this.roadGroup.add(group);
      this.sceneryTrees.push({ model: group, baseZ: z });
    }
  }

  _loadBat(ctx) {
    const gltf = getModel('/models/monsters/Squidle.glb');
    if (!gltf) return;

    const model = SkeletonUtils.clone(gltf.scene);
    model.scale.setScalar(0.7);
    model.rotation.y = Math.PI;

    model.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: 0xff9900,
          wireframe: true,
          transparent: true,
          opacity: 0.95,
        });
      }
    });

    this.batModel = model;
    this.roadGroup.add(model);

    this.batMixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const name = clip.name.replace('CharacterArmature|', '');
      this.batActions[name] = this.batMixer.clipAction(clip);
    }

    if (this.batActions['Flying_Idle']) {
      this.batActions['Flying_Idle'].play();
      this.batCurrentAction = 'Flying_Idle';
    }

    this._batLoaded = true;
  }

  _loadFlyerTemplates() {
    const defs = [
      { path: '/models/monsters/Dragon.glb',      color: 0xff1177 },
      { path: '/models/monsters/Ghost.glb',        color: 0x00ffcc },
      { path: '/models/monsters/Ghost Skull.glb',  color: 0x88ff00 },
      { path: '/models/monsters/Demon.glb',        color: 0x2299ff },
      { path: '/models/monsters/Armabee.glb',      color: 0xffdd00 },
      { path: '/models/monsters/Hywirl.glb',       color: 0xcc44ff },
    ];

    this._flyerTemplates = [];
    for (const def of defs) {
      const gltf = getModel(def.path);
      if (!gltf) continue;
      this._flyerTemplates.push({ gltf, color: def.color });
    }
  }

  _spawnFlyerObstacle(note, songTime) {
    if (this._flyerTemplates.length === 0) return;

    const SPAWN_AHEAD = 70;
    const baseZ = -((songTime - 60) * this.scrollSpeed) - SPAWN_AHEAD;
    const ROAD_HALF = 5;
    const centerX = (Math.random() * 2 - 1) * ROAD_HALF;
    const baseHeight = 4.0 + Math.random() * 3.0;
    const flockSize = 1 + Math.floor(Math.random() * 3); // 1, 2, or 3

    for (let fi = 0; fi < flockSize; fi++) {
      const tplIdx = (note + fi) % this._flyerTemplates.length;
      const tpl = this._flyerTemplates[tplIdx];

      const model = SkeletonUtils.clone(tpl.gltf.scene);
      model.scale.setScalar(0.45 + Math.random() * 0.15);

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({
            color: tpl.color,
            wireframe: true,
            transparent: true,
            opacity: 0.85,
          });
        }
      });

      const mixer = new THREE.AnimationMixer(model);
      for (const clip of tpl.gltf.animations) {
        const name = clip.name.replace('CharacterArmature|', '');
        if (name === 'Fast_Flying') {
          const action = mixer.clipAction(clip);
          action.timeScale = 0.9 + Math.random() * 0.3;
          action.play();
        }
      }

      const spreadX = (fi === 0) ? 0 : ((fi % 2 === 1) ? -1.4 : 1.4) + (Math.random() - 0.5) * 0.6;
      const spreadZ = fi * 1.5 + Math.random() * 0.5;
      const spreadY = (Math.random() - 0.5) * 0.6;

      const x = centerX + spreadX;
      const z = baseZ - spreadZ;
      const flyHeight = baseHeight + spreadY;
      const ownSpeed = 8 + Math.random() * 6;

      model.position.set(x, flyHeight, z);
      this.roadGroup.add(model);

      this.flyerObstacles.push({
        model, mixer, z, x, flyHeight, ownSpeed,
        collected: false, hitFlash: 0,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  _switchBatAction(name) {
    if (!this._batLoaded || this.batCurrentAction === name) return;
    if (!this.batActions[name]) return;

    const prev = this.batActions[this.batCurrentAction];
    const next = this.batActions[name];
    if (prev) prev.fadeOut(0.3);
    next.reset().fadeIn(0.3).play();
    this.batCurrentAction = name;
  }

  _spawnTreeObstacle(note, songTime) {
    if (this._treeTemplates.length === 0) return;

    // Leave one lane open based on note — the "window" to fly through
    const openLane = note % 3; // 0=left, 1=center, 2=right
    const lanes = [-1, 0, 1];
    const SPAWN_AHEAD = 18;
    const z = -((songTime - 60) * this.scrollSpeed) - SPAWN_AHEAD;

    for (let li = 0; li < lanes.length; li++) {
      if (li === openLane) continue; // skip the gap

      const td = this._treeTemplates[Math.floor(Math.random() * this._treeTemplates.length)];
      const inner = td.scene.clone();
      inner.position.set(-td.center.x, -td.minY, -td.center.z);

      const group = new THREE.Group();
      group.add(inner);

      const x = lanes[li] * this.laneWidth;
      const scale = 0.5 + Math.random() * 0.3;

      group.scale.setScalar(scale);
      group.position.set(x, 0, z);
      group.rotation.y = Math.random() * Math.PI * 2;

      inner.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({
            color: 0xff6633,
            wireframe: true,
            transparent: true,
            opacity: 0.7,
          });
        }
      });

      this.roadGroup.add(group);
      this.treeObstacles.push({
        model: group, inner, z, x, lane: lanes[li],
        collected: false, hitFlash: 0,
      });
    }
  }

  _spawnPulseRing(note) {
    const hue = (note % 12) / 12;
    const color = new THREE.Color().setHSL(hue, 0.7, 0.5);
    const geo = new THREE.RingGeometry(0.3, 0.5, 24);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.03, 0);
    this.roadGroup.add(ring);
    this.pulseRings.push({ mesh: ring, life: 1.0, maxLife: 1.0 });
  }

  _killBat() {
    if (this._batDead) return;
    this._batDead = true;
    this._batDeadTimer = 2.5;
    this._batFallVel = 6;
    this._batDeathElapsed = 0;
    this._batTumbleSpin = 0;
    this._cameraShake = 1.0;
    this._switchBatAction('Death');
  }

  _respawnBat() {
    this._batDead = false;
    this._respawning = true;
    this._respawnTimer = this._respawnDuration;
    this.playerY = 1.5;
    this.jumpVelY = 0;
    this.isGrounded = false;
    this._batTumbleSpin = 0;
    this._switchBatAction('Flying_Idle');

    if (this.batModel) {
      this.batModel.rotation.x = 0;
      this.batModel.rotation.z = 0;
    }
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const songTime = ctx.audio.currentTime;
    const GRAVITY = -25;
    const intensity = this.progress;

    // ── Camera ──
    const CAM_TRANSITION = 4;
    const targetCamPos = new THREE.Vector3(0, 5.5, 9);
    const targetLookAt = new THREE.Vector3(0, 0.5, -15);

    if (t < CAM_TRANSITION) {
      const p = t / CAM_TRANSITION;
      const ease = p * p * (3 - 2 * p);
      ctx.camera.fov = 55 + ease * 5;
      ctx.camera.updateProjectionMatrix();
      ctx.camera.position.lerp(targetCamPos, dt * (1 + ease * 4));
    } else {
      if (!this.cameraTransitionDone) {
        this.cameraTransitionDone = true;
        ctx.camera.fov = 60;
        ctx.camera.updateProjectionMatrix();
        if (t > CAM_TRANSITION + 1) ctx.camera.position.copy(targetCamPos);
      }
      const camTarget = new THREE.Vector3(
        this.playerTargetX * 0.3, 5.5 + this.playerY * 0.2, 9
      );
      ctx.camera.position.lerp(camTarget, dt * 3);
    }
    ctx.camera.lookAt(this.playerTargetX * 0.2, targetLookAt.y, targetLookAt.z);

    // Camera shake on death hit
    if (this._cameraShake > 0) {
      const shakeIntensity = this._cameraShake * 0.3;
      ctx.camera.position.x += (Math.random() - 0.5) * shakeIntensity;
      ctx.camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.6;
    }

    // ── World scrolling ──
    this.scrollSpeed = 12 + intensity * 4;
    const worldOffset = (songTime - 60) * this.scrollSpeed;

    for (const line of this.gridLines) {
      let wz = line.userData.baseZ + worldOffset;
      if (wz > 20) line.userData.baseZ -= 400;
      line.position.z = line.userData.baseZ + worldOffset;
    }

    for (const tree of this.sceneryTrees) {
      const wz = tree.baseZ + worldOffset;
      tree.model.position.z = wz;
      if (wz > 25) tree.baseZ -= 200;
    }

    // ── MIDI: Bass → tree obstacles ──
    for (let i = this.lastBassIndex + 1; i < this.bassEvents.length; i++) {
      const [noteTime, note] = this.bassEvents[i];
      if (songTime >= noteTime) {
        this.lastBassIndex = i;
        this._spawnTreeObstacle(note, songTime);
      } else break;
    }

    // ── MIDI: Melody → pulse rings + blink ──
    for (let i = this.lastMelodyIndex + 1; i < this.melodyEvents.length; i++) {
      const [noteTime, note] = this.melodyEvents[i];
      if (songTime >= noteTime) {
        this.lastMelodyIndex = i;
        this._spawnPulseRing(note);
        this.blinkFlash = 1.0;
      } else break;
    }

    // ── Scene color ──
    const sceneColor = new THREE.Color().setHSL(this.sceneHue, 0.2, 0.02);
    ctx.renderer.setClearColor(sceneColor);

    // Pulse rings
    for (let i = this.pulseRings.length - 1; i >= 0; i--) {
      const ring = this.pulseRings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        this.roadGroup.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        ring.mesh.material.dispose();
        this.pulseRings.splice(i, 1);
        continue;
      }
      const p = 1 - ring.life / ring.maxLife;
      ring.mesh.scale.set(1 + p * 8, 1 + p * 8, 1);
      ring.mesh.material.opacity = (1 - p) * 0.4;
    }

    // ── Player movement ──
    if (!this._batDead) {
      const mx = ctx.input.mouseX;
      const ROAD_HALF_WIDTH = 7;
      this.playerTargetX = mx * ROAD_HALF_WIDTH;

      if (Math.abs(mx) < 0.02) {
        if (ctx.input.left) this.playerTargetX = -ROAD_HALF_WIDTH;
        else if (ctx.input.right) this.playerTargetX = ROAD_HALF_WIDTH;
        else this.playerTargetX = 0;
      }

      this._batX += (this.playerTargetX - this._batX) * dt * 8;

      if ((ctx.input.upDown || ctx.input.spaceDown) && this.jumpsLeft > 0) {
        this.jumpVelY = 14;
        this.isGrounded = false;
        this.jumpsLeft--;
      }
      if (!this.isGrounded) {
        this.jumpVelY += GRAVITY * dt;
        this.playerY += this.jumpVelY * dt;
        if (this.playerY <= 0) {
          this.playerY = 0;
          this.jumpVelY = 0;
          this.isGrounded = true;
          this.jumpsLeft = 3;
        }
      }
    } else {
      this._batDeathElapsed += dt;

      // Pop upward briefly, then fall hard
      this._batFallVel += GRAVITY * 1.4 * dt;
      this.playerY += this._batFallVel * dt;
      if (this.playerY < -0.5) this.playerY = -0.5;

      // Tumble spin accelerates over time
      this._batTumbleSpin += dt * 12;

      this._batDeadTimer -= dt;
      if (this._batDeadTimer <= 0) {
        this._respawnBat();
      }
    }

    // Respawn blink countdown
    if (this._respawning) {
      this._respawnTimer -= dt;
      if (this._respawnTimer <= 0) {
        this._respawning = false;
      }
    }

    // Camera shake decay
    if (this._cameraShake > 0) {
      this._cameraShake = Math.max(0, this._cameraShake - dt * 2.5);
    }

    const batWorldX = this._batX;
    const batWorldY = this.playerY + 1.5;
    ctx.player.group.position.set(batWorldX, batWorldY, 0);

    // ── Bat model ──
    if (this._batLoaded && this.batModel) {
      this.batModel.position.set(batWorldX, batWorldY, 0);

      if (this._batDead) {
        // Tumble rotation during fall
        this.batModel.rotation.x = this._batTumbleSpin;
        this.batModel.rotation.z = Math.sin(this._batDeathElapsed * 8) * 0.5;

        // Flicker between bright red and white
        const flickerRate = 18;
        const flicker = Math.sin(this._batDeathElapsed * flickerRate * Math.PI) > 0;
        this.batModel.traverse((child) => {
          if (child.isMesh) {
            if (flicker) {
              child.material.color.setHex(0xff2200);
              child.material.opacity = 1.0;
            } else {
              child.material.color.setHex(0xffffff);
              child.material.opacity = 0.6;
            }
          }
        });
      } else if (this._respawning) {
        // Rapid blink-in: toggle visibility at decreasing rate
        const blinkProgress = 1 - (this._respawnTimer / this._respawnDuration);
        const blinkSpeed = 12 + blinkProgress * 20;
        const visible = Math.sin(this._respawnTimer * blinkSpeed) > 0;
        this.batModel.visible = visible;

        // Gradually restore normal color during blink
        this.batModel.traverse((child) => {
          if (child.isMesh) {
            child.material.color.lerpColors(
              new THREE.Color(0xffffff),
              new THREE.Color(0xff9900),
              blinkProgress
            );
            child.material.opacity = 0.5 + blinkProgress * 0.45;
          }
        });

        const beatPhase = (songTime % BEAT) / BEAT;
        this.batModel.position.y += Math.sin(beatPhase * Math.PI * 2) * 0.15;
      } else {
        // Normal flying state
        this.batModel.visible = true;
        const beatPhase = (songTime % BEAT) / BEAT;
        this.batModel.position.y += Math.sin(beatPhase * Math.PI * 2) * 0.15;

        const bankAngle = (this.playerTargetX - batWorldX) * 0.15;
        this.batModel.rotation.z = THREE.MathUtils.lerp(this.batModel.rotation.z, bankAngle, dt * 5);

        // Ensure color is normal after respawn blink ends
        this.batModel.traverse((child) => {
          if (child.isMesh) {
            child.material.color.lerp(new THREE.Color(0xff9900), dt * 5);
            child.material.opacity = THREE.MathUtils.lerp(child.material.opacity, 0.95, dt * 5);
          }
        });
      }

      this.batMixer.update(dt);
    }

    // ── Flying monster obstacles (Serum #2 melody) ──
    for (let i = this.lastFlyerIndex + 1; i < this.flyerEvents.length; i++) {
      const [ft, note] = this.flyerEvents[i];
      if (songTime >= ft) {
        this.lastFlyerIndex = i;
        this._spawnFlyerObstacle(note, songTime);
      } else break;
    }

    const beatPh = (songTime % BEAT) / BEAT;
    const beatSin = Math.sin(beatPh * Math.PI * 2);

    for (const fo of this.flyerObstacles) {
      fo.z += fo.ownSpeed * dt;
      const wz = fo.z + worldOffset;
      fo.model.position.z = wz;

      // Bob + weave while approaching
      fo.model.position.y = fo.flyHeight + Math.sin(songTime * 4 + fo.phase) * 0.4 + beatSin * 0.2;
      fo.model.rotation.y = Math.PI + Math.sin(songTime * 2.5 + fo.phase) * 0.3;
      fo.model.rotation.z = Math.sin(songTime * 3 + fo.phase) * 0.15;

      fo.mixer.timeScale = 1.0 + beatSin * 0.2;
      fo.mixer.update(dt);

      // Hit flash decay
      if (fo.hitFlash > 0) {
        fo.hitFlash -= dt * 3;
        const flash = Math.sin(fo.hitFlash * 20) * 0.5 + 0.5;
        fo.model.traverse((child) => {
          if (child.isMesh) {
            child.material.color.setRGB(1, flash * 0.2, flash * 0.1);
            child.material.opacity = 0.5 + flash * 0.5;
          }
        });
      }

      if (fo.collected) {
        if (wz > 25) fo.model.visible = false;
        continue;
      }

      // Collision check
      const dz = Math.abs(wz);
      const dx = Math.abs(fo.x - batWorldX);
      const dy = Math.abs(fo.flyHeight - batWorldY);
      if (dz < 1.5 && dx < 1.5 && dy < 1.5 && !this._batDead && !this._respawning) {
        fo.collected = true;
        fo.hitFlash = 1.0;
        ctx.score.breakCombo();
        this._killBat();

        fo.model.traverse((child) => {
          if (child.isMesh) {
            child.material.color.set(0xff0000);
            child.material.opacity = 1.0;
          }
        });
      }

      // Dodged successfully
      if (wz > 3 && !fo.collected) {
        fo.collected = true;
        ctx.score.add(75);
      }
    }

    // Melody blink
    if (this.blinkFlash > 0) {
      this.blinkFlash = Math.max(0, this.blinkFlash - dt * 6);
    }

    // ── Tree obstacle collision ──
    for (const ob of this.treeObstacles) {
      ob.model.position.z = ob.z + worldOffset;
      const oz = ob.model.position.z;

      // Hit flash decay
      if (ob.hitFlash > 0) {
        ob.hitFlash -= dt * 3;
        const flash = Math.sin(ob.hitFlash * 20) * 0.5 + 0.5;
        ob.inner.traverse((child) => {
          if (child.isMesh) {
            child.material.color.setRGB(1, flash * 0.2, flash * 0.1);
            child.material.opacity = 0.5 + flash * 0.5;
          }
        });
      }

      if (ob.collected) {
        if (oz > 25) ob.model.visible = false;
        continue;
      }

      // Collision check (invulnerable during death and respawn blink)
      const dz = Math.abs(oz);
      const dx = Math.abs(ob.x - batWorldX);
      if (dz < 1.5 && dx < 1.8 && !this._batDead && !this._respawning) {
        ob.collected = true;
        ob.hitFlash = 1.0;
        ctx.score.breakCombo();
        this._killBat();

        // Flash tree red
        ob.inner.traverse((child) => {
          if (child.isMesh) {
            child.material.color.set(0xff0000);
            child.material.opacity = 1.0;
          }
        });
      }

      // Dodged
      if (oz > 3 && !ob.collected) {
        ob.collected = true;
        ctx.score.add(50);
      }
    }

    // Intensity build
    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 0.8 + intensity * 0.4;
    }
    if (this.ambient) {
      this.ambient.intensity = 0.4 + intensity * 0.2;
    }
    if (ctx.scene.fog) {
      ctx.scene.fog.density = 0.006 - intensity * 0.002;
    }
  }

  exit(ctx) {
    ctx.player.group.visible = true;

    for (const ring of this.pulseRings) {
      this.roadGroup.remove(ring.mesh);
      ring.mesh.geometry.dispose();
      ring.mesh.material.dispose();
    }
    this.pulseRings = [];
    this.treeObstacles = [];
    this.gridLines = [];
    this.sceneryTrees = [];
    this._treeTemplates = [];

    if (this.batModel) {
      this.roadGroup.remove(this.batModel);
      this.batModel = null;
    }
    if (this.batMixer) {
      this.batMixer.stopAllAction();
      this.batMixer = null;
    }
    this.batActions = {};
    this._batLoaded = false;

    for (const fo of this.flyerObstacles) {
      this.roadGroup.remove(fo.model);
      fo.mixer.stopAllAction();
    }
    this.flyerObstacles = [];
    this._flyerTemplates = [];

    this.roadGroup = null;
    super.exit(ctx);
  }
}
