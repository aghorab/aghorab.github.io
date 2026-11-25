// Textbook input data for the Able and Baker call center example (SPEC Section 3.3).

export const CALLCENTER_TEXTBOOK = {
  // TODO (instructor): enter the per-call random digits of the 26-call textbook
  // run from slides 84 to 112, check the resulting table against the slides,
  // and then set `confirmed` to true. While `confirmed` is false, the page hides
  // the "Textbook replay" mode and the corresponding test is skipped.
  // Do not invent these numbers.
  confirmed: false,
  calls: 26,
  arrivalDigits: [],   // two-digit values; the first entry is null (call 1 arrives at time 0)
  serviceDigits: [],   // two-digit values, read after the server is chosen

  // Published results of the textbook run (slides 113 to 115).
  published: {
    run: 62,
    ableUtil: 0.90,
    bakerUtil: 0.69,
    waited: 9,
    calls: 26,
    avgDelay: 0.42,
    avgDelayWaiters: 1.22
  },

  // Slide 116: share of callers with no delay in a 100-call run.
  slideNoDelayShare: 0.62,

  // Slide 119: 400 runs of 100 calls. TODO (instructor): confirm whether these
  // percentages refer to runs or to individual callers; the page shows both.
  slideAtMost1Minute: 0.805,
  slideAbove1Minute: 0.195
};
