import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { freshness, probe, runChecks } from '../scripts/check-site.mjs';

const NOW = Date.parse('2026-10-17T12:00:00Z');

// A fake portal: `routes` maps a path to [status, body]; anything else is 404.
async function serve(routes) {
  const server = createServer((req, res) => {
    const [status, body] = routes[req.url] ?? [404, 'not found'];
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const portalHtml = '<!doctype html><ul id="index-list"></ul>';
const data = (base, extra = {}) =>
  JSON.stringify({
    generatedAt: '2026-10-17T06:00:00Z',
    projects: [
      { name: 'up', title: 'Up', status: 'production', url: `${base}/up/` },
      { name: 'down', title: 'Down', status: 'development', url: `${base}/down/` },
      { name: 'code-only', title: 'Code only', url: null },
    ],
    ...extra,
  });

test('freshness: age in hours, stale past the limit, invalid dates fail', () => {
  assert.deepEqual(freshness('2026-10-17T06:00:00Z', NOW, 48), { ok: true, text: 'rebuilt 6 h ago' });
  assert.deepEqual(freshness('2026-10-14T12:00:00Z', NOW, 48), { ok: false, text: 'rebuilt 72 h ago' });
  assert.equal(freshness(undefined, NOW, 48).ok, false);
});

test('probe reports HTTP errors and unreachable hosts without throwing', async () => {
  const s = await serve({ '/ok': [200, 'hi'], '/gone': [404, 'x'] });
  try {
    assert.deepEqual(await probe(`${s.base}/ok`), { ok: true, status: 'HTTP 200', body: 'hi' });
    assert.equal((await probe(`${s.base}/gone`)).status, 'HTTP 404');
  } finally {
    s.close();
  }
  // A port that was just freed refuses connections.
  const gone = createServer();
  await new Promise((r) => gone.listen(0, '127.0.0.1', r));
  const { port } = gone.address();
  await new Promise((r) => gone.close(r));
  const r = await probe(`http://127.0.0.1:${port}/`, { timeoutMs: 2_000 });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'connection refused');
});

test('runChecks passes a healthy portal and names each site that is down', async () => {
  const routes = { '/portal/': [200, portalHtml], '/up/': [200, 'ok'] };
  const s = await serve(routes);
  routes['/portal/data/projects.json'] = [200, data(s.base)];
  try {
    const { ok, lines } = await runChecks({ portalUrl: `${s.base}/portal/`, now: NOW, retryDelayMs: 10 });
    assert.equal(ok, false);
    assert.deepEqual(lines.slice(0, 3), [
      '✓ Portal page (HTTP 200)',
      '✓ Project list: 3 projects, rebuilt 6 h ago',
      '✗ 1 of 2 live sites answer',
    ]);
    assert.match(lines[3], /✗ Down \(In development\) .*\/down\/ \(HTTP 404\)/);

    routes['/down/'] = [200, 'back'];
    assert.equal((await runChecks({ portalUrl: `${s.base}/portal/`, now: NOW, retryDelayMs: 10 })).ok, true);
  } finally {
    s.close();
  }
});

test('runChecks catches the README being served, a stale list and a missing list', async () => {
  const routes = { '/portal/': [200, '<h1>Portal</h1> README'] };
  const s = await serve(routes);
  try {
    const opts = { portalUrl: `${s.base}/portal/`, now: NOW, retryDelayMs: 10 };
    let { ok, lines } = await runChecks(opts);
    assert.equal(ok, false);
    assert.match(lines[0], /answers but is not the portal/);
    assert.match(lines[1], /Project list .* \(HTTP 404\)/);

    routes['/portal/'] = [200, portalHtml];
    routes['/portal/data/projects.json'] = [200, data(s.base, { generatedAt: '2026-10-10T00:00:00Z', projects: [{ name: 'a' }] })];
    ({ ok, lines } = await runChecks(opts));
    assert.equal(ok, false);
    assert.match(lines[1], /rebuilt 180 h ago: the daily rebuild may have stopped/);
  } finally {
    s.close();
  }
});
