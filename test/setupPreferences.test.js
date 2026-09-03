// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installSetupPreferences } from '../src/core/SetupPreferences.js';

function makeGame(saved = {}) {
  document.body.innerHTML = `
    <button data-stage="harbor"></button><button data-stage="vertical"></button>
    <button data-rule="turf"></button><button data-rule="zone"></button><button data-rule="ko"></button>
    <button data-subweapon="bomb"></button><button data-subweapon="mine"></button><button data-subweapon="wall"></button>
    <button data-special="burst"></button><button data-special="rain"></button><button data-special="shield"></button>
  `;

  const values = {
    stageId: 'harbor',
    ruleId: 'turf',
    subWeaponId: 'bomb',
    specialId: 'burst',
    ...saved,
  };
  const settings = { values };
  for (const [field, setter] of [
    ['stageId', 'setStageId'],
    ['ruleId', 'setRuleId'],
    ['subWeaponId', 'setSubWeaponId'],
    ['specialId', 'setSpecialId'],
  ]) {
    settings[setter] = vi.fn((value) => { values[field] = value; });
  }

  const game = {
    settings,
    selectedStageId: 'harbor',
    selectedRuleId: 'turf',
    selectedSubWeaponId: 'bomb',
    selectedSpecialId: 'burst',
  };

  for (const [selector, dataKey, prop] of [
    ['[data-stage]', 'stage', 'selectedStageId'],
    ['[data-rule]', 'rule', 'selectedRuleId'],
    ['[data-subweapon]', 'subweapon', 'selectedSubWeaponId'],
    ['[data-special]', 'special', 'selectedSpecialId'],
  ]) {
    for (const button of document.querySelectorAll(selector)) {
      button.addEventListener('click', () => { game[prop] = button.dataset[dataKey]; });
    }
  }

  return game;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('installSetupPreferences', () => {
  it('restores every saved title-screen option through the existing click path', () => {
    const game = makeGame({
      stageId: 'vertical',
      ruleId: 'zone',
      subWeaponId: 'mine',
      specialId: 'rain',
    });

    installSetupPreferences(game);

    expect(game.selectedStageId).toBe('vertical');
    expect(game.selectedRuleId).toBe('zone');
    expect(game.selectedSubWeaponId).toBe('mine');
    expect(game.selectedSpecialId).toBe('rain');
    expect(game.settings.setStageId).toHaveBeenLastCalledWith('vertical');
    expect(game.settings.setRuleId).toHaveBeenLastCalledWith('zone');
    expect(game.settings.setSubWeaponId).toHaveBeenLastCalledWith('mine');
    expect(game.settings.setSpecialId).toHaveBeenLastCalledWith('rain');
  });

  it('self-heals stale IDs to the Game defaults and keeps saving later clicks', () => {
    const game = makeGame({
      stageId: 'deleted-stage',
      ruleId: 'deleted-rule',
      subWeaponId: 'deleted-sub',
      specialId: 'deleted-special',
    });

    installSetupPreferences(game);

    expect(game.selectedStageId).toBe('harbor');
    expect(game.selectedRuleId).toBe('turf');
    expect(game.selectedSubWeaponId).toBe('bomb');
    expect(game.selectedSpecialId).toBe('burst');
    expect(game.settings.values).toMatchObject({
      stageId: 'harbor',
      ruleId: 'turf',
      subWeaponId: 'bomb',
      specialId: 'burst',
    });

    document.querySelector('[data-special="shield"]').click();
    expect(game.selectedSpecialId).toBe('shield');
    expect(game.settings.setSpecialId).toHaveBeenLastCalledWith('shield');
  });
});
