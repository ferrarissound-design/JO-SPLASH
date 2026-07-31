// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { TouchControls } from '../src/core/TouchControls.js';

function makeContainer() {
  const container = document.createElement('section');
  container.innerHTML = `
    <div class="touch-joystick-zone"></div>
    <div class="touch-joystick-base"></div>
    <div class="touch-joystick-nub"></div>
    <div class="touch-look-zone"></div>
    <button class="touch-btn-fire"></button>
    <button class="touch-btn-jump"></button>
    <button class="touch-btn-surf"></button>
    <button class="touch-btn-special"></button>
    <button class="touch-btn-bomb"></button>
    <button data-weapon-key="Digit1" data-weapon-type="stream"></button>
  `;
  document.body.append(container);
  return container;
}

describe('TouchControls lifecycle', () => {
  it('removes button listeners and releases held input on dispose', () => {
    class PointerEventShim extends Event {
      constructor(type, init = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      value: PointerEventShim,
    });

    const input = {
      setFireHeld: vi.fn(),
      setVirtualKey: vi.fn(),
      addLookDelta: vi.fn(),
    };
    const container = makeContainer();
    const controls = new TouchControls(input, container);
    const fire = container.querySelector('.touch-btn-fire');

    fire.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true }));
    expect(input.setFireHeld).toHaveBeenLastCalledWith(true);

    controls.dispose();
    input.setFireHeld.mockClear();
    fire.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true }));

    expect(input.setFireHeld).not.toHaveBeenCalled();
    expect(container.classList.contains('hidden')).toBe(true);
    container.remove();
  });
});
