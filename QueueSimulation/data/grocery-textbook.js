// Textbook input data for the Grocery Checkout example (SPEC Section 3.2),
// verified in the instructor's workbook Grocery_Checkout_Single_Server_Queue.xlsm.

export const GROCERY_TEXTBOOK = {
  customers: 20,

  // Three-digit arrival random digits; customer 1 arrives at time 0 and has none.
  arrivalDigits: [null, 913, 727, 15, 948, 309, 922, 753, 235, 302, 109, 93, 607, 738, 359, 888, 106, 212, 493, 535],

  // Time between arrivals, as published (each value equals the lookup of the digits above).
  interarrivalTimes: [null, 8, 6, 1, 8, 3, 8, 7, 2, 3, 1, 1, 5, 6, 3, 8, 1, 2, 4, 5],

  // Service times, as published.
  serviceTimes: [4, 1, 4, 3, 2, 4, 5, 4, 5, 3, 3, 5, 4, 1, 5, 4, 3, 3, 2, 3],

  // The service random digits are generated automatically by the page: for each
  // customer, a random two-digit value inside the random-digit interval of the
  // published service time (see generateDigitsForTimes in distributions.js), so
  // that the table always agrees with the published service times and totals.

  // Average waiting time over 50 days quoted on slide 14/14 (findings 3/4).
  slideAvgWait50Days: 1.32
};
