import * as THREE from 'three';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { SectionChain } from './sections/section-chain.js';
import { Section1 } from './sections/section1.js';

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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Systems ─────────────────────────────────────────────────
const audio = new Audio();
const input = new Input();
const player = new Player(scene);
const chain = new SectionChain();

// Register sections (add more here as we build them)
chain.add(new Section1());

// Shared context passed to all sections
const ctx = { scene, camera, renderer, player, audio, input };

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

  // Render
  renderer.render(scene, camera);
}
