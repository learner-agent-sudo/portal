#!/usr/bin/env node
// Builds site/data/projects.json from the owner's public GitHub repos.
//
//   node scripts/build-data.mjs                      # live: calls the GitHub API
//   node scripts/build-data.mjs --fixture file.json  # offline: reads saved API data
//
// In GitHub Actions, GITHUB_TOKEN raises the API rate limit and
// GITHUB_REPOSITORY lets the portal leave itself off the list.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com';

/** Returns an http(s) URL string, or null for anything else (javascript:, junk, empty). */
export function safeUrl(value) {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;
  // The repo "Website" field is often typed without a scheme, e.g. "example.com"
  // or "example.com:8080". Any other scheme (javascript:, data:, ftp:) is refused.
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) return null;
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Default GitHub Pages address for a repo. */
export function pagesUrl(owner, repoName) {
  const host = `${owner.toLowerCase()}.github.io`;
  return repoName.toLowerCase() === host ? `https://${host}/` : `https://${host}/${repoName}/`;
}

function lowerKeys(obj) {
  return Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
}

/** Why a repo is left off the portal, or null if it should be shown. */
export function hiddenReason(repo, config, selfRepo) {
  const name = repo.name.toLowerCase();
  const override = lowerKeys(config.overrides)[name] ?? {};
  if (repo.private) return 'private';
  if (selfRepo && name === selfRepo.toLowerCase()) return 'this portal';
  if (repo.fork) return 'fork';
  if (repo.archived) return 'archived';
  if (override.hidden) return 'hidden in portal.config.json';
  if ((config.exclude ?? []).some((n) => n.toLowerCase() === name)) return 'excluded in portal.config.json';
  if ((repo.topics ?? []).includes(config.hideTopic)) return `topic "${config.hideTopic}"`;
  // `size` is 0 for an empty repo, but also for a new repo until GitHub
  // recalculates it, so the live fetch confirms with the commits API
  // and records the answer in `is_empty`.
  if (repo.is_empty ?? repo.size === 0) return 'empty';
  return null;
}

/** True if a Website link points at a host the config says to ignore (e.g. "vercel.app"). */
export function isIgnoredHost(url, config) {
  if (!url) return false;
  const host = new URL(url).hostname.toLowerCase();
  return (config.ignoreLinkHosts ?? []).some((h) => {
    const want = h.toLowerCase().replace(/^\.+/, '');
    return host === want || host.endsWith(`.${want}`);
  });
}

/** "learning-GDPR" -> "Learning GDPR". */
export function humanize(name) {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Plain text from a line of Markdown: drops images and formatting, keeps link text. */
function inlineText(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(\S.*?\S|\S)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(text, max = 220) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  if (sentence >= 30) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '')}…`;
}

/**
 * Title and first paragraph of a README, for repos whose About box is empty.
 * Headings, lists, tables, quotes, code and badge-only lines are skipped.
 */
export function readmeSummary(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) return { title: null, description: null };
  const text = markdown
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '');
  const lines = text.split('\n');

  let title = null;
  for (let i = 0; i < lines.length; i++) {
    const atx = lines[i].match(/^#\s+(.+?)\s*#*\s*$/);
    const setext = lines[i].trim() && /^=+\s*$/.test(lines[i + 1] ?? '') ? lines[i] : null;
    const raw = atx?.[1] ?? setext;
    if (raw) {
      title = inlineText(raw) || null;
      break;
    }
  }
  if (title && title.length > 70) title = null;

  let description = null;
  for (const block of text.split(/\n\s*\n/)) {
    const first = block.trim();
    if (!first) continue;
    if (/^(#|>|\||[-*+]\s|\d+[.)]\s|<\/?(table|pre|img|picture|div\s+align)|---|===|\[!)/i.test(first)) continue;
    if (/\n(=+|-+)\s*$/.test(first)) continue; // setext heading
    const plain = inlineText(block.split('\n').join(' '));
    if (plain.length < 20) continue;
    description = shorten(plain).replace(/:$/, '.');
    break;
  }
  return { title, description };
}

export function toProject(repo, config) {
  const override = lowerKeys(config.overrides)[repo.name.toLowerCase()] ?? {};
  const readme = readmeSummary(repo.readme);
  // A README heading that is just the repo slug ("research-fact-base") reads worse than the prettified name.
  const readmeTitle = readme.title && !/^[\w.]+([-_][\w.]+)+$/.test(readme.title) ? readme.title : null;
  const special = new Set([config.featuredTopic, config.hideTopic]);
  const topics = [...new Set([...(repo.topics ?? []), ...(override.topics ?? [])])]
    .filter((t) => !special.has(t))
    .sort();

  let website = safeUrl(repo.homepage);
  if (isIgnoredHost(website, config)) website = null;
  const liveUrl =
    safeUrl(override.url) ??
    website ??
    (repo.has_pages ? pagesUrl(config.owner, repo.name) : null);

  return {
    name: repo.name,
    title: override.title ?? readmeTitle ?? humanize(repo.name),
    description: override.description || repo.description || readme.description || '',
    url: liveUrl,
    sourceUrl: repo.html_url,
    topics,
    featured: override.featured ?? (repo.topics ?? []).includes(config.featuredTopic),
    language: repo.language ?? null,
    stars: repo.stargazers_count ?? 0,
    updatedAt: repo.pushed_at ?? repo.updated_at ?? null,
    createdAt: repo.created_at ?? null,
  };
}

function extraToProject(entry, i) {
  const url = safeUrl(entry.url);
  if (!url) throw new Error(`portal.config.json extra[${i}] needs a valid http(s) "url"`);
  const { host, pathname } = new URL(url);
  return {
    // Pins are stored by name, so the default must not depend on list order.
    name: entry.name ?? `extra:${host}${pathname}`,
    title: entry.title ?? entry.name ?? new URL(url).hostname,
    description: entry.description ?? '',
    url,
    sourceUrl: safeUrl(entry.sourceUrl),
    topics: [...(entry.topics ?? [])].sort(),
    featured: Boolean(entry.featured),
    language: entry.language ?? null,
    stars: 0,
    updatedAt: entry.updatedAt ?? null,
    createdAt: null,
  };
}

/** Pure transform: raw GitHub API repos + config -> { projects, hidden }. */
export function buildProjects(repos, config, { selfRepo } = {}) {
  const projects = [];
  const hidden = [];
  const ignoredLinks = [];
  for (const repo of repos) {
    const reason = hiddenReason(repo, config, selfRepo);
    if (reason) {
      hidden.push({ name: repo.name, reason });
      continue;
    }
    const website = safeUrl(repo.homepage);
    if (isIgnoredHost(website, config)) ignoredLinks.push({ name: repo.name, url: website });
    projects.push(toProject(repo, config));
  }
  (config.extra ?? []).forEach((entry, i) => projects.push(extraToProject(entry, i)));
  projects.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return { projects, hidden, ignoredLinks };
}

function ghFetch(path, token, accept = 'application/vnd.github+json') {
  return fetch(`${API}${path}`, {
    headers: {
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'portal-build-data',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function gh(path, token) {
  const res = await ghFetch(path, token);
  if (!res.ok) {
    const hint = res.status === 403 || res.status === 429 ? ' (rate limited? set GITHUB_TOKEN)' : '';
    throw new Error(`GitHub API ${res.status} for ${path}${hint}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchLive(owner, token) {
  const user = await gh(`/users/${encodeURIComponent(owner)}`, token);
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(
      `/users/${encodeURIComponent(owner)}/repos?type=owner&sort=pushed&per_page=100&page=${page}`,
      token,
    );
    repos.push(...batch);
    if (batch.length < 100) break;
    if (page === 10) console.warn('Stopped after 1000 repos; the rest are not listed.');
  }
  // A size of 0 can mean "empty" or "not measured yet". The commits API
  // answers 409 only for a repo with no commits.
  for (const repo of repos) {
    const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.name)}`;
    if (repo.size === 0) {
      const res = await ghFetch(`${base}/commits?per_page=1`, token);
      repo.is_empty = res.status === 409;
      if (repo.is_empty) continue;
    }
    if (repo.fork || repo.archived) continue;
    // The README fills in a title and description when the About box is empty.
    const res = await ghFetch(`${base}/readme`, token, 'application/vnd.github.raw+json');
    repo.readme = res.ok ? await res.text() : null;
  }
  return { user, repos };
}

function parseArgs(argv) {
  const args = { out: 'site/data/projects.json', config: 'portal.config.json', fixture: null };
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
  const config = JSON.parse(await readFile(resolve(ROOT, args.config), 'utf8'));
  const selfRepo = process.env.GITHUB_REPOSITORY?.split('/')[1];

  const { user, repos } = args.fixture
    ? JSON.parse(await readFile(resolve(ROOT, args.fixture), 'utf8'))
    : await fetchLive(config.owner, process.env.GITHUB_TOKEN);

  const { projects, hidden, ignoredLinks } = buildProjects(repos, config, { selfRepo });
  const data = {
    generatedAt: new Date().toISOString(),
    source: args.fixture ? 'fixture' : 'github',
    title: config.title,
    tagline: config.tagline,
    owner: {
      login: user.login,
      name: user.name ?? user.login,
      bio: user.bio ?? '',
      avatarUrl: safeUrl(user.avatar_url),
      profileUrl: safeUrl(user.html_url),
    },
    projects,
  };

  const out = resolve(ROOT, args.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(data, null, 2)}\n`);

  const live = projects.filter((p) => p.url).length;
  const featured = projects.filter((p) => p.featured).length;
  console.log(`Wrote ${projects.length} projects (${featured} featured, ${live} with a live site) to ${args.out}`);
  for (const p of projects) {
    console.log(`  ${p.featured ? '★' : ' '} ${p.name} -> ${p.url ?? '(code only)'}`);
    console.log(`      ${p.description || '(no description)'}${p.topics.length ? ` [${p.topics.join(', ')}]` : ''}`);
  }
  for (const h of hidden) console.log(`  hidden: ${h.name} (${h.reason})`);
  for (const l of ignoredLinks) console.log(`  ignored Website: ${l.name} ${l.url} (ignoreLinkHosts)`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary(projects, hidden, ignoredLinks), { flag: 'a' });
  }
}

/** Markdown table for the Actions run page, so the owner can check what the portal sees. */
function summary(projects, hidden, ignoredLinks) {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  const rows = projects.map(
    (p) =>
      `| ${cell(p.name)} | ${p.url ? cell(p.url) : 'code only'} | ${p.featured ? 'yes' : ''} | ${cell(p.topics.join(', '))} | ${cell(p.description || '—')} |`,
  );
  const gone = hidden.map((h) => `- ${cell(h.name)}: ${cell(h.reason)}`);
  const skipped = ignoredLinks.map((l) => `- ${cell(l.name)}: ${cell(l.url)}`);
  return [
    '## Portal projects',
    '',
    '| Repo | Live link | Featured | Topics | Description |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    gone.length ? `**Left off:**\n${gone.join('\n')}` : '',
    '',
    skipped.length ? `**Website ignored (ignoreLinkHosts):**\n${skipped.join('\n')}` : '',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
