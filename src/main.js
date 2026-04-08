import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Story } from './story.js';
import { Score } from './score.js';
import { SectionChain } from './sections/section-chain.js';
import { Section1 } from './sections/section1.js';
import { Section2 } from './sections/section2.js';

// ── Core setup ──────────────────────────────────────────────
// Force 720p internal resolution for performance (bloom is expensive at high res)
const MAX_HEIGHT = 720;
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
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
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

window.addEventListener('resize', () => {
  const s = Math.min(1, MAX_HEIGHT / window.innerHeight);
  const rw = Math.floor(window.innerWidth * s);
  const rh = Math.floor(window.innerHeight * s);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(rw, rh, false);
  composer.setSize(rw, rh);
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

// Shared context passed to all sections
const ctx = { scene, camera, renderer, composer, bloomPass, player, audio, input, story, score };

// ── Click to start ──────────────────────────────────────────
const overlay = document.getElementById('overlay');

overlay.addEventListener('click', async () => {
  overlay.style.transition = 'opacity 0.5s';
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 500);

  await audio.load('/music/dead5.mp3');

  // Skip to a specific time via URL param: ?t=30 starts at 30s
  const params = new URLSearchParams(window.location.search);
  const startAt = parseFloat(params.get('t')) || 0;
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
  player.update(dt, input, audio);
  chain.update(dt, ctx);
  story.update(audio.currentTime);
  score.update(dt);

  // Render through post-processing pipeline (bloom!)
  composer.render();

  // Clear just-pressed flags after all systems have read them
  input.flush();
}
