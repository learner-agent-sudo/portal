// Renders data/projects.json (built by scripts/build-data.mjs) into the page.
// All content is set with textContent / DOM APIs, never innerHTML.

const PIN_KEY = 'portal:pins';
const LAYOUT_KEY = 'portal:layout';
const THEME_KEY = 'portal:theme';
const VIEWS = ['featured', 'all', 'pinned'];
const LAYOUTS = ['grid', 'carousel'];
const THEMES = ['auto', 'light', 'dark'];
const SVG_NS = 'http://www.w3.org/2000/svg';

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};

// Small preferences (layout, theme). Storage can be blocked (private mode,
// strict settings); then the choice simply lasts until the page is closed.
function readPref(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved; still applied for this visit.
  }
}

const state = {
  projects: [],
  data: null,
  view: 'all',
  category: null,
  query: '',
  sort: 'recent',
  layout: readPref(LAYOUT_KEY, LAYOUTS, 'grid'),
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

// Thumbnails are relative paths ("thumbs/x.jpg"); resolve against the page and
// accept only http(s) results so nothing like javascript: or data: gets through.
function thumbUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const u = new URL(value, document.baseURI);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

// numeric: 'always' gives "1 day ago" rather than "yesterday", which would
// name the wrong calendar day for a rounded duration.
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
const dateFmt = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' });

function relative(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = (t - Date.now()) / 86_400_000;
  const abs = Math.abs(days);
  if (abs < 1 / 24) return 'just now';
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

// ---------- Icons (built with DOM APIs, no markup strings) ----------

const ICONS = {
  external: { d: ['M7 17 17 7', 'M8.5 7H17v8.5'] },
  code: { d: ['m8.5 7-5 5 5 5', 'm15.5 7 5 5-5 5'] },
  star: { d: ['M12 3.6l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.6l-5.1 2.68.97-5.68L3.75 9.6l5.7-.83z'], join: true },
  arrow: { d: ['M5 12h14', 'm13 6 6 6-6 6'] },
  sun: {
    d: [
      'M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5z',
      'M12 2.75v1.5', 'M12 19.75v1.5', 'M2.75 12h1.5', 'M19.75 12h1.5',
      'm5.46 5.46 1.06 1.06', 'm17.48 17.48 1.06 1.06', 'm5.46 18.54 1.06-1.06', 'm17.48 6.52 1.06-1.06',
    ],
  },
  moon: { d: ['M19.5 14.7A7.9 7.9 0 0 1 9.3 4.5a7.9 7.9 0 1 0 10.2 10.2z'] },
  monitor: {
    d: ['M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z', 'M9 20.5h6', 'M12 16.5v4'],
  },
  // Category icons (24px line drawings).
  scales: {
    d: ['M12 3.5v17', 'M7.5 20.5h9', 'M4.5 7h15', 'M5 7.5 2.2 13.5', 'M5 7.5l2.8 6', 'M2.2 13.5a2.8 2.8 0 0 0 5.6 0', 'M19 7.5l-2.8 6', 'M19 7.5l2.8 6', 'M16.2 13.5a2.8 2.8 0 0 0 5.6 0'],
  },
  chart: { d: ['M3.5 20.5h17', 'M4.5 16l5-5 3.5 3.5 6.5-7', 'M15 7.5h4.5V12'] },
  cap: { d: ['M2.5 9 12 4.5 21.5 9 12 13.5z', 'M6.5 11v4.5c1.5 1.5 3.5 2.5 5.5 2.5s4-1 5.5-2.5V11', 'M21.5 9v5'] },
  wrench: { d: ['M14.7 6.3a4 4 0 0 0-5.4 5.2L3.8 17a1.8 1.8 0 0 0 2.6 2.6l5.5-5.5a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.4-.6-.6-2.4z'] },
  search: { d: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'm15.5 15.5 5 5'] },
  globe: { d: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z'] },
  candle: { d: ['M8.5 21h7', 'M10 21v-9.5h4V21', 'M12 3.2c1.4 1.7 2 2.8 2 3.8a2 2 0 0 1-4 0c0-1 .6-2.1 2-3.8z'] },
  ball: {
    d: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7.5l3.8 2.8-1.5 4.5H9.7l-1.5-4.5z', 'M12 3v4.5', 'M20.6 9.6l-4.8.7', 'M17.6 19l-3.3-4.2', 'M6.4 19l3.3-4.2', 'M3.4 9.6l4.8.7'],
  },
  github: {
    view: '0 0 16 16',
    fill: true,
    d: ['M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z'],
  },
};

function icon(name, size = 16) {
  const spec = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', spec.view ?? '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon', `icon-${name}`);
  for (const d of spec.d) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    if (spec.fill) {
      path.setAttribute('fill', 'currentColor');
    } else {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    svg.append(path);
  }
  return svg;
}

// ---------- Generated cover art for projects without a screenshot ----------

// FNV-1a plus a murmur finaliser: small, stable, spreads similar names apart.
// The seed is arbitrary; this one happens to give today's repos distinct hues.
const COVER_SEED = 155;
function hash(str) {
  let h = 0x811c9dc5 ^ COVER_SEED;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Hand-picked hues (OKLCH) that all hold up as both a pale wash and a deep tile.
const HUES = [264, 292, 330, 12, 40, 150, 175, 200, 232, 312];
const PATTERNS = ['dots', 'grid', 'rings', 'lines'];

const CATEGORY = {
  legal: { label: 'Legal', icon: 'scales' },
  finance: { label: 'Finance', icon: 'chart' },
  learning: { label: 'Learning', icon: 'cap' },
  tools: { label: 'Tools', icon: 'wrench' },
  research: { label: 'Research', icon: 'search' },
  immigration: { label: 'Immigration', icon: 'globe' },
  faith: { label: 'Faith', icon: 'candle' },
  sports: { label: 'Sports', icon: 'ball' },
  other: { label: 'Other', icon: 'code' },
};
const categoryOf = (p) => CATEGORY[p.category] ?? CATEGORY.other;

// Each project keeps one colour everywhere (card tint, cover, chip, glow).
function paletteOf(p) {
  const h = hash(p.name || p.title || '');
  const hue = HUES[h % HUES.length];
  return { hue, hue2: (hue + 28 + ((h >>> 12) % 24)) % 360, pattern: PATTERNS[(h >>> 8) % PATTERNS.length] };
}

function tint(node, p) {
  const { hue, hue2 } = paletteOf(p);
  node.style.setProperty('--h', hue);
  node.style.setProperty('--h2', hue2);
  return node;
}

function catChip(p) {
  const c = categoryOf(p);
  return el('span', { className: 'cat' }, icon(c.icon, 14), c.label);
}

function initial(title, name) {
  const m = `${title} ${name}`.match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : '•';
}

// Typographic cover for projects without a screenshot: the project's own name
// and an icon for what kind of project it is, never a lone initial.
function cover(p, { compact = false } = {}) {
  const { pattern } = paletteOf(p);
  const c = categoryOf(p);
  const node = el(
    'div',
    { className: `cover cover-${pattern}${compact ? ' is-compact' : ''}` },
    el('span', { className: 'cover-pattern' }),
    el('span', { className: 'cover-glyph' }, icon(c.icon, 24)),
    compact
      ? el('span', { className: 'cover-icon' }, icon(c.icon, 18))
      : el(
          'span',
          { className: 'cover-type' },
          el('span', { className: 'cover-cat' }, icon(c.icon, 14), c.label),
          el('span', { className: `cover-title${[...(p.title ?? '')].length > 30 ? ' is-long' : ''}`, textContent: p.title ?? p.name ?? '' }),
        ),
  );
  node.setAttribute('aria-hidden', 'true');
  return tint(node, p);
}

// ---------- Selection ----------

function baseSet() {
  const { projects, view, pins } = state;
  if (view === 'featured') return projects.filter((p) => p.featured);
  if (view === 'pinned') return projects.filter((p) => pins.has(p.name));
  return projects;
}

const sortKey = (p) => (p.title || p.name || '').replace(/^[^\p{L}\p{N}]+/u, '') || p.title || '';

function visible(base) {
  const q = state.query.trim().toLowerCase();
  const list = base.filter((p) => {
    if (state.category && p.category !== state.category) return false;
    if (!q) return true;
    const hay = [p.title, p.name, p.description, p.language, categoryOf(p).label, ...p.topics].join(' ').toLowerCase();
    return hay.includes(q);
  });
  // Projects with no date sort last in both date orders.
  const time = (p) => Date.parse(p.updatedAt);
  const byDate = (dir) => (a, b) => {
    const ta = time(a);
    const tb = time(b);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.isNaN(ta) - Number.isNaN(tb);
    return dir * (ta - tb);
  };
  const sorters = {
    recent: byDate(-1),
    stale: byDate(1),
    // Leading emoji or punctuation ("🍁 Imm Channel") should not decide the order.
    name: (a, b) => sortKey(a).localeCompare(sortKey(b), 'en', { sensitivity: 'base' }),
  };
  return list.sort(sorters[state.sort] ?? sorters.recent);
}

// ---------- Pieces ----------

const LANG_COLORS = {
  TypeScript: '#3178c6',
  JavaScript: '#e8c933',
  Python: '#3572a5',
  HTML: '#e34c26',
  CSS: '#663399',
  Go: '#00add8',
  Rust: '#dea584',
  Shell: '#89e051',
  Java: '#b07219',
  Ruby: '#a91e50',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Dart: '#00b4ab',
  'C++': '#f34b7d',
  'C#': '#178600',
  PHP: '#4f5d95',
  'Jupyter Notebook': '#da5b0b',
};

// Host and path are separate spans so a narrow frame shortens the host
// ("learner-ag…/rev-exam") and keeps the part that tells sites apart.
function prettyUrl(href) {
  try {
    const u = new URL(href);
    const path = u.pathname.replace(/\/$/, '');
    return el(
      'span',
      { className: 'frame-url' },
      el('span', { className: 'frame-host', textContent: u.host }),
      path ? el('span', { className: 'frame-path', textContent: path }) : null,
    );
  } catch {
    return el('span');
  }
}

function frame(p, { showUrl = false, decorative = false, eager = false } = {}) {
  const live = httpUrl(p.url);
  const code = httpUrl(p.sourceUrl);
  const href = live ?? code;
  const thumb = thumbUrl(p.thumbnail);

  const bar = el(
    'span',
    { className: 'frame-bar' },
    el('span', { className: 'dots' }, el('i'), el('i'), el('i')),
    showUrl && href ? prettyUrl(href) : el('span'),
    el(
      'span',
      { className: `frame-badge ${live ? 'is-live' : 'is-source'}` },
      live ? el('i', { className: 'pulse' }) : icon('code', 12),
      live ? 'Live' : 'Source',
    ),
  );
  bar.setAttribute('aria-hidden', 'true');

  const view = el('span', { className: 'frame-view' });
  // Decorative frames (the header collage) and the code-only covers are hidden
  // from assistive tech; real screenshots carry alt text.
  const hidden = decorative || !thumb;
  if (thumb) {
    const img = el('img', {
      src: thumb,
      alt: decorative ? '' : `Screenshot of ${p.title}`,
      loading: decorative || eager ? 'eager' : 'lazy',
      decoding: 'async',
      width: 768,
      height: 480,
    });
    img.addEventListener(
      'error',
      () => {
        img.replaceWith(cover(p));
        wrap.setAttribute('aria-hidden', 'true');
      },
      { once: true },
    );
    view.append(img);
  } else {
    view.append(cover(p));
  }

  const wrap =
    href && !decorative
      ? el('a', { className: 'frame', href, target: '_blank', rel: 'noopener noreferrer', tabIndex: -1 }, bar, view)
      : el('span', { className: 'frame' }, bar, view);
  if (hidden) wrap.setAttribute('aria-hidden', 'true');
  return wrap;
}

function actions(p) {
  const live = httpUrl(p.url);
  const code = httpUrl(p.sourceUrl);
  return el(
    'div',
    { className: 'actions' },
    live &&
      el(
        'a',
        { className: 'btn btn-primary', href: live, target: '_blank', rel: 'noopener noreferrer' },
        'Open site',
        icon('external', 15),
      ),
    code &&
      el(
        'a',
        { className: 'btn btn-secondary', href: code, target: '_blank', rel: 'noopener noreferrer' },
        icon('code', 15),
        'View code',
      ),
    pinButton(p),
  );
}

function pinButton(p) {
  const pinned = state.pins.has(p.name);
  const btn = el('button', {
    type: 'button',
    className: 'btn pin',
    title: pinned ? 'Unpin (saved in this browser only)' : 'Pin (saved in this browser only)',
  });
  btn.append(icon('star', 18));
  btn.setAttribute('aria-pressed', String(pinned));
  btn.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${p.title}`);
  btn.dataset.focus = `pin:${p.name}`;
  btn.addEventListener('click', () => togglePin(p.name));
  return btn;
}

function tags(p) {
  if (!p.topics.length) return null;
  return el('ul', { className: 'tags' }, ...p.topics.map((t) => el('li', { textContent: t })));
}

function meta(p) {
  const lang = p.language
    ? el('span', { className: 'lang' }, el('i', { className: 'lang-dot' }), p.language)
    : null;
  if (lang) lang.style.setProperty('--lang', LANG_COLORS[p.language] ?? 'var(--ink-3)');
  const stars = p.stars > 0 ? el('span', { textContent: `★ ${p.stars}` }) : null;
  const when = timeEl(p.updatedAt);
  const bits = [lang, stars, when].filter(Boolean);
  if (!bits.length) return null;
  const out = el('p', { className: 'meta' });
  bits.forEach((b, i) => {
    if (i) {
      const sep = el('span', { className: 'sep', textContent: '·' });
      sep.setAttribute('aria-hidden', 'true');
      out.append(sep);
    }
    out.append(b);
  });
  return out;
}

function kicker(p, eyebrow) {
  return el('p', { className: 'kicker' }, catChip(p), eyebrow ? el('span', { className: 'eyebrow', textContent: eyebrow }) : null);
}

function body(p, { eyebrow } = {}) {
  return el(
    'div',
    { className: 'card-body' },
    kicker(p, eyebrow),
    el('h2', { className: 'card-title', textContent: p.title }),
    p.description && el('p', { className: 'card-desc', textContent: p.description }),
    tags(p),
    el('div', { className: 'card-foot' }, meta(p), actions(p)),
  );
}

// Featured: the lead card runs full width with the screenshot beside the text;
// the rest go in pairs, and an odd one out at the end also runs full width.
function featureCard(p, i, n, animate) {
  const wide = n !== 2 && (i === 0 || (i === n - 1 && (n - 1) % 2 === 1));
  const node = el(
    'article',
    { className: `card feature${wide ? ' is-wide' : ''}${animate ? ' reveal' : ''}` },
    frame(p, { showUrl: true }),
    body(p, { eyebrow: i === 0 ? 'Featured' : null }),
  );
  node.style.setProperty('--i', i);
  return tint(node, p);
}

function gridCard(p, i, animate) {
  const node = el('li', { className: `card tile${animate ? ' reveal' : ''}` }, frame(p), body(p));
  node.style.setProperty('--i', i);
  return tint(node, p);
}

function endShell(count, animate, ...children) {
  const node = el('li', { className: `card end${animate ? ' reveal' : ''}` }, el('div', { className: 'end-inner' }, ...children));
  node.style.setProperty('--i', count);
  node.style.setProperty('--rest3', 3 - (count % 3));
  node.style.setProperty('--rest2', 2 - (count % 2));
  return node;
}

// Closes the grid: spans whatever is left of the last row, so rows always end flush.
function endCard(count, animate) {
  if (state.view === 'pinned') {
    const btn = el(
      'button',
      { type: 'button', className: 'btn btn-secondary' },
      `Browse all ${state.projects.length}`,
      icon('arrow', 16),
    );
    btn.dataset.focus = 'pin-more';
    btn.addEventListener('click', () => {
      setView('all');
      document.querySelector('.view[data-view="all"]')?.focus({ preventScroll: true });
    });
    return endShell(
      count,
      animate,
      el('span', { className: 'end-mark end-mark-pin' }, icon('star', 22)),
      el('h2', { className: 'end-title', textContent: 'Keep favourites close' }),
      el('p', { className: 'end-text', textContent: 'Star any project to pin it here for next time.' }),
      btn,
    );
  }
  const owner = state.data?.owner ?? {};
  const profile = httpUrl(owner.profileUrl);
  if (!profile) return null;
  const repos = new URL(profile);
  repos.searchParams.set('tab', 'repositories');
  const shapes = el('span', { className: 'end-shapes' }, el('i', { className: 's-sun' }), el('i', { className: 's-pill' }), el('i', { className: 's-half' }), el('i', { className: 's-dot' }));
  shapes.setAttribute('aria-hidden', 'true');
  const shell = endShell(
    count,
    animate,
    el(
      'div',
      { className: 'end-copy' },
      el('h2', { className: 'end-title', textContent: `That's all ${state.projects.length} — for now.` }),
      el('p', { className: 'end-text', textContent: 'New projects show up here as they land on GitHub.' }),
      el(
        'a',
        { className: 'btn btn-secondary', href: repos.href, target: '_blank', rel: 'noopener noreferrer' },
        icon('github', 15),
        'Browse on GitHub',
        icon('external', 15),
      ),
    ),
  );
  shell.classList.add('end-all');
  shell.append(shapes);
  return shell;
}

// ---------- Carousel ----------

// One slide at a time on a native scroll-snap track, so touch swipes and
// trackpads work as they do everywhere else. Only the current slide is
// interactive; the others are inert so they add no hidden tab stops.
const car = { index: 0, key: null, shown: false, list: [], target: null, settle: 0, raf: 0, width: 0 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const selectionKey = () => [state.view, state.query.trim().toLowerCase(), state.sort, state.category ?? ''].join('\u0000');

function slideBody(p) {
  return el(
    'div',
    { className: 'slide-body' },
    kicker(p, p.featured && state.view !== 'featured' ? 'Featured' : null),
    // Long names (some mix CJK and Latin) step down a size to keep slides even.
    el('h2', { className: `slide-title${[...(p.title ?? '')].length > 32 ? ' is-long' : ''}`, textContent: p.title }),
    p.description && el('p', { className: 'slide-desc', textContent: p.description }),
    tags(p),
    el('div', { className: 'slide-foot' }, meta(p), actions(p)),
  );
}

function slide(p, i, n) {
  const node = el('div', { className: 'slide' }, frame(p, { showUrl: true, eager: i < 2 }), slideBody(p));
  node.setAttribute('role', 'group');
  node.setAttribute('aria-roledescription', 'slide');
  node.setAttribute('aria-label', `${i + 1} of ${n}: ${p.title}`);
  return tint(node, p);
}

function thumbButton(p, i, n) {
  const b = el('button', { type: 'button', className: 'thumb', title: p.title, tabIndex: -1 });
  b.setAttribute('aria-label', `Slide ${i + 1} of ${n}: ${p.title}`);
  b.dataset.focus = `thumb:${p.name}`;
  const src = thumbUrl(p.thumbnail);
  if (src) {
    const img = el('img', { src, alt: '', loading: 'lazy', decoding: 'async', width: 64, height: 40 });
    img.addEventListener('error', () => img.replaceWith(cover(p, { compact: true })), { once: true });
    b.append(img);
  } else {
    b.append(cover(p, { compact: true }));
  }
  tint(b, p);
  b.addEventListener('click', () => goTo(i));
  return b;
}

const slideOffset = (track, i) => track.children[i].offsetLeft - track.children[0].offsetLeft;

function indexFromScroll(track) {
  const x = track.scrollLeft;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < track.children.length; i++) {
    const d = Math.abs(slideOffset(track, i) - x);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

function updateFades(strip) {
  const max = strip.scrollWidth - strip.clientWidth;
  strip.classList.toggle('fade-start', strip.scrollLeft > 2);
  strip.classList.toggle('fade-end', strip.scrollLeft < max - 2);
}

// Scroll the strip (only the strip, never the page) so a thumbnail is in view.
function revealThumb(thumb, smooth) {
  if (!thumb) return;
  const strip = thumb.parentElement;
  const room = 44;
  const left = thumb.offsetLeft;
  const right = left + thumb.offsetWidth;
  let to = null;
  if (left - room < strip.scrollLeft) to = left - room;
  else if (right + room > strip.scrollLeft + strip.clientWidth) to = right + room - strip.clientWidth;
  if (to !== null) strip.scrollTo({ left: Math.max(0, to), behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto' });
}

function setActive(i, { smooth = true } = {}) {
  const track = $('#carousel-track');
  const slides = [...track.children];
  const n = slides.length;
  if (!n) return;
  car.index = i;
  const focused = document.activeElement;

  // Focus inside a slide that is about to go inert would be dropped to <body>;
  // carry it to the same control on the new slide instead.
  const leaving = slides.find((s, k) => k !== i && s.contains(focused));
  slides.forEach((s, k) => {
    s.inert = k !== i;
    s.classList.toggle('is-active', k === i);
  });
  if (leaving) {
    const kind = ['.btn-primary', '.btn-secondary', '.pin', '.frame'].find((sel) => focused.matches(sel));
    const to = (kind && slides[i].querySelector(kind)) || slides[i].querySelector('.pin');
    to?.focus({ preventScroll: true });
  }

  $('#carousel-now').textContent = String(i + 1);
  $('#carousel-total').textContent = String(n);

  // Prev/Next are disabled at the ends; a focused button hands focus to its
  // partner first, so keyboard users are never left on <body>.
  const prev = $('#carousel-prev');
  const next = $('#carousel-next');
  const atStart = i === 0;
  const atEnd = i === n - 1;
  const onPrev = document.activeElement === prev;
  const onNext = document.activeElement === next;
  prev.disabled = atStart && !onPrev;
  next.disabled = atEnd && !onNext;
  if (atStart && onPrev && !atEnd) next.focus({ preventScroll: true });
  if (atEnd && onNext && !atStart) prev.focus({ preventScroll: true });
  prev.disabled = atStart;
  next.disabled = atEnd;

  // The strip is one tab stop (roving tabindex) that follows the slide.
  const thumbs = [...$('#carousel-strip').children];
  const thumbHadFocus = thumbs.includes(document.activeElement);
  thumbs.forEach((t, k) => {
    if (k === i) t.setAttribute('aria-current', 'true');
    else t.removeAttribute('aria-current');
    t.tabIndex = k === i ? 0 : -1;
  });
  if (thumbHadFocus && document.activeElement !== thumbs[i]) thumbs[i]?.focus({ preventScroll: true });
  revealThumb(thumbs[i], smooth);
}

function announce(message, where = '#carousel-live') {
  $(where).textContent = message;
}

// Buttons, keys and thumbnails come through here (swipes only update the UI).
function goTo(i) {
  const track = $('#carousel-track');
  const n = track.children.length;
  if (!n) return;
  const to = Math.max(0, Math.min(n - 1, i));
  const changed = to !== car.index;
  const left = slideOffset(track, to);
  if (Math.abs(track.scrollLeft - left) > 1) car.target = to;
  setActive(to);
  track.scrollTo({ left, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  if (changed) announce(`Slide ${to + 1} of ${n}: ${car.list[to]?.title ?? ''}`);
}

function onTrackScroll() {
  const track = $('#carousel-track');
  // Settled: whatever slide is snapped in place is the current one.
  clearTimeout(car.settle);
  car.settle = setTimeout(() => {
    car.target = null;
    const i = indexFromScroll(track);
    if (i !== car.index) setActive(i);
  }, 150);
  // While a button-driven scroll is running, the UI already shows its target.
  if (car.target !== null || car.raf) return;
  car.raf = requestAnimationFrame(() => {
    car.raf = 0;
    if (car.target !== null) return;
    const i = indexFromScroll(track);
    if (i !== car.index) setActive(i);
  });
}

function clearCarousel() {
  $('#carousel').hidden = true;
  $('#carousel-track').replaceChildren();
  $('#carousel-strip').replaceChildren();
  car.list = [];
  car.target = null;
}

function renderCarousel(list, animate) {
  const box = $('#carousel');
  const track = $('#carousel-track');
  const strip = $('#carousel-strip');
  // A new selection (view, search, sort, topic) or switching into the
  // carousel starts at slide 1; anything else (pinning) keeps the place.
  const key = selectionKey();
  const reset = key !== car.key || !car.shown;
  car.key = key;
  car.list = list;
  car.target = null;
  const n = list.length;
  box.hidden = n === 0;
  if (!n) {
    track.replaceChildren();
    strip.replaceChildren();
    car.index = 0;
    return;
  }
  const index = reset ? 0 : Math.min(car.index, n - 1);
  track.replaceChildren(...list.map((p, i) => slide(p, i, n)));
  strip.replaceChildren(...list.map((p, i) => thumbButton(p, i, n)));
  strip.hidden = n < 2;
  if (animate) box.classList.add('reveal');
  if (reset) strip.scrollLeft = 0;
  setActive(index, { smooth: false });
  track.scrollTo({ left: slideOffset(track, index), behavior: 'auto' });
  updateFades(strip);
}

function initCarousel() {
  const box = $('#carousel');
  const track = $('#carousel-track');
  const strip = $('#carousel-strip');
  $('#carousel-prev').addEventListener('click', () => goTo(car.index - 1));
  $('#carousel-next').addEventListener('click', () => goTo(car.index + 1));
  track.addEventListener('scroll', onTrackScroll, { passive: true });
  strip.addEventListener('scroll', () => updateFades(strip), { passive: true });

  // Inert slides let clicks fall through to the track: a click on the
  // peeking slide brings it forward.
  track.addEventListener('click', (e) => {
    if (e.target !== track) return;
    const k = [...track.children].findIndex((s) => {
      const r = s.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (k >= 0 && k !== car.index) goTo(k);
  });

  box.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const n = track.children.length;
    const to = { ArrowLeft: car.index - 1, ArrowRight: car.index + 1, Home: 0, End: n - 1 }[e.key];
    if (to === undefined || !n) return;
    e.preventDefault();
    goTo(to);
  });

  // Keep the current slide in place when the width changes (rotation, resize).
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w === car.width) return;
    car.width = w;
    if (box.hidden || !track.children.length) return;
    car.target = null;
    track.scrollTo({ left: slideOffset(track, car.index), behavior: 'auto' });
    revealThumb(strip.children[car.index], false);
    updateFades(strip);
  }).observe(track);
}

// ---------- Layout and theme switches ----------

function renderLayouts() {
  for (const b of document.querySelectorAll('.layout')) {
    b.setAttribute('aria-pressed', String(b.dataset.layout === state.layout));
  }
}

function setLayout(layout) {
  if (!LAYOUTS.includes(layout) || layout === state.layout) return;
  state.layout = layout;
  writePref(LAYOUT_KEY, layout);
  render({ animate: true });
}

const THEME_TEXT = {
  auto: { label: 'Auto', long: 'Auto (follows your device)', icon: 'monitor' },
  light: { label: 'Light', long: 'Light', icon: 'sun' },
  dark: { label: 'Dark', long: 'Dark', icon: 'moon' },
};
const THEME_COLORS = { light: '#f6f6f3', dark: '#060913' };

// Auto leaves data-theme off, so the stylesheet follows the device setting.
const prefersDark = matchMedia('(prefers-color-scheme: dark)');

// data-scheme always holds the mode actually shown (Auto resolved from the
// device), so dark-only effects need one selector instead of two.
function applyScheme() {
  const root = document.documentElement;
  root.dataset.scheme = root.dataset.theme ?? (prefersDark.matches ? 'dark' : 'light');
}

function applyTheme(theme, { changed = false } = {}) {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  applyScheme();
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = /dark/.test(m.media) ? 'dark' : 'light';
    m.content = THEME_COLORS[theme === 'auto' ? scheme : theme];
  }

  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  const label = `Theme: ${THEME_TEXT[theme].long}. Switch to ${THEME_TEXT[next].long}`;
  const btn = $('#theme-toggle');
  btn.dataset.theme = theme;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  $('#theme-label').textContent = THEME_TEXT[theme].label;
  const holder = $('#theme-icon');
  holder.replaceChildren(icon(THEME_TEXT[theme].icon, 18));
  if (changed) {
    holder.classList.remove('is-changing');
    void holder.offsetWidth;
    holder.classList.add('is-changing');
    announce(`Theme: ${THEME_TEXT[theme].long}`, '#announcer');
  }
}

function initTheme() {
  applyTheme(readPref(THEME_KEY, THEMES, 'auto'));
  prefersDark.addEventListener('change', applyScheme);
  $('#theme-toggle').addEventListener('click', (e) => {
    const current = e.currentTarget.dataset.theme;
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    writePref(THEME_KEY, next);
    applyTheme(next, { changed: true });
  });
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

// Filter chips by category (topics stay as tags on the cards).
function renderTopics(base) {
  const counts = new Map();
  for (const p of base) {
    const k = CATEGORY[p.category] ? p.category : 'other';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (state.category && !counts.has(state.category)) state.category = null;

  const box = $('#topics');
  box.replaceChildren();
  box.hidden = counts.size < 2;
  if (counts.size < 2) {
    // No chips are drawn, so a filter left over from another view could not be cleared.
    state.category = null;
    return;
  }
  const chip = (key, n) => {
    const c = key ? CATEGORY[key] : null;
    const b = el(
      'button',
      { type: 'button', className: 'chip' },
      c ? icon(c.icon, 14) : null,
      c ? c.label : 'All',
      el('span', { className: 'chip-n', textContent: n }),
    );
    if (key) tint(b, { name: key });
    b.setAttribute('aria-pressed', String(state.category === key));
    b.dataset.focus = `chip:${key ?? '*'}`;
    b.addEventListener('click', () => {
      state.category = state.category === key ? null : key;
      render();
    });
    return b;
  };
  box.append(
    chip(null, base.length),
    ...[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => chip(k, n)),
  );
}

const LIST_LABELS = { all: 'All projects', pinned: 'Pinned projects' };

function render({ animate = false } = {}) {
  // Re-rendering replaces the buttons, so remember which one had focus.
  const focusKey = document.activeElement?.dataset?.focus;
  if (state.view !== 'all' && baseSet().length === 0) {
    state.view = 'all';
    history.replaceState(null, '', '#all');
  }
  renderViews();
  renderLayouts();

  const base = baseSet();
  renderTopics(base);
  const list = visible(base);

  const featuredBox = $('#featured-list');
  const indexBox = $('#index-list');
  const status = $('#status');
  const more = $('#more');
  const asCarousel = state.layout === 'carousel';
  const asFeature = state.view === 'featured' && !asCarousel;

  // Only the active layout is in the DOM, so data-focus keys stay unique.
  featuredBox.hidden = !asFeature || list.length === 0;
  indexBox.hidden = asFeature || asCarousel || list.length === 0;
  if (asCarousel) {
    featuredBox.replaceChildren();
    indexBox.replaceChildren();
    renderCarousel(list, animate);
  } else if (asFeature) {
    clearCarousel();
    featuredBox.replaceChildren(...list.map((p, i) => featureCard(p, i, list.length, animate)));
    indexBox.replaceChildren();
  } else {
    clearCarousel();
    indexBox.setAttribute('aria-label', LIST_LABELS[state.view] ?? LIST_LABELS.all);
    const cards = list.map((p, i) => gridCard(p, i, animate));
    if (list.length) cards.push(endCard(list.length, animate));
    indexBox.replaceChildren(...cards.filter(Boolean));
    featuredBox.replaceChildren();
  }
  car.shown = asCarousel;

  more.hidden = state.view !== 'featured' || state.projects.length <= list.length;
  $('#see-all').replaceChildren(`See all ${state.projects.length} projects`, icon('arrow', 16));

  status.hidden = list.length > 0;
  if (!list.length) {
    status.textContent = state.query ? `Nothing matches “${state.query.trim()}”.` : 'Nothing here yet.';
  }
  $('#pin-hint').hidden = state.view !== 'pinned';

  if (focusKey) {
    const target =
      document.querySelector(`[data-focus="${CSS.escape(focusKey)}"]:not([hidden])`) ??
      document.querySelector('.view[aria-pressed="true"]');
    if (target && target.offsetParent !== null && !target.closest('[inert]')) target.focus({ preventScroll: true });
    else document.querySelector('.view[aria-pressed="true"]')?.focus({ preventScroll: true });
  }
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

function renderCollage(projects) {
  const box = $('#collage');
  const byRecent = (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
  const withShots = projects.filter((p) => thumbUrl(p.thumbnail)).sort(byRecent);
  const featured = withShots.filter((p) => p.featured);
  let pool = featured.length >= 3 ? featured : withShots;
  // Leave out what opens the default view (the lead feature, or the first row
  // of the grid) when there are enough others, so the hero is not a repeat of
  // the cards right below it. Then: newest on top, one from the middle, the oldest.
  const skip = pool === featured ? 1 : 3;
  if (pool.length - skip >= 3) pool = pool.slice(skip);
  const n = pool.length;
  const picks = [...new Set([0, Math.round((n - 1) / 2), n - 1])].filter((i) => i >= 0 && i < n).map((i) => pool[i]);
  box.hidden = picks.length < 2;
  box.closest('.hero')?.classList.toggle('no-collage', box.hidden);
  if (box.hidden) return;
  // Back to front: the most relevant shot sits on top.
  box.replaceChildren(
    ...picks
      .map((p, i) => el('div', { className: `shot shot-${i + 1} reveal` }, frame(p, { showUrl: true, decorative: true })))
      .reverse(),
  );
  box.dataset.count = picks.length;
}

function renderHeader(data) {
  const owner = data.owner ?? {};
  const name = owner.name || owner.login || '';
  const title = data.title || 'Projects';
  document.title = name ? `${title} · ${name}` : title;
  $('#title').textContent = title;
  $('#title-count').textContent = data.projects.length || '';
  $('#tagline').textContent = data.tagline ?? '';
  $('#owner-name').textContent = owner.login || name;
  $('#owner-mono').textContent = initial(name, owner.login ?? '');

  const profile = httpUrl(owner.profileUrl);
  const ownerLink = $('#owner');
  if (profile) {
    Object.assign(ownerLink, { href: profile, target: '_blank', rel: 'noopener noreferrer' });
    ownerLink.setAttribute('aria-label', `${owner.login || name} on GitHub`);
  } else {
    ownerLink.removeAttribute('href');
  }
  const avatar = httpUrl(owner.avatarUrl);
  if (avatar) {
    const img = $('#avatar');
    img.addEventListener('error', () => { img.hidden = true; }, { once: true });
    Object.assign(img, { src: avatar, hidden: false });
  }

  const live = data.projects.filter((p) => httpUrl(p.url)).length;
  const latest = data.projects.map((p) => p.updatedAt).filter((d) => !Number.isNaN(Date.parse(d))).sort().at(-1);
  const langs = new Map();
  for (const p of data.projects) if (p.language) langs.set(p.language, (langs.get(p.language) ?? 0) + 1);
  const topLang = [...langs].sort((a, b) => b[1] - a[1])[0]?.[0];
  // Bento-style tiles, each with its own soft colour.
  const stat = (label, value, hue) => {
    const tile = el('div', { className: 'stat' }, el('dt', { textContent: label }), el('dd', {}, value));
    tile.style.setProperty('--h', hue);
    return tile;
  };
  const latestEl = latest ? timeEl(latest, '') : null;
  $('#stats').replaceChildren(
    ...[
      stat('Projects', String(data.projects.length), 264),
      stat('Live sites', String(live), 150),
      topLang && stat('Mostly written in', topLang, 40),
      latestEl && stat('Last update', latestEl, 200),
    ].filter(Boolean),
  );

  renderCollage(data.projects);

  const generated = timeEl(data.generatedAt, '');
  $('#generated').replaceChildren(generated ?? '');
  if (data.source === 'fixture') $('#generated').append(' (sample data)');
}

// Entrance animations are one-shot: drop the class once each finishes.
document.addEventListener('animationend', (e) => {
  if (e.target instanceof Element) e.target.classList.remove('reveal');
});

// The theme switch works even if the project list fails to load.
initTheme();
renderLayouts();

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

  state.data = data;
  state.projects = Array.isArray(data.projects) ? data.projects : [];
  state.projects.forEach((p) => {
    if (!Array.isArray(p.topics)) p.topics = [];
  });
  data.projects = state.projects;
  renderHeader(data);

  const fromHash = location.hash.slice(1);
  const hasFeatured = state.projects.some((p) => p.featured);
  state.view = VIEWS.includes(fromHash) ? fromHash : hasFeatured ? 'featured' : 'all';

  // Browsers may restore form values on reload; start from what is shown.
  state.sort = $('#sort').value;
  state.query = $('#search').value;

  for (const btn of document.querySelectorAll('.view')) {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  }
  for (const btn of document.querySelectorAll('.layout')) {
    btn.addEventListener('click', () => setLayout(btn.dataset.layout));
  }
  initCarousel();
  $('#see-all').addEventListener('click', () => {
    setView('all');
    document.querySelector('.view[data-view="all"]')?.focus({ preventScroll: true });
  });
  $('#search').addEventListener('input', (e) => {
    state.query = e.target.value;
    render();
  });
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });
  // "/" jumps to search, as on GitHub.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    $('#search').focus();
  });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1), { push: false }));

  render({ animate: true });
}

init();
