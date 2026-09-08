// ============================================================================
// Player.js — First-person controlled entity: AABB physics, survival stats,
// screen-flash feedback, and melee/mining raycast.
// ============================================================================
import * as THREE from 'three';
import { PHYSICS, PLAYER } from '../config.js';

export class Player {
  constructor(camera, world, hud) {
    this.camera = camera;
    this.world = world;
    this.hud = hud;

    this.position = new THREE.Vector3(WORLDSTART_X(world), 0, WORLDSTART_Z(world));
    this.position.y = world.surfaceHeight(this.position.x, this.position.z) + 2;
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.fallStartY = this.position.y;

    this.health = PLAYER.MAX_HEALTH;
    this.hunger = PLAYER.MAX_HUNGER;
    this.isDead = false;
    this.won = false;

    this._invulnTimer = 0;
    this._attackCooldownTimer = 0;
    this._hungerAccum = 0;

    this._syncCamera();
  }

  _syncCamera() {
    this.camera.position.set(this.position.x, this.position.y + PHYSICS.PLAYER_EYE, this.position.z);
  }

  getEyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + PHYSICS.PLAYER_EYE, this.position.z);
  }

  getForwardVector() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }

  /** Axis-aligned bounding box at a given center-bottom position */
  _boxAt(pos) {
    const r = PHYSICS.PLAYER_RADIUS;
    return {
      minX: pos.x - r, maxX: pos.x + r,
      minY: pos.y, maxY: pos.y + PHYSICS.PLAYER_HEIGHT,
      minZ: pos.z - r, maxZ: pos.z + r,
    };
  }

  _boxCollides(box) {
    const x0 = Math.floor(box.minX), x1 = Math.floor(box.maxX);
    const y0 = Math.floor(box.minY), y1 = Math.floor(box.maxY - 0.001);
    const z0 = Math.floor(box.minZ), z1 = Math.floor(box.maxZ);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  update(dt, input) {
    if (this.isDead) return;

    // --- Timers ---
    if (this._invulnTimer > 0) this._invulnTimer -= dt;
    if (this._attackCooldownTimer > 0) this._attackCooldownTimer -= dt;

    // --- Hunger & regen/starvation ---
    this._hungerAccum += dt;
    this.hunger = Math.max(0, this.hunger - PLAYER.HUNGER_DECAY_PER_SEC * dt);
    if (this.hunger <= 0) {
      this.takeDamage(PLAYER.STARVE_DAMAGE_PER_SEC * dt, 'starvation');
    } else if (this.hunger > PLAYER.MAX_HUNGER * 0.9 && this.health < PLAYER.MAX_HEALTH) {
      this.health = Math.min(PLAYER.MAX_HEALTH, this.health + PLAYER.REGEN_HEALTH_PER_SEC * dt);
    }

    // --- Movement input (camera-relative, horizontal only) ---
    const forward = this.getForwardVector();
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();

    const moveDir = new THREE.Vector3();
    if (input.forward) moveDir.add(forward);
    if (input.backward) moveDir.sub(forward);
    if (input.right) moveDir.add(right);
    if (input.left) moveDir.sub(right);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const speed = input.sprint ? PHYSICS.SPRINT_SPEED : PHYSICS.WALK_SPEED;
    const control = this.onGround ? 1 : PHYSICS.AIR_CONTROL;
    const targetVX = moveDir.x * speed;
    const targetVZ = moveDir.z * speed;
    this.velocity.x += (targetVX - this.velocity.x) * Math.min(1, control * 10 * dt);
    this.velocity.z += (targetVZ - this.velocity.z) * Math.min(1, control * 10 * dt);

    // --- Jump ---
    if (input.jump && this.onGround) {
      this.velocity.y = PHYSICS.JUMP_VELOCITY;
      this.onGround = false;
    }

    // --- Gravity ---
    this.velocity.y += PHYSICS.GRAVITY * dt;
    if (this.velocity.y < PHYSICS.TERMINAL_VELOCITY) this.velocity.y = PHYSICS.TERMINAL_VELOCITY;

    if (!this.onGround && this.velocity.y < 0 && this.fallStartY < this.position.y) {
      this.fallStartY = this.position.y;
    }

    this._moveWithCollision(dt);
    this._syncCamera();
  }

  _moveWithCollision(dt) {
    // --- X axis (with step-up assist) ---
    let dx = this.velocity.x * dt;
    if (dx !== 0) {
      const trial = this.position.clone(); trial.x += dx;
      if (this._boxCollides(this._boxAt(trial))) {
        const stepped = this.position.clone(); stepped.x += dx; stepped.y += PHYSICS.STEP_HEIGHT;
        if (!this._boxCollides(this._boxAt(stepped)) && this._canRestOn(stepped)) {
          this.position.x += dx;
          this.position.y += PHYSICS.STEP_HEIGHT;
          this._settleDown();
        } else {
          this.velocity.x = 0;
        }
      } else {
        this.position.x += dx;
      }
    }

    // --- Z axis (with step-up assist) ---
    let dz = this.velocity.z * dt;
    if (dz !== 0) {
      const trial = this.position.clone(); trial.z += dz;
      if (this._boxCollides(this._boxAt(trial))) {
        const stepped = this.position.clone(); stepped.z += dz; stepped.y += PHYSICS.STEP_HEIGHT;
        if (!this._boxCollides(this._boxAt(stepped)) && this._canRestOn(stepped)) {
          this.position.z += dz;
          this.position.y += PHYSICS.STEP_HEIGHT;
          this._settleDown();
        } else {
          this.velocity.z = 0;
        }
      } else {
        this.position.z += dz;
      }
    }

    // --- Y axis ---
    let dy = this.velocity.y * dt;
    const trialY = this.position.clone(); trialY.y += dy;
    if (this._boxCollides(this._boxAt(trialY))) {
      if (dy < 0) {
        // landed — check fall damage
        const fallDistance = this.fallStartY - this.position.y;
        if (fallDistance > PHYSICS.FALL_DAMAGE_MIN_HEIGHT) {
          const dmg = (fallDistance - PHYSICS.FALL_DAMAGE_MIN_HEIGHT) * PHYSICS.FALL_DAMAGE_PER_BLOCK;
          this.takeDamage(dmg, 'fall');
        }
        this.onGround = true;
        this.fallStartY = this.position.y;
      }
      this.velocity.y = 0;
    } else {
      this.position.y += dy;
      this.onGround = false;
    }

    // world bounds safety net (prevent falling into the void)
    if (this.position.y < -10) {
      this.position.y = this.world.surfaceHeight(this.position.x, this.position.z) + 3;
      this.velocity.set(0, 0, 0);
      this.takeDamage(4, 'void');
    }
  }

  /** After a step-up, snap down onto the surface rather than floating */
  _settleDown() {
    for (let i = 0; i < 20; i++) {
      const below = this.position.clone(); below.y -= 0.05;
      if (this._boxCollides(this._boxAt(below))) break;
      this.position.y -= 0.05;
    }
  }

  _canRestOn(pos) {
    const below = pos.clone(); below.y -= 0.1;
    return this._boxCollides(this._boxAt(below));
  }

  takeDamage(amount, source = 'unknown') {
    if (this.isDead || amount <= 0) return;
    if (this._invulnTimer > 0 && source !== 'starvation' && source !== 'fall') return;
    this.health = Math.max(0, this.health - amount);
    this._invulnTimer = PLAYER.INVULN_TIME;
    if (this.hud) this.hud.flashDamage();
    if (this.hud) this.hud.updateHealth(this.health);
    if (this.health <= 0) this.die();
  }

  feed(amount) {
    this.hunger = Math.min(PLAYER.MAX_HUNGER, this.hunger + amount);
    if (this.hud) this.hud.updateHunger(this.hunger);
  }

  die() {
    this.isDead = true;
    this.health = 0;
  }

  respawn(world) {
    this.isDead = false;
    this.health = PLAYER.MAX_HEALTH;
    this.hunger = PLAYER.MAX_HUNGER;
    this.velocity.set(0, 0, 0);
    this.position.set(WORLDSTART_X(world), 0, WORLDSTART_Z(world));
    this.position.y = world.surfaceHeight(this.position.x, this.position.z) + 2;
    this.fallStartY = this.position.y;
    this._syncCamera();
  }

  canAttack() {
    return this._attackCooldownTimer <= 0;
  }

  triggerAttackCooldown() {
    this._attackCooldownTimer = PLAYER.ATTACK_COOLDOWN;
  }

  /** Raycast from the eye in the look direction, used for both mining and melee. */
  attackRaycast(range = PLAYER.ATTACK_RANGE) {
    return this.world.raycast(this.getEyePosition(), this.getForwardVector(), range);
  }
}

function WORLDSTART_X(world) { return Math.floor(world.sizeX / 2) + 0.5; }
function WORLDSTART_Z(world) { return Math.floor(world.sizeZ / 2) + 0.5; }
