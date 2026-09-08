// ============================================================================
// SaveSystem.js — Serializes modified terrain, player stats/position, and
// inventory/hotbar counts into LocalStorage; restores them on load.
// ============================================================================
import { SAVE_KEY } from '../config.js';

export class SaveSystem {
  static hasSave() {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  static save({ world, player, inventory, seed, dayTime = 0, cyclesSurvived = 0 }) {
    const data = {
      version: 1,
      seed,
      timestamp: Date.now(),
      dayTime,
      cyclesSurvived,
      modifications: world.getModificationsForSave(),
      player: {
        health: player.health,
        hunger: player.hunger,
        position: { x: player.position.x, y: player.position.y, z: player.position.z },
      },
      inventory, // plain object: { [blockId]: count }
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('SaveSystem: failed to write save', err);
      return false;
    }
  }

  static load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error('SaveSystem: failed to parse save', err);
      return null;
    }
  }

  static clear() {
    localStorage.removeItem(SAVE_KEY);
  }
}
