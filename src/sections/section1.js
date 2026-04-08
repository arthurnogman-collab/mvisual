import * as THREE from 'three';
import { SectionBase } from './section-base.js';

/**
 * SECTION 1 — "The Void Awakening" (0:00 – 0:30)
 *
 * Music: Single sustained F#3 synth pad. 30 seconds of emptiness.
 *
 * Visuals: DMT/ayahuasca trip onset.
 *  - Deep black void with faint sacred geometry wireframes
 *  - Slowly rotating mandala behind the player
 *  - Tiny geometric particles drifting through space
 *  - Everything breathes with the sustained pad note
 *  - Colors: deep indigo, violet, electric cyan hints
 *  - At ~28s, a crack of light appears ahead — the portal to Section 2
 *
 * Gameplay: Almost no speed. Player floats, getting used to controls.
 *           Nothing to dodge or collect. Pure atmosphere.
 */
export class Section1 extends SectionBase {
  constructor() {
    super('void-awakening', 0, 30);
    this.mandala = null;
    this.particles = null;
    this.portalLight = null;
    this.sacredRings = [];
    this.floatingGeo = [];
  }

  enter(ctx) {
    super.enter(ctx);

    // Dark fog — not too dense so geometry is visible
    ctx.scene.fog = new THREE.FogExp2(0x050008, 0.025);
    ctx.renderer.setClearColor(0x020005);

    // Player setup for this section
    ctx.player.speed = 1.5;
    ctx.player.mesh.material.color.setHex(0x8844ff);
    ctx.player.mesh.material.emissive.setHex(0x5522aa);

    // Camera position — behind and slightly above player
    ctx.camera.position.set(0, 2, 5);
    ctx.camera.lookAt(0, 0.5, -10);

    // Dim ambient
    this.ambient = new THREE.AmbientLight(0x220044, 0.6);
    this.add(this.ambient, ctx);

    this._buildMandala(ctx);
    this._buildSacredRings(ctx);
    this._buildParticles(ctx);
    this._buildPortal(ctx);
    this._buildFloatingGeometry(ctx);
  }

  _buildMandala(ctx) {
    // Large rotating mandala behind the player — sacred geometry feel
    const group = new THREE.Group();

    const ringCount = 6;
    for (let i = 0; i < ringCount; i++) {
      const radius = 3 + i * 1.5;
      const segments = 6 + i * 6; // hexagonal -> more complex
      const geo = new THREE.RingGeometry(radius - 0.02, radius + 0.02, segments);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.75 - i * 0.03, 0.9, 0.5),
        transparent: true,
        opacity: 0.3 - i * 0.03,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.z = (i * Math.PI) / ringCount;
      group.add(ring);
    }

    // Inner pattern — triangles forming Star of David / hexagram
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(angle) * 8, Math.sin(angle) * 8, 0),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x9955ff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      group.add(new THREE.Line(lineGeo, lineMat));
    }

    group.position.set(0, 1, -20);
    this.mandala = this.add(group, ctx);
  }

  _buildSacredRings(ctx) {
    // Floating sacred geometry rings around the path
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.TorusGeometry(1.2 + Math.random() * 0.8, 0.02, 8, 6 + Math.floor(Math.random() * 3) * 6);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.7 + Math.random() * 0.15, 0.9, 0.45),
        transparent: true,
        opacity: 0.4,
        wireframe: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.position.set(
        (Math.random() - 0.5) * 8,
        Math.random() * 4,
        -5 - i * 5
      );
      ring.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        0
      );
      ring.userData.rotSpeed = (Math.random() - 0.5) * 0.5;
      ring.userData.floatOffset = Math.random() * Math.PI * 2;
      this.sacredRings.push(this.add(ring, ctx));
    }
  }

  _buildParticles(ctx) {
    // Dust particles drifting through the void
    const count = 500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = Math.random() * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60 - 10;

      const hue = 0.7 + Math.random() * 0.2;
      const c = new THREE.Color().setHSL(hue, 0.9, 0.5 + Math.random() * 0.3);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = this.add(new THREE.Points(geo, mat), ctx);
  }

  _buildPortal(ctx) {
    // Portal light that appears near the end — crack of light ahead
    const geo = new THREE.PlaneGeometry(0.1, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.portalLight = this.add(new THREE.Mesh(geo, mat), ctx);
    this.portalLight.position.set(0, 2, -40);

    // Portal glow
    const glowGeo = new THREE.PlaneGeometry(3, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x8844ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.portalGlow = this.add(new THREE.Mesh(glowGeo, glowMat), ctx);
    this.portalGlow.position.set(0, 2, -40);
  }

  _buildFloatingGeometry(ctx) {
    // Sacred geometry shapes floating in the void — tetrahedra, octahedra, icosahedra
    const geoTypes = [
      new THREE.TetrahedronGeometry(0.2, 0),
      new THREE.OctahedronGeometry(0.2, 0),
      new THREE.IcosahedronGeometry(0.15, 0),
      new THREE.TetrahedronGeometry(0.15, 1),
    ];

    for (let i = 0; i < 20; i++) {
      const geo = geoTypes[i % geoTypes.length];
      const hue = 0.7 + Math.random() * 0.2;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 0.9, 0.45),
        wireframe: true,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 12,
        Math.random() * 5,
        -3 - Math.random() * 50
      );
      mesh.userData.rotSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.4
      );
      mesh.userData.floatOffset = Math.random() * Math.PI * 2;
      this.floatingGeo.push(this.add(mesh, ctx));
    }
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const audio = ctx.audio;

    // Camera follows player smoothly
    const pPos = ctx.player.group.position;
    ctx.camera.position.lerp(
      new THREE.Vector3(pPos.x * 0.3, pPos.y + 2, pPos.z + 5),
      dt * 2
    );
    ctx.camera.lookAt(pPos.x * 0.5, pPos.y + 0.5, pPos.z - 10);

    // Mandala — slow rotation, breathes with audio
    if (this.mandala) {
      this.mandala.rotation.z += dt * 0.1;
      const breathScale = 1 + Math.sin(t * 0.4) * 0.1 + audio.energy * 0.5;
      this.mandala.scale.setScalar(breathScale);

      // Fade in mandala over first 5 seconds
      const mandalaFade = Math.min(t / 5, 1);
      this.mandala.children.forEach(child => {
        if (child.material && child.material._baseOpacity === undefined) {
          child.material._baseOpacity = child.material.opacity;
        }
        if (child.material) {
          child.material.opacity = (child.material._baseOpacity || 0.3) * mandalaFade + audio.energy * 0.2;
        }
      });

      // Move mandala forward with player (stays in background)
      this.mandala.position.z = pPos.z - 20;
    }

    // Sacred rings — rotate and float
    for (const ring of this.sacredRings) {
      ring.rotation.x += ring.userData.rotSpeed * dt;
      ring.rotation.y += ring.userData.rotSpeed * dt * 0.7;
      ring.position.y += Math.sin(t * 0.5 + ring.userData.floatOffset) * dt * 0.2;

      // Breathe opacity with audio
      ring.material.opacity = 0.12 + audio.energy * 0.3 + Math.sin(t * 0.3 + ring.userData.floatOffset) * 0.05;

      // Recycle rings that fall behind player
      if (ring.position.z > pPos.z + 5) {
        ring.position.z = pPos.z - 30 - Math.random() * 15;
        ring.position.x = (Math.random() - 0.5) * 8;
      }
    }

    // Floating geometry — rotate, recycle
    for (const mesh of this.floatingGeo) {
      const rs = mesh.userData.rotSpeed;
      mesh.rotation.x += rs.x * dt;
      mesh.rotation.y += rs.y * dt;
      mesh.rotation.z += rs.z * dt;
      mesh.position.y += Math.sin(t * 0.6 + mesh.userData.floatOffset) * dt * 0.15;

      // Pulse with audio
      const s = 1 + audio.energy * 0.5;
      mesh.scale.setScalar(s);

      // Recycle
      if (mesh.position.z > pPos.z + 5) {
        mesh.position.z = pPos.z - 30 - Math.random() * 25;
        mesh.position.x = (Math.random() - 0.5) * 12;
      }
    }

    // Particles — drift and shimmer
    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        // Recycle particles that pass the player
        if (positions[i + 2] > pPos.z + 10) {
          positions[i + 2] = pPos.z - 40 - Math.random() * 20;
          positions[i] = (Math.random() - 0.5) * 20;
          positions[i + 1] = Math.random() * 10;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.material.opacity = 0.3 + audio.energy * 0.5;
    }

    // Portal — appears in last 4 seconds
    const portalStart = 26;
    if (t > portalStart && this.portalLight) {
      const portalProgress = (t - portalStart) / (this.endTime - this.startTime - portalStart);
      const portalOpacity = portalProgress * portalProgress; // ease in

      this.portalLight.material.opacity = portalOpacity * 0.9;
      this.portalLight.scale.x = 1 + portalProgress * 20;
      this.portalLight.position.z = pPos.z - 35;

      this.portalGlow.material.opacity = portalOpacity * 0.4;
      this.portalGlow.scale.x = 1 + portalProgress * 5;
      this.portalGlow.position.z = pPos.z - 35;

      // Increase fog density for whiteout transition
      ctx.scene.fog.density = 0.08 - portalProgress * 0.06;
    }

    // Slowly increase player speed as section progresses
    ctx.player.speed = 1.5 + this.progress * 2;

    // Color shift over time — deep indigo to violet
    const hue = 0.73 + Math.sin(t * 0.2) * 0.05;
    ctx.player.mesh.material.emissive.setHSL(hue, 0.7, 0.2 + audio.energy * 0.3);
  }

  exit(ctx) {
    this.sacredRings = [];
    this.floatingGeo = [];
    this.mandala = null;
    this.particles = null;
    this.portalLight = null;
    this.portalGlow = null;
    super.exit(ctx);
  }
}
