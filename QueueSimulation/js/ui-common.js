// Shared UI helpers: page chrome, tabs, tables, number formatting, CSV export,
// charts, distribution panel and the SVG queue animation.
// This module touches the DOM; the engines never do.

import { CONFIG } from './config.js';
import { makeDistribution, assignmentText, validateDistribution } from './distributions.js';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Number with d decimals; '-' for null. */
export function fmt(x, d = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return '-';
  return Number(x).toFixed(d);
}

/** Percentage with d decimals, for example 0.655 gives "65.5%". */
export function pct(x, d = 0) {
  return `${(x * 100).toFixed(d)}%`;
}

/** Safe access to localStorage: used only for small conveniences. */
export const store = {
  get(key, fallback = null) {
    try {
      const v = window.localStorage.getItem(`queuesim.${key}`);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { window.localStorage.setItem(`queuesim.${key}`, String(value)); } catch (e) { /* storage unavailable */ }
  }
};

export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A new random seed for "Run new day" (the engines themselves never use Math.random). */
export function newSeed() {
  if (window.crypto && window.crypto.getRandomValues) {
    return window.crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  }
  return Math.floor(Math.random() * 1000000);
}

/** Lets the browser paint between chunks of a long calculation. */
export const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------
// Page chrome: theme and presentation mode
// ---------------------------------------------------------------------------

const themeListeners = [];
export function onThemeChange(fn) { themeListeners.push(fn); }

export function initChrome() {
  const root = document.documentElement;
  const savedTheme = store.get('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;

  const themeBtn = $('#theme-toggle');
  if (themeBtn) {
    const label = () => {
      const dark = currentThemeIsDark();
      themeBtn.textContent = dark ? 'Light theme' : 'Dark theme';
      themeBtn.setAttribute('aria-label', dark ? 'Switch to the light theme' : 'Switch to the dark theme');
    };
    label();
    themeBtn.addEventListener('click', () => {
      root.dataset.theme = currentThemeIsDark() ? 'light' : 'dark';
      store.set('theme', root.dataset.theme);
      label();
      themeListeners.forEach((fn) => fn());
    });
  }

  const presBtn = $('#presentation-toggle');
  if (presBtn) {
    const apply = (on) => {
      document.body.classList.toggle('presentation', on);
      presBtn.setAttribute('aria-pressed', String(on));
    };
    apply(store.get('presentation') === '1');
    presBtn.addEventListener('click', () => {
      const on = !document.body.classList.contains('presentation');
      apply(on);
      store.set('presentation', on ? '1' : '0');
      themeListeners.forEach((fn) => fn());
    });
  }

  // Tap support for the formula icons on touch screens.
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.info');
    $$('.info[aria-expanded="true"]').forEach((b) => { if (b !== btn) b.setAttribute('aria-expanded', 'false'); });
    if (btn) btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') $$('.info[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  });
}

function currentThemeIsDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------------------------------------------------------------------------
// Tabs (WAI-ARIA tab pattern with arrow-key navigation)
// ---------------------------------------------------------------------------

export function setupTabs(tablist, onSelect) {
  const tabs = () => $$('[role="tab"]', tablist).filter((t) => !t.hidden);
  function select(tab, focus = false) {
    for (const t of $$('[role="tab"]', tablist)) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
    onSelect(tab.dataset.mode);
  }
  tablist.addEventListener('click', (ev) => {
    const tab = ev.target.closest('[role="tab"]');
    if (tab) select(tab);
  });
  tablist.addEventListener('keydown', (ev) => {
    const list = tabs();
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (ev.key === 'ArrowRight') j = (i + 1) % list.length;
    if (ev.key === 'ArrowLeft') j = (i - 1 + list.length) % list.length;
    if (ev.key === 'Home') j = 0;
    if (ev.key === 'End') j = list.length - 1;
    if (j !== null) { ev.preventDefault(); select(list[j], true); }
  });
  return { select: (mode) => select($(`[data-mode="${mode}"]`, tablist)) };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Column heading with an optional formula icon (shown on hover, focus or tap). */
export function headingHtml(label, formula) {
  if (!formula || !CONFIG.showFormulas) return esc(label);
  return `${esc(label)}<button type="button" class="info" aria-label="Formula for ${esc(label)}" aria-expanded="false">i<span class="tip" role="tooltip">${esc(formula)}</span></button>`;
}

/**
 * Renders a simulation table.
 *   columns: [{ key, label, formula, get(row) -> text, total(rows) -> text, cls }]
 *   rows:    row objects
 *   opts:    { footLabel, footExtra (html), rowAttr(row, i) }
 */
export function renderTable(table, columns, rows, opts = {}) {
  const head = `<thead><tr>${columns.map((c) => `<th scope="col" class="${c.cls || ''}">${headingHtml(c.label, c.formula)}</th>`).join('')}</tr></thead>`;
  const parts = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let cells = '';
    for (let j = 0; j < columns.length; j++) {
      const c = columns[j];
      cells += j === 0
        ? `<th scope="row" class="${c.cls || ''}">${c.get(r, i)}</th>`
        : `<td class="${c.cls || ''}" data-col="${c.key}">${c.get(r, i)}</td>`;
    }
    parts[i] = `<tr data-i="${i}">${cells}</tr>`;
  }
  let foot = '';
  if (opts.footLabel) {
    foot = `<tfoot><tr>${columns.map((c, j) => (j === 0
      ? `<th scope="row" class="text">${esc(opts.footLabel)}</th>`
      : `<td class="${c.cls || ''}">${c.total ? c.total(rows) : ''}</td>`)).join('')}</tr>${opts.footExtra || ''}</tfoot>`;
  }
  table.innerHTML = `${head}<tbody>${parts.join('')}</tbody>${foot}`;
}

/** Marks one table row as current and scrolls it into view inside its scroll box. */
export function markCurrentRow(table, index) {
  const prev = $('tr.current', table);
  if (prev) prev.classList.remove('current');
  if (index === null || index < 0) return;
  const row = $(`tbody tr[data-i="${index}"]`, table);
  if (!row) return;
  row.classList.add('current');
  const box = table.closest('.table-scroll');
  if (box && box.scrollHeight > box.clientHeight) {
    const top = row.offsetTop - box.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
}

/**
 * Measures table: items [{ num, label, formula, value, theory }].
 * The theoretical column is shown beside the simulated value when provided.
 */
export function renderMeasures(container, items) {
  const showF = CONFIG.showFormulas;
  container.innerHTML = `<div class="table-scroll"><table class="measures">
    <thead><tr><th scope="col">#</th><th scope="col" class="text">Measure</th>${showF ? '<th scope="col" class="text">Formula</th>' : ''}<th scope="col">Simulated value</th><th scope="col">Theoretical value</th></tr></thead>
    <tbody>${items.map((m) => `<tr><td>${m.num}</td><td class="text">${esc(m.label)}</td>${showF ? `<td class="formula">${esc(m.formula)}</td>` : ''}<td class="value">${m.value}</td><td>${m.theory ?? ''}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

/**
 * Replication table with summary rows (average, standard deviation, minimum, maximum).
 *   columns: [{ key, label, digits }]; rows: objects with those keys; summary: { key: {avg, sd, min, max} }
 */
export function renderReplicationTable(table, firstLabel, columns, rows, summary) {
  const head = `<thead><tr><th scope="col">${esc(firstLabel)}</th>${columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead>`;
  const body = rows.map((r, i) => `<tr><th scope="row">${i + 1}</th>${columns.map((c) => `<td>${fmt(r[c.key], c.digits)}</td>`).join('')}</tr>`).join('');
  const names = [['avg', 'Average'], ['sd', 'Standard deviation'], ['min', 'Minimum'], ['max', 'Maximum']];
  const foot = names.map(([k, label]) => `<tr><th scope="row" class="text">${label}</th>${columns.map((c) => `<td>${fmt(summary[c.key][k], k === 'sd' ? Math.max(c.digits, 3) : c.digits)}</td>`).join('')}</tr>`).join('');
  table.innerHTML = `${head}<tbody>${body}</tbody><tfoot>${foot}</tfoot>`;
}

/** Frequency table: labels, counts, and percentages of the total. */
export function renderFrequencyTable(container, title, labels, counts, unitLabel) {
  const total = counts.reduce((s, c) => s + c, 0);
  container.innerHTML = `<table class="plain">
    <caption class="text muted small" style="caption-side: top; text-align: left; padding-bottom: 4px;">${esc(title)}</caption>
    <thead><tr><th scope="col" class="text">Interval (minutes)</th><th scope="col">${esc(unitLabel)}</th><th scope="col">Percent</th></tr></thead>
    <tbody>${labels.map((l, i) => `<tr><td class="text">${esc(l)}</td><td>${counts[i]}</td><td>${total ? pct(counts[i] / total, 1) : '-'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row" class="text">Total</th><td>${total}</td><td>${total ? '100%' : '-'}</td></tr></tfoot>
  </table>`;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds CSV text from a header and rows (arrays), then offers it as a download. */
export function downloadCSV(filename, header, rows) {
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Charts (Chart.js 4; the page still works when the library cannot load)
// ---------------------------------------------------------------------------

const charts = new Map();

export function chartAvailable() {
  return typeof window.Chart === 'function';
}

/**
 * Draws a chart in `box` (a .chart-box element). `build(colors)` returns the
 * Chart.js configuration. If Chart.js is missing, a short message replaces the chart.
 */
export function drawChart(box, build) {
  const old = charts.get(box);
  if (old) { old.destroy(); charts.delete(box); }
  if (!chartAvailable()) {
    box.innerHTML = '<div class="chart-fallback">The chart library could not be loaded, so this chart is not shown. The same values appear in the tables on this page.</div>';
    return null;
  }
  box.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', box.dataset.label || 'Chart');
  box.appendChild(canvas);
  const colors = {
    c1: cssVar('--chart-1'), c2: cssVar('--chart-2'), c3: cssVar('--chart-3'),
    text: cssVar('--text'), muted: cssVar('--muted'), grid: cssVar('--border')
  };
  const cfg = build(colors);
  const big = document.body.classList.contains('presentation');
  cfg.options = cfg.options || {};
  cfg.options.responsive = true;
  cfg.options.maintainAspectRatio = false;
  cfg.options.animation = prefersReducedMotion() ? false : { duration: 300 };
  cfg.options.plugins = { ...(cfg.options.plugins || {}) };
  cfg.options.plugins.legend = { labels: { color: colors.text, font: { size: big ? 16 : 12 } }, ...(cfg.options.plugins.legend || {}) };
  for (const axis of Object.values(cfg.options.scales || {})) {
    axis.ticks = { color: colors.muted, font: { size: big ? 15 : 12 }, ...(axis.ticks || {}) };
    axis.grid = { color: colors.grid, ...(axis.grid || {}) };
    if (axis.title) axis.title = { display: true, color: colors.text, font: { size: big ? 15 : 12 }, ...axis.title };
  }
  const chart = new window.Chart(canvas, cfg);
  charts.set(box, chart);
  return chart;
}

/** Standard bar chart. */
export function barChart(box, { labels, datasets, xTitle, yTitle, yMax = undefined, stepSize = undefined }) {
  return drawChart(box, (c) => ({
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        label: d.label,
        data: d.data,
        backgroundColor: [c.c1, c.c2, c.c3][i % 3],
        borderWidth: 0,
        maxBarThickness: 48
      }))
    },
    options: {
      plugins: { legend: { display: datasets.length > 1 } },
      scales: {
        x: { title: { text: xTitle }, grid: { display: false } },
        y: { beginAtZero: true, max: yMax, title: { text: yTitle }, ticks: stepSize ? { stepSize } : {} }
      }
    }
  }));
}

/** Line chart of one value per replication, with a horizontal line at the overall average. */
export function lineWithAverage(box, { labels, data, average, label, xTitle, yTitle }) {
  return drawChart(box, (c) => ({
    type: 'line',
    data: {
      labels,
      datasets: [
        { label, data, borderColor: c.c1, backgroundColor: c.c1, pointRadius: labels.length > 100 ? 0 : 2, borderWidth: 2, tension: 0 },
        { label: `Overall average (${fmt(average)})`, data: labels.map(() => average), borderColor: c.c2, borderDash: [6, 4], pointRadius: 0, borderWidth: 2 }
      ]
    },
    options: {
      scales: {
        x: { title: { text: xTitle }, ticks: { maxTicksLimit: 20 } },
        y: { beginAtZero: true, title: { text: yTitle } }
      }
    }
  }));
}

// ---------------------------------------------------------------------------
// Distribution panel
// ---------------------------------------------------------------------------

/**
 * Renders the probability tables, cumulative probabilities and random-digit
 * assignments, plus a bar chart of each distribution.
 *   defs:     [{ id, def (values, probs, digits, name), valueLabel }]
 *   editable: probabilities can be changed (random and replication modes)
 *   onChange(dists, ok): called with the current distributions after each edit
 * Returns { get() -> { id: distribution }, ok() -> bool, setEditable(bool), reset() }.
 */
export function createDistributionPanel(container, defs, onChange) {
  const clone = (list) => list.map((d) => ({ ...d, def: { ...d.def, values: d.def.values.slice(), probs: d.def.probs.slice() } }));
  const original = clone(defs);
  let edited = clone(defs);      // the student's distributions, kept while a non-editable mode is shown
  let editable = false;
  let valid = true;
  const view = () => (editable && CONFIG.enableProbabilityEditing ? edited : original);
  const num = (x) => (Number.isFinite(x) ? x : '');

  function build() {
    const allowEdit = editable && CONFIG.enableProbabilityEditing;
    const list = view();
    container.innerHTML = `
      <p class="muted small">${allowEdit
        ? 'In this mode the distributions can be edited to explore "what if" scenarios: change a time or a probability, or add and remove rows. Times must be different whole numbers of at least 1 minute, and each table must sum to 1. The cumulative probabilities and random-digit assignments are recalculated automatically, and the new values apply from the next run.'
        : (CONFIG.enableProbabilityEditing
          ? 'The textbook distributions are used in this mode. They can be edited in the other modes.'
          : 'The textbook distributions are used.')}</p>
      <div class="grid-halves">${list.map((d, idx) => {
        const dist = makeDistribution(d.def);
        const ok = validateDistribution(d.def.values, d.def.probs).ok;
        return `<section aria-labelledby="dist-h-${d.id}">
          <h3 id="dist-h-${d.id}">${esc(d.def.name)} (${d.def.digits}-digit random numbers)</h3>
          <div class="table-scroll"><table class="plain dist-table">
            <thead><tr><th scope="col">${esc(d.valueLabel)}</th><th scope="col">Probability</th><th scope="col">Cumulative probability</th><th scope="col">Random-digit assignment</th></tr></thead>
            <tbody>${dist.rows.map((r, i) => `<tr><td>${allowEdit
              ? `<label class="visually-hidden" for="v-${d.id}-${i}">Time in row ${i + 1} (${esc(d.def.name)})</label><input class="prob-input val-input" id="v-${d.id}-${i}" type="number" min="1" step="1" value="${num(d.def.values[i])}" data-dist="${idx}" data-row="${i}" data-kind="value">`
              : r.value}</td><td>${allowEdit
              ? `<label class="visually-hidden" for="p-${d.id}-${i}">Probability in row ${i + 1} (${esc(d.def.name)})</label><input class="prob-input" id="p-${d.id}-${i}" type="number" min="0" max="1" step="0.005" value="${num(d.def.probs[i])}" data-dist="${idx}" data-row="${i}" data-kind="prob">`
              : fmt(r.p, 3)}</td><td>${ok ? fmt(r.cum, 3) : '-'}</td><td class="mono">${ok ? assignmentText(r, dist) : '-'}</td></tr>`).join('')}</tbody>
            <tfoot><tr><th scope="row">Sum</th><td>${fmt(dist.sum, 3)}</td><td colspan="2" class="text">Expected value: <strong>${ok ? fmt(dist.expected) : '-'}</strong> minutes</td></tr></tfoot>
          </table></div>
          ${allowEdit ? `<p class="control-group"><button type="button" class="dist-add" data-dist="${idx}">Add a row</button><button type="button" class="dist-remove" data-dist="${idx}" ${d.def.values.length <= 1 ? 'disabled' : ''}>Remove the last row</button></p>` : ''}
          <div class="error" id="dist-err-${d.id}" role="alert"></div>
          <div class="chart-box short" data-label="Probability distribution of ${esc(d.def.name)}" id="dist-chart-${d.id}"></div>
        </section>`;
      }).join('')}</div>
      ${allowEdit ? '<p><button type="button" class="dist-reset">Restore the textbook distributions</button></p>' : ''}`;
    list.forEach((d) => drawDistChart(d));
    $$('input.prob-input', container).forEach((inp) => inp.addEventListener('change', onEdit));
    $$('.dist-add', container).forEach((b) => b.addEventListener('click', () => {
      const def = edited[Number(b.dataset.dist)].def;
      const finite = def.values.filter(Number.isFinite);
      def.values.push(finite.length ? Math.max(...finite) + 1 : 1);
      def.probs.push(0);
      rebuild(null, `.dist-add[data-dist="${b.dataset.dist}"]`);
    }));
    $$('.dist-remove', container).forEach((b) => b.addEventListener('click', () => {
      const def = edited[Number(b.dataset.dist)].def;
      if (def.values.length <= 1) return;
      def.values.pop();
      def.probs.pop();
      rebuild(null, `.dist-add[data-dist="${b.dataset.dist}"]`);
    }));
    const reset = $('.dist-reset', container);
    if (reset) reset.addEventListener('click', () => { edited = clone(original); rebuild(null, '.dist-reset'); });
    checkAll();
  }

  function drawDistChart(d) {
    barChart($(`#dist-chart-${d.id}`, container), {
      labels: d.def.values.map((v) => String(num(v))),
      datasets: [{ label: 'Probability', data: d.def.probs.map((p) => (Number.isFinite(p) ? p : 0)) }],
      xTitle: d.valueLabel,
      yTitle: 'Probability'
    });
  }

  function checkAll() {
    valid = true;
    view().forEach((d, idx) => {
      const v = validateDistribution(d.def.values, d.def.probs);
      const err = $(`#dist-err-${d.id}`, container);
      if (err) err.textContent = v.ok ? '' : v.message;
      $$(`input[data-dist="${idx}"]`, container).forEach((inp) => inp.setAttribute('aria-invalid', String(!v.ok)));
      if (!v.ok) valid = false;
    });
    return valid;
  }

  /** Rebuilds the panel, then puts the focus back where the user was working. */
  function rebuild(focusId, focusSelector) {
    build();
    const target = focusId ? document.getElementById(focusId) : (focusSelector ? $(focusSelector, container) : null);
    if (target) target.focus();
    notify();
  }

  function onEdit(ev) {
    const inp = ev.target;
    const def = edited[Number(inp.dataset.dist)].def;
    const value = inp.value === '' ? NaN : Number(inp.value);
    if (inp.dataset.kind === 'value') def.values[Number(inp.dataset.row)] = value;
    else def.probs[Number(inp.dataset.row)] = value;
    rebuild(inp.id);
  }

  function notify() { onChange(api.get(), valid); }

  const api = {
    get() {
      const out = {};
      for (const d of view()) out[d.id] = makeDistribution(d.def);
      return out;
    },
    ok: () => valid,
    setEditable(on) {
      if (on === editable) return;
      editable = on;
      build();
    },
    redraw: () => view().forEach((d) => drawDistChart(d))
  };
  build();
  return api;
}

// ---------------------------------------------------------------------------
// Speed slider
// ---------------------------------------------------------------------------

const SPEED_DELAYS = [1600, 1100, 750, 500, 330, 200, 120, 60, 25, 5];

/** Connects a range input (1 to 10) to a delay in milliseconds between events. */
export function setupSpeed(input, output) {
  const saved = Number(store.get('speed', '4'));
  input.value = saved >= 1 && saved <= 10 ? saved : 4;
  const update = () => {
    if (output) output.textContent = `${input.value} of 10`;
    store.set('speed', input.value);
  };
  input.addEventListener('input', update);
  update();
  return () => SPEED_DELAYS[Number(input.value) - 1];
}

// ---------------------------------------------------------------------------
// Queue animation (inline SVG; it only replays the engine's event list)
// ---------------------------------------------------------------------------

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, text = null) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== null) e.textContent = text;
  return e;
}

/**
 * QueueAnimator draws customers as numbered circles that enter from the left,
 * wait in one horizontal line, move into a server box, and leave to the right.
 *   servers: ['Server'] for one server, or ['Able', 'Baker'] for two servers
 * Call load(events, rows) with the engine output, then show(k) to display the
 * state after the first k events. No value is computed here except what is read
 * from the event list.
 */
export class QueueAnimator {
  constructor(container, { servers = ['Server'], noun = 'Customer' } = {}) {
    this.servers = servers;
    this.noun = noun;
    this.events = [];
    this.rows = [];
    this.nodes = new Map();
    this.maxSlots = 10;
    this.H = servers.length === 1 ? 230 : 290;
    this.svg = svgEl('svg', {
      viewBox: `0 0 900 ${this.H}`,
      class: 'anim-svg',
      role: 'img',
      'aria-label': servers.length === 1
        ? 'Animation of the single-server queue: customers wait in line, are served, and leave.'
        : 'Animation of the two-server queue: callers wait in one line and are served by Able or Baker.'
    });
    container.innerHTML = '';
    container.appendChild(this.svg);
    this.drawStatic();
  }

  drawStatic() {
    const s = this.svg;
    const midY = this.H / 2 + 10;
    this.qY = midY;
    this.clock = svgEl('text', { x: 16, y: 30, class: 'clock' }, 'Clock: minute 0');
    s.appendChild(this.clock);
    s.appendChild(svgEl('text', { x: 16, y: this.H - 12, class: 'label' }, 'Arrivals'));
    s.appendChild(svgEl('text', { x: 884, y: 30, class: 'label', 'text-anchor': 'end' }, 'Departures'));
    s.appendChild(svgEl('rect', { x: 70, y: midY - 26, width: 520, height: 52, rx: 26, class: 'lane' }));
    s.appendChild(svgEl('text', { x: 330, y: midY - 34, class: 'label', 'text-anchor': 'middle' }, 'Queue (first in, first out)'));
    this.more = svgEl('text', { x: 80, y: midY + 44, class: 'more' }, '');
    s.appendChild(this.more);

    this.serverPos = {};
    this.serverEls = {};
    const n = this.servers.length;
    this.servers.forEach((name, i) => {
      const cy = n === 1 ? midY : (i === 0 ? midY - 62 : midY + 62);
      const x = 630, w = 190, h = n === 1 ? 96 : 92;
      this.serverPos[name] = { x: x + w / 2 - 30, y: cy + 4 };
      const box = svgEl('rect', { x, y: cy - h / 2, width: w, height: h, rx: 10, class: 'server-box idle' });
      const title = svgEl('text', { x: x + 12, y: cy - h / 2 + 22, class: 'server-name' }, name);
      const status = svgEl('text', { x: x + w - 10, y: cy + h / 2 - 12, class: 'server-status idle', 'text-anchor': 'end' }, 'Idle');
      s.append(box, title, status);
      s.appendChild(svgEl('path', { d: `M590 ${midY} C 615 ${midY}, 615 ${cy}, ${x} ${cy}`, class: 'arrow' }));
      s.appendChild(svgEl('path', { d: `M${x + w} ${cy} L 870 ${cy}`, class: 'arrow' }));
      const els = { box, status };
      if (n > 1) {
        // Running utilization bar: busy time so far / clock.
        const bx = x, by = cy + h / 2 + 6;
        s.appendChild(svgEl('rect', { x: bx, y: by, width: w, height: 10, class: 'util-bg' }));
        els.util = svgEl('rect', { x: bx, y: by, width: 0, height: 10, class: 'util-fill' });
        els.utilText = svgEl('text', { x: x + w - 10, y: cy - h / 2 + 21, class: 'label', 'text-anchor': 'end', 'font-size': 13 }, 'Utilization 0%');
        s.append(els.util, els.utilText);
      }
      this.serverEls[name] = els;
    });
    this.layer = svgEl('g');
    s.appendChild(this.layer);
  }

  load(events, rows) {
    this.events = events;
    this.rows = rows;
    for (const g of this.nodes.values()) g.remove();
    this.nodes.clear();
    this.show(0);
  }

  slotPos(i) {
    return { x: 560 - i * 48, y: this.qY };
  }

  node(id) {
    let g = this.nodes.get(id);
    if (!g) {
      g = svgEl('g', { class: 'cust' });
      g.appendChild(svgEl('circle', { r: 18, cx: 0, cy: 0 }));
      g.appendChild(svgEl('text', { x: 0, y: 5, 'text-anchor': 'middle' }, String(id)));
      g.setAttribute('aria-hidden', 'true');
      g.style.transform = `translate(20px, ${this.qY}px)`;
      g.style.opacity = '0';
      this.layer.appendChild(g);
      this.nodes.set(id, g);
      // Force a style flush so that the move from the entrance is animated.
      g.getBoundingClientRect();
    }
    return g;
  }

  /** Displays the state of the system after the first k events. */
  show(k) {
    const queue = [];
    const inService = {};
    for (const name of this.servers) inService[name] = null;
    const justLeft = [];
    let clock = 0;
    for (let i = 0; i < k && i < this.events.length; i++) {
      const e = this.events[i];
      const srv = e.server || this.servers[0];
      clock = e.time;
      if (e.type === 'arrival') queue.push(e.customer);
      else if (e.type === 'start') { queue.splice(queue.indexOf(e.customer), 1); inService[srv] = e.customer; }
      else if (e.type === 'departure') { inService[srv] = null; if (i === k - 1) justLeft.push(e.customer); }
    }
    this.clock.textContent = `Clock: minute ${clock}`;

    const visible = new Set();
    queue.slice(0, this.maxSlots).forEach((id, i) => {
      const g = this.node(id);
      const p = this.slotPos(i);
      g.classList.remove('in-service', 'leaving');
      g.style.opacity = '1';
      g.style.transform = `translate(${p.x}px, ${p.y}px)`;
      visible.add(id);
    });
    this.more.textContent = queue.length > this.maxSlots ? `+${queue.length - this.maxSlots} more waiting (${queue.length} in the queue)` : (queue.length ? `${queue.length} in the queue` : 'Queue is empty');

    for (const name of this.servers) {
      const id = inService[name];
      const els = this.serverEls[name];
      const busy = id !== null;
      els.box.setAttribute('class', `server-box ${busy ? 'busy' : 'idle'}`);
      els.status.setAttribute('class', `server-status ${busy ? 'busy' : 'idle'}`);
      els.status.textContent = busy ? `Busy (${this.noun.toLowerCase()} ${id})` : 'Idle';
      if (busy) {
        const g = this.node(id);
        const p = this.serverPos[name];
        g.classList.add('in-service');
        g.classList.remove('leaving');
        g.style.opacity = '1';
        g.style.transform = `translate(${p.x}px, ${p.y}px)`;
        visible.add(id);
      }
      if (els.util) {
        let busyTime = 0;
        for (const r of this.rows) {
          if (r.server === name && r.begin < clock) busyTime += Math.min(r.end, clock) - r.begin;
        }
        const u = clock > 0 ? busyTime / clock : 0;
        els.util.setAttribute('width', String(190 * u));
        els.utilText.textContent = `Utilization ${Math.round(u * 100)}%`;
      }
    }

    for (const id of justLeft) {
      const g = this.nodes.get(id);
      if (!g) continue;
      const y = g.style.transform.match(/,\s*([\d.]+)px/);
      g.classList.add('leaving');
      g.classList.remove('in-service');
      g.style.opacity = '0';
      g.style.transform = `translate(880px, ${y ? y[1] : this.qY}px)`;
      visible.add(id);
    }
    for (const [id, g] of this.nodes) {
      if (!visible.has(id)) {
        g.remove();
        this.nodes.delete(id);
      } else if (justLeft.includes(id)) {
        const ms = prefersReducedMotion() ? 0 : 700;
        setTimeout(() => { if (g.classList.contains('leaving')) { g.remove(); if (this.nodes.get(id) === g) this.nodes.delete(id); } }, ms);
      }
    }
    return { clock, queue, inService };
  }

  /** Sets how long a move takes, so that fast playback stays readable. */
  setDuration(ms) {
    const d = prefersReducedMotion() ? 0 : Math.max(0, Math.min(600, ms * 0.8));
    this.svg.style.setProperty('--anim-ms', `${d}ms`);
  }
}

/**
 * Playback controller: steps through an event list with a delay from the speed
 * slider. onStep(k) is called after each step; onDone() at the end.
 */
export class Player {
  constructor({ total, getDelay, onStep, onState }) {
    this.k = 0;
    this.total = total;
    this.getDelay = getDelay;
    this.onStep = onStep;
    this.onState = onState || (() => {});
    this.timer = null;
  }
  get playing() { return this.timer !== null; }
  setTotal(total) { this.stop(); this.k = 0; this.total = total; }
  stepTo(k) {
    this.k = Math.max(0, Math.min(this.total, k));
    this.onStep(this.k);
  }
  play(untilFn = null) {
    if (this.playing) return;
    if (prefersReducedMotion()) {
      // Reduced motion: replace the animation with an instant update.
      let k = this.k;
      while (k < this.total && !(untilFn && untilFn(k))) k++;
      this.stepTo(k);
      this.onState(false);
      return;
    }
    const tick = () => {
      if (this.k >= this.total || (untilFn && untilFn(this.k))) { this.stop(); return; }
      this.stepTo(this.k + 1);
      this.timer = setTimeout(tick, this.getDelay());
    };
    this.timer = setTimeout(tick, 0);
    this.onState(true);
  }
  stop() {
    if (this.timer !== null) clearTimeout(this.timer);
    const was = this.timer !== null;
    this.timer = null;
    if (was) this.onState(false);
  }
}
