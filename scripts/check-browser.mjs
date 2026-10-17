#!/usr/bin/env node
// Opens the live portal in a real (headless) browser and checks that the
// project cards appear and the page has no script errors.
//
//   node scripts/check-browser.mjs [--url https://…/portal/] [--report file]
//
// GoatCounter is blocked twice over: every request to it is cancelled, and
// GoatCounter's own "skip this browser" setting is switched on. Appends to
// the report file if one is given. Exits 1 if the check fails.
//
// Needs Playwright: `npm install --no-save playwright && npx playwright install chromium`.

import { appendFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagesUrl } from './build-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isCounter = (url) => /^https?:\/\/([^/]+\.)?(goatcounter\.com|zgo\.at)(\/|:|$)/i.test(url);

async function checkOnce(browser, portalUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let blocked = 0;
  await context.route(isCounter, (route) => {
    blocked++;
    return route.abort();
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('skipgc', 't');
    } catch {}
  });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(portalUrl, { waitUntil: 'load', timeout: 45_000 });
    await page.waitForSelector('#index-list .card', { timeout: 20_000 });
    const cards = await page.locator('#index-list .card:not(.end-all)').count();
    if (errors.length) return { ok: false, text: `Browser: script error on the page: ${errors[0]}` };
    return { ok: true, text: `Browser: ${cards} project cards shown (GoatCounter blocked, ${blocked} request(s) stopped)` };
  } catch (err) {
    const status = (await page.locator('#status').textContent().catch(() => '')).trim();
    const why = errors[0] || status || err.message.split('\n')[0];
    return { ok: false, text: `Browser: project cards did not appear (${why})` };
  } finally {
    await context.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? null : argv[i + 1];
  };
  let portalUrl = opt('url');
  if (!portalUrl) {
    const config = JSON.parse(await readFile(resolve(ROOT, 'portal.config.json'), 'utf8'));
    portalUrl = pagesUrl(config.owner, process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'portal');
  }

  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  let result = await checkOnce(browser, portalUrl);
  if (!result.ok) {
    // One more try after a pause, so a brief blip is not reported as an outage.
    await new Promise((r) => setTimeout(r, 30_000));
    result = await checkOnce(browser, portalUrl);
  }
  await browser.close();

  const line = `${result.ok ? '✓' : '✗'} ${result.text}`;
  console.log(line);
  const report = opt('report');
  if (report) await appendFile(resolve(ROOT, report), `${line}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n\`${line}\`\n`);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
