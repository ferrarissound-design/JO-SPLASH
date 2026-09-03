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
  assert.equal(await page.locator('#screen-boot-error').isVisible(), false, 'boot error screen is visible');
  assert.match(await page.locator('#daily-challenge-board').innerText(), /毎日0:00更新/);

  // Choose a non-default setup so the smoke test also exercises arena rebuilds
  // and the persisted returning-player path.
  await page.locator('[data-stage="vertical"]').click();
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
  // title -> live match -> pause/resume -> result -> rematch.
  await page.locator('#btn-start').click();
  await page.locator('#screen-title').waitFor({ state: 'hidden' });
  await page.locator('#hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 10000 });
  await page.waitForFunction(() => window.__game.player.subWeapon.type === 'mine');
  await page.waitForFunction(() => window.__game.player.special.type === 'rain');

  await page.locator('#btn-pause').click();
  await page.waitForFunction(() => window.__game.state === 'paused');
  await page.locator('#screen-pause').waitFor({ state: 'visible' });
  await page.locator('#btn-resume').click();
  await page.waitForFunction(() => window.__game.state === 'playing');
  await page.locator('#screen-pause').waitFor({ state: 'hidden' });

  await page.evaluate(() => window.__game._endMatch());
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
