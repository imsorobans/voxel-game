// ============================================================================
// HUD.js — DOM-driven heads-up display: hearts, hunger, hotbar, floating text,
// hit-flash overlays, and death/victory screens.
// ============================================================================
import { PLAYER } from '../config.js';

export class HUD {
  constructor() {
    this.heartsContainer = document.getElementById('hearts-container');
    this.hungerFill = document.getElementById('hunger-bar-fill');
    this.hitFlash = document.getElementById('hit-flash');
    this.floatingLayer = document.getElementById('floating-layer');
    this.hotbarSlots = Array.from(document.querySelectorAll('.hotbar-slot'));
    this.deathScreen = document.getElementById('death-screen');
    this.victoryScreen = document.getElementById('victory-screen');
    this.dayNightLabel = document.getElementById('daynight-label');
    this.viewport = document.getElementById('viewport');

    this._buildHearts();
    this.updateHealth(PLAYER.MAX_HEALTH);
    this.updateHunger(PLAYER.MAX_HUNGER);
  }

  _buildHearts() {
    this.heartsContainer.innerHTML = '';
    this.heartEls = [];
    const totalHearts = PLAYER.MAX_HEALTH / 2;
    for (let i = 0; i < totalHearts; i++) {
      const el = document.createElement('div');
      el.className = 'heart full';
      this.heartsContainer.appendChild(el);
      this.heartEls.push(el);
    }
  }

  updateHealth(health) {
    const clamped = Math.max(0, Math.min(PLAYER.MAX_HEALTH, health));
    for (let i = 0; i < this.heartEls.length; i++) {
      const heartValue = clamped - i * 2;
      const el = this.heartEls[i];
      el.classList.remove('full', 'half', 'empty');
      if (heartValue >= 2) el.classList.add('full');
      else if (heartValue >= 1) el.classList.add('half');
      else el.classList.add('empty');
    }
  }

  updateHunger(hunger) {
    const pct = Math.max(0, Math.min(100, (hunger / PLAYER.MAX_HUNGER) * 100));
    this.hungerFill.style.width = `${pct}%`;
    this.hungerFill.classList.toggle('low', pct < 25);
  }

  setActiveSlot(slotIndex) {
    this.hotbarSlots.forEach((el, i) => {
      el.classList.toggle('active', i === slotIndex);
    });
  }

  flashDamage() {
    this.hitFlash.classList.remove('flash-active');
    // force reflow so the animation can restart if triggered rapidly
    void this.hitFlash.offsetWidth;
    this.hitFlash.classList.add('flash-active');
    this.screenShake(this.viewport);
  }

  screenShake(container) {
    if (!container) return;
    container.classList.remove('shake-active');
    void container.offsetWidth;
    container.classList.add('shake-active');
  }

  /** Floating combat text, e.g. "-4" over a hit mob, rises and fades. */
  showFloatingDamage(amount, colorClass = 'dmg-red') {
    const el = document.createElement('div');
    el.className = `floating-text ${colorClass}`;
    el.textContent = `-${Math.round(amount)}`;
    el.style.left = `${48 + (Math.random() * 10 - 5)}%`;
    el.style.top = `${42 + (Math.random() * 6 - 3)}%`;
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /** Floating item pickup popup, e.g. "+1 Grass" */
  showItemPickup(label) {
    const el = document.createElement('div');
    el.className = 'floating-text pickup';
    el.textContent = `+1 ${label}`;
    el.style.left = '50%';
    el.style.top = '70%';
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  setDayNightLabel(text) {
    if (this.dayNightLabel) this.dayNightLabel.textContent = text;
  }

  showDeathScreen() {
    this.deathScreen.classList.add('visible');
  }

  hideDeathScreen() {
    this.deathScreen.classList.remove('visible');
  }

  showVictoryScreen() {
    this.victoryScreen.classList.add('visible');
  }

  hideVictoryScreen() {
    this.victoryScreen.classList.remove('visible');
  }
}
