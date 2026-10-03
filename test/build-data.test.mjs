import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildProjects, hiddenReason, isIgnoredHost, pagesUrl, safeUrl, toProject } from '../scripts/build-data.mjs';

const config = {
  owner: 'Some-User',
  featuredTopic: 'featured',
  hideTopic: 'hide',
  exclude: [],
  overrides: {},
  extra: [],
};

const repo = (over = {}) => ({
  name: 'app',
  html_url: 'https://github.com/Some-User/app',
  description: 'An app',
  homepage: null,
  topics: [],
  has_pages: false,
  language: 'JavaScript',
  stargazers_count: 2,
  pushed_at: '2026-01-01T00:00:00Z',
  private: false,
  fork: false,
  archived: false,
  size: 10,
  ...over,
});

test('safeUrl keeps http(s), adds a missing scheme, rejects the rest', () => {
  assert.equal(safeUrl('https://a.com/x'), 'https://a.com/x');
  assert.equal(safeUrl('example.com'), 'https://example.com/');
  assert.equal(safeUrl('  http://a.com  '), 'http://a.com/');
  assert.equal(safeUrl('example.com:8080/app'), 'https://example.com:8080/app');
  assert.equal(safeUrl('HTTPS://A.com'), 'https://a.com/');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('JavaScript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('ftp://a.com'), null);
  assert.equal(safeUrl(''), null);
  assert.equal(safeUrl(null), null);
});

test('pagesUrl lowercases the owner, keeps repo casing, handles the user site', () => {
  assert.equal(pagesUrl('Some-User', 'Stock-mon'), 'https://some-user.github.io/Stock-mon/');
  assert.equal(pagesUrl('Some-User', 'some-user.github.io'), 'https://some-user.github.io/');
});

test('live link: config override, then Website field, then GitHub Pages, else none', () => {
  assert.equal(toProject(repo(), config).url, null);
  assert.equal(toProject(repo({ has_pages: true }), config).url, 'https://some-user.github.io/app/');
  assert.equal(
    toProject(repo({ has_pages: true, homepage: 'https://custom.dev' }), config).url,
    'https://custom.dev/',
  );
  const withOverride = { ...config, overrides: { APP: { url: 'https://demo.dev/x.html' } } };
  assert.equal(toProject(repo({ homepage: 'https://custom.dev' }), withOverride).url, 'https://demo.dev/x.html');
});

test('ignoreLinkHosts drops matching Website links and falls back to Pages', () => {
  const c = { ...config, ignoreLinkHosts: ['vercel.app'] };
  assert.equal(isIgnoredHost('https://app-x.vercel.app/', c), true);
  assert.equal(isIgnoredHost('https://vercel.app/', c), true);
  assert.equal(isIgnoredHost('https://notvercel.app/', c), false);
  assert.equal(isIgnoredHost(null, c), false);
  assert.equal(toProject(repo({ homepage: 'https://app-x.vercel.app' }), c).url, null);
  assert.equal(
    toProject(repo({ homepage: 'https://app-x.vercel.app', has_pages: true }), c).url,
    'https://some-user.github.io/app/',
  );
  assert.equal(toProject(repo({ homepage: 'https://custom.dev' }), c).url, 'https://custom.dev/');
  const { ignoredLinks } = buildProjects([repo({ homepage: 'app-x.vercel.app' })], c);
  assert.deepEqual(ignoredLinks, [{ name: 'app', url: 'https://app-x.vercel.app/' }]);
});

test('featured comes from the topic; special topics are not shown as tags', () => {
  const p = toProject(repo({ topics: ['tools', 'featured'] }), config);
  assert.equal(p.featured, true);
  assert.deepEqual(p.topics, ['tools']);
  assert.equal(toProject(repo({ topics: ['tools'] }), config).featured, false);
});

test('overrides can change title, description and featured', () => {
  const c = { ...config, overrides: { app: { title: 'My App', description: 'Better', featured: true } } };
  const p = toProject(repo(), c);
  assert.equal(p.title, 'My App');
  assert.equal(p.description, 'Better');
  assert.equal(p.featured, true);
});

test('hiddenReason explains every way a repo is left off', () => {
  assert.equal(hiddenReason(repo(), config), null);
  assert.equal(hiddenReason(repo({ private: true }), config), 'private');
  assert.equal(hiddenReason(repo({ fork: true }), config), 'fork');
  assert.equal(hiddenReason(repo({ archived: true }), config), 'archived');
  assert.equal(hiddenReason(repo({ size: 0 }), config), 'empty');
  // A new repo with commits can still report size 0; the live fetch sets is_empty.
  assert.equal(hiddenReason(repo({ size: 0, is_empty: false }), config), null);
  assert.equal(hiddenReason(repo({ size: 0, is_empty: true }), config), 'empty');
  assert.equal(hiddenReason(repo({ topics: ['hide'] }), config), 'topic "hide"');
  assert.equal(hiddenReason(repo({ name: 'portal' }), config, 'Portal'), 'this portal');
  assert.match(hiddenReason(repo(), { ...config, exclude: ['APP'] }), /excluded/);
  assert.match(hiddenReason(repo(), { ...config, overrides: { app: { hidden: true } } }), /hidden/);
});

test('buildProjects sorts newest first and appends valid extra entries', () => {
  const c = { ...config, extra: [{ title: 'Elsewhere', url: 'site.example.org', updatedAt: '2026-06-01T00:00:00Z' }] };
  const { projects, hidden } = buildProjects(
    [repo({ name: 'old', pushed_at: '2025-01-01T00:00:00Z' }), repo({ name: 'new' }), repo({ name: 'gone', fork: true })],
    c,
  );
  assert.deepEqual(projects.map((p) => p.name), ['extra:site.example.org/', 'new', 'old']);
  assert.equal(projects[0].url, 'https://site.example.org/');
  assert.deepEqual(hidden, [{ name: 'gone', reason: 'fork' }]);
  assert.throws(() => buildProjects([], { ...config, extra: [{ url: 'javascript:x' }] }), /valid http/);
});

test('CLI rejects a flag with no value instead of silently going online', async () => {
  const run = promisify(execFile);
  const script = new URL('../scripts/build-data.mjs', import.meta.url).pathname;
  await assert.rejects(run(process.execPath, [script, '--fixture']), /Missing value for --fixture/);
  await assert.rejects(run(process.execPath, [script, '--constructor', 'x']), /Unknown option/);
});

test('sample fixture builds without errors', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/repos.json', import.meta.url), 'utf8'));
  const { projects, hidden } = buildProjects(fixture.repos, { ...config, owner: 'learner-agent-sudo' });
  assert.ok(projects.length > 10);
  assert.deepEqual(hidden, [{ name: 'jobs', reason: 'empty' }]);
});
