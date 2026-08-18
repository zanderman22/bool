// Browser smoke test: loads the game in a real browser at a phone viewport,
// plays actual swipes, and captures screenshots. Catches the whole class of
// failures the headless suite cannot see -- module errors, canvas problems,
// layout collapse, an unresponsive input path.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const TARGET = process.env.URL || 'http://localhost:8080/';
const OUT = new URL('../shots/', import.meta.url).pathname;

const errors = [];

async function swipe(page, from, to, steps = 24) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
}

const state = (page) => page.evaluate(() => ({
  phase: window.__bool?.match?.phase,
  current: window.__bool?.match?.current,
  shotsLeft: window.__bool?.match?.shotsLeft,
  balls: window.__bool?.match?.world.balls.length,
  scores: window.__bool?.match?.scores,
  log: window.__bool?.match?.log.length,
}));

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The favicon request is noise, not a failure.
    if (/favicon/.test(m.location()?.url || '') || /favicon/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });
  page.on('requestfailed', (r) => {
    if (!/favicon/.test(r.url())) errors.push('request failed: ' + r.url());
  });

  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '1-setup.png' });

  // Start a two-player match.
  await page.fill('#name1', 'Dorian');
  await page.click('#btnLocal');
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '2-level-1.png' });

  let s = await state(page);
  if (s.phase !== 'aiming') errors.push(`expected aiming after start, got ${s.phase}`);
  if (s.balls !== 1) errors.push(`expected only the jack on the pitch, found ${s.balls}`);

  // Mid-swipe, to capture the aim preview.
  const cx = 195, cy = 700;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(cx + i * 2, cy + i * 7); await page.waitForTimeout(10); }
  await page.waitForTimeout(120);
  await page.screenshot({ path: OUT + '3-aiming.png' });
  await page.mouse.up();

  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '4-rolling.png' });

  // Wait for the throw to settle.
  await page.waitForFunction(() => window.__bool?.match?.phase !== 'simulating', null, { timeout: 15000 })
    .catch(() => errors.push('shot never settled'));

  s = await state(page);
  if (s.log !== 1) errors.push(`expected 1 logged shot, got ${s.log}`);
  if (s.balls !== 2) errors.push(`expected jack + 1 boule, got ${s.balls}`);

  // Play out the remaining five throws.
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction(() => window.__bool?.match?.phase === 'aiming', null, { timeout: 15000 })
      .catch(() => {});
    if ((await state(page)).phase !== 'aiming') break;
    const jitter = (i - 2) * 9;
    await swipe(page, { x: cx + jitter, y: cy }, { x: cx + jitter - 6, y: cy + 150 });
    await page.waitForFunction(() => window.__bool?.match?.phase !== 'simulating', null, { timeout: 15000 })
      .catch(() => errors.push(`throw ${i + 2} never settled`));
    await page.waitForTimeout(150);
  }

  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + '5-end-result.png' });

  s = await state(page);
  if (s.log !== 6) errors.push(`expected 6 shots logged, got ${s.log}`);
  const endVisible = await page.isVisible('#screen-endover');
  if (!endVisible) errors.push('end-of-end screen did not appear after six throws');

  // Next level.
  if (endVisible) {
    await page.click('#btnNext');
    await page.waitForTimeout(700);
    await page.screenshot({ path: OUT + '6-level-2.png' });
  }

  // Landscape, to confirm the pitch reflows rather than the round restarting.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '7-landscape.png' });

  // Solo mode, for the scoring ring. Reload rather than trying to click back
  // through whatever screen the match happens to be on.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.click('#btnSolo');
  await page.waitForTimeout(700);
  const soloMode = await page.evaluate(() => window.__bool?.match?.mode);
  if (soloMode !== 'solo') errors.push(`solo button did not start a solo match (mode=${soloMode})`);
  const oppHidden = await page.isHidden('#side2');
  if (!oppHidden) errors.push('opponent panel still visible in solo mode');
  await page.screenshot({ path: OUT + '8-solo.png' });

  await browser.close();

  console.log('\n  Browser smoke test');
  console.log('  ' + '-'.repeat(56));
  if (errors.length === 0) console.log('  \x1b[32m✓\x1b[0m no errors — screenshots written to shots/');
  else for (const e of errors) console.log('  \x1b[31m✗\x1b[0m ' + e);
  console.log();
  process.exit(errors.length ? 1 : 0);
};

run();
