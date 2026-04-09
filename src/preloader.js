/**
 * Asset preloader — loads all GLB models into memory before the game starts.
 * Sections clone from these cached templates instead of loading on the fly.
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = {};  // path → gltf
let totalAssets = 0;
let loadedAssets = 0;

// All model paths used across all sections
const ALL_MODELS = [
  // Environment
  '/models/environment/Trees.glb',
  '/models/environment/Pine Trees.glb',
  '/models/environment/Birch Trees.glb',
  '/models/environment/Dead Trees.glb',
  '/models/environment/Maple Trees.glb',
  '/models/environment/Bushes.glb',
  '/models/environment/Flowers.glb',
  '/models/environment/Flower Bushes.glb',
  '/models/environment/Grass.glb',
  '/models/environment/Rocks.glb',
  '/models/environment/Palm Trees.glb',
  // Monsters / Characters
  '/models/monsters/Demon.glb',
  '/models/monsters/Blue Demon.glb',
  '/models/monsters/Ninja-xGYmeDpfTu.glb',
  '/models/monsters/Ninja.glb',
  '/models/monsters/Dragon.glb',
  '/models/monsters/Alien.glb',
  '/models/monsters/Orc.glb',
  '/models/monsters/Ghost.glb',
  '/models/monsters/Mushroom King.glb',
  '/models/monsters/Squidle.glb',
  '/models/monsters/Armabee.glb',
  '/models/monsters/Hywirl.glb',
  // Section 5 dancers
  '/models/monsters/Bunny.glb',
  '/models/monsters/Cat.glb',
  '/models/monsters/Frog.glb',
  '/models/monsters/Dino.glb',
  // Section 5/6 enemies
  '/models/monsters/Green Blob.glb',
  '/models/monsters/Orc Enemy.glb',
  '/models/monsters/Ghost Skull.glb',
];

/**
 * Load all models. Returns a promise that resolves when everything is ready.
 * Calls onProgress(loaded, total) for each loaded asset.
 */
export function preloadAll(onProgress) {
  totalAssets = ALL_MODELS.length;
  loadedAssets = 0;

  return new Promise((resolve) => {
    if (totalAssets === 0) { resolve(); return; }

    for (const path of ALL_MODELS) {
      loader.load(path, (gltf) => {
        cache[path] = gltf;
        loadedAssets++;
        if (onProgress) onProgress(loadedAssets, totalAssets);
        if (loadedAssets === totalAssets) resolve();
      }, undefined, (err) => {
        // Model failed to load — skip it, don't block
        console.warn('Failed to load:', path, err);
        loadedAssets++;
        if (onProgress) onProgress(loadedAssets, totalAssets);
        if (loadedAssets === totalAssets) resolve();
      });
    }
  });
}

/**
 * Get a cached GLTF. Returns the full gltf object (with .scene, .animations).
 * Sections should clone gltf.scene for each instance.
 */
export function getModel(path) {
  return cache[path] || null;
}

/**
 * Get just the scene (model) from cache, or null if not loaded.
 */
export function getScene(path) {
  return cache[path]?.scene || null;
}
