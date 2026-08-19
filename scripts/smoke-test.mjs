import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { startStaticServer } from './serve-static.mjs';

const server = await startStaticServer();
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

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

  await page.locator('[data-subweapon="mine"]').click();
  await page.locator('[data-special="rain"]').click();
  assert.equal(await page.locator('[data-subweapon="mine"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-special="rain"]').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => window.__game.selectedSubWeaponId === 'mine');
  await page.waitForFunction(() => window.__game.selectedSpecialId === 'rain');

  await page.locator('#btn-start').click();
  await page.locator('#screen-title').waitFor({ state: 'hidden' });
  await page.locator('#hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.__game.player.subWeapon.type === 'mine');
  await page.waitForFunction(() => window.__game.player.special.type === 'rain');
  assert.deepEqual(pageErrors, []);

  console.log('Browser smoke test passed.');
} finally {
  await browser.close();
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}
