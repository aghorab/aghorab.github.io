// Two-server (Able and Baker) simulation engine (SPEC Section 5.2). Pure functions, no DOM access.

import { createRng } from './rng.js?v=3';
import { lookup } from './distributions.js?v=3';

export const SERVERS = ['Able', 'Baker'];

/**
 * Server-selection rule.
 *   preferred = 'Able' (textbook rule) or 'Baker' (Quiz 1 rule).
 * If both servers are idle when the call arrives, the preferred server takes it.
 * Otherwise the call goes to the server that becomes free first; on a tie the
 * preferred server takes it. If both are busy, the call waits in one FIFO queue.
 */
export function chooseServer(arrival, freeAble, freeBaker, preferred = 'Able') {
  if (freeAble <= arrival && freeBaker <= arrival) return preferred;   // both idle
  if (freeAble === freeBaker) return preferred;                         // tie
  return freeAble < freeBaker ? 'Able' : 'Baker';
}

/**
 * Runs the two-server simulation table.
 * input:
 *   interarrival or arrivalDigits (with dists.arrival): time between calls, null for call 1
 *   serviceDigits (with dists.able and dists.baker) or service: service times.
 *     Service digits are converted with the distribution of the server that was
 *     chosen, so they are used after the server is chosen, as in the textbook table.
 *     A plain `service` array (times) is applied to whichever server is chosen.
 *   preferred: 'Able' (default) or 'Baker'
 *   withEvents: false skips the animation event list (replication mode)
 */
export function simulateMultiServer({
  interarrival = null,
  arrivalDigits = null,
  serviceDigits = null,
  service = null,
  dists = null,
  preferred = 'Able',
  withEvents = true
}) {
  const n = serviceDigits ? serviceDigits.length : service.length;
  const rows = [];
  const free = { Able: 0, Baker: 0 };
  const totals = {
    n, iat: 0, delay: 0, system: 0, waited: 0, run: 0, maxDelay: 0,
    serviceAble: 0, serviceBaker: 0, callsAble: 0, callsBaker: 0
  };
  let prevArrival = 0;

  for (let i = 0; i < n; i++) {
    let a = null;
    if (i > 0) a = interarrival ? interarrival[i] : lookup(arrivalDigits[i], dists.arrival);
    const arrival = i === 0 ? 0 : prevArrival + a;
    const ableAvail = free.Able;
    const bakerAvail = free.Baker;

    const server = chooseServer(arrival, free.Able, free.Baker, preferred);
    // The service digits are read after the server is chosen.
    const s = serviceDigits
      ? lookup(serviceDigits[i], server === 'Able' ? dists.able : dists.baker)
      : service[i];
    const begin = Math.max(arrival, free[server]);
    const end = begin + s;
    free[server] = end;
    const delay = begin - arrival;

    rows.push({
      caller: i + 1,
      arrivalDigits: arrivalDigits ? arrivalDigits[i] : null,
      iat: a,
      arrival,
      ableAvail,
      bakerAvail,
      server,
      serviceDigits: serviceDigits ? serviceDigits[i] : null,
      service: s,
      begin,
      end,
      delay,
      system: end - arrival,
      waited: delay > 0 ? 1 : 0
    });

    if (a !== null) totals.iat += a;
    totals.delay += delay;
    totals.system += end - arrival;
    totals.waited += delay > 0 ? 1 : 0;
    totals.maxDelay = Math.max(totals.maxDelay, delay);
    totals[`service${server}`] += s;
    totals[`calls${server}`] += 1;
    totals.run = Math.max(totals.run, end);   // run length: when the last service ends
    prevArrival = arrival;
  }

  return { rows, totals, events: withEvents ? buildMultiServerEvents(rows) : [], preferred };
}

/** Draws digits from a seed: for each call, the arrival digit (from call 2), then the service digit. */
export function drawMultiServerDigits(seed, n, dists) {
  const rng = createRng(seed);
  const arrivalDigits = [];
  const serviceDigits = [];
  for (let i = 0; i < n; i++) {
    arrivalDigits.push(i === 0 ? null : rng.randomDigits(dists.arrival.digits));
    serviceDigits.push(rng.randomDigits(dists.able.digits));
  }
  return { arrivalDigits, serviceDigits };
}

/** Draws digits from a seed and runs the two-server table for n calls. */
export function simulateMultiServerSeeded({ seed, n, dists, preferred = 'Able', withEvents = true }) {
  const digits = drawMultiServerDigits(seed, n, dists);
  const result = simulateMultiServer({ ...digits, dists, preferred, withEvents });
  result.seed = seed;
  return result;
}

/** Busy intervals of each server, for the timeline chart and the invariant tests. */
export function busyIntervals(rows) {
  const out = { Able: [], Baker: [] };
  for (const r of rows) out[r.server].push({ start: r.begin, end: r.end, caller: r.caller });
  return out;
}

/** Ordered event list for the animation (departure, then arrival, then start at equal times). */
export function buildMultiServerEvents(rows) {
  const order = { departure: 0, arrival: 1, start: 2 };
  const events = [];
  for (const r of rows) {
    events.push({ type: 'arrival', time: r.arrival, customer: r.caller });
    events.push({ type: 'start', time: r.begin, customer: r.caller, server: r.server });
    events.push({ type: 'departure', time: r.end, customer: r.caller, server: r.server });
  }
  events.sort((x, y) => x.time - y.time || order[x.type] - order[y.type] || x.customer - y.customer);
  return events;
}
