// Renders data/projects.json (built by scripts/build-data.mjs) into the page.
// All content is set with textContent / DOM APIs, never innerHTML.

const PIN_KEY = 'portal:pins';
const VIEWS = ['featured', 'all', 'pinned'];

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};

const state = {
  projects: [],
  view: 'all',
  topic: null,
  query: '',
  sort: 'recent',
  pins: loadPins(),
};

function loadPins() {
  try {
    const raw = JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function savePins() {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify([...state.pins]));
  } catch {
    // Private mode or storage blocked: pins still work until the page is closed.
  }
}

function httpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dateFmt = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' });

function relative(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = (t - Date.now()) / 86_400_000;
  const abs = Math.abs(days);
  if (abs < 1) return rtf.format(Math.round(days * 24), 'hour');
  if (abs < 30) return rtf.format(Math.round(days), 'day');
  if (abs < 365) return rtf.format(Math.round(days / 30.44), 'month');
  return rtf.format(Math.round(days / 365.25), 'year');
}

function timeEl(iso, prefix = 'Updated ') {
  const rel = relative(iso);
  if (!rel) return null;
  return el('time', { dateTime: iso, title: dateFmt.format(new Date(iso)), textContent: `${prefix}${rel}` });
}

// ---------- Selection ----------

function baseSet() {
  const { projects, view, pins } = state;
  if (view === 'featured') return projects.filter((p) => p.featured);
  if (view === 'pinned') return projects.filter((p) => pins.has(p.name));
  return projects;
}

function visible(base) {
  const q = state.query.trim().toLowerCase();
  const list = base.filter((p) => {
    if (state.topic && !p.topics.includes(state.topic)) return false;
    if (!q) return true;
    const hay = [p.title, p.name, p.description, p.language, ...p.topics].join(' ').toLowerCase();
    return hay.includes(q);
  });
  const time = (p) => Date.parse(p.updatedAt) || 0;
  const sorters = {
    recent: (a, b) => time(b) - time(a),
    stale: (a, b) => time(a) - time(b),
    name: (a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }),
  };
  return list.sort(sorters[state.sort] ?? sorters.recent);
}

// ---------- Pieces ----------

function linkButtons(p, { compact = false } = {}) {
  const live = httpUrl(p.url);
  const code = httpUrl(p.sourceUrl);
  return el(
    'div',
    { className: 'actions' },
    live && el('a', { className: 'btn btn-primary', href: live, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open ↗' }),
    code && el('a', { className: `btn ${live ? 'btn-ghost' : ''}`, href: code, target: '_blank', rel: 'noopener noreferrer', textContent: 'Code' }),
    !live && !compact && el('span', { className: 'no', textContent: 'No live site' }),
    pinButton(p),
  );
}

function pinButton(p) {
  const pinned = state.pins.has(p.name);
  const btn = el('button', {
    type: 'button',
    className: 'btn pin',
    textContent: pinned ? '★' : '☆',
    title: pinned ? 'Unpin (saved in this browser only)' : 'Pin (saved in this browser only)',
  });
  btn.setAttribute('aria-pressed', String(pinned));
  btn.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${p.title}`);
  btn.addEventListener('click', () => togglePin(p.name));
  return btn;
}

function tags(p) {
  if (!p.topics.length) return null;
  return el('ul', { className: 'tags' }, ...p.topics.map((t) => el('li', { textContent: t })));
}

function metaLine(p) {
  const bits = [p.language, p.stars > 0 ? `★ ${p.stars}` : null].filter(Boolean);
  return bits.length ? el('span', { className: 'meta', textContent: bits.join(' · ') }) : null;
}

const pad = (n) => String(n).padStart(2, '0');

// Column spans (of 12) for n featured cards so no row is left half empty.
// Wide screens: a 7+5 lead row, then rows of three, a last row of two
// becomes halves and a lone last card goes full width.
// Medium screens: the lead card full width, then pairs.
function featuredSpans(n) {
  const lg = [];
  const md = [];
  if (n === 1) return { lg: [12], md: [12] };
  lg.push(7, 5);
  let rest = n - 2;
  while (rest > 0) {
    const take = rest === 4 ? 2 : Math.min(rest, 3);
    lg.push(...Array(take).fill(12 / take));
    rest -= take;
  }
  for (let i = 0; i < n; i++) md.push(i === 0 || (i === n - 1 && n % 2 === 0) ? 12 : 6);
  return { lg: lg.slice(0, n), md };
}

function card(p, i, animate, spans) {
  const node = el(
    'article',
    { className: `card${i === 0 ? ' card-lead' : ''}${animate ? ' reveal' : ''}` },
    el('div', { className: 'card-head' }, el('span', { className: 'card-no', textContent: `№ ${pad(i + 1)}` }), metaLine(p)),
    el('h2', { className: 'card-title', textContent: p.title }),
    p.description && el('p', { className: 'card-desc', textContent: p.description }),
    tags(p),
    el(
      'div',
      { className: 'card-foot' },
      linkButtons(p),
      el('span', { className: 'meta' }, timeEl(p.updatedAt) ?? ''),
    ),
  );
  node.style.setProperty('--i', i);
  node.style.setProperty('--span', spans.lg[i]);
  node.style.setProperty('--span-md', spans.md[i]);
  return node;
}

function row(p, i, animate) {
  const node = el(
    'li',
    { className: `row${animate ? ' reveal' : ''}` },
    el('span', { className: 'row-no', textContent: pad(i + 1) }),
    el(
      'div',
      { className: 'row-main' },
      el('h2', { className: 'row-title', textContent: p.title }),
      p.description && el('p', { className: 'row-desc', textContent: p.description }),
      tags(p),
    ),
    el('div', { className: 'row-when meta' }, timeEl(p.updatedAt, '') ?? '', p.language ? el('div', { textContent: p.language }) : null),
    linkButtons(p, { compact: true }),
  );
  node.style.setProperty('--i', i);
  return node;
}

// ---------- Render ----------

function renderViews() {
  const counts = {
    featured: state.projects.filter((p) => p.featured).length,
    all: state.projects.length,
    pinned: state.projects.filter((p) => state.pins.has(p.name)).length,
  };
  for (const btn of document.querySelectorAll('.view')) {
    const v = btn.dataset.view;
    btn.hidden = v !== 'all' && counts[v] === 0;
    btn.setAttribute('aria-pressed', String(v === state.view));
    btn.querySelector('.count').textContent = counts[v];
  }
}

function renderTopics(base) {
  const counts = new Map();
  for (const p of base) for (const t of p.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  if (state.topic && !counts.has(state.topic)) state.topic = null;

  const box = $('#topics');
  box.replaceChildren();
  if (counts.size < 2) return;
  const chip = (label, topic) => {
    const b = el('button', { type: 'button', className: 'chip', textContent: label });
    b.setAttribute('aria-pressed', String(state.topic === topic));
    b.addEventListener('click', () => {
      state.topic = state.topic === topic ? null : topic;
      render();
    });
    return b;
  };
  box.append(
    chip('everything', null),
    ...[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) => chip(`${t} ${n}`, t)),
  );
}

function render({ animate = false } = {}) {
  if (state.view !== 'all' && baseSet().length === 0) state.view = 'all';
  renderViews();

  const base = baseSet();
  renderTopics(base);
  const list = visible(base);

  const featuredBox = $('#featured-list');
  const indexBox = $('#index-list');
  const status = $('#status');
  const asCards = state.view === 'featured';

  featuredBox.hidden = !asCards || list.length === 0;
  indexBox.hidden = asCards || list.length === 0;
  if (asCards) {
    const spans = featuredSpans(list.length);
    featuredBox.replaceChildren(...list.map((p, i) => card(p, i, animate, spans)));
  } else {
    indexBox.replaceChildren(...list.map((p, i) => row(p, i, animate)));
  }

  status.hidden = list.length > 0;
  if (!list.length) {
    status.textContent = state.query ? `Nothing matches “${state.query.trim()}”.` : 'Nothing here yet.';
  }
  $('#pin-hint').hidden = state.view !== 'pinned';
}

function setView(view, { push = true } = {}) {
  if (!VIEWS.includes(view)) return;
  state.view = view;
  if (push) history.replaceState(null, '', `#${view}`);
  render({ animate: true });
}

function togglePin(name) {
  if (state.pins.has(name)) state.pins.delete(name);
  else state.pins.add(name);
  savePins();
  render();
}

function renderHeader(data) {
  const owner = data.owner ?? {};
  const name = owner.name || owner.login || '';
  const title = data.title || 'Projects';
  document.title = name ? `${title} · ${name}` : title;
  $('#title').textContent = title;
  $('#tagline').textContent = data.tagline ?? '';
  $('#owner-name').textContent = name;

  const profile = httpUrl(owner.profileUrl);
  if (profile) $('#owner').href = profile;
  const avatar = httpUrl(owner.avatarUrl);
  if (avatar) {
    const img = $('#avatar');
    img.addEventListener('error', () => { img.hidden = true; }, { once: true });
    Object.assign(img, { src: avatar, hidden: false });
  }

  const live = data.projects.filter((p) => httpUrl(p.url)).length;
  const stat = (label, value) => el('div', {}, el('dt', { textContent: label }), el('dd', { textContent: value }));
  $('#stats').replaceChildren(stat('Projects', data.projects.length), stat('Live sites', live));

  const generated = timeEl(data.generatedAt, '');
  $('#generated').replaceChildren(generated ?? '');
  if (data.source === 'fixture') $('#generated').append(' (sample data)');
}

async function init() {
  let data;
  try {
    const res = await fetch('data/projects.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    $('#status').textContent = 'Could not load the project list. Try again in a minute.';
    console.error(err);
    return;
  }

  state.projects = Array.isArray(data.projects) ? data.projects : [];
  renderHeader(data);

  const fromHash = location.hash.slice(1);
  const hasFeatured = state.projects.some((p) => p.featured);
  state.view = VIEWS.includes(fromHash) ? fromHash : hasFeatured ? 'featured' : 'all';

  for (const btn of document.querySelectorAll('.view')) {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  }
  $('#search').addEventListener('input', (e) => {
    state.query = e.target.value;
    render();
  });
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1), { push: false }));

  render({ animate: true });
}

init();
