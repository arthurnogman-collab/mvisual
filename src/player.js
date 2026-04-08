import * as THREE from 'three';

/**
 * The Runner — starts as a glowing sphere, can morph between forms.
 * Sections can change its shape, but the player object persists across sections.
 */
export class Player {
  constructor(scene) {
    this.scene = scene;

    // Current form
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Default sphere form
    this.mesh = null;
    this.glow = null;
    this.buildSphere();

    // Movement state
    this.laneX = 0;         // target X position
    this.posY = 0;          // target Y position
    this.speed = 0;         // forward speed (set by section)
    this.forwardZ = 0;      // accumulated forward distance

    // Breathing state (driven by audio)
    this.breathPhase = 0;
  }

  buildSphere() {
    // Clear old form
    while (this.group.children.length) {
      this.group.remove(this.group.children[0]);
    }

    // Core sphere
    const geo = new THREE.IcosahedronGeometry(0.3, 3);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8844ff,
      emissive: 0x5522aa,
      emissiveIntensity: 0.5,
      metalness: 0.3,
      roughness: 0.4,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.group.add(this.mesh);

    // Outer glow shell
    const glowGeo = new THREE.IcosahedronGeometry(0.45, 2);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xaa66ff,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
    this.glow = new THREE.Mesh(glowGeo, glowMat);
    this.group.add(this.glow);

    // Point light emanating from the player
    const light = new THREE.PointLight(0x8844ff, 2, 8);
    this.group.add(light);
  }

  update(dt, input, audio) {
    // Lateral movement
    const lateralSpeed = 4;
    if (input.left)  this.laneX -= lateralSpeed * dt;
    if (input.right) this.laneX += lateralSpeed * dt;
    this.laneX = THREE.MathUtils.clamp(this.laneX, -3, 3);

    // Vertical movement
    const vertSpeed = 3;
    if (input.up)   this.posY += vertSpeed * dt;
    if (input.down) this.posY -= vertSpeed * dt;
    this.posY = THREE.MathUtils.clamp(this.posY, 0, 4);

    // Forward movement
    this.forwardZ -= this.speed * dt;

    // Apply position
    this.group.position.set(this.laneX, this.posY + 0.5, this.forwardZ);

    // Breathing / pulsing from audio
    this.breathPhase += dt * 2;
    const breathScale = 1 + Math.sin(this.breathPhase) * 0.05;
    const audioScale = 1 + audio.energy * 0.8;
    const s = breathScale * audioScale;
    this.mesh.scale.setScalar(s);
    this.glow.scale.setScalar(s * 1.3);

    // Emissive intensity from bass
    this.mesh.material.emissiveIntensity = 0.5 + audio.bass * 2;

    // Glow opacity from energy
    this.glow.material.opacity = 0.1 + audio.energy * 0.4;

    // Slow rotation
    this.mesh.rotation.y += dt * 0.5;
    this.mesh.rotation.x += dt * 0.3;
  }
}
