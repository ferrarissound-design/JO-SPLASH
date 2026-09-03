import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { startStaticServer } from './serve-static.mjs';

const server = await startStaticServer();
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const assertHealthy = async (label) => {
    await page.waitForTimeout(100);
    if (await page.locator('#screen-boot-error').isVisible()) {
      const detail = await page.locator('#boot-error-message').innerText();
      throw new Error(`${label} triggered the boot error screen:\n${detail}\npageErrors=${JSON.stringify(pageErrors)}\nconsoleErrors=${JSON.stringify(consoleErrors)}`);
    }
  };

  await page.addInitScript(() => {
    localStorage.setItem('chromaDuel.profile.v1', JSON.stringify({
      xp: 0,
      tutorialComplete: true,
      bests: {},
    }));
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__game));
  await page.locator('#screen-title').waitFor({ state: 'visible' });
  await assertHealthy('initial boot');
  assert.match(await page.locator('#daily-challenge-board').innerText(), /毎日0:00更新/);

  // Choose a non-default setup so the smoke test also exercises arena rebuilds
  // and the persisted returning-player path.
  await page.locator('[data-stage="vertical"]').click();
  await assertHealthy('stage selection');
  await page.locator('[data-rule="zone"]').click();
  await page.locator('[data-subweapon="mine"]').click();
  await page.locator('[data-special="rain"]').click();
  await page.waitForFunction(() => (
    window.__game.selectedStageId === 'vertical'
    && window.__game.selectedRuleId === 'zone'
    && window.__game.selectedSubWeaponId === 'mine'
    && window.__game.selectedSpecialId === 'rain'
  ));

  // Reload is the important regression check: a finished-feeling game should
  // remember the setup instead of silently returning every option to default.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__game));
  await page.locator('#screen-title').waitFor({ state: 'visible' });
  await assertHealthy('setup restoration');
  await page.waitForFunction(() => (
    window.__game.selectedStageId === 'vertical'
    && window.__game.selectedRuleId === 'zone'
    && window.__game.selectedSubWeaponId === 'mine'
    && window.__game.selectedSpecialId === 'rain'
  ));
  assert.equal(await page.locator('[data-stage="vertical"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-rule="zone"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-subweapon="mine"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-special="rain"]').getAttribute('aria-pressed'), 'true');

  // Exercise the complete playable shell rather than stopping at boot:
  // title -> countdown -> live match -> pause/resume -> result -> rematch.
  await page.locator('#btn-start').click();
  await page.locator('#screen-title').waitFor({ state: 'hidden' });
  await page.locator('#hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.__game.state === 'countdown', null, { timeout: 5000 });

  // Headless WebGL can render the countdown far slower than wall-clock time on
  // shared CI runners. We only need to verify the transition here, not spend
  // real seconds watching 3-2-1, so advance the production countdown handler
  // deterministically once the real Start path has entered COUNTDOWN.
  await page.evaluate(() => {
    window.__game.countdownRemaining = 0;
    window.__game._updateCountdown(0);
  });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 5000 });
  await page.waitForFunction(() => window.__game.player.subWeapon.type === 'mine');
  await page.waitForFunction(() => window.__game.player.special.type === 'rain');

  // Desktop gameplay runs under Pointer Lock, so Escape is the real supported
  // pause/resume path. Clicking the floating touch-friendly II control with a
  // desktop pointer is intentionally not representative while the pointer is locked.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.state === 'paused');
  await page.locator('#screen-pause').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.state === 'playing');
  await page.locator('#screen-pause').waitFor({ state: 'hidden' });

  // Use the production judging transition before accelerating into results so
  // its pointer-lock/audio/UI cleanup also gets exercised.
  await page.evaluate(() => {
    window.__game._beginJudging();
    window.__game._endMatch();
  });
  await page.waitForFunction(() => window.__game.state === 'result');
  await page.locator('#screen-result').waitFor({ state: 'visible' });
  assert.match(await page.locator('#result-loadout').innerText(), /インクマイン/);
  assert.match(await page.locator('#result-loadout').innerText(), /インクレイン/);

  await page.locator('#btn-restart').click();
  await page.locator('#screen-result').waitFor({ state: 'hidden' });
  await page.locator('#hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.__game.selectedStageId === 'vertical');
  await page.waitForFunction(() => window.__game.player.subWeapon.type === 'mine');
  await page.waitForFunction(() => window.__game.player.special.type === 'rain');

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  console.log('Browser smoke test passed.');
} finally {
  await browser.close();
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}
