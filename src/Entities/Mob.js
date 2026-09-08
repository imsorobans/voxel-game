// ============================================================================
// Mob.js — Hostile Zombie entity: voxel mesh, AI state machine, pathing.
// States: IDLE -> PURSUE -> ATTACK, with a TAKE_DAMAGE/flinch overlay.
// ============================================================================
import * as THREE from 'three';
import { ZOMBIE, PHYSICS } from '../config.js';

const STATE = {
  IDLE: 'IDLE',
  PURSUE: 'PURSUE',
  ATTACK: 'ATTACK',
};

let MOB_ID_COUNTER = 1;

export class Mob {
  constructor(scene, world, position) {
    this.id = MOB_ID_COUNTER++;
    this.scene = scene;
    this.world = world;

    this.health = ZOMBIE.MAX_HEALTH;
    this.state = STATE.IDLE;
    this.dead = false;
    this.markedForRemoval = false;

    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.facingAngle = 0;

    this._attackTimer = 0;
    this._flinchTimer = 0;
    this._hopCooldown = 0;
    this._walkCycle = 0;

    this._buildMesh();
    this.scene.add(this.mesh);
    this._updateMeshTransform();
  }

  _buildMesh() {
    const skin = new THREE.MeshLambertMaterial({ color: 0x3b6b3b });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x2e4d8a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x25314f });

    this.mesh = new THREE.Group();

    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    this.head.position.set(0, 1.55, 0);
    this.head.castShadow = true;
    this.mesh.add(this.head);

    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
    this.body.position.set(0, 1.02, 0);
    this.body.castShadow = true;
    this.mesh.add(this.body);

    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.2), skin);
    this.armL.position.set(-0.38, 1.05, 0);
    this.armL.castShadow = true;
    this.mesh.add(this.armL);

    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.2), skin);
    this.armR.position.set(0.38, 1.05, 0);
    this.armR.castShadow = true;
    this.mesh.add(this.armR);

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), pants);
    this.legL.position.set(-0.14, 0.36, 0);
    this.legL.castShadow = true;
    this.mesh.add(this.legL);

    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), pants);
    this.legR.position.set(0.14, 0.36, 0);
    this.legR.castShadow = true;
    this.mesh.add(this.legR);

    this._allParts = [this.head, this.body, this.armL, this.armR, this.legL, this.legR];
    this._allMaterials = [skin, shirt, pants];
  }

  _updateMeshTransform() {
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    this.mesh.rotation.y = this.facingAngle;
  }

  _boxAt(pos) {
    const r = ZOMBIE.RADIUS;
    return {
      minX: pos.x - r, maxX: pos.x + r,
      minY: pos.y, maxY: pos.y + ZOMBIE.HEIGHT,
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

  /**
   * @param dt delta seconds
   * @param playerPosition THREE.Vector3 (feet position of player)
   * @param onAttackPlayer callback(damage) invoked when zombie lands a hit
   */
  update(dt, playerPosition, onAttackPlayer) {
    if (this.dead) return;

    if (this._flinchTimer > 0) {
      this._flinchTimer -= dt;
      const flash = Math.max(0, Math.sin(this._flinchTimer * 40));
      for (const part of this._allParts) {
        part.material.emissive = new THREE.Color(flash * 0.8, 0, 0);
      }
    } else {
      for (const part of this._allParts) {
        if (part.material.emissive && part.material.emissive.r !== 0) {
          part.material.emissive.set(0, 0, 0);
        }
      }
    }
    if (this._attackTimer > 0) this._attackTimer -= dt;
    if (this._hopCooldown > 0) this._hopCooldown -= dt;

    const toPlayer = new THREE.Vector3().subVectors(playerPosition, this.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    // --- AI State transitions ---
    if (dist <= ZOMBIE.ATTACK_RANGE) {
      this.state = STATE.ATTACK;
    } else if (dist <= ZOMBIE.VISION_RANGE) {
      this.state = STATE.PURSUE;
    } else {
      this.state = STATE.IDLE;
    }

    let moveDir = new THREE.Vector3();
    if (this.state === STATE.PURSUE || this.state === STATE.ATTACK) {
      if (dist > 0.001) {
        moveDir = toPlayer.clone().normalize();
        this.facingAngle = Math.atan2(moveDir.x, moveDir.z);
      }
    }

    if (this.state === STATE.ATTACK) {
      // Stop closing distance fully; attack on cooldown.
      if (this._attackTimer <= 0) {
        onAttackPlayer(ZOMBIE.ATTACK_DAMAGE);
        this._attackTimer = ZOMBIE.ATTACK_COOLDOWN;
      }
      moveDir.multiplyScalar(0.15); // small shuffle instead of full speed
    }

    // --- Horizontal movement + obstacle hop ---
    const speed = ZOMBIE.SPEED;
    const dx = moveDir.x * speed * dt;
    const dz = moveDir.z * speed * dt;

    if (dx !== 0 || dz !== 0) {
      const trial = this.position.clone(); trial.x += dx; trial.z += dz;
      if (this._boxCollides(this._boxAt(trial))) {
        // try hopping over a 1-block obstacle
        const hopTrial = trial.clone(); hopTrial.y += PHYSICS.STEP_HEIGHT;
        if (!this._boxCollides(this._boxAt(hopTrial))) {
          this.position.x += dx;
          this.position.z += dz;
          if (this.onGround && this._hopCooldown <= 0) {
            this.velocity.y = PHYSICS.JUMP_VELOCITY * 0.7;
            this.onGround = false;
            this._hopCooldown = 0.4;
          }
        }
        // else: fully blocked, stay put this frame
      } else {
        this.position.x += dx;
        this.position.z += dz;
      }
      this._walkCycle += dt * 10;
    } else {
      this._walkCycle *= 0.8;
    }

    // --- Gravity & vertical collision ---
    this.velocity.y += PHYSICS.GRAVITY * dt;
    if (this.velocity.y < PHYSICS.TERMINAL_VELOCITY) this.velocity.y = PHYSICS.TERMINAL_VELOCITY;
    const dy = this.velocity.y * dt;
    const trialY = this.position.clone(); trialY.y += dy;
    if (this._boxCollides(this._boxAt(trialY))) {
      if (dy < 0) this.onGround = true;
      this.velocity.y = 0;
    } else {
      this.position.y += dy;
      this.onGround = false;
    }

    // knockback friction
    this.velocity.x *= 0.85;
    this.velocity.z *= 0.85;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // --- Walk animation ---
    const swing = Math.sin(this._walkCycle) * 0.6;
    this.armL.rotation.x = swing;
    this.armR.rotation.x = -swing;
    this.legL.rotation.x = -swing;
    this.legR.rotation.x = swing;

    this._updateMeshTransform();

    if (this.position.y < -20) this.dead = true; // fell into the void
  }

  takeDamage(amount, knockbackDir) {
    if (this.dead) return;
    this.health -= amount;
    this._flinchTimer = 0.25;
    if (knockbackDir) {
      this.velocity.x += knockbackDir.x * ZOMBIE.KNOCKBACK;
      this.velocity.z += knockbackDir.z * ZOMBIE.KNOCKBACK;
      this.velocity.y = 3.5;
      this.onGround = false;
    }
    if (this.health <= 0) {
      this.dead = true;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    for (const part of this._allParts) part.geometry.dispose();
    for (const mat of this._allMaterials) mat.dispose();
  }
}
