// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { calculateRelativeDirectionAngle } from '../src/core/Game.js';
import { UIManager } from '../src/ui/UIManager.js';

describe('calculateRelativeDirectionAngle', () => {
  const origin = { x: 0, z: 0 };
  const forward = { x: 0, z: -1 };
  const right = { x: 1, z: 0 };

  it('maps world directions into camera-relative screen bearings', () => {
    expect(calculateRelativeDirectionAngle(origin, { x: 0, z: -5 }, forward, right)).toBeCloseTo(0);
    expect(calculateRelativeDirectionAngle(origin, { x: 5, z: 0 }, forward, right)).toBeCloseTo(Math.PI / 2);
    expect(calculateRelativeDirectionAngle(origin, { x: 0, z: 5 }, forward, right)).toBeCloseTo(Math.PI);
    expect(calculateRelativeDirectionAngle(origin, { x: -5, z: 0 }, forward, right)).toBeCloseTo(-Math.PI / 2);
  });

  it('returns a stable forward bearing when source and target overlap', () => {
    expect(calculateRelativeDirectionAngle(origin, origin, forward, right)).toBe(0);
  });
});

describe('UIManager damage direction lifecycle', () => {
  it('shows, rotates, emphasizes lethal hits, and expires the indicator', () => {
    const ui = Object.create(UIManager.prototype);
    ui.el = { damageDirection: document.createElement('div') };
    ui.el.damageDirection.classList.add('hidden');
    ui._damageDirectionTimer = 0;

    ui.showDamageDirection(Math.PI / 2, true);
    expect(ui.el.damageDirection.classList.contains('hidden')).toBe(false);
    expect(ui.el.damageDirection.classList.contains('pulse')).toBe(true);
    expect(ui.el.damageDirection.classList.contains('lethal')).toBe(true);
    expect(ui.el.damageDirection.style.getPropertyValue('--damage-angle')).toBe(`${Math.PI / 2}rad`);

    ui.tickDamageDirection(0.8);
    expect(ui.el.damageDirection.classList.contains('hidden')).toBe(false);
    ui.tickDamageDirection(0.3);
    expect(ui.el.damageDirection.classList.contains('hidden')).toBe(true);
    expect(ui.el.damageDirection.classList.contains('pulse')).toBe(false);
  });

  it('ignores invalid direction values', () => {
    const ui = Object.create(UIManager.prototype);
    ui.el = { damageDirection: document.createElement('div') };
    ui.el.damageDirection.classList.add('hidden');
    ui.showDamageDirection(Number.NaN);
    expect(ui.el.damageDirection.classList.contains('hidden')).toBe(true);
  });
});
