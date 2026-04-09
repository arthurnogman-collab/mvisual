import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Audio } from './audio.js';
import { preloadAll } from './preloader.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Story } from './story.js';
import { Score } from './score.js';
import { SectionChain } from './sections/section-chain.js';
import { Section1 } from './sections/section1.js';
import { Section2 } from './sections/section2.js';
import { Section3 } from './sections/section3.js';
import { Section4 } from './sections/section4.js';
import { Section5 } from './sections/section5.js';

// ── Core setup ──────────────────────────────────────────────
// 480p internal resolution — balance of performance + clarity
const MAX_HEIGHT = 480;
const scale = Math.min(1, MAX_HEIGHT / window.innerHeight);
const renderW = Math.floor(window.innerWidth * scale);
const renderH = Math.floor(window.innerHeight * scale);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(renderW, renderH, false); // false = don't set CSS style
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(0, 2, 5);

// ── Post-processing: Bloom ──────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(renderW, renderH),
  1.5,   // strength — how much glow bleeds out
  0.4,   // radius — how far the glow spreads
  0.1    // threshold — how bright something needs to be to glow
);
composer.addPass(bloomPass);

// ── CRT / Interlaced scanline shader ───────────────────────
const CRTShader = {
  uniforms: {
    tDiffuse:      { value: null },
    resolution:    { value: new THREE.Vector2(renderW, renderH) },
    time:          { value: 0 },
    scanlineWeight:{ value: 0.18 },   // how dark the scanlines are
    noiseAmount:   { value: 0.04 },   // subtle static grain
    rgbShift:      { value: 0.003 },  // chromatic aberration
    curvature:     { value: 0.03 },   // barrel distortion
    vignette:      { value: 0.4 },    // edge darkening
    interlace:     { value: 1.0 },    // interlace on/off
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float scanlineWeight;
    uniform float noiseAmount;
    uniform float rgbShift;
    uniform float curvature;
    uniform float vignette;
    uniform float interlace;

    varying vec2 vUv;

    // Simple hash noise
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Barrel distortion
    vec2 curveUV(vec2 uv) {
      vec2 cu = uv * 2.0 - 1.0;
      cu *= 1.0 + curvature * dot(cu, cu);
      return cu * 0.5 + 0.5;
    }

    void main() {
      vec2 uv = curveUV(vUv);

      // Out of bounds after distortion → black
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // RGB channel shift (chromatic aberration)
      float r = texture2D(tDiffuse, uv + vec2(rgbShift, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(rgbShift, 0.0)).b;
      vec3 col = vec3(r, g, b);

      // Scanlines — alternating dark lines
      float scanY = gl_FragCoord.y;
      float scanline = 1.0 - scanlineWeight * step(0.5, mod(scanY, 2.0));
      col *= scanline;

      // Interlace flicker — shift every other frame (based on time)
      float frame = floor(time * 30.0); // ~30fps flicker
      float interlaceOffset = mod(frame, 2.0);
      float interlaceLine = 1.0 - (interlace * 0.08) * step(0.5, mod(scanY + interlaceOffset, 2.0));
      col *= interlaceLine;

      // Subtle static grain noise
      float noise = hash(vUv * resolution + time * 100.0) * noiseAmount;
      col += noise;

      // Phosphor glow — slightly boost brightness near scanline centers
      float phosphor = 1.0 + 0.06 * sin(scanY * 3.14159);
      col *= phosphor;

      // Vignette — darken edges
      vec2 vc = vUv - 0.5;
      float vig = 1.0 - vignette * dot(vc, vc) * 2.0;
      col *= vig;

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

const crtPass = new ShaderPass(CRTShader);
composer.addPass(crtPass);

window.addEventListener('resize', () => {
  const s = Math.min(1, MAX_HEIGHT / window.innerHeight);
  const rw = Math.floor(window.innerWidth * s);
  const rh = Math.floor(window.innerHeight * s);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(rw, rh, false);
  composer.setSize(rw, rh);
  crtPass.uniforms.resolution.value.set(rw, rh);
});

// ── Systems ─────────────────────────────────────────────────
const audio = new Audio();
const input = new Input();
const player = new Player(scene);
const story = new Story();
const score = new Score();
const chain = new SectionChain();

// Register sections (add more here as we build them)
chain.add(new Section1());
chain.add(new Section2());
chain.add(new Section3());
chain.add(new Section4());
chain.add(new Section5());

// Shared context passed to all sections
const ctx = { scene, camera, renderer, composer, bloomPass, crtPass, player, audio, input, story, score };

// ── Click to start ──────────────────────────────────────────
const overlay = document.getElementById('overlay');

overlay.addEventListener('click', async () => {
  const label = overlay.querySelector('span');
  label.textContent = 'LOADING...';
  label.style.animation = 'none';
  label.style.opacity = '0.7';

  // Load audio + all 3D models in parallel
  const audioPromise = audio.load('/music/dead5.mp3');
  const modelsPromise = preloadAll((loaded, total) => {
    const pct = Math.round((loaded / total) * 100);
    label.textContent = `LOADING ${pct}%`;
  });
  await Promise.all([audioPromise, modelsPromise]);

  label.textContent = 'READY';
  overlay.style.transition = 'opacity 0.5s';
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 500);

  // Skip to a specific time via URL param: ?t=0 starts from beginning
  const params = new URLSearchParams(window.location.search);
  const tParam = params.get('t');
  const startAt = tParam !== null ? parseFloat(tParam) : 0;
  audio.play(startAt);
  loop();
});

// ── Game loop ───────────────────────────────────────────────
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);

  const dt = Math.min(clock.getDelta(), 0.05); // cap delta

  // Update systems
  audio.update();
  player.update(dt, input, audio, score);
  chain.update(dt, ctx);
  story.update(audio.currentTime);
  score.update(dt);

  // Update CRT time for interlace flicker + noise
  crtPass.uniforms.time.value = audio.currentTime || 0;

  // Render through post-processing pipeline (bloom + CRT!)
  composer.render();

  // Clear just-pressed flags after all systems have read them
  input.flush();
}
