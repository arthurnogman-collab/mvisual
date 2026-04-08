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
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,   // strength — how much glow bleeds out
  0.4,   // radius — how far the glow spreads
  0.1    // threshold — how bright something needs to be to glow
);
composer.addPass(bloomPass);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
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
  audio.play();
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
}
