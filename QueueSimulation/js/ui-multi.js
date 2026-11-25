// DOM and animation code for multi-server.html (Able and Baker call center).
// All values shown come from the engine (multi-server.js) and measures.js.

import { CONFIG } from './config.js';
import { formatDigits, deriveSeed, normalizeSeed } from './rng.js';
import { CALL_ARRIVAL, ABLE_SERVICE, BAKER_SERVICE } from './distributions.js';
import { simulateMultiServer, simulateMultiServerSeeded, busyIntervals } from './multi-server.js';
import { multiServerMeasures, runMeasures, summarize, histogram, relativeFrequency, mean } from './measures.js';
import { CALLCENTER_TEXTBOOK } from '../data/callcenter-textbook.js';
import {
  $, esc, fmt, pct, initChrome, setupTabs, renderTable, markCurrentRow, renderMeasures,
  renderReplicationTable, renderFrequencyTable, downloadCSV, barChart, lineWithAverage,
  createDistributionPanel, setupSpeed, QueueAnimator, Player, newSeed, nextFrame, onThemeChange
} from './ui-common.js';

initChrome();

const TB = CALLCENTER_TEXTBOOK;

// ---------------------------------------------------------------------------
// Server-selection rule: a toggle button. CONFIG.enableBakerFirstRule sets its
// state when the page opens; the engine implements both rules.
// ---------------------------------------------------------------------------

let preferred = CONFIG.enableBakerFirstRule ? 'Baker' : 'Able';
const ruleName = (p) => (p === 'Baker' ? 'Baker-first rule' : 'Able-first rule (textbook)');

function showRule() {
  const on = preferred === 'Baker';
  const btn = $('#rule-toggle');
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = `Baker-first rule: ${on ? 'on' : 'off'}`;
  $('#rule-text').textContent = on
    ? 'When both servers are idle, Baker takes the call (Baker-first rule). Turn the rule off to return to the textbook rule, in which Able takes such calls.'
    : 'When both servers are idle, Able takes the call (textbook rule). Turn the Baker-first rule on to send such calls to Baker instead.';
}
showRule();
$('#rule-toggle').addEventListener('click', () => {
  preferred = preferred === 'Baker' ? 'Able' : 'Baker';
  showRule();
  rebuildReplay();
  if (runResult) runOne();
  if (runsResult) runMany();
});

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

let dists = null;
let distsOk = true;
const distPanel = createDistributionPanel($('#dist-panel'), [
  { id: 'arrival', def: CALL_ARRIVAL, valueLabel: 'Time between calls (min)' },
  { id: 'able', def: ABLE_SERVICE, valueLabel: 'Able service time (min)' },
  { id: 'baker', def: BAKER_SERVICE, valueLabel: 'Baker service time (min)' }
], (d, ok) => applyDists(d, ok, true));

let currentMode = 'textbook';
/** Takes the distributions in effect; `edited` is true after a change by the user. */
function applyDists(d, ok, edited) {
  dists = d;
  distsOk = ok;
  const msg = ok ? '' : 'The input distributions are not valid; see the messages in the distribution panel. Correct them before running.';
  ['#run-error', '#runs-error', '#tb-error'].forEach((s) => { $(s).textContent = msg; });
  ['#run-new', '#run-run', '#runs-new', '#runs-run', '#tb-new-digits', '#tb-use-seed'].forEach((s) => { $(s).disabled = !ok; });
  if (ok && edited) {
    const note = 'The input distributions have changed; run again to apply them.';
    if (runResult) $('#run-status').textContent = note;
    if (runsResult) $('#runs-status').textContent = note;
    if (currentMode === 'textbook' && !useTextbookDigits) { replayDists = d; rebuildReplay(); }
  }
}
dists = distPanel.get();

const E = (d) => ({ EArrival: d.arrival.expected, EAble: d.able.expected, EBaker: d.baker.expected });

// ---------------------------------------------------------------------------
// Simulation table columns (SPEC Section 4.3)
// ---------------------------------------------------------------------------

const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] ?? 0), 0);
const COLUMNS = [
  { key: 'caller', label: 'Caller number', formula: 'Caller i, in order of arrival.', get: (r) => r.caller },
  { key: 'arrivalDigits', label: 'Random digits for arrival', formula: 'Two-digit random number (01 to 00). Call 1 arrives at time 0 and needs none.', cls: 'mono', get: (r) => formatDigits(r.arrivalDigits, 2) },
  { key: 'iat', label: 'Time between arrivals', formula: 'The time between calls whose random-digit interval contains the arrival digits.', get: (r) => (r.iat === null ? '-' : r.iat), total: (rows) => sum(rows, 'iat') },
  { key: 'arrival', label: 'Clock time of arrival', formula: 'Arrival(i) = Arrival(i-1) + time between arrivals; Arrival(1) = 0.', get: (r) => r.arrival },
  { key: 'ableAvail', label: 'Time Able available', formula: 'Clock time at which Able finishes the previous call assigned to Able (0 at the start).', get: (r) => r.ableAvail },
  { key: 'bakerAvail', label: 'Time Baker available', formula: 'Clock time at which Baker finishes the previous call assigned to Baker (0 at the start).', get: (r) => r.bakerAvail },
  { key: 'server', label: 'Server chosen', formula: 'If both are idle at the arrival time, the preferred server (Able in the textbook); otherwise the server that is free first.', cls: 'text', get: (r) => r.server },
  { key: 'serviceDigits', label: 'Random digits for service', formula: 'Two-digit random number, read after the server is chosen.', cls: 'mono', get: (r) => formatDigits(r.serviceDigits, 2) },
  { key: 'service', label: 'Service time', formula: 'The service time from the chosen server\'s random-digit assignment.', get: (r) => r.service, total: (rows) => sum(rows, 'service') },
  { key: 'begin', label: 'Time service begins', formula: 'Begin(i) = max(Arrival(i), time the chosen server is available).', get: (r) => r.begin },
  { key: 'end', label: 'Time service ends', formula: 'End(i) = Begin(i) + service time.', get: (r) => r.end },
  { key: 'delay', label: 'Caller delay', formula: 'Delay(i) = Begin(i) - Arrival(i).', get: (r) => r.delay, total: (rows) => sum(rows, 'delay') },
  { key: 'system', label: 'Time in system', formula: 'End(i) - Arrival(i) = delay + service time.', get: (r) => r.system, total: (rows) => sum(rows, 'system') }
];
const CSV_HEADER = COLUMNS.map((c) => c.label);
const csvRows = (rows, runNumber = null) => rows.map((r) => {
  const line = [r.caller, formatDigits(r.arrivalDigits, 2), r.iat === null ? '-' : r.iat, r.arrival, r.ableAvail, r.bakerAvail,
    r.server, formatDigits(r.serviceDigits, 2), r.service, r.begin, r.end, r.delay, r.system];
  if (runNumber !== null) line.unshift(runNumber);
  return line;
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

function explainEvent(e, rows, pref) {
  const r = rows[e.customer - 1];
  const c = `Call ${r.caller}`;
  const other = r.server === 'Able' ? 'Baker' : 'Able';
  if (e.type === 'arrival') {
    return r.caller === 1
      ? 'Call 1 arrives at minute 0. Both servers start idle.'
      : `${c} arrives at minute ${r.arrival}: the random digits ${formatDigits(r.arrivalDigits, 2)} give a time between arrivals of ${r.iat} ${r.iat === 1 ? 'minute' : 'minutes'}.`;
  }
  if (e.type === 'start') {
    const bothIdle = r.ableAvail <= r.arrival && r.bakerAvail <= r.arrival;
    if (bothIdle) return `Both servers are idle at minute ${r.arrival}, so ${r.server} takes call ${r.caller} (${pref === 'Baker' ? 'Baker-first rule' : 'Able is preferred'}); the service time is ${r.service} minutes.`;
    if (r.delay === 0) return `${other} is busy at minute ${r.arrival}, but ${r.server} is idle, so ${r.server} takes call ${r.caller} at once; the service time is ${r.service} minutes.`;
    return `Both servers are busy when call ${r.caller} arrives at minute ${r.arrival} (Able until ${r.ableAvail}, Baker until ${r.bakerAvail}); ${r.server} is free first, so the caller waits ${r.delay} ${r.delay === 1 ? 'minute' : 'minutes'} and service begins at minute ${r.begin}.`;
  }
  return `${r.server} finishes call ${r.caller} at minute ${r.end}; the caller spent ${r.system} minutes in the system.`;
}

// ---------------------------------------------------------------------------
// Results panel
// ---------------------------------------------------------------------------

function measureItems(m) {
  return [
    { num: 1, label: 'Run length (minutes)', formula: 'Time service of the last call ends', value: String(m.run) },
    { num: 2, label: 'Able utilization', formula: 'Total Able service time / Run length', value: fmt(m.ableUtil) },
    { num: 3, label: 'Baker utilization', formula: 'Total Baker service time / Run length', value: fmt(m.bakerUtil) },
    { num: 4, label: 'Calls handled by Able and by Baker', formula: 'Counts and percentages of all calls', value: `Able ${m.callsAble} (${pct(m.shareAble)}); Baker ${m.callsBaker} (${pct(m.shareBaker)})` },
    { num: 5, label: 'Probability a caller waits', formula: 'Number of callers with delay > 0 / Number of calls', value: `${fmt(m.pWait)} (${m.waited} callers)` },
    { num: 6, label: 'Average delay of all callers (minutes)', formula: 'Total delay / Number of calls', value: fmt(m.avgDelay) },
    { num: 7, label: 'Average delay of those who waited (minutes)', formula: 'Total delay / Number of callers who waited (0 if none waited)', value: m.noneWaited ? '0.00 (none waited)' : fmt(m.avgDelayWaiters) },
    { num: 8, label: 'Average time in system (minutes)', formula: 'Total time in system / Number of calls', value: fmt(m.avgSystem) },
    { num: '9a', label: 'Average service time of Able (minutes)', formula: 'Total Able service time / Calls handled by Able', value: m.callsAble ? fmt(m.avgServiceAble) : '-', theory: `E = ${fmt(m.EAble)}` },
    { num: '9b', label: 'Average service time of Baker (minutes)', formula: 'Total Baker service time / Calls handled by Baker', value: m.callsBaker ? fmt(m.avgServiceBaker) : '-', theory: `E = ${fmt(m.EBaker)}` },
    { num: 10, label: 'Average time between calls (minutes)', formula: 'Sum of times between calls / (Number of calls - 1)', value: fmt(m.avgIAT), theory: `E = ${fmt(m.EArrival)}` }
  ];
}

function interpretation(m, pref) {
  const busier = m.ableUtil >= m.bakerUtil ? 'Able' : 'Baker';
  return `Able was busy ${pct(m.ableUtil)} of the time and Baker ${pct(m.bakerUtil)}; under the ${ruleName(pref)}, ${busier} is the busier server and handled ${busier === 'Able' ? m.callsAble : m.callsBaker} of the ${m.callsAble + m.callsBaker} calls. `
    + `${pct(m.pWait)} of the callers waited, with an average delay of ${fmt(m.avgDelay)} minutes over all callers and ${fmt(m.avgDelayWaiters)} minutes for those who waited.`;
}

function showResults(container, m, pref) {
  renderMeasures(container, measureItems(m));
  const p = document.createElement('p');
  p.className = 'interpretation';
  p.textContent = interpretation(m, pref);
  container.appendChild(p);
}

// ---------------------------------------------------------------------------
// Shared animation set-up
// ---------------------------------------------------------------------------

function makeAnimation(prefix) {
  const anim = new QueueAnimator($(`#${prefix}-anim`), { servers: ['Able', 'Baker'], noun: 'Call' });
  const delay = setupSpeed($(`#${prefix}-speed`), $(`#${prefix}-speed-out`));
  return { anim, delay };
}

// ---------------------------------------------------------------------------
// Mode 1: step-by-step replay of 26 calls. It uses the textbook digits once
// CALLCENTER_TEXTBOOK.confirmed is true; until then it uses random digits
// generated from a seed, so that the replay works now.
// ---------------------------------------------------------------------------

const useTextbookDigits = TB.confirmed && TB.arrivalDigits.length === TB.calls && TB.serviceDigits.length === TB.calls;
const tbAnimation = makeAnimation('tb');
const tbTable = $('#tb-table');
const REVEAL = { caller: 1, arrivalDigits: 1, iat: 1, arrival: 1, ableAvail: 1, bakerAvail: 1, server: 2, serviceDigits: 2, service: 2, begin: 2, delay: 2, end: 3, system: 3 };
const STAGE = { arrival: 1, start: 2, departure: 3 };
let tbRes = null;
let tbSeedText = String(CONFIG.defaultSeed);
let tbPrevStages = [];
let tbOverride = null;
$('#tb-seed').value = tbSeedText;

if (useTextbookDigits) {
  $('#tab-textbook').textContent = 'Textbook replay (26 calls)';
  $('#tb-seed-controls').hidden = true;
  $('#tb-source').textContent = 'This replay uses the random digits of the textbook run (slides 84 to 112) and the textbook distributions.';
}

/** Builds the 26-call table from the textbook digits or from the seed. */
function rebuildReplay() {
  if (useTextbookDigits) {
    tbRes = simulateMultiServer({ arrivalDigits: TB.arrivalDigits, serviceDigits: TB.serviceDigits, dists: distPanel.get(), preferred });
  } else {
    tbRes = simulateMultiServerSeeded({ seed: normalizeSeed(tbSeedText), n: TB.calls, dists: replayDists, preferred });
    $('#tb-source').textContent = `The random digits of this replay were generated automatically (seed ${tbSeedText}), because the textbook digits are not yet entered. Press "New random digits" for another set, or type a seed to share one replay with the class.`;
  }
  tbAnimation.anim.load(tbRes.events, tbRes.rows);
  renderTable(tbTable, COLUMNS, tbRes.rows, { footLabel: 'Totals' });
  tbPrevStages = new Array(tbRes.rows.length).fill(0);
  if (tbPlayer) { tbPlayer.setTotal(tbRes.events.length); tbPlayer.stepTo(0); }
}

function renderReplay(k) {
  const res = tbRes;
  const st = new Array(res.rows.length).fill(0);
  for (let i = 0; i < k; i++) { const e = res.events[i]; st[e.customer - 1] = Math.max(st[e.customer - 1], STAGE[e.type]); }
  res.rows.forEach((r, i) => {
    COLUMNS.forEach((c, j) => {
      const cell = tbTable.tBodies[0].rows[i].cells[j];
      const show = st[i] >= REVEAL[c.key];
      cell.textContent = show ? c.get(r) : '';
      cell.classList.toggle('changed', show && tbPrevStages[i] < REVEAL[c.key]);
    });
  });
  COLUMNS.forEach((c, j) => {
    if (!c.total || j === 0) return;
    const vis = res.rows.filter((r, i) => st[i] >= REVEAL[c.key]);
    tbTable.tFoot.rows[0].cells[j].textContent = vis.length ? c.total(vis) : '';
  });
  tbPrevStages = st;
  const done = k >= res.events.length;
  const last = k ? res.events[k - 1] : null;
  markCurrentRow(tbTable, last ? last.customer - 1 : null);
  tbAnimation.anim.show(k);
  $('#tb-explain').textContent = tbOverride || (last
    ? explainEvent(last, res.rows, preferred) + (done ? ` The replay is complete: the run length is ${res.totals.run} minutes.` : '')
    : 'Press "Next event" to process the first event, or "Next call" to fill one complete row of the simulation table.');
  tbOverride = null;
  $('#tb-next-event').disabled = done;
  $('#tb-next-customer').disabled = done;
  renderReplayChecks(done);
}

function renderReplayChecks(done) {
  const m = multiServerMeasures(tbRes.totals, E(useTextbookDigits ? distPanel.get() : replayDists));
  const P = TB.published;
  const rows = [
    ['Run length (min)', P.run, m.run, m.run === P.run],
    ['Able utilization', fmt(P.ableUtil), fmt(m.ableUtil), fmt(m.ableUtil) === fmt(P.ableUtil)],
    ['Baker utilization', fmt(P.bakerUtil), fmt(m.bakerUtil), fmt(m.bakerUtil) === fmt(P.bakerUtil)],
    ['Callers who waited', `${P.waited} of ${P.calls}`, `${m.waited} of ${tbRes.totals.n}`, m.waited === P.waited && tbRes.totals.n === P.calls],
    ['Average delay of all callers (min)', fmt(P.avgDelay), fmt(m.avgDelay), fmt(m.avgDelay) === fmt(P.avgDelay)],
    ['Average delay of those who waited (min)', fmt(P.avgDelayWaiters), fmt(m.avgDelayWaiters), fmt(m.avgDelayWaiters) === fmt(P.avgDelayWaiters)]
  ];
  const verify = useTextbookDigits && preferred === 'Able';
  $('#tb-verify-title').textContent = verify ? 'Verification against the published results' : 'Comparison with the published textbook results';
  const lead = verify ? '' : `<p class="muted small">${useTextbookDigits
    ? 'The published results were obtained with the Able-first rule, so they are shown for comparison only while the Baker-first rule is on.'
    : 'These random digits differ from the textbook digits, so the results are expected to differ from the published values; they are shown side by side for comparison, not as a check.'}</p>`;
  const check = (ok) => (!done ? '<span class="muted">complete the replay</span>'
    : (verify ? (ok ? '<span class="check-ok">OK &#10003;</span>' : '<span class="check-bad">Different &#10007;</span>') : '<span class="muted">for comparison</span>'));
  $('#tb-verify').innerHTML = `${lead}<div class="table-scroll"><table class="plain"><thead><tr><th scope="col" class="text">Quantity</th><th scope="col">Published value</th><th scope="col">This replay</th><th scope="col" class="text">Check</th></tr></thead><tbody>${rows.map(([l, p, c, ok]) => `<tr><td class="text">${l}</td><td>${p}</td><td>${done ? c : '<span class="muted">pending</span>'}</td><td class="text">${check(ok)}</td></tr>`).join('')}</tbody></table></div>`;
  if (done) showResults($('#tb-results'), m, preferred);
  else $('#tb-results').innerHTML = '<p class="muted">The measures appear when the replay reaches the end. Press "Run to end" to complete it, or continue step by step.</p>';
}

let tbPlayer = null;
let replayDists = dists;
rebuildReplay();
tbPlayer = new Player({
  total: tbRes.events.length,
  getDelay: tbAnimation.delay,
  onStep: (k) => { tbAnimation.anim.setDuration(tbAnimation.delay()); renderReplay(k); },
  onState: (playing) => { $('#tb-run').textContent = playing ? 'Pause' : 'Run to end'; }
});
$('#tb-next-event').addEventListener('click', () => { tbPlayer.stop(); tbAnimation.anim.setDuration(500); tbPlayer.stepTo(tbPlayer.k + 1); });
$('#tb-next-customer').addEventListener('click', () => {
  tbPlayer.stop();
  const next = tbPrevStages.findIndex((s) => s < 3) + 1;
  if (!next) return;
  const target = tbRes.events.findIndex((e) => e.type === 'departure' && e.customer === next) + 1;
  tbOverride = ['arrival', 'start', 'departure'].map((type) => explainEvent({ type, customer: next }, tbRes.rows, preferred)).join(' ');
  tbAnimation.anim.setDuration(500);
  tbPlayer.stepTo(Math.max(target, tbPlayer.k));
});
$('#tb-run').addEventListener('click', () => { if (tbPlayer.playing) tbPlayer.stop(); else tbPlayer.play(); });
$('#tb-reset').addEventListener('click', () => { tbPlayer.stop(); tbPrevStages = tbPrevStages.map(() => 0); tbPlayer.stepTo(0); });
$('#tb-new-digits').addEventListener('click', () => {
  tbSeedText = String(newSeed());
  $('#tb-seed').value = tbSeedText;
  replayDists = dists;
  rebuildReplay();
});
function useReplaySeed() {
  tbSeedText = $('#tb-seed').value.trim() || String(CONFIG.defaultSeed);
  replayDists = dists;
  rebuildReplay();
}
$('#tb-use-seed').addEventListener('click', useReplaySeed);
$('#tb-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') useReplaySeed(); });
$('#tb-csv').addEventListener('click', () => downloadCSV(useTextbookDigits ? 'call-center-textbook-26-calls.csv' : `call-center-replay-26-calls-seed-${tbSeedText}.csv`, CSV_HEADER, csvRows(tbRes.rows)));
tbPlayer.stepTo(0);

// ---------------------------------------------------------------------------
// Mode 2: one run
// ---------------------------------------------------------------------------

let runResult = null;
const runAnim = makeAnimation('run');
const runPlayer = new Player({
  total: 0,
  getDelay: runAnim.delay,
  onStep: (k) => {
    runAnim.anim.setDuration(runAnim.delay());
    runAnim.anim.show(k);
    const last = k ? runResult.events[k - 1] : null;
    markCurrentRow($('#run-table'), last ? last.customer - 1 : null);
    $('#run-explain').textContent = last ? explainEvent(last, runResult.rows, runResult.preferred) : 'Press "Play" to watch the run, or "Next event" to step through it.';
  },
  onState: (playing) => { $('#run-play').textContent = playing ? 'Pause' : 'Play'; }
});
$('#run-seed').value = CONFIG.defaultSeed;

function readInt(input, min, max, name) {
  const v = Number(input.value);
  if (!Number.isInteger(v) || v < min || v > max) {
    input.setAttribute('aria-invalid', 'true');
    throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  }
  input.setAttribute('aria-invalid', 'false');
  return v;
}

function runOne() {
  let n;
  try { n = readInt($('#run-n'), 2, 1000, 'The number of calls'); } catch (e) { $('#run-error').textContent = e.message; return; }
  $('#run-error').textContent = '';
  const seedText = $('#run-seed').value.trim() || String(CONFIG.defaultSeed);
  const seed = normalizeSeed(seedText);
  runResult = simulateMultiServerSeeded({ seed, n, dists, preferred });
  runResult.dists = dists;
  $('#run-status').textContent = `Run simulated with seed ${seedText}, ${n} calls and the ${ruleName(preferred)}. Share the seed to reproduce exactly the same run.`;
  renderTable($('#run-table'), COLUMNS, runResult.rows, {
    footLabel: 'Totals',
    footExtra: `<tr><th scope="row" class="text">Run length</th><td colspan="${COLUMNS.length - 1}" class="text">${runResult.totals.run} minutes (time service of the last call ends)</td></tr>`
  });
  runAnim.anim.load(runResult.events, runResult.rows);
  runPlayer.setTotal(runResult.events.length);
  runPlayer.stepTo(0);
  const m = multiServerMeasures(runResult.totals, E(dists));
  showResults($('#run-results'), m, preferred);
  renderComparison(seed, n);
  drawRunCharts();
}

function renderComparison(seed, n) {
  const a = multiServerMeasures(simulateMultiServerSeeded({ seed, n, dists, preferred: 'Able', withEvents: false }).totals, E(dists));
  const b = multiServerMeasures(simulateMultiServerSeeded({ seed, n, dists, preferred: 'Baker', withEvents: false }).totals, E(dists));
  const rows = [
    ['Run length (minutes)', a.run, b.run],
    ['Able utilization', fmt(a.ableUtil), fmt(b.ableUtil)],
    ['Baker utilization', fmt(a.bakerUtil), fmt(b.bakerUtil)],
    ['Calls handled by Able', a.callsAble, b.callsAble],
    ['Calls handled by Baker', a.callsBaker, b.callsBaker],
    ['Probability a caller waits', fmt(a.pWait), fmt(b.pWait)],
    ['Average delay of all callers (minutes)', fmt(a.avgDelay), fmt(b.avgDelay)],
    ['Average delay of those who waited (minutes)', fmt(a.avgDelayWaiters), fmt(b.avgDelayWaiters)],
    ['Average time in system (minutes)', fmt(a.avgSystem), fmt(b.avgSystem)]
  ];
  $('#compare').innerHTML = `<p class="muted small">Both rules use the same seed (${seed}), so they use exactly the same random digits; only the server choice differs.</p>
    <div class="table-scroll"><table class="plain"><thead><tr><th scope="col" class="text">Measure</th><th scope="col">Able first (textbook)</th><th scope="col">Baker first</th></tr></thead>
    <tbody>${rows.map(([l, x, y]) => `<tr><td class="text">${esc(l)}</td><td>${x}</td><td>${y}</td></tr>`).join('')}</tbody></table></div>`;
}

function drawRunCharts() {
  if (!runResult) return;
  const delays = runResult.rows.map((r) => r.delay);
  const h = histogram(delays, [1, 2, 3, 4, 5], { zeroBin: true });
  h.labels[0] = '0 (no delay)';
  barChart($('#run-chart-freq'), { labels: h.labels, datasets: [{ label: 'Number of callers', data: h.counts }], xTitle: 'Caller delay (minutes)', yTitle: 'Number of callers' });
  renderFrequencyTable($('#run-freq-table'), `Frequency of caller delay (slide 116 reports ${pct(TB.slideNoDelayShare)} with no delay)`, h.labels, h.counts, 'Callers');
  barChart($('#run-chart-delay'), { labels: runResult.rows.map((r) => r.caller), datasets: [{ label: 'Delay (minutes)', data: delays }], xTitle: 'Caller', yTitle: 'Delay (minutes)' });
  for (const [name, key, box] of [['Able', 'able', '#run-chart-able'], ['Baker', 'baker', '#run-chart-baker']]) {
    const d = runResult.dists[key];
    const values = d.rows.map((r) => r.value);
    const times = runResult.rows.filter((r) => r.server === name).map((r) => r.service);
    barChart($(box), {
      labels: values.map(String),
      datasets: [{ label: `Simulated relative frequency (${times.length} calls)`, data: relativeFrequency(times, values) }, { label: 'Theoretical probability', data: d.rows.map((r) => r.p) }],
      xTitle: `${name} service time (minutes)`, yTitle: 'Relative frequency'
    });
  }
  drawGantt();
}

/** Gantt-style strip per server: busy periods are filled, idle periods are left empty. */
function drawGantt() {
  const iv = busyIntervals(runResult.rows);
  const run = runResult.totals.run || 1;
  const W = Math.max(900, Math.min(6000, run * 6));
  const left = 70, right = 20, rowH = 34, top = 10;
  const x = (t) => left + (t / run) * (W - left - right);
  const step = run <= 80 ? 5 : run <= 200 ? 10 : run <= 600 ? 25 : 50;
  let svg = `<svg class="anim-svg" viewBox="0 0 ${W} ${top + 2 * (rowH + 14) + 40}" width="${W}" role="img" aria-label="Server timeline: busy and idle periods of Able and Baker over the run">`;
  ['Able', 'Baker'].forEach((name, i) => {
    const y = top + i * (rowH + 14);
    svg += `<text x="${left - 10}" y="${y + rowH / 2 + 5}" text-anchor="end" class="server-name" font-size="15">${name}</text>`;
    svg += `<rect x="${left}" y="${y}" width="${W - left - right}" height="${rowH}" class="server-box idle"><title>${name} idle</title></rect>`;
    for (const b of iv[name]) {
      svg += `<rect x="${x(b.start)}" y="${y}" width="${Math.max(0.5, x(b.end) - x(b.start))}" height="${rowH}" class="server-box busy" stroke-width="1"><title>${name} busy with call ${b.caller}: minute ${b.start} to ${b.end}</title></rect>`;
    }
  });
  const axisY = top + 2 * (rowH + 14) + 4;
  for (let t = 0; t <= run; t += step) {
    svg += `<line x1="${x(t)}" x2="${x(t)}" y1="${axisY - 4}" y2="${axisY + 2}" class="arrow" stroke-width="1"/><text x="${x(t)}" y="${axisY + 18}" text-anchor="middle" class="label" font-size="12">${t}</text>`;
  }
  svg += `<text x="${left}" y="${axisY + 34}" class="label" font-size="12">Clock time (minutes). Filled: busy (Busy). Light: idle (Idle).</text></svg>`;
  $('#run-gantt').innerHTML = svg;
}

$('#run-new').addEventListener('click', () => { $('#run-seed').value = newSeed(); runOne(); });
$('#run-run').addEventListener('click', runOne);
$('#run-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') runOne(); });
$('#run-play').addEventListener('click', () => { if (runPlayer.playing) runPlayer.stop(); else runPlayer.play(); });
$('#run-step').addEventListener('click', () => { runPlayer.stop(); runAnim.anim.setDuration(500); runPlayer.stepTo(runPlayer.k + 1); });
$('#run-end').addEventListener('click', () => { runPlayer.stop(); runAnim.anim.setDuration(0); runPlayer.stepTo(runPlayer.total); });
$('#run-anim-reset').addEventListener('click', () => { runPlayer.stop(); runPlayer.stepTo(0); });
$('#run-csv').addEventListener('click', () => {
  if (runResult) downloadCSV(`call-center-one-run-seed-${runResult.seed}.csv`, CSV_HEADER, csvRows(runResult.rows));
});

// ---------------------------------------------------------------------------
// Mode 3: many runs
// ---------------------------------------------------------------------------

let runsResult = null;
$('#runs-seed').value = CONFIG.defaultSeed;
const RUN_COLUMNS = [
  { key: 'avgDelay', label: 'Average delay (min)', digits: 2 },
  { key: 'pWait', label: 'Probability a caller waits', digits: 2 },
  { key: 'ableUtil', label: 'Able utilization', digits: 3 },
  { key: 'bakerUtil', label: 'Baker utilization', digits: 3 },
  { key: 'avgDelayWaiters', label: 'Average delay of those who waited (min)', digits: 2 },
  { key: 'avgSystem', label: 'Average time in system (min)', digits: 2 },
  { key: 'run', label: 'Run length (min)', digits: 0 }
];

async function runMany() {
  let count, n;
  try {
    count = readInt($('#runs-count'), 1, 1000, 'The number of runs');
    n = readInt($('#runs-n'), 2, 1000, 'The number of calls per run');
  } catch (e) { $('#runs-error').textContent = e.message; return; }
  $('#runs-error').textContent = '';
  const seedText = $('#runs-seed').value.trim() || String(CONFIG.defaultSeed);
  const seed = normalizeSeed(seedText);
  const buttons = ['#runs-new', '#runs-run'].map((s) => $(s));
  buttons.forEach((b) => { b.disabled = true; });
  const status = $('#runs-status');
  const t0 = performance.now();
  const runs = [];
  let callers = 0, callersAtMost1 = 0;
  for (let i = 0; i < count; i++) {
    const r = simulateMultiServerSeeded({ seed: deriveSeed(seed, i), n, dists, preferred, withEvents: false });
    runs.push(runMeasures(r.totals));
    callers += r.rows.length;
    for (const row of r.rows) if (row.delay <= 1) callersAtMost1++;
    if (i % 50 === 49) { status.textContent = `Simulating run ${i + 1} of ${count}...`; await nextFrame(); }
  }
  buttons.forEach((b) => { b.disabled = !distsOk; });
  runsResult = { seed, seedText, count, n, dists, preferred, runs, callers, callersAtMost1 };
  status.textContent = `${count} runs of ${n} calls simulated with seed ${seedText} and the ${ruleName(preferred)} in ${Math.round(performance.now() - t0)} ms.`;
  renderRuns();
}

function renderRuns() {
  const { runs, count, callers, callersAtMost1 } = runsResult;
  const summary = {};
  for (const c of RUN_COLUMNS) summary[c.key] = summarize(runs.map((r) => r[c.key]));
  renderReplicationTable($('#runs-table'), 'Run', RUN_COLUMNS, runs, summary);
  const delays = runs.map((r) => r.avgDelay);
  const runsAtMost1 = delays.filter((d) => d <= 1).length;
  const rows = [
    ['Overall average delay (minutes)', fmt(summary.avgDelay.avg, 3)],
    ['Lowest and highest average delay of a run (minutes)', `${fmt(summary.avgDelay.min)} and ${fmt(summary.avgDelay.max)}`],
    ['Overall probability a caller waits', fmt(summary.pWait.avg, 3)],
    ['Average Able utilization', fmt(summary.ableUtil.avg, 3)],
    ['Average Baker utilization', fmt(summary.bakerUtil.avg, 3)],
    ['Runs with an average delay of at most 1 minute', `${runsAtMost1} of ${count} (${pct(runsAtMost1 / count, 1)})`],
    ['Runs with an average delay above 1 minute', `${count - runsAtMost1} of ${count} (${pct((count - runsAtMost1) / count, 1)})`],
    ['Callers (over all runs) with a delay of at most 1 minute', `${pct(callersAtMost1 / callers, 1)}`],
    ['Callers (over all runs) with a delay above 1 minute', `${pct(1 - callersAtMost1 / callers, 1)}`],
    ['Slide 119 reference', `${pct(TB.slideAtMost1Minute, 1)} at most 1 minute, ${pct(TB.slideAbove1Minute, 1)} above 1 minute`]
  ];
  $('#runs-findings').innerHTML = `<div class="table-scroll"><table class="plain"><thead><tr><th scope="col" class="text">Measure</th><th scope="col">Value</th></tr></thead>
    <tbody>${rows.map(([a, b]) => `<tr><td class="text">${esc(a)}</td><td>${b}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">The slide percentages may refer to runs or to individual callers; both are shown until this is confirmed.</p>
    <p class="interpretation">Over ${count} ${count === 1 ? 'run' : 'runs'} the average delay was ${fmt(summary.avgDelay.avg)} minutes, and the average delay of a single run ranged from ${fmt(summary.avgDelay.min)} to ${fmt(summary.avgDelay.max)} minutes, so one run is not enough to judge the system. Able was busy ${pct(summary.ableUtil.avg)} and Baker ${pct(summary.bakerUtil.avg)} of the time on average.</p>`;
  drawRunsCharts();
}

function drawRunsCharts() {
  if (!runsResult) return;
  const delays = runsResult.runs.map((r) => r.avgDelay);
  const h = histogram(delays, [0.5, 1, 1.5, 2, 2.5, 3]);
  barChart($('#runs-chart-freq'), { labels: h.labels, datasets: [{ label: 'Number of runs', data: h.counts }], xTitle: 'Average delay of a run (minutes)', yTitle: 'Number of runs' });
  renderFrequencyTable($('#runs-freq-table'), 'Frequency of the average delay per run', h.labels, h.counts, 'Runs');
  lineWithAverage($('#runs-chart-line'), { labels: delays.map((_, i) => i + 1), data: delays, average: mean(delays), label: 'Average delay (minutes)', xTitle: 'Run', yTitle: 'Average delay (minutes)' });
}

$('#runs-new').addEventListener('click', () => { $('#runs-seed').value = newSeed(); runMany(); });
$('#runs-run').addEventListener('click', runMany);
$('#runs-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') runMany(); });
$('#runs-csv').addEventListener('click', () => {
  if (!runsResult) return;
  downloadCSV(`call-center-${runsResult.count}-runs-seed-${runsResult.seed}.csv`, ['Run', ...RUN_COLUMNS.map((c) => c.label)],
    runsResult.runs.map((r, i) => [i + 1, ...RUN_COLUMNS.map((c) => r[c.key])]));
});
$('#runs-csv-all').addEventListener('click', () => {
  if (!runsResult) return;
  const { seed, count, n, dists: dd, preferred: pref } = runsResult;
  const all = [];
  for (let i = 0; i < count; i++) {
    const r = simulateMultiServerSeeded({ seed: deriveSeed(seed, i), n, dists: dd, preferred: pref, withEvents: false });
    all.push(...csvRows(r.rows, i + 1));
  }
  downloadCSV(`call-center-${count}-runs-all-callers-seed-${seed}.csv`, ['Run', ...CSV_HEADER], all);
});

// ---------------------------------------------------------------------------
// Tabs and start-up
// ---------------------------------------------------------------------------

const started = { run: false, runs: false };
const tabs = setupTabs($('#mode-tabs'), (mode) => {
  currentMode = mode;
  if (tbPlayer) tbPlayer.stop();
  runPlayer.stop();
  // The textbook digits go with the textbook distributions; random digits allow editing.
  distPanel.setEditable(mode !== 'textbook' || !useTextbookDigits);
  applyDists(distPanel.get(), distPanel.ok(), false);
  if (mode === 'run' && !started.run) { started.run = true; runOne(); }
  if (mode === 'runs' && !started.runs) { started.runs = true; runMany(); }
});
tabs.select('textbook');

onThemeChange(() => { distPanel.redraw(); drawRunCharts(); drawRunsCharts(); });
$('#dist-details').addEventListener('toggle', () => { if ($('#dist-details').open) distPanel.redraw(); });
