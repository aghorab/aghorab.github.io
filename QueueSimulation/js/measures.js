// Performance-measure calculations shared by both engines (SPEC Sections 3.2.1, 4.3 and 5.3).
// Every division is guarded against a zero denominator.

/** Safe division: returns `fallback` when the denominator is zero. */
export function ratio(num, den, fallback = 0) {
  return den === 0 ? fallback : num / den;
}

export function mean(values) {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

/** Sample standard deviation, as Excel STDEV.S. Returns 0 for fewer than two values. */
export function stdevS(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

/** Average, standard deviation, minimum and maximum of one column. */
export function summarize(values) {
  return {
    avg: mean(values),
    sd: stdevS(values),
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0
  };
}

/**
 * The eleven single-server measures of SPEC Section 5.3, plus the maximum
 * waiting time used by the one-day mode.
 *   totals: from simulateSingleServer; EA, ES: theoretical expected values
 */
export function singleServerMeasures(totals, { EA, ES }) {
  const n = totals.n;
  const pIdle = ratio(totals.idle, totals.run);
  const avgWait = ratio(totals.wait, n);
  const avgService = ratio(totals.service, n);
  return {
    avgWait,                                            // 1  total wait / customers
    pWait: ratio(totals.waited, n),                     // 2  customers who wait / customers
    pIdle,                                              // 3  total idle time / total run time
    pBusy: 1 - pIdle,                                   // 4  1 - probability of idle server
    avgService,                                         // 5  total service / customers
    ES,                                                 // 6  sum of s times p(s)
    avgIAT: ratio(totals.iat, n - 1),                   // 7  sum of times between arrivals / (customers - 1)
    EA,                                                 // 8  sum of a times p(a)
    avgWaitWaiters: ratio(totals.wait, totals.waited),  // 9  total wait / customers who wait (0 if none)
    noneWaited: totals.waited === 0,
    avgSystem: ratio(totals.system, n),                 // 10 total time in system / customers
    avgSystemAlt: avgWait + avgService,                 // 11 check: measure 1 + measure 5
    maxWait: totals.maxWait                             // one-day mode: maximum waiting time
  };
}

/** The nine daily measures of the "50 Experiments" sheet (SPEC Section 3.2.1). */
export function dailyMeasures(totals) {
  const m = singleServerMeasures(totals, { EA: 0, ES: 0 });
  return {
    avgWait: m.avgWait,
    pWait: m.pWait,
    pIdle: m.pIdle,
    pBusy: m.pBusy,
    avgService: m.avgService,
    avgIAT: m.avgIAT,
    avgWaitWaiters: m.avgWaitWaiters,
    avgSystem: m.avgSystem,
    run: totals.run
  };
}

/**
 * Key findings over all days (SPEC Section 3.2.1). Overall values are the
 * averages of the daily values, as in the workbook.
 */
export function singleServerKeyFindings(days, { EA, ES, slideAvgWait }) {
  const waits = days.map((d) => d.avgWait);
  return {
    overallAvgWait: mean(waits),
    slideAvgWait,
    lowestAvgWait: Math.min(...waits),
    highestAvgWait: Math.max(...waits),
    daysAbove2: waits.filter((w) => w > 2).length,
    overallPWait: mean(days.map((d) => d.pWait)),
    overallUtilization: mean(days.map((d) => d.pBusy)),
    avgTimeInSystem: mean(days.map((d) => d.avgSystem)),
    ES,
    EA
  };
}

/**
 * Frequency table with half-open bins (lower, upper].
 *   edges: upper bounds of the closed bins, for example [2, 4, 6] gives
 *          (0, 2], (2, 4], (4, 6] and a final "> 6" bin.
 *   zeroBin: when true, a first bin "0 (no wait)" counts values equal to 0,
 *            and the first interval starts above 0.
 */
export function histogram(values, edges, { zeroBin = false } = {}) {
  const labels = [];
  if (zeroBin) labels.push('0 (no wait)');
  let lower = 0;
  for (const e of edges) {
    labels.push(`(${lower}, ${e}]`);
    lower = e;
  }
  labels.push(`> ${edges[edges.length - 1]}`);
  const counts = new Array(labels.length).fill(0);
  const offset = zeroBin ? 1 : 0;
  for (const v of values) {
    if (zeroBin && v === 0) { counts[0]++; continue; }
    let idx = edges.findIndex((e) => v <= e);
    if (idx === -1) idx = edges.length;
    counts[idx + offset]++;
  }
  return { labels, counts };
}

/** Relative frequency of each value of a distribution among simulated times. */
export function relativeFrequency(times, values) {
  return values.map((v) => ratio(times.filter((t) => t === v).length, times.length));
}

/** The call-center measures of SPEC Section 4.3 (results panel). */
export function multiServerMeasures(totals, { EArrival, EAble, EBaker }) {
  const n = totals.n;
  return {
    run: totals.run,                                         // 1 time service of the last call ends
    ableUtil: ratio(totals.serviceAble, totals.run),         // 2 total Able service / run length
    bakerUtil: ratio(totals.serviceBaker, totals.run),       // 3 total Baker service / run length
    callsAble: totals.callsAble,                             // 4 counts and shares
    callsBaker: totals.callsBaker,
    shareAble: ratio(totals.callsAble, n),
    shareBaker: ratio(totals.callsBaker, n),
    pWait: ratio(totals.waited, n),                          // 5 callers with delay > 0 / calls
    waited: totals.waited,
    avgDelay: ratio(totals.delay, n),                        // 6 total delay / calls
    avgDelayWaiters: ratio(totals.delay, totals.waited),     // 7 total delay / callers who waited
    noneWaited: totals.waited === 0,
    avgSystem: ratio(totals.system, n),                      // 8 total time in system / calls
    avgServiceAble: ratio(totals.serviceAble, totals.callsAble),   // 9 beside E = 3.29
    avgServiceBaker: ratio(totals.serviceBaker, totals.callsBaker), //   beside E = 4.25
    EAble,
    EBaker,
    avgIAT: ratio(totals.iat, n - 1),                        // 10 beside E = 2.25
    EArrival,
    maxDelay: totals.maxDelay
  };
}

/** Per-run measures for the "many runs" table of the call center. */
export function runMeasures(totals) {
  return {
    avgDelay: ratio(totals.delay, totals.n),
    pWait: ratio(totals.waited, totals.n),
    ableUtil: ratio(totals.serviceAble, totals.run),
    bakerUtil: ratio(totals.serviceBaker, totals.run),
    avgDelayWaiters: ratio(totals.delay, totals.waited),
    avgSystem: ratio(totals.system, totals.n),
    run: totals.run
  };
}
