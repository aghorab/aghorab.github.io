// Single-server simulation engine (SPEC Section 5.2). Pure functions, no DOM access.
// The same code runs in the page and in the tests.

import { createRng, deriveSeed } from './rng.js?v=4';
import { lookup } from './distributions.js?v=4';

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
export function simulateSingleServerFromDigits({ arrivalDigits, serviceDigits, arrivalDist, serviceDist, withEvents = true, discipline = 'FIFO', disciplineSeed = 0 }) {
  const interarrival = arrivalDigits.map((d, i) => (i === 0 ? null : lookup(d, arrivalDist)));
  const service = serviceDigits.map((d) => lookup(d, serviceDist));
  return simulateSingleServer({ interarrival, service, arrivalDigits, serviceDigits, withEvents, discipline, disciplineSeed });
}

/** Draws digits from a seed and runs the simulation table for n customers. */
export function simulateSingleServerSeeded({ seed, n, arrivalDist, serviceDist, withEvents = true, discipline = 'FIFO' }) {
  const digits = drawSingleServerDigits(seed, n, arrivalDist, serviceDist);
  // SIRO draws its random choices from a separate stream, so the arrival and
  // service digits stay the same for every discipline (common random numbers).
  const result = simulateSingleServerFromDigits({ ...digits, arrivalDist, serviceDist, withEvents, discipline, disciplineSeed: deriveSeed(seed, 1000003) });
  result.seed = seed;
  return result;
}

/**
 * Queue disciplines: which waiting customer the server takes next. All are
 * non-preemptive: a customer in service is never interrupted.
 */
export const DISCIPLINES = [
  { id: 'FIFO', name: 'FIFO (first in, first out)', short: 'FIFO', desc: 'The customer who has waited longest is served next (the textbook rule).' },
  { id: 'LIFO', name: 'LIFO (last in, first out)', short: 'LIFO', desc: 'The customer who arrived most recently is served next.' },
  { id: 'SIRO', name: 'SIRO (service in random order)', short: 'SIRO', desc: 'The next customer is chosen at random among those waiting.' },
  { id: 'SPT', name: 'SPT (shortest service time first)', short: 'SPT', desc: 'The waiting customer with the shortest service time is served next (ties: first in, first out).' },
  { id: 'LPT', name: 'LPT (longest service time first)', short: 'LPT', desc: 'The waiting customer with the longest service time is served next (ties: first in, first out).' }
];

/**
 * Picks the position (in `waiting`, which is in arrival order) of the next customer.
 *   waiting: indices of the customers in the queue; service: service times; rng for SIRO
 */
function pickNext(waiting, discipline, service, rng) {
  switch (discipline) {
    case 'LIFO': return waiting.length - 1;
    case 'SIRO': return Math.floor(rng.next() * waiting.length);
    case 'SPT':
    case 'LPT': {
      let best = 0;
      for (let k = 1; k < waiting.length; k++) {
        const better = discipline === 'SPT'
          ? service[waiting[k]] < service[waiting[best]]
          : service[waiting[k]] > service[waiting[best]];
        if (better) best = k;   // strict comparison keeps the earlier arrival on a tie
      }
      return best;
    }
    default: return 0;   // FIFO
  }
}

/**
 * Core of the hand simulation table. Times are integers in minutes.
 *   interarrival[i]: time since last arrival of customer i + 1 (null for customer 1)
 *   service[i]:      service time of customer i + 1
 *   discipline:      'FIFO' (default), 'LIFO', 'SIRO', 'SPT' or 'LPT'
 *   disciplineSeed:  seed of the random choices of SIRO
 * Digit arrays are optional and only copied into the rows for display.
 * withEvents = false skips the animation event list (used by the replication modes).
 *
 * Arrival(1) = 0;  Arrival(i) = Arrival(i-1) + A(i).
 * Each time the server becomes free, every customer who has arrived by then is
 * in the queue, and the discipline chooses the next one, c:
 *   Begin(c)  = max(Arrival(c), time the server becomes free)
 *   Wait(c)   = Begin(c) - Arrival(c)       time in the queue
 *   End(c)    = Begin(c) + S(c)
 *   System(c) = End(c) - Arrival(c)         waiting time plus service time
 *   Idle(c)   = Begin(c) - end of the previous service (server idle before c)
 * Under FIFO the next customer is always the next one in arrival order, which
 * gives the textbook formula Begin(i) = max(Arrival(i), End(i-1)).
 */
export function simulateSingleServer({
  interarrival, service, arrivalDigits = null, serviceDigits = null,
  withEvents = true, discipline = 'FIFO', disciplineSeed = 0
}) {
  const n = service.length;
  const rng = createRng(disciplineSeed);
  const totals = { n, iat: 0, service: 0, wait: 0, system: 0, idle: 0, waited: 0, run: 0, maxWait: 0 };

  // Arrival times, in customer order.
  const arrival = new Array(n);
  for (let i = 0; i < n; i++) {
    arrival[i] = i === 0 ? 0 : arrival[i - 1] + interarrival[i];
    if (i > 0) totals.iat += interarrival[i];
  }

  const rows = new Array(n);
  const order = [];          // customer numbers in the order of service
  const waiting = [];        // indices of waiting customers, in arrival order
  let next = 0;              // next customer to arrive
  let free = 0;              // time at which the server becomes free
  while (order.length < n) {
    if (waiting.length === 0 && arrival[next] > free) free = arrival[next];   // the server is idle until the next arrival
    while (next < n && arrival[next] <= free) waiting.push(next++);
    const queueLength = waiting.length;
    const c = waiting.splice(pickNext(waiting, discipline, service, rng), 1)[0];
    const prevEnd = order.length ? rows[order[order.length - 1] - 1].end : 0;
    const begin = Math.max(arrival[c], free);
    const wait = begin - arrival[c];
    const end = begin + service[c];
    rows[c] = {
      customer: c + 1,
      arrivalDigits: arrivalDigits ? arrivalDigits[c] : null,
      iat: c === 0 ? null : interarrival[c],
      arrival: arrival[c],
      serviceDigits: serviceDigits ? serviceDigits[c] : null,
      service: service[c],
      begin,
      wait,
      end,
      system: end - arrival[c],
      idle: begin - prevEnd,
      waited: wait > 0 ? 1 : 0,
      serviceOrder: order.length + 1,
      queueLength                       // customers waiting when this one was chosen (itself included)
    };
    order.push(c + 1);
    free = end;
  }

  for (const r of rows) {
    totals.service += r.service;
    totals.wait += r.wait;
    totals.system += r.system;
    totals.idle += r.idle;
    totals.waited += r.waited;
    totals.maxWait = Math.max(totals.maxWait, r.wait);
  }
  // Total run time = time service of the last customer ends.
  totals.run = free;

  return { rows, totals, order, discipline, events: withEvents ? buildSingleServerEvents(rows) : [] };
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
