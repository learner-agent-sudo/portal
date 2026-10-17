#!/usr/bin/env node
// Checks that the live portal works: the page, its project list (and that
// the daily rebuild is still running), and every project's live link.
//
//   node scripts/check-site.mjs                        # checks the live portal
//   node scripts/check-site.mjs --url http://localhost:8000/ --report out.txt
//
// Plain HTTP requests only. No JavaScript runs, so GoatCounter never sees
// these requests and visit counts are not affected. Exits 1 if a check fails.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pagesUrl } from './build-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'portal-site-check (+https://github.com/learner-agent-sudo/portal)';
const NETWORK_ERRORS = {
  ENOTFOUND: 'address not found',
  ECONNREFUSED: 'connection refused',
  ECONNRESET: 'connection dropped',
  UND_ERR_SOCKET: 'connection dropped',
  CERT_HAS_EXPIRED: 'certificate expired',
  ERR_TLS_CERT_ALTNAME_INVALID: 'certificate is for another address',
};

/** GETs a URL and reports whether it answered with a non-error status. */
export async function probe(url, { timeoutMs = 20_000 } = {}) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': UA },
    });
    const body = await res.text();
    return { ok: res.status < 400, status: `HTTP ${res.status}`, body };
  } catch (err) {
    const code = err.cause?.code;
    const why = err.name === 'TimeoutError' ? 'no answer in time' : (NETWORK_ERRORS[code] ?? code ?? err.cause?.message ?? err.message);
    return { ok: false, status: why, body: '' };
  }
}

/** "3 h ago" style age of an ISO date, and whether it is older than maxHours. */
export function freshness(iso, now, maxHours) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { ok: false, text: 'has no valid rebuild date' };
  const hours = Math.max(0, Math.round((now - t) / 3_600_000));
  return { ok: hours <= maxHours, text: `rebuilt ${hours} h ago` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Probes once, and once more after a pause if it fails, so a brief blip is not
// reported as an outage.
async function probeTwice(url, retryDelayMs) {
  const first = await probe(url);
  if (first.ok) return first;
  await sleep(retryDelayMs);
  return probe(url);
}

/** Runs every check. Returns { ok, lines } where lines read as a short report. */
export async function runChecks({ portalUrl, now = Date.now(), maxAgeHours = 48, retryDelayMs = 30_000 }) {
  const lines = [];
  let ok = true;
  const pass = (text) => lines.push(`✓ ${text}`);
  const fail = (text) => {
    ok = false;
    lines.push(`✗ ${text}`);
  };

  const page = await probeTwice(portalUrl, retryDelayMs);
  // If Pages is set to "Deploy from a branch", it serves the README instead of
  // the portal, still with HTTP 200, so look for the project list's element.
  if (!page.ok) fail(`Portal page ${portalUrl} (${page.status})`);
  else if (!page.body.includes('id="index-list"')) fail(`Portal page ${portalUrl} answers but is not the portal`);
  else pass(`Portal page (${page.status})`);

  const dataUrl = new URL('data/projects.json', portalUrl).href;
  const data = await probeTwice(dataUrl, retryDelayMs);
  let projects = [];
  if (!data.ok) {
    fail(`Project list ${dataUrl} (${data.status})`);
  } else {
    let parsed = null;
    try {
      parsed = JSON.parse(data.body);
    } catch {
      fail(`Project list ${dataUrl} is not valid JSON`);
    }
    if (parsed) {
      projects = Array.isArray(parsed.projects) ? parsed.projects : [];
      const age = freshness(parsed.generatedAt, now, maxAgeHours);
      if (!projects.length) fail('Project list is empty');
      else if (!age.ok) fail(`Project list ${age.text}: the daily rebuild may have stopped`);
      else pass(`Project list: ${projects.length} projects, ${age.text}`);
    }
  }

  const live = projects.filter((p) => typeof p.url === 'string' && /^https?:\/\//.test(p.url));
  const results = await Promise.all(live.map(async (p) => ({ p, r: await probeTwice(p.url, retryDelayMs) })));
  const down = results.filter(({ r }) => !r.ok);
  if (live.length) {
    if (down.length) fail(`${live.length - down.length} of ${live.length} live sites answer`);
    else pass(`${live.length} of ${live.length} live sites answer`);
  }
  for (const { p, r } of down) {
    const where = p.status === 'production' ? 'Production' : 'In development';
    lines.push(`  ✗ ${p.title ?? p.name} (${where}) ${p.url} (${r.status})`);
  }
  return { ok, lines };
}

function parseArgs(argv) {
  const args = { url: null, report: null, config: 'portal.config.json' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!Object.hasOwn(args, key)) throw new Error(`Unknown option ${argv[i]}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    args[key] = value;
    i++;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let portalUrl = args.url;
  if (!portalUrl) {
    const config = JSON.parse(await readFile(resolve(ROOT, args.config), 'utf8'));
    portalUrl = pagesUrl(config.owner, process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'portal');
  }
  const { ok, lines } = await runChecks({ portalUrl });
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const report = [`Portal check, ${stamp} UTC`, ...lines, ''].join('\n');
  console.log(report);
  if (args.report) await writeFile(resolve(ROOT, args.report), report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Site check\n\n\`\`\`\n${report}\`\`\`\n`, { flag: 'a' });
  }
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
