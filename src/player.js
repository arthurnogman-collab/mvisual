import * as THREE from 'three';

/**
 * The Runner — starts as an ethereal glowing orb with noisy shader glow.
 * Sections can morph its form, but the player object persists.
 */

// Vertex shader for the glow orb
const glowVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader — ethereal noisy glow
const glowFragmentShader = `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uBass;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  // Simplex-style noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    // View-dependent rim glow
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - abs(dot(viewDir, vNormal));
    rim = pow(rim, 2.0);

    // Animated noise crawling over the surface
    float n1 = snoise(vWorldPos * 3.0 + uTime * 0.5) * 0.5 + 0.5;
    float n2 = snoise(vWorldPos * 8.0 - uTime * 0.3) * 0.5 + 0.5;
    float noisePattern = n1 * 0.7 + n2 * 0.3;

    // Breathing pulse
    float breath = sin(uTime * 1.5) * 0.15 + 0.85;
    float pulse = breath + uBass * 0.5;

    // Core glow — white/warm center, fading outward
    float coreGlow = exp(-rim * 0.5) * pulse;

    // Noisy ethereal wisps
    float wisps = rim * noisePattern * (1.0 + uEnergy * 2.0);

    // Combine
    float alpha = (coreGlow * 0.6 + wisps * 0.5) * pulse;
    alpha = clamp(alpha, 0.0, 1.0);

    // Color: mostly white with subtle warmth
    vec3 col = mix(uColor, vec3(1.0), 0.7 + noisePattern * 0.3);
    col += rim * vec3(0.8, 0.85, 1.0) * 0.3; // subtle cool rim

    gl_FragColor = vec4(col, alpha);
  }
`;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.mesh = null;
    this.glowMesh = null;
    this.light = null;
    this.glowMat = null;
    this.buildSphere();

    // Movement state
    this.laneX = 0;
    this.posY = 0;
    this.speed = 0;
    this.forwardZ = 0;
    this.breathPhase = 0;
    this.elapsed = 0;

    // Movement bounds — sections can override these
    this.boundsX = [-3, 3];
    this.boundsY = [0, 4];
    this.boundsMode = 'rect'; // 'rect' or 'circle'
    this.boundsRadius = 3;    // for circle mode (tunnel)
  }

  buildSphere() {
    while (this.group.children.length) {
      this.group.remove(this.group.children[0]);
    }

    // Tiny bright core
    const coreGeo = new THREE.IcosahedronGeometry(0.12, 3);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.mesh = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this.mesh);

    // Shader glow shell — the main visual
    const glowGeo = new THREE.IcosahedronGeometry(0.5, 4);
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uBass: { value: 0 },
        uColor: { value: new THREE.Color(0.9, 0.9, 1.0) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.glowMesh = new THREE.Mesh(glowGeo, this.glowMat);
    this.group.add(this.glowMesh);

    // Soft white point light
    this.light = new THREE.PointLight(0xeeeeff, 3, 12);
    this.group.add(this.light);
  }

  update(dt, input, audio, score) {
    this.elapsed += dt;

    // Lateral movement (analog mouse or keyboard)
    const lateralSpeed = 4;
    const move = input.moveAmount;
    if (move !== 0) {
      this.laneX += move * lateralSpeed * dt;
    } else {
      if (input.left)  this.laneX -= lateralSpeed * dt;
      if (input.right) this.laneX += lateralSpeed * dt;
    }

    // Vertical movement (mouse Y in tunnel mode, keyboard fallback)
    const vertSpeed = 3;
    if (this.boundsMode === 'circle' && Math.abs(input.mouseY) > 0.08) {
      // In tunnel, mouse Y controls vertical
      const my = input.mouseY;
      const sign = Math.sign(my);
      const amount = sign * Math.min(1, (Math.abs(my) - 0.08) / 0.92);
      this.posY += amount * vertSpeed * dt;
    } else {
      if (input.up)   this.posY += vertSpeed * dt;
      if (input.down) this.posY -= vertSpeed * dt;
    }

    // Apply bounds
    if (this.boundsMode === 'circle') {
      // Circular tunnel bounds — clamp to radius from center (0, 0.5)
      const dx = this.laneX;
      const dy = this.posY - 0; // center Y of tunnel
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxR = this.boundsRadius - 0.5; // leave room for player size
      if (dist > maxR) {
        const scale = maxR / dist;
        this.laneX = dx * scale;
        this.posY = dy * scale;
      }
    } else {
      this.laneX = THREE.MathUtils.clamp(this.laneX, this.boundsX[0], this.boundsX[1]);
      this.posY = THREE.MathUtils.clamp(this.posY, this.boundsY[0], this.boundsY[1]);
    }

    // Forward movement
    this.forwardZ -= this.speed * dt;

    // Position
    this.group.position.set(this.laneX, this.posY + 0.5, this.forwardZ);

    // Update shader uniforms
    this.glowMat.uniforms.uTime.value = this.elapsed;
    this.glowMat.uniforms.uEnergy.value = audio.energy;
    this.glowMat.uniforms.uBass.value = audio.bass;

    // ── Score-driven ball visuals ──
    const sf = score ? score.flash : 0;      // 0-1, positive score flash
    const hf = score ? score.hitFlash : 0;   // 0-1, red hit flash

    // Breathing + score pulse scale
    this.breathPhase += dt * 1.5;
    const breathScale = 1 + Math.sin(this.breathPhase) * 0.08;
    const audioScale = 1 + audio.energy * 0.5;
    const scoreScale = 1 + sf * 0.6; // ball grows on score
    const s = breathScale * audioScale * scoreScale;
    this.glowMesh.scale.setScalar(s);
    this.mesh.scale.setScalar(scoreScale);

    // Color shift on score — PURPLE glow on good, RED blink on bad
    if (sf > 0 && score) {
      // Purple signal on positive scoring
      const purpleColor = new THREE.Color(0.7, 0.1, 1.0);
      this.glowMat.uniforms.uColor.value.lerp(purpleColor, sf * 0.8);
      this.mesh.material.color.lerp(new THREE.Color(0.8, 0.3, 1.0), sf * 0.6);
      this.glowMat.uniforms.uEnergy.value = audio.energy + sf * 2.0;
      this.light.color.lerp(new THREE.Color(0.6, 0.1, 1.0), sf * 0.5);
      this.light.intensity = 2 + audio.energy * 5 + sf * 12;
    } else if (hf > 0) {
      // Red blink on hit/miss — aggressive flashing
      const blinkPhase = Math.sin(this.elapsed * 30) > 0 ? 1 : 0.3;
      const hitColor = new THREE.Color(1, 0.05, 0.05);
      this.glowMat.uniforms.uColor.value.lerp(hitColor, hf * blinkPhase);
      this.mesh.material.color.lerp(hitColor, hf * blinkPhase * 0.7);
      this.light.color.lerp(new THREE.Color(1, 0, 0), hf * 0.6);
      this.light.intensity = 2 + hf * 8 * blinkPhase;
    } else {
      // Restore to default
      this.glowMat.uniforms.uColor.value.lerp(new THREE.Color(0.9, 0.9, 1.0), dt * 3);
      this.mesh.material.color.lerp(new THREE.Color(1, 1, 1), dt * 5);
      this.light.color.lerp(new THREE.Color(0.93, 0.93, 1.0), dt * 3);
      this.light.intensity = 2 + audio.energy * 5 + audio.bass * 3;
    }

    // Core subtle rotation
    this.mesh.rotation.y += dt * 0.3;
  }
}
