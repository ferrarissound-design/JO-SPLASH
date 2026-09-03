const OPTION_GROUPS = Object.freeze([
  Object.freeze({
    field: 'stageId',
    gameProp: 'selectedStageId',
    selector: '[data-stage]',
    dataKey: 'stage',
    setter: 'setStageId',
  }),
  Object.freeze({
    field: 'ruleId',
    gameProp: 'selectedRuleId',
    selector: '[data-rule]',
    dataKey: 'rule',
    setter: 'setRuleId',
  }),
  Object.freeze({
    field: 'subWeaponId',
    gameProp: 'selectedSubWeaponId',
    selector: '[data-subweapon]',
    dataKey: 'subweapon',
    setter: 'setSubWeaponId',
  }),
  Object.freeze({
    field: 'specialId',
    gameProp: 'selectedSpecialId',
    selector: '[data-special]',
    dataKey: 'special',
    setter: 'setSpecialId',
  }),
]);

/**
 * Restores the player's last title-screen battle setup through the same DOM
 * buttons used by a real click. This deliberately sits outside Game: the
 * existing selection handlers remain the single source of truth for arena
 * rebuilds, rule hints, weapon instances, touch labels and selected styling.
 *
 * Unknown/stale stored IDs self-heal to Game's current validated default.
 * The returned cleanup is mostly useful for tests; production installs this
 * once for the lifetime of the page.
 */
export function installSetupPreferences(game, root = document) {
  if (!game?.settings) return () => {};

  const cleanups = [];

  for (const group of OPTION_GROUPS) {
    const buttons = Array.from(root.querySelectorAll(group.selector));
    if (!buttons.length) continue;

    const persist = (button) => {
      const value = button.dataset[group.dataKey];
      if (!value) return;
      game.settings[group.setter]?.(value);
    };

    for (const button of buttons) {
      const onClick = () => persist(button);
      button.addEventListener('click', onClick);
      cleanups.push(() => button.removeEventListener('click', onClick));
    }

    const requested = game.settings.values[group.field];
    const current = game[group.gameProp];
    const target = buttons.find((button) => button.dataset[group.dataKey] === requested)
      ?? buttons.find((button) => button.dataset[group.dataKey] === current)
      ?? buttons[0];

    // Game registered its own click handlers before this module is attached,
    // so this routes restoration through the exact same validated path as a
    // player click and then our listener persists the canonical value.
    target.click();
  }

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}
