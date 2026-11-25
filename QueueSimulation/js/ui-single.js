// DOM and animation code for single-server.html (Grocery Checkout).
// All values shown come from the engine (single-server.js) and measures.js.

import { CONFIG } from './config.js';
import { formatDigits, deriveSeed, normalizeSeed, createRng } from './rng.js';
import { GROCERY_ARRIVAL, GROCERY_SERVICE, DISTRIBUTIONS, generateDigitsForTimes } from './distributions.js';
import { simulateSingleServer, simulateSingleServerSeeded } from './single-server.js';
import {
  singleServerMeasures, dailyMeasures, singleServerKeyFindings, summarize,
  histogram, relativeFrequency
} from './measures.js';
import { GROCERY_TEXTBOOK } from '../data/grocery-textbook.js';
import {
  $, esc, fmt, pct, initChrome, setupTabs, renderTable, markCurrentRow, renderMeasures,
  renderReplicationTable, renderFrequencyTable, downloadCSV, barChart, lineWithAverage,
  createDistributionPanel, setupSpeed, QueueAnimator, Player, newSeed, nextFrame, onThemeChange
} from './ui-common.js';

initChrome();

// ---------------------------------------------------------------------------
// Distributions (editable in the random and replication modes)
// ---------------------------------------------------------------------------

let dists = null;
let distsOk = true;
const distPanel = createDistributionPanel($('#dist-panel'), [
  { id: 'arrival', def: GROCERY_ARRIVAL, valueLabel: 'Time between arrivals (min)' },
  { id: 'service', def: GROCERY_SERVICE, valueLabel: 'Service time (min)' }
], (d, ok) => applyDists(d, ok, true));

/** Takes the distributions in effect; `edited` is true after a change by the user. */
function applyDists(d, ok, edited) {
  dists = d;
  distsOk = ok;
  const msg = ok ? '' : 'The input distributions are not valid; see the messages in the distribution panel. Correct them before running.';
  $('#day-error').textContent = msg;
  $('#days-error').textContent = msg;
  ['#day-new', '#day-run', '#days-new', '#days-run'].forEach((s) => { $(s).disabled = !ok; });
  if (ok && edited) {
    const note = 'The input distributions have changed; run again to apply them.';
    if (dayResult) $('#day-status').textContent = note;
    if (daysResult) $('#days-status').textContent = note;
  }
}
dists = distPanel.get();

// ---------------------------------------------------------------------------
// Column definitions of the simulation table (SPEC Section 4.2)
// ---------------------------------------------------------------------------

const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] ?? 0), 0);

function columns({ serviceDigitsKnown = true, withWaited = false } = {}) {
  const cols = [
    { key: 'customer', label: 'Customer', formula: 'Customer number i, in order of arrival.', get: (r) => r.customer },
    { key: 'arrivalDigits', label: 'Random digits (arrival)', formula: 'Three-digit random number (001 to 000). Customer 1 arrives at time 0 and needs none.', cls: 'mono', get: (r) => formatDigits(r.arrivalDigits, 3) },
    { key: 'iat', label: 'Time since last arrival (min)', formula: 'A(i): the time whose random-digit interval contains the arrival digits.', get: (r) => (r.iat === null ? '-' : r.iat), total: (rows) => sum(rows, 'iat') },
    { key: 'arrival', label: 'Arrival time', formula: 'Arrival(i) = Arrival(i-1) + A(i); Arrival(1) = 0.', get: (r) => r.arrival },
    { key: 'serviceDigits', label: 'Random digits (service)', formula: 'Two-digit random number (01 to 00) for the service time.', cls: 'mono', get: (r) => (serviceDigitsKnown ? formatDigits(r.serviceDigits, 2) : 'see slide') },
    { key: 'service', label: 'Service time (min)', formula: 'S(i): the service time whose random-digit interval contains the service digits.', get: (r) => r.service, total: (rows) => sum(rows, 'service') },
    { key: 'begin', label: 'Time service begins', formula: 'Begin(i) = max(Arrival(i), End(i-1)): service starts when the customer is present and the server is free.', get: (r) => r.begin },
    { key: 'wait', label: 'Waiting time in queue (min)', formula: 'Wait(i) = Begin(i) - Arrival(i).', get: (r) => r.wait, total: (rows) => sum(rows, 'wait') },
    { key: 'end', label: 'Time service ends', formula: 'End(i) = Begin(i) + S(i).', get: (r) => r.end },
    { key: 'system', label: 'Time customer spends in system (min)', formula: 'System(i) = End(i) - Arrival(i) = Wait(i) + S(i).', get: (r) => r.system, total: (rows) => sum(rows, 'system') },
    { key: 'idle', label: 'Idle time of server (min)', formula: 'Idle(i) = Begin(i) - End(i-1), with End(0) = 0.', get: (r) => r.idle, total: (rows) => sum(rows, 'idle') }
  ];
  if (withWaited) {
    cols.push({ key: 'waited', label: 'Customer waited? (1 = yes)', formula: '1 if Wait(i) > 0, otherwise 0.', get: (r) => r.waited, total: (rows) => sum(rows, 'waited') });
  }
  return cols;
}

function csvRows(rows, withWaited, serviceDigitsKnown = true, dayNumber = null) {
  return rows.map((r) => {
    const line = [
      r.customer, formatDigits(r.arrivalDigits, 3), r.iat === null ? '-' : r.iat, r.arrival,
      serviceDigitsKnown ? formatDigits(r.serviceDigits, 2) : '', r.service, r.begin, r.wait, r.end, r.system, r.idle
    ];
    if (withWaited) line.push(r.waited);
    if (dayNumber !== null) line.unshift(dayNumber);
    return line;
  });
}

const CSV_HEADER = ['Customer', 'Random digits (arrival)', 'Time since last arrival (min)', 'Arrival time', 'Random digits (service)',
  'Service time (min)', 'Time service begins', 'Waiting time in queue (min)', 'Time service ends',
  'Time customer spends in system (min)', 'Idle time of server (min)'];

// ---------------------------------------------------------------------------
// Plain-language explanations of each event
// ---------------------------------------------------------------------------

function explainEvent(e, rows) {
  const r = rows[e.customer - 1];
  const prev = e.customer > 1 ? rows[e.customer - 2] : null;
  const c = `Customer ${r.customer}`;
  if (e.type === 'arrival') {
    if (!prev) return `${c} arrives at minute 0. The system starts empty and idle.`;
    return `${c} arrives at minute ${r.arrival}: the random digits ${formatDigits(r.arrivalDigits, 3)} give a time since the last arrival of ${r.iat} ${r.iat === 1 ? 'minute' : 'minutes'}, so the arrival time is ${prev.arrival} + ${r.iat} = ${r.arrival}.`;
  }
  if (e.type === 'start') {
    if (r.wait > 0) {
      return `${c} arrives at minute ${r.arrival}, but the server is busy until minute ${r.begin}, so the customer waits ${r.wait} ${r.wait === 1 ? 'minute' : 'minutes'}. Service begins at minute ${r.begin}.`;
    }
    if (!prev) return `The server is idle, so ${c.toLowerCase()} begins service at once at minute 0.`;
    if (r.idle > 0) {
      return `The server has been idle since minute ${prev.end}, so ${c.toLowerCase()} begins service at once at minute ${r.begin}; the server was idle for ${r.idle} ${r.idle === 1 ? 'minute' : 'minutes'}.`;
    }
    return `The server becomes free at minute ${r.begin}, exactly when ${c.toLowerCase()} arrives, so service begins at once without waiting.`;
  }
  return `${c} leaves at minute ${r.end} (service began at minute ${r.begin} and took ${r.service} ${r.service === 1 ? 'minute' : 'minutes'}); the customer spent ${r.system} ${r.system === 1 ? 'minute' : 'minutes'} in the system.`;
}

// ---------------------------------------------------------------------------
// Results panel (SPEC Section 5.3)
// ---------------------------------------------------------------------------

function measureItems(m, { withMax = false } = {}) {
  const items = [
    { num: 1, label: 'Average waiting time (minutes)', formula: 'Total waiting time in queue / Number of customers', value: fmt(m.avgWait) },
    { num: 2, label: 'Probability that a customer waits', formula: 'Number of customers who wait / Number of customers', value: fmt(m.pWait) },
    { num: 3, label: 'Probability of idle server', formula: 'Total idle time of server / Total run time', value: fmt(m.pIdle) },
    { num: 4, label: 'Probability that the server is busy', formula: '1 - Probability of idle server', value: fmt(m.pBusy) },
    { num: 5, label: 'Average service time (minutes)', formula: 'Total service time / Number of customers', value: fmt(m.avgService), theory: `E(S) = ${fmt(m.ES)}` },
    { num: 6, label: 'Expected service time E(S) (minutes)', formula: 'Sum of s times p(s) over the service-time distribution', value: fmt(m.ES) },
    { num: 7, label: 'Average time between arrivals (minutes)', formula: 'Sum of all times between arrivals / (Number of customers - 1)', value: fmt(m.avgIAT), theory: `E(A) = ${fmt(m.EA)}` },
    { num: 8, label: 'Expected time between arrivals E(A) (minutes)', formula: 'Sum of a times p(a) over the time-between-arrivals distribution', value: fmt(m.EA) },
    { num: 9, label: 'Average waiting time of those who wait (minutes)', formula: 'Total waiting time in queue / Number of customers who wait', value: m.noneWaited ? 'none waited' : fmt(m.avgWaitWaiters) },
    { num: 10, label: 'Average time a customer spends in the system (minutes)', formula: 'Total time customers spend in the system / Number of customers', value: fmt(m.avgSystem) },
    { num: 11, label: 'Check: average time in system', formula: 'Average waiting time (1) + Average service time (5)', value: fmt(m.avgSystemAlt) }
  ];
  if (withMax) items.push({ num: 12, label: 'Maximum waiting time (minutes)', formula: 'Largest waiting time in queue of any customer', value: String(m.maxWait) });
  return items;
}

function showResults(container, m, sentence, opts) {
  renderMeasures(container, measureItems(m, opts));
  const p = document.createElement('p');
  p.className = 'interpretation';
  p.textContent = sentence;
  container.appendChild(p);
}

// ---------------------------------------------------------------------------
// Mode 1: textbook replay
// ---------------------------------------------------------------------------

const TB = GROCERY_TEXTBOOK;
const tbKnownDigits = true;
let tbSeed = CONFIG.defaultSeed;

/**
 * The textbook table with automatically generated service digits: each digit is
 * drawn from the random-digit interval of the published service time, so the
 * service times, and therefore every other column and total, stay as published.
 */
function buildTextbook(seed) {
  const serviceDigits = generateDigitsForTimes(TB.serviceTimes, DISTRIBUTIONS.groceryService, createRng(seed));
  return simulateSingleServer({
    interarrival: TB.interarrivalTimes,
    service: TB.serviceTimes,
    arrivalDigits: TB.arrivalDigits,
    serviceDigits
  });
}
let tbResult = buildTextbook(tbSeed);
const tbCols = columns({ serviceDigitsKnown: tbKnownDigits });
// Which event reveals which cells of a row: the hand table is filled left to right.
const REVEAL = {
  customer: 1, arrivalDigits: 1, iat: 1, arrival: 1, serviceDigits: 1, service: 1,
  begin: 2, wait: 2, idle: 2, end: 3, system: 3
};
const STAGE = { arrival: 1, start: 2, departure: 3 };

const tbTable = $('#tb-table');
const tbAnim = new QueueAnimator($('#tb-anim'));
tbAnim.load(tbResult.events, tbResult.rows);
const tbDelay = setupSpeed($('#tb-speed'), $('#tb-speed-out'));
let tbStages = new Array(TB.customers).fill(0);

renderTable(tbTable, tbCols, tbResult.rows, { footLabel: 'Totals' });
function digitNote() {
  $('#tb-digit-note').textContent = `The service random digits were generated automatically (seed ${tbSeed}): each one is a random number inside the random-digit interval of the published service time, so the service times and totals stay as in the textbook. Press "New service digits" for another set.`;
}
digitNote();

function stagesAfter(k) {
  const st = new Array(TB.customers).fill(0);
  for (let i = 0; i < k; i++) {
    const e = tbResult.events[i];
    st[e.customer - 1] = Math.max(st[e.customer - 1], STAGE[e.type]);
  }
  return st;
}

function tbRender(k) {
  const stages = stagesAfter(k);
  const rows = tbResult.rows;
  const body = tbTable.tBodies[0];
  for (let i = 0; i < rows.length; i++) {
    const tr = body.rows[i];
    tbCols.forEach((c, j) => {
      const cell = tr.cells[j];
      const show = stages[i] >= REVEAL[c.key];
      const was = tbStages[i] >= REVEAL[c.key];
      cell.textContent = show ? c.get(rows[i]) : '';
      cell.classList.toggle('changed', show && !was);
    });
  }
  // Running totals of the cells filled so far.
  const foot = tbTable.tFoot.rows[0];
  tbCols.forEach((c, j) => {
    if (!c.total || j === 0) return;
    const visible = rows.filter((r, i) => stages[i] >= REVEAL[c.key]);
    foot.cells[j].textContent = visible.length ? c.total(visible) : '';
  });
  tbStages = stages;

  const done = k >= tbResult.events.length;
  const last = k > 0 ? tbResult.events[k - 1] : null;
  markCurrentRow(tbTable, last ? last.customer - 1 : null);
  tbAnim.show(k);
  if (!tbExplainOverride) {
    $('#tb-explain').textContent = last
      ? explainEvent(last, rows) + (done ? ` The replay is complete: the total run time is ${tbResult.totals.run} minutes.` : '')
      : 'Press "Next event" to process the first event, or "Next customer" to fill one complete row of the simulation table.';
  }
  tbExplainOverride = false;
  $('#tb-next-event').disabled = done;
  $('#tb-next-customer').disabled = done;
  if (done && !tbPlayer.playing) $('#tb-run').disabled = true;
  else $('#tb-run').disabled = false;
  renderVerification(done);
  renderTextbookResults(done);
}
let tbExplainOverride = false;

const tbPlayer = new Player({
  total: tbResult.events.length,
  getDelay: () => tbDelay(),
  onStep: (k) => { tbAnim.setDuration(tbDelay()); tbRender(k); },
  onState: (playing) => {
    $('#tb-run').textContent = playing ? 'Pause' : 'Run to end';
    $('#tb-run').disabled = !playing && tbPlayer.k >= tbPlayer.total;
  }
});

$('#tb-next-event').addEventListener('click', () => { tbPlayer.stop(); tbAnim.setDuration(500); tbPlayer.stepTo(tbPlayer.k + 1); });
$('#tb-next-customer').addEventListener('click', () => {
  tbPlayer.stop();
  // Fill the next incomplete row: advance to the departure of the lowest-numbered unfinished customer.
  const next = tbStages.findIndex((s) => s < 3) + 1;
  if (next === 0) return;
  const target = tbResult.events.findIndex((e) => e.type === 'departure' && e.customer === next) + 1;
  const text = [explainEvent({ type: 'arrival', customer: next }, tbResult.rows),
    explainEvent({ type: 'start', customer: next }, tbResult.rows),
    explainEvent({ type: 'departure', customer: next }, tbResult.rows)].join(' ');
  tbAnim.setDuration(500);
  tbExplainOverride = true;
  $('#tb-explain').textContent = text + (target >= tbResult.events.length ? ` The replay is complete: the total run time is ${tbResult.totals.run} minutes.` : '');
  tbPlayer.stepTo(Math.max(target, tbPlayer.k));
});
$('#tb-run').addEventListener('click', () => { if (tbPlayer.playing) tbPlayer.stop(); else tbPlayer.play(); });
$('#tb-new-digits').addEventListener('click', () => {
  tbSeed = newSeed();
  tbResult = buildTextbook(tbSeed);
  digitNote();
  tbRender(tbPlayer.k);
});
$('#tb-reset').addEventListener('click', () => { tbPlayer.stop(); tbStages = new Array(TB.customers).fill(0); tbPlayer.stepTo(0); });

function renderVerification(done) {
  const t = tbResult.totals;
  const P = TB.publishedTotals;
  const items = [
    ['Sum of times between arrivals (min)', P.iat, t.iat],
    ['Total service time (min)', P.service, t.service],
    ['Total waiting time in queue (min)', P.wait, t.wait],
    ['Total time customers spend in system (min)', P.system, t.system],
    ['Total idle time of server (min)', P.idle, t.idle],
    ['Customers who waited', P.waited, t.waited],
    ['Total run time (min)', P.run, t.run]
  ];
  $('#tb-verify').innerHTML = `<div class="table-scroll"><table class="plain">
    <thead><tr><th scope="col" class="text">Quantity</th><th scope="col">Published value</th><th scope="col">Computed value</th><th scope="col" class="text">Check</th></tr></thead>
    <tbody>${items.map(([label, pub, comp]) => `<tr><td class="text">${label}</td><td>${pub}</td><td>${done ? comp : '<span class="muted">pending</span>'}</td><td class="text">${done
      ? (pub === comp ? '<span class="check-ok">OK &#10003;</span>' : '<span class="check-bad">Different &#10007;</span>')
      : '<span class="muted">complete the replay</span>'}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function renderTextbookResults(done) {
  const box = $('#tb-results');
  if (!done) {
    box.innerHTML = '<p class="muted">The eleven performance measures appear when the replay reaches the end. Press "Run to end" to complete it, or continue step by step.</p>';
    return;
  }
  const m = singleServerMeasures(tbResult.totals, { EA: DISTRIBUTIONS.groceryArrival.expected, ES: DISTRIBUTIONS.groceryService.expected });
  showResults(box, m,
    `In this 20-customer run the average waiting time was ${fmt(m.avgWait)} minutes, ${pct(m.pWait)} of the customers waited, and the server was busy ${pct(m.pBusy)} of the time. `
    + `The average service time (${fmt(m.avgService)} minutes) differs from E(S) = ${fmt(m.ES)} minutes and the average time between arrivals (${fmt(m.avgIAT)} minutes) differs from E(A) = ${fmt(m.EA)} minutes, because 20 customers are a small sample.`);
}

$('#tb-csv').addEventListener('click', () => {
  downloadCSV(`grocery-textbook-20-customers-seed-${tbSeed}.csv`, CSV_HEADER, csvRows(tbResult.rows, false, tbKnownDigits));
});

tbRender(0);

// ---------------------------------------------------------------------------
// Mode 2: one day
// ---------------------------------------------------------------------------

let dayResult = null;
const dayAnim = new QueueAnimator($('#day-anim'));
const dayDelay = setupSpeed($('#day-speed'), $('#day-speed-out'));
const dayPlayer = new Player({
  total: 0,
  getDelay: () => dayDelay(),
  onStep: (k) => {
    dayAnim.setDuration(dayDelay());
    dayAnim.show(k);
    const last = k > 0 ? dayResult.events[k - 1] : null;
    markCurrentRow($('#day-table'), last ? last.customer - 1 : null);
    $('#day-explain').textContent = last ? explainEvent(last, dayResult.rows) : 'Press "Play" to watch the day, or "Next event" to step through it.';
  },
  onState: (playing) => { $('#day-play').textContent = playing ? 'Pause' : 'Play'; }
});
$('#day-seed').value = CONFIG.defaultSeed;

function readInt(input, min, max, name) {
  const v = Number(input.value);
  if (!Number.isInteger(v) || v < min || v > max) {
    input.setAttribute('aria-invalid', 'true');
    throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  }
  input.setAttribute('aria-invalid', 'false');
  return v;
}

function runDay() {
  const err = $('#day-error');
  let n;
  try {
    n = readInt($('#day-n'), 2, 1000, 'The number of customers');
  } catch (e) { err.textContent = e.message; return; }
  const seedText = $('#day-seed').value.trim() || String(CONFIG.defaultSeed);
  err.textContent = '';
  const seed = normalizeSeed(seedText);
  dayResult = simulateSingleServerSeeded({ seed, n, arrivalDist: dists.arrival, serviceDist: dists.service });
  dayResult.E = { EA: dists.arrival.expected, ES: dists.service.expected };
  dayResult.serviceValues = dists.service.rows.map((r) => r.value);
  dayResult.serviceProbs = dists.service.rows.map((r) => r.p);
  $('#day-status').textContent = `Day simulated with seed ${seedText} and ${n} customers. Share the seed to reproduce exactly the same day.`;

  renderTable($('#day-table'), columns({ withWaited: true }), dayResult.rows, {
    footLabel: 'Totals',
    footExtra: `<tr><th scope="row" class="text">Total run time</th><td colspan="11" class="text">${dayResult.totals.run} minutes (time service of the last customer ends)</td></tr>`
  });
  dayAnim.load(dayResult.events, dayResult.rows);
  dayPlayer.setTotal(dayResult.events.length);
  dayPlayer.stepTo(0);

  const m = singleServerMeasures(dayResult.totals, dayResult.E);
  showResults($('#day-results'), m,
    `On this day of ${n} customers the average waiting time was ${fmt(m.avgWait)} minutes, ${pct(m.pWait)} of the customers waited, and the longest wait was ${m.maxWait} minutes; the server was busy ${pct(m.pBusy)} of the time. `
    + `The average service time (${fmt(m.avgService)}) is compared with E(S) = ${fmt(m.ES)}, and the average time between arrivals (${fmt(m.avgIAT)}) with E(A) = ${fmt(m.EA)}; another day with a different seed will give different values.`,
    { withMax: true });
  drawDayCharts();
}

function drawDayCharts() {
  if (!dayResult) return;
  const waits = dayResult.rows.map((r) => r.wait);
  const h = histogram(waits, [2, 4, 6, 8, 10, 12, 14], { zeroBin: true });
  barChart($('#day-chart-freq'), { labels: h.labels, datasets: [{ label: 'Number of customers', data: h.counts }], xTitle: 'Waiting time in queue (minutes)', yTitle: 'Number of customers' });
  renderFrequencyTable($('#day-freq-table'), 'Frequency of waiting time in queue', h.labels, h.counts, 'Customers');
  barChart($('#day-chart-wait'), { labels: dayResult.rows.map((r) => r.customer), datasets: [{ label: 'Waiting time (minutes)', data: waits }], xTitle: 'Customer', yTitle: 'Waiting time (minutes)' });
  const rf = relativeFrequency(dayResult.rows.map((r) => r.service), dayResult.serviceValues);
  barChart($('#day-chart-service'), {
    labels: dayResult.serviceValues.map(String),
    datasets: [{ label: 'Simulated relative frequency', data: rf }, { label: 'Theoretical probability', data: dayResult.serviceProbs }],
    xTitle: 'Service time (minutes)', yTitle: 'Relative frequency'
  });
}

$('#day-new').addEventListener('click', () => { $('#day-seed').value = newSeed(); runDay(); });
$('#day-run').addEventListener('click', runDay);
$('#day-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') runDay(); });
$('#day-play').addEventListener('click', () => { if (dayPlayer.playing) dayPlayer.stop(); else dayPlayer.play(); });
$('#day-step').addEventListener('click', () => { dayPlayer.stop(); dayAnim.setDuration(500); dayPlayer.stepTo(dayPlayer.k + 1); });
$('#day-end').addEventListener('click', () => { dayPlayer.stop(); dayAnim.setDuration(0); dayPlayer.stepTo(dayPlayer.total); });
$('#day-anim-reset').addEventListener('click', () => { dayPlayer.stop(); dayPlayer.stepTo(0); });
$('#day-csv').addEventListener('click', () => {
  if (!dayResult) return;
  downloadCSV(`grocery-one-day-seed-${dayResult.seed}.csv`, [...CSV_HEADER, 'Customer waited? (1 = yes)'], csvRows(dayResult.rows, true));
});

// ---------------------------------------------------------------------------
// Mode 3: fifty days (replications)
// ---------------------------------------------------------------------------

let daysResult = null;
$('#days-seed').value = CONFIG.defaultSeed;

const DAY_COLUMNS = [
  { key: 'avgWait', label: 'Average waiting time (min)', digits: 2 },
  { key: 'pWait', label: 'Probability a customer waits', digits: 2 },
  { key: 'pIdle', label: 'Probability of idle server', digits: 3 },
  { key: 'pBusy', label: 'Probability server busy', digits: 3 },
  { key: 'avgService', label: 'Average service time (min)', digits: 2 },
  { key: 'avgIAT', label: 'Average time between arrivals (min)', digits: 2 },
  { key: 'avgWaitWaiters', label: 'Average wait of those who wait (min)', digits: 2 },
  { key: 'avgSystem', label: 'Average time in system (min)', digits: 2 },
  { key: 'run', label: 'Total run time (min)', digits: 0 }
];

async function runDays() {
  const err = $('#days-error');
  let count, n;
  try {
    count = readInt($('#days-count'), 1, 500, 'The number of days');
    n = readInt($('#days-n'), 2, 1000, 'The number of customers per day');
  } catch (e) { err.textContent = e.message; return; }
  err.textContent = '';
  const seedText = $('#days-seed').value.trim() || String(CONFIG.defaultSeed);
  const seed = normalizeSeed(seedText);
  const runDists = dists;
  const buttons = ['#days-new', '#days-run'].map((s) => $(s));
  buttons.forEach((b) => { b.disabled = true; });
  const status = $('#days-status');
  const t0 = performance.now();
  const days = [];
  // Each day uses its own seed derived from the master seed; the work is split
  // into chunks so that the page stays responsive.
  for (let d = 0; d < count; d++) {
    const r = simulateSingleServerSeeded({ seed: deriveSeed(seed, d), n, arrivalDist: runDists.arrival, serviceDist: runDists.service, withEvents: false });
    days.push(dailyMeasures(r.totals));
    if (d % 50 === 49) { status.textContent = `Simulating day ${d + 1} of ${count}...`; await nextFrame(); }
  }
  const ms = Math.round(performance.now() - t0);
  buttons.forEach((b) => { b.disabled = !distsOk; });
  daysResult = { seed, seedText, count, n, dists: runDists, days };
  status.textContent = `${count} days of ${n} customers simulated with seed ${seedText} in ${ms} ms. Share the seed to reproduce the same experiment.`;
  renderDays();
}

function renderDays() {
  const { days, count, n, dists: dd } = daysResult;
  const summary = {};
  for (const c of DAY_COLUMNS) summary[c.key] = summarize(days.map((d) => d[c.key]));
  renderReplicationTable($('#days-table'), 'Day', DAY_COLUMNS, days, summary);

  const kf = singleServerKeyFindings(days, { EA: dd.arrival.expected, ES: dd.service.expected, slideAvgWait: TB.slideAvgWait50Days });
  const rows = [
    ['Overall average waiting time (minutes)', fmt(kf.overallAvgWait, 3)],
    ['Slide reference value (slide 14/14, findings 3/4) (minutes)', fmt(kf.slideAvgWait)],
    ['Lowest daily average wait (minutes)', fmt(kf.lowestAvgWait)],
    ['Highest daily average wait (minutes)', fmt(kf.highestAvgWait)],
    ['Days with an average wait above 2 minutes', String(kf.daysAbove2)],
    ['Overall probability a customer waits', fmt(kf.overallPWait, 4)],
    ['Overall server utilization', fmt(kf.overallUtilization, 4)],
    ['Average time in system (minutes)', fmt(kf.avgTimeInSystem, 3)],
    ['E(S), expected service time (minutes)', fmt(kf.ES)],
    ['E(A), expected time between arrivals (minutes)', fmt(kf.EA)]
  ];
  const textbookInputs = Math.abs(dd.arrival.expected - DISTRIBUTIONS.groceryArrival.expected) < 1e-9 && Math.abs(dd.service.expected - DISTRIBUTIONS.groceryService.expected) < 1e-9;
  $('#days-findings').innerHTML = `<div class="table-scroll"><table class="plain">
    <thead><tr><th scope="col" class="text">Measure</th><th scope="col">Value</th></tr></thead>
    <tbody>${rows.map(([a, b]) => `<tr><td class="text">${esc(a)}</td><td>${b}</td></tr>`).join('')}</tbody></table></div>
    <p class="interpretation">Over ${count} ${count === 1 ? 'day' : 'days'} the average wait was ${fmt(kf.overallAvgWait)} minutes (slides: ${fmt(kf.slideAvgWait)}${textbookInputs ? '' : ', obtained with the textbook inputs'}); daily values ranged from ${fmt(kf.lowestAvgWait)} to ${fmt(kf.highestAvgWait)} minutes, so one day is not enough to judge the system.</p>`;
  drawDaysCharts();
}

function drawDaysCharts() {
  if (!daysResult) return;
  const waits = daysResult.days.map((d) => d.avgWait);
  const h = histogram(waits, [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  barChart($('#days-chart-freq'), { labels: h.labels, datasets: [{ label: 'Number of days', data: h.counts }], xTitle: 'Daily average waiting time (minutes)', yTitle: 'Number of days' });
  renderFrequencyTable($('#days-freq-table'), 'Frequency of the daily average waiting time', h.labels, h.counts, 'Days');
  const avg = waits.reduce((s, v) => s + v, 0) / waits.length;
  lineWithAverage($('#days-chart-line'), { labels: waits.map((_, i) => i + 1), data: waits, average: avg, label: 'Average waiting time (minutes)', xTitle: 'Day', yTitle: 'Average waiting time (minutes)' });
}

$('#days-new').addEventListener('click', () => { $('#days-seed').value = newSeed(); runDays(); });
$('#days-run').addEventListener('click', runDays);
$('#days-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') runDays(); });
$('#days-csv').addEventListener('click', () => {
  if (!daysResult) return;
  downloadCSV(`grocery-${daysResult.count}-days-seed-${daysResult.seed}.csv`, ['Day', ...DAY_COLUMNS.map((c) => c.label)],
    daysResult.days.map((d, i) => [i + 1, ...DAY_COLUMNS.map((c) => d[c.key])]));
});
$('#days-csv-all').addEventListener('click', () => {
  if (!daysResult) return;
  // The customer rows are regenerated from the day seeds (the same digits as the run).
  const { seed, count, n, dists: dd } = daysResult;
  const all = [];
  for (let d = 0; d < count; d++) {
    const r = simulateSingleServerSeeded({ seed: deriveSeed(seed, d), n, arrivalDist: dd.arrival, serviceDist: dd.service, withEvents: false });
    all.push(...csvRows(r.rows, true, true, d + 1));
  }
  downloadCSV(`grocery-${count}-days-all-customers-seed-${seed}.csv`, ['Day', ...CSV_HEADER, 'Customer waited? (1 = yes)'], all);
});

// ---------------------------------------------------------------------------
// Tabs and start-up
// ---------------------------------------------------------------------------

const started = { day: false, days: false };
setupTabs($('#mode-tabs'), (mode) => {
  tbPlayer.stop();
  dayPlayer.stop();
  distPanel.setEditable(mode !== 'textbook');
  applyDists(distPanel.get(), distPanel.ok(), false);
  if (mode === 'day' && !started.day) { started.day = true; runDay(); }
  if (mode === 'days' && !started.days) { started.days = true; runDays(); }
});

onThemeChange(() => {
  distPanel.redraw();
  drawDayCharts();
  drawDaysCharts();
});

// Redraw the distribution charts once the panel is opened (a hidden canvas has no size).
$('#dist-details').addEventListener('toggle', () => { if ($('#dist-details').open) distPanel.redraw(); });
