// ============================================================================
// main.js — Game bootstrap and requestAnimationFrame loop.
// ============================================================================
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { BLOCK, BLOCK_COLOR, HOTBAR_BLOCKS, PLAYER, ZOMBIE, DAY_CYCLE, WORLD } from './config.js';
import { World } from './World/World.js';
import { Player } from './Entities/Player.js';
import { Mob } from './Entities/Mob.js';
import { HUD } from './UI/HUD.js';
import { SaveSystem } from './Storage/SaveSystem.js';

const BLOCK_NAMES = {
  [BLOCK.DIRT]: 'Dirt', [BLOCK.GRASS]: 'Grass', [BLOCK.STONE]: 'Stone',
  [BLOCK.WOOD]: 'Wood', [BLOCK.LEAVES]: 'Leaves', [BLOCK.SAND]: 'Sand',
};

// ----------------------------------------------------------------------------
// Renderer / Scene / Camera
// ----------------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const SKY_DAY = new THREE.Color(0x8fd0ff);
const SKY_NIGHT = new THREE.Color(0x05070f);
const scene = new THREE.Scene();
scene.background = SKY_DAY.clone();
scene.fog = new THREE.Fog(SKY_DAY.getHex(), 20, 70);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----------------------------------------------------------------------------
// Lighting
// ----------------------------------------------------------------------------
const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff2d0, 1.1);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -40;
sunLight.shadow.camera.right = 40;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -40;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 120;
sunLight.shadow.bias = -0.0015;
scene.add(sunLight);
scene.add(sunLight.target);

const hemiLight = new THREE.HemisphereLight(0xbdd6ff, 0x2a2a2a, 0.4);
scene.add(hemiLight);

// ----------------------------------------------------------------------------
// HUD, World, Player
// ----------------------------------------------------------------------------
const hud = new HUD();

let seed = Math.random();
let existingSave = null;
if (SaveSystem.hasSave()) {
  existingSave = SaveSystem.load();
  if (existingSave && typeof existingSave.seed === 'number') seed = existingSave.seed;
}

const world = new World(scene, seed);
world.buildMesh();

const player = new Player(camera, world, hud);

// Inventory: { blockId: count }. Give a small starter supply of building blocks.
const inventory = {
  [BLOCK.DIRT]: 12, [BLOCK.STONE]: 8, [BLOCK.WOOD]: 8,
  [BLOCK.GRASS]: 4, [BLOCK.LEAVES]: 4, [BLOCK.SAND]: 4,
};

if (existingSave) {
  world.applyModifications(existingSave.modifications || []);
  player.health = existingSave.player?.health ?? PLAYER.MAX_HEALTH;
  player.hunger = existingSave.player?.hunger ?? PLAYER.MAX_HUNGER;
  if (existingSave.player?.position) {
    player.position.set(existingSave.player.position.x, existingSave.player.position.y, existingSave.player.position.z);
  }
  if (existingSave.inventory) Object.assign(inventory, existingSave.inventory);
}
hud.updateHealth(player.health);
hud.updateHunger(player.hunger);

let activeSlot = 0;
hud.setActiveSlot(activeSlot);

// ----------------------------------------------------------------------------
// Pointer lock controls
// ----------------------------------------------------------------------------
const controls = new PointerLockControls(camera, document.body);
const startOverlay = document.getElementById('start-overlay');

startOverlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => startOverlay.classList.add('hidden'));
controls.addEventListener('unlock', () => {
  if (!player.isDead) startOverlay.classList.remove('hidden');
});

// ----------------------------------------------------------------------------
// Input state
// ----------------------------------------------------------------------------
const input = { forward: false, backward: false, left: false, right: false, jump: false, sprint: false };

const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
};

window.addEventListener('keydown', (e) => {
  if (KEY_MAP[e.code]) input[KEY_MAP[e.code]] = true;
  if (e.code >= 'Digit1' && e.code <= 'Digit9') {
    const idx = parseInt(e.code.replace('Digit', ''), 10) - 1;
    if (idx >= 0 && idx < HOTBAR_BLOCKS.length) {
      activeSlot = idx;
      hud.setActiveSlot(activeSlot);
    }
  }
  if (e.code === 'KeyP') {
    SaveSystem.save({ world, player, inventory, seed, dayTime, cyclesSurvived });
  }
});
window.addEventListener('keyup', (e) => {
  if (KEY_MAP[e.code]) input[KEY_MAP[e.code]] = false;
});

// Mouse click: left = mine/attack, right = place
let mouseLeftDown = false;
document.addEventListener('mousedown', (e) => {
  if (!controls.isLocked) return;
  if (e.button === 0) mouseLeftDown = true;
  if (e.button === 2) handlePlace();
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseLeftDown = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

function handlePlace() {
  if (player.isDead) return;
  const hitResult = player.attackRaycast(6);
  if (!hitResult.hit || !hitResult.placeAt) return;
  const blockId = HOTBAR_BLOCKS[activeSlot];
  if ((inventory[blockId] || 0) <= 0) return;

  const { x, y, z } = hitResult.placeAt;
  // Prevent placing a block inside the player's own bounding box.
  const playerBox = player._boxAt(player.position);
  const overlaps = (x + 1 > playerBox.minX && x < playerBox.maxX &&
                     y + 1 > playerBox.minY && y < playerBox.maxY &&
                     z + 1 > playerBox.minZ && z < playerBox.maxZ);
  if (overlaps) return;

  const placed = world.placeBlock(x, y, z, blockId);
  if (placed) inventory[blockId] -= 1;
}

function handleMineOrAttack() {
  if (player.isDead || !player.canAttack()) return;

  const eye = player.getEyePosition();
  const forward = player.getForwardVector();

  // Find nearest mob roughly along the look direction within attack range.
  let bestMob = null;
  let bestDist = Infinity;
  for (const mob of mobs) {
    if (mob.dead) continue;
    const toMob = new THREE.Vector3(mob.position.x - eye.x, mob.position.y + 1 - eye.y, mob.position.z - eye.z);
    const dist = toMob.length();
    if (dist > PLAYER.ATTACK_RANGE) continue;
    const dirToMob = toMob.clone().normalize();
    const dot = dirToMob.dot(forward);
    if (dot > 0.75 && dist < bestDist) {
      bestDist = dist;
      bestMob = mob;
    }
  }

  const blockHit = world.raycast(eye, forward, PLAYER.ATTACK_RANGE);
  const blockDist = blockHit.hit ? blockHit.point.distanceTo(eye) : Infinity;

  player.triggerAttackCooldown();

  if (bestMob && bestDist <= blockDist + 0.35) {
    const knockDir = new THREE.Vector3(bestMob.position.x - player.position.x, 0, bestMob.position.z - player.position.z).normalize();
    bestMob.takeDamage(PLAYER.ATTACK_DAMAGE, knockDir);
    hud.showFloatingDamage(PLAYER.ATTACK_DAMAGE, 'dmg-white');
    return;
  }

  if (blockHit.hit) {
    const minedId = world.breakBlock(blockHit.x, blockHit.y, blockHit.z);
    if (minedId) {
      hud.showFloatingDamage(1, 'dmg-yellow');
    }
  }
}

// ----------------------------------------------------------------------------
// Mob management
// ----------------------------------------------------------------------------
const mobs = [];
let mobSpawnTimer = 0;
let dayTime = existingSave?.dayTime ?? 0; // seconds elapsed within the day/night cycle
let cyclesSurvived = existingSave?.cyclesSurvived ?? 0;
const VICTORY_CYCLES = 3;

function isNight() {
  const frac = (dayTime % DAY_CYCLE.DAY_LENGTH_SEC) / DAY_CYCLE.DAY_LENGTH_SEC;
  return frac >= DAY_CYCLE.NIGHT_START && frac <= DAY_CYCLE.NIGHT_END;
}

function updateDayNight(dt) {
  const prevFrac = (dayTime % DAY_CYCLE.DAY_LENGTH_SEC) / DAY_CYCLE.DAY_LENGTH_SEC;
  dayTime += dt;
  const frac = (dayTime % DAY_CYCLE.DAY_LENGTH_SEC) / DAY_CYCLE.DAY_LENGTH_SEC;
  if (frac < prevFrac) {
    cyclesSurvived += 1;
    if (cyclesSurvived >= VICTORY_CYCLES && !player.won && !player.isDead) {
      player.won = true;
      hud.showVictoryScreen();
      controls.unlock();
    }
  }

  // angle: 0 = sunrise, PI = sunset/night start
  const angle = frac * Math.PI * 2;
  const sunDistance = 60;
  sunLight.position.set(Math.cos(angle) * sunDistance, Math.max(5, Math.sin(angle) * sunDistance), 20);
  sunLight.target.position.set(player.position.x, player.position.y, player.position.z);
  sunLight.target.updateMatrixWorld();

  const night = isNight();
  const brightness = night ? 0.12 : Math.max(0.25, Math.sin(angle));
  sunLight.intensity = 1.1 * Math.max(0.15, brightness);
  ambientLight.intensity = night ? 0.18 : 0.55;

  const skyColor = SKY_DAY.clone().lerp(SKY_NIGHT, night ? 0.92 : Math.max(0, 1 - brightness) * 0.3);
  scene.background = skyColor;
  scene.fog.color = skyColor;
  scene.fog.near = night ? 12 : 20;
  scene.fog.far = night ? 40 : 70;

  hud.setDayNightLabel(night ? `Night (${cyclesSurvived}/${VICTORY_CYCLES} cycles survived)` : `Day (${cyclesSurvived}/${VICTORY_CYCLES} cycles survived)`);
}

function trySpawnMob(dt) {
  mobSpawnTimer -= dt;
  if (mobSpawnTimer > 0) return;
  mobSpawnTimer = ZOMBIE.SPAWN_INTERVAL_SEC;
  if (!isNight()) return;
  if (mobs.filter(m => !m.dead).length >= ZOMBIE.MAX_ACTIVE) return;

  const angle = Math.random() * Math.PI * 2;
  const dist = ZOMBIE.SPAWN_MIN_DIST + Math.random() * (ZOMBIE.SPAWN_MAX_DIST - ZOMBIE.SPAWN_MIN_DIST);
  let x = player.position.x + Math.cos(angle) * dist;
  let z = player.position.z + Math.sin(angle) * dist;
  x = Math.max(1, Math.min(world.sizeX - 2, x));
  z = Math.max(1, Math.min(world.sizeZ - 2, z));
  const y = world.surfaceHeight(x, z) + 1;

  const mob = new Mob(scene, world, new THREE.Vector3(x, y, z));
  mobs.push(mob);
}

function updateMobs(dt) {
  for (const mob of mobs) {
    if (mob.dead) continue;
    mob.update(dt, player.position, (damage) => {
      if (!player.isDead) player.takeDamage(damage, 'zombie');
    });

    // simple separation so the mob doesn't render fully inside the player
    const dx = mob.position.x - player.position.x;
    const dz = mob.position.z - player.position.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    const minDist = ZOMBIE.RADIUS + 0.32;
    if (horizDist < minDist && horizDist > 0.0001) {
      const push = (minDist - horizDist);
      mob.position.x += (dx / horizDist) * push;
      mob.position.z += (dz / horizDist) * push;
    }
  }

  for (let i = mobs.length - 1; i >= 0; i--) {
    if (mobs[i].dead) {
      const deadMob = mobs[i];
      hud.showItemPickup('Zombie Slain');
      world.spawnDrop(new THREE.Vector3(deadMob.position.x, deadMob.position.y + 0.5, deadMob.position.z), BLOCK.WOOD);
      deadMob.dispose();
      mobs.splice(i, 1);
    }
  }
}

// ----------------------------------------------------------------------------
// Death / respawn / victory UI wiring
// ----------------------------------------------------------------------------
const respawnBtn = document.getElementById('respawn-btn');
respawnBtn.addEventListener('click', () => {
  player.respawn(world);
  hud.updateHealth(player.health);
  hud.updateHunger(player.hunger);
  hud.hideDeathScreen();
  controls.lock();
});

const playAgainBtn = document.getElementById('playagain-btn');
playAgainBtn.addEventListener('click', () => {
  player.won = false;
  hud.hideVictoryScreen();
  controls.lock();
});

let deathScreenShown = false;

// ----------------------------------------------------------------------------
// Main loop
// ----------------------------------------------------------------------------
const clock = new THREE.Clock();
let autosaveTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  if (controls.isLocked && !player.isDead && !player.won) {
    player.update(dt, input);
    if (mouseLeftDown) handleMineOrAttack();

    updateDayNight(dt);
    trySpawnMob(dt);
    updateMobs(dt);

    world.updateDrops(dt, player.getEyePosition(), (blockId) => {
      inventory[blockId] = (inventory[blockId] || 0) + 1;
      hud.showItemPickup(BLOCK_NAMES[blockId] || 'Block');
    });

    autosaveTimer += dt;
    if (autosaveTimer > 15) {
      autosaveTimer = 0;
      SaveSystem.save({ world, player, inventory, seed, dayTime, cyclesSurvived });
    }
  }

  if (player.isDead && !deathScreenShown) {
    deathScreenShown = true;
    hud.showDeathScreen();
    controls.unlock();
  }
  if (!player.isDead && deathScreenShown) {
    deathScreenShown = false;
  }

  renderer.render(scene, camera);
}

animate();

// Save on page unload as a safety net.
window.addEventListener('beforeunload', () => {
  SaveSystem.save({ world, player, inventory, seed, dayTime, cyclesSurvived });
});
