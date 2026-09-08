// ============================================================================
// TerrainGenerator.js — Simplex-noise heightmap terrain generation
// ============================================================================
import { createNoise2D } from 'simplex-noise';
import { BLOCK, WORLD } from '../config.js';

export class TerrainGenerator {
  constructor(seed = Math.random()) {
    // Simple deterministic PRNG seeded so re-generation (after save/load) is stable.
    this._seedState = Math.floor(seed * 2147483647) || 1;
    const rng = () => {
      this._seedState = (this._seedState * 16807) % 2147483647;
      return (this._seedState - 1) / 2147483646;
    };
    this.noise2D = createNoise2D(rng);
    this.noise2DDetail = createNoise2D(rng);
    this.treeNoise = createNoise2D(rng);
  }

  /** Height (integer, >= 1) of the terrain surface at world-space x,z */
  heightAt(x, z) {
    const base = this.noise2D(x * 0.02, z * 0.02) * 6;
    const detail = this.noise2DDetail(x * 0.08, z * 0.08) * 2;
    const h = WORLD.SEA_LEVEL + base + detail;
    return Math.max(2, Math.min(WORLD.HEIGHT - 6, Math.round(h)));
  }

  /** Deterministic pseudo-random in [0,1) for tree placement, based on world coords */
  _treeRand(x, z) {
    const v = this.treeNoise(x * 0.37 + 0.11, z * 0.37 + 0.53);
    return (v + 1) / 2;
  }

  /**
   * Fills a Uint8Array (indexed by x + z*SIZE_X + y*SIZE_X*SIZE_Z) with block ids
   * for the full world: bedrock floor, stone body, dirt/grass surface, and trees.
   */
  generate(blocks, index) {
    const { SIZE_X, SIZE_Z, HEIGHT } = WORLD;
    const heights = new Int32Array(SIZE_X * SIZE_Z);

    for (let x = 0; x < SIZE_X; x++) {
      for (let z = 0; z < SIZE_Z; z++) {
        const h = this.heightAt(x, z);
        heights[x + z * SIZE_X] = h;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y === h) id = BLOCK.GRASS;
          else if (y >= h - 3) id = BLOCK.DIRT;
          else id = BLOCK.STONE;
          blocks[index(x, y, z)] = id;
        }
        for (let y = h + 1; y < HEIGHT; y++) {
          blocks[index(x, y, z)] = BLOCK.AIR;
        }
      }
    }

    // Scatter trees: pick candidate columns away from world edges, avoid clustering.
    for (let x = 3; x < SIZE_X - 3; x++) {
      for (let z = 3; z < SIZE_Z - 3; z++) {
        const h = heights[x + z * SIZE_X];
        const r = this._treeRand(x, z);
        if (r > 0.978) {
          this._placeTree(blocks, index, x, h + 1, z);
        }
      }
    }

    return heights;
  }

  _placeTree(blocks, index, x, y, z) {
    const { SIZE_X, SIZE_Z, HEIGHT } = WORLD;
    const trunkHeight = 4 + (Math.floor(this._treeRand(x + 1, z + 1) * 3));
    if (y + trunkHeight + 3 >= HEIGHT) return;
    // Trunk
    for (let i = 0; i < trunkHeight; i++) {
      blocks[index(x, y + i, z)] = BLOCK.WOOD;
    }
    // Leaf canopy (a small sphere-ish blob at the top of the trunk)
    const topY = y + trunkHeight;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = -2; dy <= 2; dy++) {
          const lx = x + dx, ly = topY + dy, lz = z + dz;
          if (lx < 0 || lx >= SIZE_X || lz < 0 || lz >= SIZE_Z) continue;
          if (ly < 1 || ly >= HEIGHT) continue;
          const dist = Math.sqrt(dx * dx + dy * dy * 1.3 + dz * dz);
          if (dist <= 2.2) {
            const idx = index(lx, ly, lz);
            if (blocks[idx] === BLOCK.AIR) blocks[idx] = BLOCK.LEAVES;
          }
        }
      }
    }
  }
}
