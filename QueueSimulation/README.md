# Queueing Simulation

An interactive teaching website for Chapter 3 (Queueing Simulation) of the Modeling and Simulation course. It shows how a single-server queue (Grocery Checkout) and a two-server queue (Able and Baker call center) are simulated by hand with the simulation-table method.

Live site: <https://aghorab.github.io/QueueSimulation/> (the folder name is case-sensitive).

The full specification is in [`SPEC.md`](SPEC.md).

## Pages

| File | Content |
| --- | --- |
| `index.html` | Landing page and links |
| `single-server.html` | Grocery Checkout: textbook replay, one day, fifty days |
| `multi-server.html` | Able and Baker: one run, many runs (textbook replay once confirmed) |
| `about.html` | Method, notation, glossary, sources, responsible use |
| `tests/tests.html` | Automated verification tests |

The site is plain HTML, CSS and JavaScript modules. There is no build step and no back end. Chart.js 4.4.7 is loaded from jsDelivr with a Subresource Integrity hash; if it cannot load, the pages still work and show a short message in place of each chart.

## Run locally

JavaScript modules do not load from `file://` addresses, so use a local web server. From the **repository root** (the folder that contains `QueueSimulation/`):

```bash
python -m http.server
```

Then open <http://localhost:8000/QueueSimulation/>.

## Run the tests

With the local server running, open <http://localhost:8000/QueueSimulation/tests/tests.html>. The tests also run on the live site at <https://aghorab.github.io/QueueSimulation/tests/tests.html>. The page lists the eleven test groups of SPEC Section 5.4 and marks each as Pass, Fail or Skipped. Group 7 (call center textbook run) is skipped until the call-center textbook data are confirmed (see below).

The fixtures in `tests/fixtures/` are snapshots of the instructor's workbook of 25 November 2026:

- `grocery-workbook-fixture.json`: digits, totals and measures of one 100-customer day and of all 50 days.
- `grocery-workbook-100-rows.json`: the service begin times and waiting times of the 100-customer day, row by row (sheet "100 customer", columns G and H), used by the row-by-row check in test 11.

## Instructor switches (`js/config.js`)

```js
export const CONFIG = {
  enableBakerFirstRule: false,   // Quiz 1 answer: keep false until after the due date
  enableProbabilityEditing: true,
  showFormulas: true,
  defaultSeed: 12345
};
```

- `enableBakerFirstRule`: when `true`, the two-server page shows a rule selector ("Able first (textbook)" or "Baker first") and a side-by-side comparison of both rules with the same seed. When `false`, the Baker-first rule cannot be reached from the interface.
- `enableProbabilityEditing`: allows students to edit the probabilities in the random and replication modes.
- `showFormulas`: shows the formula icons in the table headings and the formula column in the results.
- `defaultSeed`: the seed used when a page opens.

Edit the file on GitHub, commit, and GitHub Pages publishes the change within a few minutes.

## Textbook data (`data/`)

- `data/grocery-textbook.js`: the 20-customer Grocery Checkout run. The service random digits (slide 8/14) are `null` until confirmed; the page then shows "see slide" in that column. To add them, replace `null` with an array of 20 two-digit values (use `100` or `0` for `00`).
- `data/callcenter-textbook.js`: the 26-call Able and Baker run. Enter the arrival digits (26 values, the first one `null`) and the service digits (26 values) from slides 84 to 112, then set `confirmed: true`. The "Textbook replay" tab then appears on the two-server page, and test 7 checks the published results (run length 62, Able 90%, Baker 69%, 9 of 26 waited, average delay 0.42, 1.22 for those who waited). If a check fails, the data or the distributions need correcting.

The probability distributions of both examples are in `js/distributions.js`.

## Files

```
css/style.css            Shared styles (light and dark theme, presentation mode, print)
js/config.js             Instructor switches
js/rng.js                Seeded random-number generator (Mulberry32) and random-digit helpers
js/distributions.js      Distributions, cumulative tables and digit lookup
js/single-server.js      Single-server engine (pure functions)
js/multi-server.js       Two-server engine (pure functions)
js/measures.js           Performance measures and summary statistics
js/ui-common.js          Shared interface helpers, charts and the SVG animation
js/ui-single.js          Interface of single-server.html
js/ui-multi.js           Interface of multi-server.html
data/                    Textbook input data
tests/                   Test runner, tests and workbook fixtures
```

## Open items for the instructor

- Confirm the service random digits of the Grocery example (slide 8/14).
- Enter and confirm the 26 call-center textbook rows (slides 84 to 112), then set `confirmed: true`.
- Confirm the call-center distributions against slides 79 to 82.
- Decide when to set `enableBakerFirstRule: true` (after the Quiz 1 due date).
- Confirm whether the 80.5% on slide 119 refers to runs or to individual callers (the page shows both).
