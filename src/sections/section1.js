import * as THREE from 'three';
import { SectionBase } from './section-base.js';

/**
 * SECTION 1 — "The Tunnel" (0:00 – 0:30)
 *
 * Music: Single sustained F#3 synth pad. 30 seconds of near-silence.
 *
 * Concept: After-death tunnel. You are a soul — a noisy white orb —
 *          drifting through a dark tunnel toward a distant light.
 *          The goal is to follow the light. Reach it, and the melody
 *          begins (Section 2's gift).
 *
 * Visuals:
 *  - Dark cylindrical tunnel stretching into the distance
 *  - Faint sacred geometry etched into the tunnel walls (subtle, not random)
 *  - Sparse white particles drift past like dust motes in darkness
 *  - A single bright light at the far end — warm, beckoning
 *  - As you get closer (time progresses), the light grows, tunnel brightens
 *  - Minimal. Intentional. Every element has meaning.
 *
 * Gameplay: Slow drift forward. Move left/right/up/down to stay
 *           centered in the tunnel. The light is the only guide.
 */

// Tunnel wall shader — dark with faint sacred geometry patterns
const tunnelVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const tunnelFragmentShader = `
  uniform float uTime;
  uniform float uProgress;
  uniform float uEnergy;
  uniform vec3 uPlayerPos;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  #define PI 3.14159265359

  // Simple hash noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    // Distance from player — things near the orb are slightly lit
    float distFromPlayer = length(vWorldPos - uPlayerPos);
    float playerLight = exp(-distFromPlayer * 0.3) * 0.15;

    // Sacred geometry pattern on tunnel walls
    // Use the angle around the tunnel and distance along it
    float angle = atan(vWorldPos.y - 0.5, vWorldPos.x) / PI; // -1 to 1
    float depth = vWorldPos.z * 0.15;

    // Hexagonal grid pattern
    float hexAngle = fract(angle * 3.0 + depth) * 2.0 - 1.0;
    float hexDepth = fract(depth + angle * 0.5) * 2.0 - 1.0;
    float hexDist = max(abs(hexAngle), abs(hexDepth * 0.866 + hexAngle * 0.5));
    float hexLine = smoothstep(0.02, 0.0, abs(hexDist - 0.5));

    // Subtle veins of light
    float vein = sin(angle * 6.0 * PI + depth * 2.0 + uTime * 0.2) * 0.5 + 0.5;
    vein = pow(vein, 8.0) * 0.1;

    // Pattern fades in over time and brightens near the end
    float patternStrength = smoothstep(0.0, 0.3, uProgress) * 0.08
                          + uProgress * 0.05
                          + uEnergy * 0.05;

    // Combine
    float light = playerLight + hexLine * patternStrength + vein * patternStrength;

    // Color: very dark, hints of cool blue-white
    vec3 col = vec3(0.7, 0.75, 0.9) * light;

    // Slight warm tint toward the far end (where the light is)
    float endGlow = smoothstep(-50.0, -80.0, vWorldPos.z - uPlayerPos.z) * uProgress * 0.03;
    col += vec3(1.0, 0.9, 0.7) * endGlow;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Section1 extends SectionBase {
  constructor() {
    super('the-tunnel', 0, 30);
    this.tunnelSegments = [];
    this.particles = null;
    this.endLight = null;
    this.endLightFlare = null;
    this.tunnelMat = null;
    this.rings = [];
  }

  enter(ctx) {
    super.enter(ctx);

    // Pure black
    ctx.scene.fog = new THREE.FogExp2(0x000000, 0.02);
    ctx.renderer.setClearColor(0x000000);

    // Bloom — ethereal glow for the tunnel
    if (ctx.bloomPass) {
      ctx.bloomPass.strength = 1.8;
      ctx.bloomPass.radius = 0.6;
      ctx.bloomPass.threshold = 0.15;
    }

    // Player setup
    ctx.player.speed = 3;
    ctx.player.glowMat.uniforms.uColor.value.set(0.9, 0.9, 1.0);

    // Camera — close behind player, looking forward
    ctx.camera.position.set(0, 1.5, 4);
    ctx.camera.lookAt(0, 0.5, -20);

    // Very dim ambient — tunnel should be almost black
    this.ambient = new THREE.AmbientLight(0x111122, 0.1);
    this.add(this.ambient, ctx);

    // Story
    ctx.story.clear();
    ctx.story.schedule('...', 1, 3);
    ctx.story.schedule('use arrow keys to move', 5, 3);
    ctx.story.schedule('follow the light', 10, 4);
    ctx.story.schedule('let go', 17, 3);
    ctx.story.schedule('you are almost there', 22, 3, 'bright');
    ctx.story.schedule('step into the light', 27, 3, 'bright');

    this._buildTunnel(ctx);
    this._buildSacredRings(ctx);
    this._buildParticles(ctx);
    this._buildEndLight(ctx);
  }

  _buildTunnel(ctx) {
    // Long tunnel made of cylinder segments
    const segmentLength = 30;
    const segmentCount = 6;
    const radius = 4;

    this.tunnelMat = new THREE.ShaderMaterial({
      vertexShader: tunnelVertexShader,
      fragmentShader: tunnelFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uEnergy: { value: 0 },
        uPlayerPos: { value: new THREE.Vector3() },
      },
      side: THREE.BackSide,
    });

    for (let i = 0; i < segmentCount; i++) {
      const geo = new THREE.CylinderGeometry(radius, radius, segmentLength, 24, 1, true);
      geo.rotateX(Math.PI / 2); // align along Z axis
      const mesh = new THREE.Mesh(geo, this.tunnelMat);
      mesh.position.set(0, 0.5, -segmentLength * i - segmentLength / 2);
      this.tunnelSegments.push(this.add(mesh, ctx));
    }
  }

  _buildSacredRings(ctx) {
    // A few thin rings inside the tunnel at intervals — like gates you pass through
    // These are intentional markers, not random clutter
    const ringPositions = [-15, -35, -55, -75];

    for (const z of ringPositions) {
      const geo = new THREE.TorusGeometry(3.5, 0.015, 8, 64);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x667799,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.position.set(0, 0.5, z);
      ring.userData.baseZ = z;
      this.rings.push(this.add(ring, ctx));
    }
  }

  _buildParticles(ctx) {
    // Sparse white dust motes — very few, not a blizzard
    const count = 150;
    const positions = new Float32Array(count * 3);
    const opacities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribute inside the tunnel cylinder
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 3;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = Math.sin(angle) * r + 0.5;
      positions[i * 3 + 2] = -Math.random() * 120;
      opacities[i] = 0.3 + Math.random() * 0.7;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.04,
      color: 0xccccdd,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = this.add(new THREE.Points(geo, mat), ctx);
  }

  _buildEndLight(ctx) {
    // The light at the end of the tunnel — starts as a tiny point, grows

    // Core bright point
    const lightGeo = new THREE.CircleGeometry(0.3, 32);
    const lightMat = new THREE.MeshBasicMaterial({
      color: 0xfff8ee,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.endLight = this.add(new THREE.Mesh(lightGeo, lightMat), ctx);
    this.endLight.position.set(0, 0.5, -100);

    // Soft glow flare around it
    const flareGeo = new THREE.CircleGeometry(2, 32);
    const flareMat = new THREE.MeshBasicMaterial({
      color: 0xffeedd,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.endLightFlare = this.add(new THREE.Mesh(flareGeo, flareMat), ctx);
    this.endLightFlare.position.set(0, 0.5, -100);

    // Actual Three.js point light at the end
    this.endPointLight = new THREE.PointLight(0xffeedd, 0.5, 60);
    this.endPointLight.position.set(0, 0.5, -100);
    this.add(this.endPointLight, ctx);
  }

  update(dt, ctx) {
    super.update(dt, ctx);

    const t = this.localTime;
    const audio = ctx.audio;
    const pPos = ctx.player.group.position;

    // Update tunnel shader
    if (this.tunnelMat) {
      this.tunnelMat.uniforms.uTime.value = t;
      this.tunnelMat.uniforms.uProgress.value = this.progress;
      this.tunnelMat.uniforms.uEnergy.value = audio.energy;
      this.tunnelMat.uniforms.uPlayerPos.value.copy(pPos);
    }

    // Camera — smooth follow behind player, looking into the tunnel
    const targetCam = new THREE.Vector3(
      pPos.x * 0.2,
      pPos.y + 1.2,
      pPos.z + 3.5
    );
    ctx.camera.position.lerp(targetCam, dt * 3);
    ctx.camera.lookAt(pPos.x * 0.3, pPos.y + 0.3, pPos.z - 15);

    // Recycle tunnel segments — infinite tunnel illusion
    for (const seg of this.tunnelSegments) {
      if (seg.position.z > pPos.z + 20) {
        // Move to the front
        let minZ = Infinity;
        for (const s of this.tunnelSegments) minZ = Math.min(minZ, s.position.z);
        seg.position.z = minZ - 30;
      }
    }

    // Sacred rings — glow slightly as player approaches, then recycle
    for (const ring of this.rings) {
      const distToPlayer = Math.abs(ring.position.z - pPos.z);

      // Glow when passing through
      if (distToPlayer < 5) {
        ring.material.opacity = 0.15 + (1 - distToPlayer / 5) * 0.4;
      } else {
        ring.material.opacity = 0.08;
      }

      // Recycle behind player
      if (ring.position.z > pPos.z + 5) {
        let minZ = Infinity;
        for (const r of this.rings) minZ = Math.min(minZ, r.position.z);
        ring.position.z = minZ - 25;
      }
    }

    // Particles — drift and recycle
    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        // Slow drift upward and forward
        positions[i + 1] += dt * 0.05;

        // Recycle behind player
        if (positions[i + 2] > pPos.z + 8) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.random() * 3;
          positions[i] = Math.cos(angle) * r;
          positions[i + 1] = Math.sin(angle) * r + 0.5;
          positions[i + 2] = pPos.z - 60 - Math.random() * 60;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;

      // Particles get slightly brighter as section progresses
      this.particles.material.opacity = 0.3 + this.progress * 0.3 + audio.energy * 0.3;
    }

    // The light at the end — grows as you progress
    // It's always ahead, getting closer and brighter
    const lightZ = pPos.z - 70 + this.progress * 45; // approaches from -70 to -25 relative
    this.endLight.position.z = lightZ;
    this.endLightFlare.position.z = lightZ;
    this.endPointLight.position.z = lightZ;

    // Light grows in size and intensity
    const lightScale = 0.5 + this.progress * 3;
    this.endLight.scale.setScalar(lightScale);
    this.endLight.material.opacity = 0.3 + this.progress * 0.7;

    const flareScale = 1 + this.progress * 8;
    this.endLightFlare.scale.setScalar(flareScale);
    this.endLightFlare.material.opacity = this.progress * 0.4;

    this.endPointLight.intensity = 0.5 + this.progress * 10;
    this.endPointLight.distance = 30 + this.progress * 50;

    // Last 4 seconds — approaching the light, everything washes white
    if (t > 26) {
      const washProgress = (t - 26) / 4; // 0 to 1
      const wash = washProgress * washProgress; // ease in

      // Fog fades to white
      ctx.scene.fog.color.setRGB(wash, wash, wash);
      ctx.renderer.setClearColor(
        new THREE.Color(wash * 0.8, wash * 0.8, wash * 0.8)
      );

      // Increase ambient
      this.ambient.intensity = 0.1 + wash * 2;
      this.ambient.color.setRGB(1, 0.95, 0.85);

      // Player INVERTS — becomes a dark silhouette against the light
      // The lonely dark ball floating in white
      const invert = Math.min(wash * 1.5, 1); // goes dark faster than bg goes white
      ctx.player.mesh.material.color.setRGB(1 - invert, 1 - invert, 1 - invert);
      ctx.player.glowMat.uniforms.uColor.value.set(1 - invert * 0.9, 1 - invert * 0.9, 1 - invert * 0.85);
      ctx.player.light.intensity = 3 * (1 - invert); // light fades as ball goes dark

      // Bloom ramps up — light overwhelms everything
      if (ctx.bloomPass) {
        ctx.bloomPass.strength = 1.8 + wash * 4;
        ctx.bloomPass.radius = 0.6 + wash * 0.5;
      }
    }

    // Slowly accelerate — being pulled toward the light
    ctx.player.speed = 3 + this.progress * 5;
  }

  exit(ctx) {
    this.tunnelSegments = [];
    this.tunnelMat = null;
    this.particles = null;
    this.endLight = null;
    this.endLightFlare = null;
    this.endPointLight = null;
    this.rings = [];
    super.exit(ctx);
  }
}
