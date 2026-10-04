#!/usr/bin/env node
// Screenshots each project's live site for its card image, and adds
// `thumbnail` to site/data/projects.json. Runs in GitHub Actions after
// build-data.mjs. A site that fails to load just gets no image; this script
// never fails the build.
//
// Needs Playwright: `npm install --no-save playwright && npx playwright install chromium`.
// Locally, NODE_PATH="$(npm root -g)" works with a global install.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = resolve(ROOT, process.argv[2] ?? 'site');
const DATA = resolve(SITE, 'data/projects.json');

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const data = JSON.parse(await readFile(DATA, 'utf8'));
  await mkdir(resolve(SITE, 'thumbs'), { recursive: true });

  const browser = await chromium.launch();
  // 1280x800 layout, saved at 0.6 scale: sharp enough for a card, ~50-100 KB each.
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.6 });
  let ok = 0;
  for (const p of data.projects) {
    if (!p.url) continue;
    const file = `thumbs/${slug(p.name)}.jpg`;
    const page = await context.newPage();
    try {
      await page.goto(p.url, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForTimeout(2_000); // let client-side apps render
      await page.screenshot({ path: resolve(SITE, file), type: 'jpeg', quality: 72 });
      p.thumbnail = file;
      ok++;
      console.log(`  ✓ ${p.name}`);
    } catch (err) {
      console.log(`  ✗ ${p.name}: ${err.message.split('\n')[0]}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
  await writeFile(DATA, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Captured ${ok} of ${data.projects.filter((p) => p.url).length} live sites.`);
}

main().catch((err) => {
  console.log(`Screenshots skipped: ${err.message}`);
});
