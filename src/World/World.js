// ============================================================================
// World.js — Voxel data storage, face-culled mesh rendering, editing, raycast,
// and item-drop management.
// ============================================================================
import * as THREE from 'three';
import { BLOCK, BLOCK_COLOR, WORLD, ITEM, MINABLE } from '../config.js';
import { TerrainGenerator } from './TerrainGenerator.js';

// Cube face definitions: [normal, 4 corner offsets (relative to block min-corner)]
const FACES = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },   // +X
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },  // -X
  { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },   // +Y
  { dir: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },  // -Y
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },   // +Z
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },  // -Z
];
// Simple per-face shading so cubes read as 3D without textures.
const FACE_SHADE = [0.82, 0.82, 1.0, 0.55, 0.9, 0.7];

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.terrain = new TerrainGenerator(seed);
    this.sizeX = WORLD.SIZE_X;
    this.sizeY = WORLD.HEIGHT;
    this.sizeZ = WORLD.SIZE_Z;
    this.blocks = new Uint8Array(this.sizeX * this.sizeY * this.sizeZ);
    this.modifications = new Map(); // idx -> blockId, for save-diffing
    this.meshGroup = new THREE.Group();
    this.meshGroup.name = 'terrain';
    this.scene.add(this.meshGroup);
    this._materialCache = new Map();

    this.drops = []; // { mesh, blockId, spawnTime, velocityY }
    this.dropGroup = new THREE.Group();
    this.scene.add(this.dropGroup);

    this.terrain.generate(this.blocks, (x, y, z) => this.index(x, y, z));
  }

  index(x, y, z) {
    return x + z * this.sizeX + y * this.sizeX * this.sizeZ;
  }

  inBounds(x, y, z) {
    return x >= 0 && x < this.sizeX && y >= 0 && y < this.sizeY && z >= 0 && z < this.sizeZ;
  }

  getBlock(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (!this.inBounds(x, y, z)) return BLOCK.AIR;
    return this.blocks[this.index(x, y, z)];
  }

  isSolid(x, y, z) {
    return this.getBlock(x, y, z) !== BLOCK.AIR;
  }

  setBlock(x, y, z, id, recordModification = true) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (!this.inBounds(x, y, z)) return;
    const idx = this.index(x, y, z);
    this.blocks[idx] = id;
    if (recordModification) this.modifications.set(idx, id);
  }

  /** Height of the topmost solid block below (or at) the given y at column x,z */
  surfaceHeight(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    for (let y = this.sizeY - 1; y >= 0; y--) {
      if (this.isSolid(x, y, z)) return y;
    }
    return 0;
  }

  // -------------------------------------------------------------------
  // Mesh building — merges all exposed faces of each block type into a
  // single BufferGeometry per material (huge draw-call reduction vs.
  // one mesh per cube).
  // -------------------------------------------------------------------
  buildMesh() {
    // Clear previous meshes
    for (const child of [...this.meshGroup.children]) {
      child.geometry.dispose();
      this.meshGroup.remove(child);
    }

    const buffers = new Map(); // blockId -> { pos:[], normal:[], color:[] }
    const getBuf = (id) => {
      if (!buffers.has(id)) buffers.set(id, { pos: [], normal: [], color: [] });
      return buffers.get(id);
    };

    for (let x = 0; x < this.sizeX; x++) {
      for (let y = 0; y < this.sizeY; y++) {
        for (let z = 0; z < this.sizeZ; z++) {
          const id = this.getBlock(x, y, z);
          if (id === BLOCK.AIR) continue;
          const buf = getBuf(id);
          const baseColor = new THREE.Color(BLOCK_COLOR[id] || 0xffffff);

          for (let f = 0; f < FACES.length; f++) {
            const face = FACES[f];
            const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
            const neighborSolid = this.inBounds(nx, ny, nz) ? this.isSolid(nx, ny, nz) : false;
            if (neighborSolid) continue; // culled — hidden face

            const shade = FACE_SHADE[f];
            const c0 = face.corners[0], c1 = face.corners[1], c2 = face.corners[2], c3 = face.corners[3];
            // Two triangles: c0,c1,c2 and c0,c2,c3
            const push = (c) => {
              buf.pos.push(x + c[0], y + c[1], z + c[2]);
              buf.normal.push(face.dir[0], face.dir[1], face.dir[2]);
              buf.color.push(baseColor.r * shade, baseColor.g * shade, baseColor.b * shade);
            };
            push(c0); push(c1); push(c2);
            push(c0); push(c2); push(c3);
          }
        }
      }
    }

    for (const [id, buf] of buffers.entries()) {
      if (buf.pos.length === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normal, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(buf.color, 3));
      const material = this._getMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.blockId = id;
      this.meshGroup.add(mesh);
    }
  }

  _getMaterial() {
    if (!this._sharedMaterial) {
      this._sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    }
    return this._sharedMaterial;
  }

  // -------------------------------------------------------------------
  // Voxel DDA raycast — returns the first solid block hit, plus the
  // empty-space cell immediately before it (used for block placement).
  // -------------------------------------------------------------------
  raycast(origin, direction, maxDist = 6) {
    const pos = origin.clone();
    const dir = direction.clone().normalize();
    const step = 0.05;
    let prevCell = null;
    for (let t = 0; t < maxDist; t += step) {
      const p = pos.clone().addScaledVector(dir, t);
      const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
      if (this.isSolid(bx, by, bz)) {
        return {
          hit: true,
          blockId: this.getBlock(bx, by, bz),
          x: bx, y: by, z: bz,
          placeAt: prevCell,
          point: p,
        };
      }
      prevCell = { x: bx, y: by, z: bz };
    }
    return { hit: false };
  }

  // -------------------------------------------------------------------
  // Editing helpers used by the game loop
  // -------------------------------------------------------------------
  breakBlock(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id === BLOCK.AIR || id === BLOCK.BEDROCK) return null;
    this.setBlock(x, y, z, BLOCK.AIR);
    this.buildMesh();
    if (MINABLE.has(id)) {
      this.spawnDrop(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), id);
    }
    return id;
  }

  placeBlock(x, y, z, blockId) {
    if (this.isSolid(x, y, z)) return false;
    this.setBlock(x, y, z, blockId);
    this.buildMesh();
    return true;
  }

  // -------------------------------------------------------------------
  // Item drops — small floating/spinning cubes that can be picked up.
  // -------------------------------------------------------------------
  spawnDrop(position, blockId) {
    const geo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    const mat = new THREE.MeshLambertMaterial({ color: BLOCK_COLOR[blockId] || 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.castShadow = true;
    this.dropGroup.add(mesh);
    this.drops.push({
      mesh,
      blockId,
      spawnTime: performance.now() / 1000,
      baseY: position.y,
      velocityY: 3.0,
      settled: false,
    });
  }

  /** Updates drop physics/animation and returns array of {blockId} picked up this frame */
  updateDrops(dt, playerPosition, onPickup) {
    const now = performance.now() / 1000;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      // simple gravity + floor settle
      if (!d.settled) {
        d.velocityY += -20 * dt;
        d.mesh.position.y += d.velocityY * dt;
        const floorY = this.surfaceHeight(d.mesh.position.x, d.mesh.position.z) + 1 + 0.16;
        if (d.mesh.position.y <= floorY) {
          d.mesh.position.y = floorY;
          d.velocityY = 0;
          d.settled = true;
          d.baseY = floorY;
        }
      } else {
        d.mesh.position.y = d.baseY + Math.sin(now * ITEM.BOB_SPEED + i) * 0.08;
      }
      d.mesh.rotation.y += ITEM.SPIN_SPEED * dt;

      // expire
      if (now - d.spawnTime > ITEM.DROP_LIFETIME_SEC) {
        this.dropGroup.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.drops.splice(i, 1);
        continue;
      }

      // pickup check
      const dist = d.mesh.position.distanceTo(playerPosition);
      if (dist <= ITEM.PICKUP_RANGE) {
        this.dropGroup.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.drops.splice(i, 1);
        if (onPickup) onPickup(d.blockId);
      }
    }
  }

  // -------------------------------------------------------------------
  // Save/Load support
  // -------------------------------------------------------------------
  getModificationsForSave() {
    const arr = [];
    for (const [idx, id] of this.modifications.entries()) arr.push([idx, id]);
    return arr;
  }

  applyModifications(arr) {
    for (const [idx, id] of arr) {
      this.blocks[idx] = id;
      this.modifications.set(idx, id);
    }
    this.buildMesh();
  }
}
