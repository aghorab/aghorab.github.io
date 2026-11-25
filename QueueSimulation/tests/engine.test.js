// Verification tests (SPEC Section 5.4). Runs in tests.html (browser) and can
// also be imported by any ES-module runner: call runAllTests(fixture, rowsFixture).

import { createRng } from '../js/rng.js';
import {
  DISTRIBUTIONS, lookup, makeDistribution, generateDigitsForTimes,
  GROCERY_ARRIVAL, GROCERY_SERVICE, CALL_ARRIVAL, ABLE_SERVICE, BAKER_SERVICE
} from '../js/distributions.js';
import {
  simulateSingleServer, simulateSingleServerFromDigits, simulateSingleServerSeeded
} from '../js/single-server.js';
import {
  simulateMultiServer, simulateMultiServerSeeded, chooseServer, busyIntervals
} from '../js/multi-server.js';
import {
  singleServerMeasures, dailyMeasures, singleServerKeyFindings, summarize,
  histogram, relativeFrequency, multiServerMeasures
} from '../js/measures.js';
import { GROCERY_TEXTBOOK } from '../data/grocery-textbook.js';
import { CALLCENTER_TEXTBOOK } from '../data/callcenter-textbook.js';

const D = DISTRIBUTIONS;
const r2 = (x) => Math.round(x * 100) / 100;
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const sameArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const callDists = { arrival: D.callArrival, able: D.ableService, baker: D.bakerService };

/** Collects the results of one test group. */
function group(id, title) {
  const checks = [];
  return {
    id, title, checks, skipped: null,
    check(name, pass, detail = '') { checks.push({ name, pass: Boolean(pass), detail }); },
    skip(reason) { this.skipped = reason; }
  };
}

function groceryTextbookRun() {
  return simulateSingleServer({
    interarrival: GROCERY_TEXTBOOK.interarrivalTimes,
    service: GROCERY_TEXTBOOK.serviceTimes,
    arrivalDigits: GROCERY_TEXTBOOK.arrivalDigits
  });
}

export function runAllTests(fixture, rowsFixture) {
  const groups = [];

  // 1. Grocery textbook run, totals --------------------------------------
  {
    const g = group(1, 'Grocery textbook run, totals');
    const { totals: t } = groceryTextbookRun();
    const expected = { iat: 82, service: 68, wait: 56, system: 124, idle: 18, waited: 13, run: 86 };
    for (const [k, v] of Object.entries(expected)) g.check(`total ${k} = ${v}`, t[k] === v, `got ${t[k]}`);
    groups.push(g);
  }

  // 2. Grocery textbook run, row by row ----------------------------------
  {
    const g = group(2, 'Grocery textbook run, row by row');
    const { rows } = groceryTextbookRun();
    const begin = [0, 8, 14, 18, 23, 26, 34, 41, 45, 50, 53, 56, 61, 65, 66, 71, 75, 78, 81, 83];
    const wait = [0, 0, 0, 3, 0, 0, 0, 0, 2, 4, 6, 8, 8, 6, 4, 1, 4, 5, 4, 1];
    const end = [4, 9, 18, 21, 25, 30, 39, 45, 50, 53, 56, 61, 65, 66, 71, 75, 78, 81, 83, 86];
    g.check('Time service begins', sameArray(rows.map((r) => r.begin), begin), rows.map((r) => r.begin).join(', '));
    g.check('Waiting time', sameArray(rows.map((r) => r.wait), wait), rows.map((r) => r.wait).join(', '));
    g.check('Time service ends', sameArray(rows.map((r) => r.end), end), rows.map((r) => r.end).join(', '));
    groups.push(g);
  }

  // 3. Grocery measures ---------------------------------------------------
  {
    const g = group(3, 'Grocery measures (two decimals)');
    const { totals } = groceryTextbookRun();
    const m = singleServerMeasures(totals, { EA: D.groceryArrival.expected, ES: D.groceryService.expected });
    const keys = ['avgWait', 'pWait', 'pIdle', 'pBusy', 'avgService', 'ES', 'avgIAT', 'EA', 'avgWaitWaiters', 'avgSystem', 'avgSystemAlt'];
    const expected = [2.80, 0.65, 0.21, 0.79, 3.40, 3.20, 4.32, 4.50, 4.31, 6.20, 6.20];
    keys.forEach((k, i) => g.check(`measure ${i + 1} (${k}) = ${expected[i].toFixed(2)}`, r2(m[k]) === expected[i], `got ${m[k]}`));
    groups.push(g);
  }

  // 4. Digit lookup boundaries -------------------------------------------
  {
    const g = group(4, 'Digit lookup boundaries');
    const arr = [[1, 1], [125, 1], [126, 2], [875, 7], [876, 8], [0, 8], [1000, 8]];
    for (const [d, v] of arr) g.check(`arrival ${String(d % 1000).padStart(3, '0')} gives ${v}`, lookup(d, D.groceryArrival) === v);
    const svc = [[1, 1], [10, 1], [11, 2], [95, 5], [96, 6], [0, 6], [100, 6]];
    for (const [d, v] of svc) g.check(`service ${String(d % 100).padStart(2, '0')} gives ${v}`, lookup(d, D.groceryService) === v);
    const tb = GROCERY_TEXTBOOK;
    let ok = true;
    for (let i = 1; i < tb.customers; i++) if (lookup(tb.arrivalDigits[i], D.groceryArrival) !== tb.interarrivalTimes[i]) ok = false;
    g.check('each of the 19 textbook arrival digits maps to its textbook time', ok);
    let genOk = true;
    for (let seed = 1; seed <= 200; seed++) {
      const digits = generateDigitsForTimes(tb.serviceTimes, D.groceryService, createRng(seed));
      digits.forEach((d, i) => { if (d === null || d < 1 || d > 100 || lookup(d, D.groceryService) !== tb.serviceTimes[i]) genOk = false; });
    }
    g.check('generated service digits (200 seeds) always map to the published service times', genOk);
    groups.push(g);
  }

  // 5. Call center distributions ----------------------------------------
  {
    const g = group(5, 'Call center distributions');
    for (const def of [CALL_ARRIVAL, ABLE_SERVICE, BAKER_SERVICE]) {
      const dist = makeDistribution(def);
      g.check(`${def.name} sums to 1`, close(dist.sum, 1) && dist.rows[dist.rows.length - 1].upper === 100);
    }
    g.check('Able 30 gives 2', lookup(30, D.ableService) === 2);
    g.check('Able 31 gives 3', lookup(31, D.ableService) === 3);
    g.check('Able 00 gives 5', lookup(0, D.ableService) === 5);
    g.check('Baker 35 gives 3', lookup(35, D.bakerService) === 3);
    g.check('Baker 36 gives 4', lookup(36, D.bakerService) === 4);
    g.check('Baker 00 gives 6', lookup(0, D.bakerService) === 6);
    g.check('E(time between calls) = 2.25', close(D.callArrival.expected, 2.25));
    g.check('E(Able) = 3.29', close(D.ableService.expected, 3.29));
    g.check('E(Baker) = 4.25', close(D.bakerService.expected, 4.25));
    groups.push(g);
  }

  // 6. Server-selection rule ---------------------------------------------
  {
    const g = group(6, 'Server-selection rule');
    g.check('both idle: Able under the default rule', chooseServer(5, 0, 0, 'Able') === 'Able');
    g.check('both idle: Baker under the quiz rule', chooseServer(5, 0, 0, 'Baker') === 'Baker');
    g.check('only Baker idle: Baker under the default rule', chooseServer(5, 9, 3, 'Able') === 'Baker');
    g.check('only Baker idle: Baker under the quiz rule', chooseServer(5, 9, 3, 'Baker') === 'Baker');
    // Hand-built tables: call 1 at 0 (both idle), call 2 at 1 (only the other server idle).
    const a = simulateMultiServer({ interarrival: [null, 1], service: [4, 4], preferred: 'Able' });
    g.check('table, default rule: call 1 to Able, call 2 to Baker', a.rows[0].server === 'Able' && a.rows[1].server === 'Baker');
    const b = simulateMultiServer({ interarrival: [null, 1], service: [4, 4], preferred: 'Baker' });
    g.check('table, quiz rule: call 1 to Baker, call 2 to Able', b.rows[0].server === 'Baker' && b.rows[1].server === 'Able');
    const tie = simulateMultiServer({ interarrival: [null, 0, 1], service: [3, 3, 2], preferred: 'Able' });
    g.check('both busy with equal free times: call waits for the preferred server', tie.rows[2].server === 'Able' && tie.rows[2].delay === 2);
    const digits = simulateMultiServer({ interarrival: [null, 1], serviceDigits: [30, 30], dists: callDists });
    g.check('service digits use the chosen server\'s table (30: Able 2, Baker 3)', digits.rows[0].service === 2 && digits.rows[1].service === 3);
    groups.push(g);
  }

  // 7. Call center textbook run ------------------------------------------
  {
    const g = group(7, 'Call center textbook run');
    const tb = CALLCENTER_TEXTBOOK;
    if (!tb.confirmed) {
      g.skip('Skipped: callcenter-textbook.js has confirmed: false (digits from slides 84 to 112 not yet entered).');
    } else {
      const res = simulateMultiServer({ arrivalDigits: tb.arrivalDigits, serviceDigits: tb.serviceDigits, dists: callDists });
      const m = multiServerMeasures(res.totals, { EArrival: 2.25, EAble: 3.29, EBaker: 4.25 });
      g.check('run length 62', m.run === 62, `got ${m.run}`);
      g.check('Able utilization 0.90', r2(m.ableUtil) === 0.90, `got ${m.ableUtil}`);
      g.check('Baker utilization 0.69', r2(m.bakerUtil) === 0.69, `got ${m.bakerUtil}`);
      g.check('9 of 26 callers waited', m.waited === 9 && res.totals.n === 26);
      g.check('average delay 0.42', r2(m.avgDelay) === 0.42, `got ${m.avgDelay}`);
      g.check('average delay of those who waited 1.22', r2(m.avgDelayWaiters) === 1.22, `got ${m.avgDelayWaiters}`);
    }
    groups.push(g);
  }

  // 8. Invariants on 1,000 random seeds ----------------------------------
  {
    const g = group(8, 'Invariants on 1,000 random seeds');
    let single = true, singleBalance = true, multi = true, overlap = true;
    for (let seed = 1; seed <= 1000; seed++) {
      const s = simulateSingleServerSeeded({ seed, n: 100, arrivalDist: D.groceryArrival, serviceDist: D.groceryService });
      for (const r of s.rows) if (r.wait < 0 || r.idle < 0 || r.begin < r.arrival) single = false;
      if (s.totals.service + s.totals.idle !== s.totals.run) singleBalance = false;
      const m = simulateMultiServerSeeded({ seed, n: 100, dists: callDists });
      for (const r of m.rows) if (r.delay < 0 || r.begin < r.arrival) multi = false;
      const iv = busyIntervals(m.rows);
      for (const list of [iv.Able, iv.Baker]) {
        for (let i = 1; i < list.length; i++) if (list[i].start < list[i - 1].end) overlap = false;
      }
    }
    g.check('single server: no negative waiting or idle time; Begin never before Arrival', single);
    g.check('single server: total service + total idle = run time', singleBalance);
    g.check('two servers: no negative delay; Begin never before Arrival', multi);
    g.check('two servers: no server has overlapping service intervals', overlap);
    groups.push(g);
  }

  // 9. Reproducibility ---------------------------------------------------
  {
    const g = group(9, 'Reproducibility');
    const run = (seed) => JSON.stringify(simulateSingleServerSeeded({ seed, n: 100, arrivalDist: D.groceryArrival, serviceDist: D.groceryService }).rows);
    const runM = (seed) => JSON.stringify(simulateMultiServerSeeded({ seed, n: 100, dists: callDists }).rows);
    g.check('single server: same seed gives identical tables', run(12345) === run(12345));
    g.check('single server: different seeds give different tables', run(12345) !== run(12346));
    g.check('two servers: same seed gives identical tables', runM(12345) === runM(12345));
    g.check('two servers: different seeds give different tables', runM(12345) !== runM(12346));
    groups.push(g);
  }

  // 10. Distribution sanity ----------------------------------------------
  {
    const g = group(10, 'Distribution sanity (100,000 draws)');
    const cases = [
      [D.groceryArrival, 4.5], [D.groceryService, 3.2], [D.callArrival, 2.25],
      [D.ableService, 3.29], [D.bakerService, 4.25]
    ];
    cases.forEach(([dist, e], i) => {
      const rng = createRng(1000 + i);
      let sum = 0;
      for (let k = 0; k < 100000; k++) sum += lookup(rng.randomDigits(dist.digits), dist);
      const m = sum / 100000;
      g.check(`${dist.name}: sample mean within 0.03 of ${e}`, Math.abs(m - e) <= 0.03, `sample mean ${m.toFixed(4)}`);
    });
    groups.push(g);
  }

  // 11. Excel workbook equivalence ---------------------------------------
  {
    const g = group(11, 'Excel workbook equivalence');
    if (!fixture) {
      g.check('fixture grocery-workbook-fixture.json loaded', false);
    } else {
      const dists = { arrivalDist: D.groceryArrival, serviceDist: D.groceryService };
      const E = { EA: D.groceryArrival.expected, ES: D.groceryService.expected };

      // One day of 100 customers.
      const day = fixture.oneDay100;
      const res = simulateSingleServerFromDigits({ arrivalDigits: day.arrivalDigits, serviceDigits: day.serviceDigits, ...dists });
      if (rowsFixture) {
        g.check('one day: service begin times equal the workbook, row by row', sameArray(res.rows.map((r) => r.begin), rowsFixture.begin));
        g.check('one day: waiting times equal the workbook, row by row', sameArray(res.rows.map((r) => r.wait), rowsFixture.wait));
      }
      const t = res.totals;
      const tExp = { iat: 411, service: 325, wait: 255, system: 580, idle: 92, waited: 58, run: 417, maxWait: 14 };
      for (const [k, v] of Object.entries(tExp)) g.check(`one day: total ${k} = ${v}`, t[k] === v, `got ${t[k]}`);
      const fxTotals = { iat: 'iat', service: 'service', wait: 'wait', sys: 'system', idle: 'idle', waited: 'waited', run: 'run', maxWait: 'maxWait' };
      g.check('one day: totals equal oneDay100.totals', Object.entries(fxTotals).every(([fk, k]) => day.totals[fk] === t[k]));
      const m = singleServerMeasures(t, E);
      const badM = Object.keys(day.measures).filter((k) => !close(m[k], day.measures[k]));
      g.check('one day: the 12 measures equal oneDay100.measures', badM.length === 0, badM.join(', '));
      const h = histogram(res.rows.map((r) => r.wait), [2, 4, 6, 8, 10, 12, 14], { zeroBin: true });
      g.check('one day: waiting-time histogram equals the workbook', sameArray(h.counts, day.waitingHistogram.counts), h.counts.join(', '));
      g.check('one day: histogram bin labels equal the workbook', sameArray(h.labels, day.waitingHistogram.bins), h.labels.join(' | '));
      const rf = relativeFrequency(res.rows.map((r) => r.service), [1, 2, 3, 4, 5, 6]);
      g.check('one day: service relative frequencies equal the workbook', rf.every((v, i) => close(v, day.serviceRelativeFrequency[i])), rf.join(', '));

      // Fifty days.
      const fd = fixture.fiftyDays;
      const daily = fd.days.map((d) => dailyMeasures(
        simulateSingleServerFromDigits({ arrivalDigits: d.arrivalDigits, serviceDigits: d.serviceDigits, ...dists }).totals
      ));
      const badDays = [];
      fd.days.forEach((d, k) => {
        for (const key of Object.keys(d.expected)) if (!close(daily[k][key], d.expected[key])) badDays.push(`day ${d.day} ${key}`);
      });
      g.check(`fifty days: the daily measures of all ${fd.days.length} days equal the workbook (tolerance 1e-9)`, badDays.length === 0, badDays.slice(0, 5).join(', '));
      const kf = singleServerKeyFindings(daily, { ...E, slideAvgWait: 1.32 });
      const s = fd.summary;
      const waits = daily.map((d) => d.avgWait);
      const sum = summarize(waits);
      g.check('overall average wait 1.279', close(kf.overallAvgWait, s.avgOf50.avgWait) && close(Math.round(kf.overallAvgWait * 1000) / 1000, 1.279), `got ${kf.overallAvgWait}`);
      g.check('overall probability a customer waits', close(kf.overallPWait, s.avgOf50.pWait), `got ${kf.overallPWait}`);
      g.check('standard deviation 0.4435', close(sum.sd, s.stdDev.avgWait) && close(Math.round(sum.sd * 1e4) / 1e4, 0.4435), `got ${sum.sd}`);
      g.check('minimum 0.58, maximum 2.54', close(kf.lowestAvgWait, s.min.avgWait) && close(kf.highestAvgWait, s.max.avgWait));
      g.check('2 days above 2 minutes', kf.daysAbove2 === s.daysAvgWaitAbove2 && kf.daysAbove2 === 2);
      g.check('overall utilization 0.7100', close(kf.overallUtilization, s.overallUtilisation) && close(Math.round(kf.overallUtilization * 1e4) / 1e4, 0.71), `got ${kf.overallUtilization}`);
      g.check('average time in system 4.488', close(kf.avgTimeInSystem, s.avgTimeInSystem), `got ${kf.avgTimeInSystem}`);
      const hd = histogram(waits, [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
      g.check('histogram counts 0, 15, 21, 12, 1, 1, 0, 0, 0, 0, 0', sameArray(hd.counts, s.histogram.counts) && sameArray(hd.counts, [0, 15, 21, 12, 1, 1, 0, 0, 0, 0, 0]), hd.counts.join(', '));
      g.check('histogram bin labels equal the workbook', sameArray(hd.labels, s.histogram.bins), hd.labels.join(' | '));
    }
    groups.push(g);
  }

  return groups;
}
