// Discrete distributions, cumulative probability tables and random-digit lookup
// (SPEC Sections 3.2, 3.3 and 5.1). All model inputs are defined here, never in UI code.

/**
 * Builds a discrete distribution with its cumulative probability table and
 * random-digit assignment.
 *   values: the possible times (minutes)
 *   probs:  the probability of each time
 *   digits: number of random digits used (k), for example 3 for "001 to 125"
 * Cumulative bounds are computed with Math.round(cum * 10^k) so that
 * floating-point sums such as 0.1 + 0.2 do not shift a boundary.
 */
export function makeDistribution({ name, values, probs, digits }) {
  const scale = 10 ** digits;
  const rows = [];
  let cum = 0;
  let prevUpper = 0;
  values.forEach((value, i) => {
    cum += probs[i];
    const upper = Math.round(cum * scale);
    rows.push({
      value,
      p: probs[i],
      cum: Math.round(cum * 1e12) / 1e12,
      lower: prevUpper + 1,      // first random-digit value of the interval
      upper                      // last random-digit value (10^k shown as all zeros)
    });
    prevUpper = upper;
  });
  const sum = probs.reduce((s, p) => s + p, 0);
  return {
    name,
    digits,
    scale,
    rows,
    sum,
    expected: values.reduce((s, v, i) => s + v * probs[i], 0)
  };
}

/**
 * Maps a random-digit value to a time (Excel MATCH(digit, lower bounds, 1)).
 * A value of 0 means the top of the last interval (1000 for three digits,
 * 100 for two digits); the workbook writes this value directly as 1000 or 100.
 * The result is the first row whose upper bound is at least the value.
 */
export function lookup(digitValue, dist) {
  const v = digitValue === 0 ? dist.scale : digitValue;
  for (const row of dist.rows) {
    if (row.upper >= v) return row.value;
  }
  return dist.rows[dist.rows.length - 1].value;
}

/** Text of a random-digit assignment, for example "001 to 125" or "876 to 000". */
export function assignmentText(row, dist) {
  const pad = (n) => String(n % dist.scale).padStart(dist.digits, '0');
  return `${pad(row.lower)} to ${pad(row.upper)}`;
}

/**
 * Checks that a list of probabilities is valid: every value between 0 and 1
 * and a sum of exactly 1 (with a small tolerance for decimal input).
 */
export function validateProbabilities(probs) {
  if (probs.some((p) => !Number.isFinite(p) || p < 0 || p > 1)) {
    return { ok: false, sum: NaN, message: 'Each probability must be a number from 0 to 1.' };
  }
  const sum = probs.reduce((s, p) => s + p, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    return { ok: false, sum, message: `The probabilities sum to ${sum.toFixed(4)}; they must sum to 1.` };
  }
  return { ok: true, sum, message: '' };
}

// ---------------------------------------------------------------------------
// Example 1: Grocery Checkout (single server), SPEC Section 3.2
// ---------------------------------------------------------------------------

/** Time between arrivals: discrete uniform on 1 to 8 minutes, three-digit random numbers. */
export const GROCERY_ARRIVAL = {
  name: 'Time between arrivals',
  values: [1, 2, 3, 4, 5, 6, 7, 8],
  probs: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125],
  digits: 3
};

/** Service time, two-digit random numbers. */
export const GROCERY_SERVICE = {
  name: 'Service time',
  values: [1, 2, 3, 4, 5, 6],
  probs: [0.10, 0.20, 0.30, 0.25, 0.10, 0.05],
  digits: 2
};

// ---------------------------------------------------------------------------
// Example 2: Able and Baker call center (two servers), SPEC Section 3.3
// TODO (instructor): confirm these three tables against slides 79 to 82.
// ---------------------------------------------------------------------------

/** Time between calls, two-digit random numbers. */
export const CALL_ARRIVAL = {
  name: 'Time between calls',
  values: [1, 2, 3, 4],
  probs: [0.25, 0.40, 0.20, 0.15],
  digits: 2
};

/** Able's service time (more experienced, faster). */
export const ABLE_SERVICE = {
  name: 'Able service time',
  values: [2, 3, 4, 5],
  probs: [0.30, 0.28, 0.25, 0.17],
  digits: 2
};

/** Baker's service time (newer, slower). */
export const BAKER_SERVICE = {
  name: 'Baker service time',
  values: [3, 4, 5, 6],
  probs: [0.35, 0.25, 0.20, 0.20],
  digits: 2
};

/** Ready-made distribution objects for the default (textbook) inputs. */
export const DISTRIBUTIONS = {
  groceryArrival: makeDistribution(GROCERY_ARRIVAL),
  groceryService: makeDistribution(GROCERY_SERVICE),
  callArrival: makeDistribution(CALL_ARRIVAL),
  ableService: makeDistribution(ABLE_SERVICE),
  bakerService: makeDistribution(BAKER_SERVICE)
};
