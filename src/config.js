// ============================================================================
// config.js — Global game constants
// ============================================================================

// ---- Block IDs ----
export const BLOCK = {
  AIR: 0,
  DIRT: 1,
  GRASS: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  BEDROCK: 6,
  SAND: 7,
};

// Colors used to build voxel face materials (no textures needed — flat shaded).
export const BLOCK_COLOR = {
  [BLOCK.DIRT]: 0x6b4a2f,
  [BLOCK.GRASS]: 0x4c9a3a,
  [BLOCK.STONE]: 0x8a8a8a,
  [BLOCK.WOOD]: 0x5b3a22,
  [BLOCK.LEAVES]: 0x2f7a2f,
  [BLOCK.BEDROCK]: 0x2b2b2b,
  [BLOCK.SAND]: 0xd8c98a,
};

// Which blocks the player can mine and pick up (drops itself).
export const MINABLE = new Set([
  BLOCK.DIRT, BLOCK.GRASS, BLOCK.STONE, BLOCK.WOOD, BLOCK.LEAVES, BLOCK.SAND,
]);

// Hotbar: ordered list of placeable block ids for slots 1-9.
export const HOTBAR_BLOCKS = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.WOOD, BLOCK.LEAVES,
  BLOCK.SAND, BLOCK.STONE, BLOCK.WOOD, BLOCK.DIRT,
];

// ---- World dimensions ----
export const WORLD = {
  SIZE_X: 48,
  SIZE_Z: 48,
  HEIGHT: 32,
  SEA_LEVEL: 9,
  CHUNK_REBUILD_MS: 0, // rebuild mesh immediately on edit
};

// ---- Physics ----
export const PHYSICS = {
  GRAVITY: -28,
  JUMP_VELOCITY: 9.2,
  WALK_SPEED: 4.6,
  SPRINT_SPEED: 7.2,
  AIR_CONTROL: 0.5,
  PLAYER_HEIGHT: 1.8,
  PLAYER_EYE: 1.62,
  PLAYER_RADIUS: 0.32,
  STEP_HEIGHT: 1.05, // allows stepping up 1 block
  TERMINAL_VELOCITY: -50,
  FALL_DAMAGE_MIN_HEIGHT: 4, // blocks fallen before damage starts
  FALL_DAMAGE_PER_BLOCK: 2,
};

// ---- Player stats ----
export const PLAYER = {
  MAX_HEALTH: 20, // 10 hearts
  MAX_HUNGER: 20,
  HUNGER_DECAY_PER_SEC: 0.02,
  STARVE_DAMAGE_PER_SEC: 0.5,
  REGEN_HEALTH_PER_SEC: 0.25, // only when hunger is high
  ATTACK_DAMAGE: 4,
  ATTACK_RANGE: 4.2,
  ATTACK_COOLDOWN: 0.35,
  INVULN_TIME: 0.5,
};

// ---- Mob specs ----
export const ZOMBIE = {
  MAX_HEALTH: 20,
  SPEED: 2.2,
  ATTACK_DAMAGE: 2,
  ATTACK_RANGE: 1.5,
  ATTACK_COOLDOWN: 1.0,
  VISION_RANGE: 16,
  KNOCKBACK: 6,
  HEIGHT: 1.95,
  RADIUS: 0.3,
  SPAWN_MIN_DIST: 14,
  SPAWN_MAX_DIST: 26,
  MAX_ACTIVE: 8,
  SPAWN_INTERVAL_SEC: 5,
};

// ---- Day / Night cycle ----
export const DAY_CYCLE = {
  DAY_LENGTH_SEC: 240, // full day+night cycle
  NIGHT_START: 0.5,    // fraction of cycle when night begins
  NIGHT_END: 0.95,     // fraction of cycle when night ends
};

// ---- Item drop ----
export const ITEM = {
  DROP_LIFETIME_SEC: 90,
  PICKUP_RANGE: 1.4,
  BOB_SPEED: 2.4,
  SPIN_SPEED: 1.2,
};

// ---- Save ----
export const SAVE_KEY = 'voxel_survival_save_v1';
