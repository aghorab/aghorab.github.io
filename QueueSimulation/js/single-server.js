// Single-server simulation engine (SPEC Section 5.2). Pure functions, no DOM access.
// The same code runs in the page and in the tests.

import { createRng } from './rng.js';
import { lookup } from './distributions.js';

/**
 * Draws the random digits for n customers from a seeded stream, in the order
 * of the workbook: for each customer, first the arrival digit (from customer 2),
 * then the service digit. Customer 1 has no arrival digit (null).
 */
export function drawSingleServerDigits(seed, n, arrivalDist, serviceDist) {
  const rng = createRng(seed);
  const arrivalDigits = [];
  const serviceDigits = [];
  for (let i = 0; i < n; i++) {
    arrivalDigits.push(i === 0 ? null : rng.randomDigits(arrivalDist.digits));
    serviceDigits.push(rng.randomDigits(serviceDist.digits));
  }
  return { arrivalDigits, serviceDigits };
}

/**
 * Runs the simulation table from random digits supplied from outside (for
 * example the workbook's digits) or drawn from a seed.
 * input: { arrivalDigits, serviceDigits, arrivalDist, serviceDist }
 */
export function simulateSingleServerFromDigits({ arrivalDigits, serviceDigits, arrivalDist, serviceDist, withEvents = true }) {
  const interarrival = arrivalDigits.map((d, i) => (i === 0 ? null : lookup(d, arrivalDist)));
  const service = serviceDigits.map((d) => lookup(d, serviceDist));
  return simulateSingleServer({ interarrival, service, arrivalDigits, serviceDigits, withEvents });
}

/** Draws digits from a seed and runs the simulation table for n customers. */
export function simulateSingleServerSeeded({ seed, n, arrivalDist, serviceDist, withEvents = true }) {
  const digits = drawSingleServerDigits(seed, n, arrivalDist, serviceDist);
  const result = simulateSingleServerFromDigits({ ...digits, arrivalDist, serviceDist, withEvents });
  result.seed = seed;
  return result;
}

/**
 * Core of the hand simulation table. Times are integers in minutes.
 *   interarrival[i]: time since last arrival of customer i + 1 (null for customer 1)
 *   service[i]:      service time of customer i + 1
 * Digit arrays are optional and only copied into the rows for display.
 * withEvents = false skips the animation event list (used by the replication modes).
 *
 * For customer i = 1 to n, with End(0) = 0:
 *   Arrival(1) = 0;  Arrival(i) = Arrival(i-1) + A(i)
 *   Begin(i)   = max(Arrival(i), End(i-1))   service starts when both are present
 *   Wait(i)    = Begin(i) - Arrival(i)       time in the queue
 *   End(i)     = Begin(i) + S(i)
 *   System(i)  = End(i) - Arrival(i)         waiting time plus service time
 *   Idle(i)    = Begin(i) - End(i-1)         server idle before this customer
 */
export function simulateSingleServer({ interarrival, service, arrivalDigits = null, serviceDigits = null, withEvents = true }) {
  const n = service.length;
  const rows = [];
  const totals = { n, iat: 0, service: 0, wait: 0, system: 0, idle: 0, waited: 0, run: 0, maxWait: 0 };
  let prevArrival = 0;
  let prevEnd = 0;

  for (let i = 0; i < n; i++) {
    const a = i === 0 ? null : interarrival[i];
    const arrival = i === 0 ? 0 : prevArrival + a;
    const s = service[i];
    const begin = Math.max(arrival, prevEnd);
    const wait = begin - arrival;
    const end = begin + s;
    const system = end - arrival;
    const idle = begin - prevEnd;

    rows.push({
      customer: i + 1,
      arrivalDigits: arrivalDigits ? arrivalDigits[i] : null,
      iat: a,
      arrival,
      serviceDigits: serviceDigits ? serviceDigits[i] : null,
      service: s,
      begin,
      wait,
      end,
      system,
      idle,
      waited: wait > 0 ? 1 : 0
    });

    if (a !== null) totals.iat += a;
    totals.service += s;
    totals.wait += wait;
    totals.system += system;
    totals.idle += idle;
    totals.waited += wait > 0 ? 1 : 0;
    totals.maxWait = Math.max(totals.maxWait, wait);

    prevArrival = arrival;
    prevEnd = end;
  }
  // Total run time = time service of the last customer ends.
  totals.run = prevEnd;

  return { rows, totals, events: withEvents ? buildSingleServerEvents(rows) : [] };
}

/**
 * Ordered event list used only by the animation. At equal times a departure
 * comes first, then an arrival, then a service start, which is the order in
 * which the hand table reads them.
 */
export function buildSingleServerEvents(rows) {
  const order = { departure: 0, arrival: 1, start: 2 };
  const events = [];
  for (const r of rows) {
    events.push({ type: 'arrival', time: r.arrival, customer: r.customer });
    events.push({ type: 'start', time: r.begin, customer: r.customer });
    events.push({ type: 'departure', time: r.end, customer: r.customer });
  }
  events.sort((x, y) => x.time - y.time || order[x.type] - order[y.type] || x.customer - y.customer);
  return events;
}
