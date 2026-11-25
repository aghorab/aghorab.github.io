# QueueSimulation: Specification for the Interactive Queueing Simulation Website

Nov 25, 2026 · @Ahmed Ghorab

## 1. Purpose, scope and constraints

Build a static, interactive teaching website that shows students how a single-server queue (Grocery Checkout) and a two-server queue (Able and Baker call center) are simulated by hand, using the simulation-table method of Chapter 3 (Queueing Simulation) of the Modeling and Simulation course. The site is published at `https://aghorab.github.io/QueueSimulation/`.

**Audience.** Undergraduate students of the Modeling and Simulation course. The instructor also uses the site live in lectures (projector) and links it from Google Classroom.

**Learning outcomes.** After using the site, a student can:

1. Convert random digits into interarrival and service times using a cumulative probability table and random-digit assignment.
2. Build a simulation table row by row and explain each column.
3. Compute and interpret the performance measures (average waiting time, probability of waiting, server utilization, average time in system).
4. Explain why a single short run is not enough, and why replications are needed.
5. Explain how a server-selection rule changes utilization and waiting in a multi-server system.

**Hard constraints (must not be violated):**

- **No back end.** Everything runs in the browser. No server, database, login, analytics, cookies or external API calls.
- **Static files only**, deployable by GitHub Pages without any build step. No Node build, no bundler, no framework that needs compiling.
- **All new files live in the folder `QueueSimulation/`** at the root of the public repository `aghorab/aghorab.github.io`.
- **Do not modify, move or delete any existing file outside `QueueSimulation/`.** In particular, `app-ads.txt` at the repository root must remain unchanged, because it is used by AdMob.
- **Do not add** a `_config.yml`, `CNAME`, `.nojekyll` or GitHub Actions workflow at the root unless the instructor approves it.
- **No answer keys** for graded work in the repository (the repository is public).
- Interface language: **English**. Formal, clear academic wording, without contractions.

## 2. Repository, structure and technology

The site is plain HTML, CSS and JavaScript (ES modules), with Chart.js as the only third-party library, served by GitHub Pages from the existing `main` branch.

**Repository:** `https://github.com/aghorab/aghorab.github.io` (public). **Live URL:** `https://aghorab.github.io/QueueSimulation/` (the folder name is case-sensitive).

**Folder structure** (all paths relative to the repository root):

```
QueueSimulation/
  index.html              Landing page: course context, links to both simulations
  single-server.html      Grocery Checkout (single server)
  multi-server.html       Able and Baker call center (two servers)
  about.html              Method, notation, glossary, source references
  README.md               How to run, test and edit the site
  css/
    style.css             Shared styles (light and dark theme, print styles)
  js/
    config.js             Instructor switches (see Section 4.4)
    rng.js                Seeded random-number generator and random-digit helpers
    distributions.js      Discrete distributions, cumulative tables, digit lookup
    single-server.js      Single-server simulation engine (pure functions, no DOM)
    multi-server.js       Two-server simulation engine (pure functions, no DOM)
    measures.js           Performance-measure calculations shared by both engines
    ui-common.js          Shared UI helpers: tables, number formatting, CSV export
    ui-single.js          DOM and animation code for single-server.html
    ui-multi.js           DOM and animation code for multi-server.html
  data/
    grocery-textbook.js   Textbook input data for the Grocery Checkout example
    callcenter-textbook.js Textbook input data for the call center example
  tests/
    tests.html            Browser test runner (open locally or on the live site)
    engine.test.js        Verification tests (Section 5.4)
    fixtures/
      grocery-workbook-fixture.json   Snapshot of the instructor's Excel workbook (Section 3.2.1)
```

**Technology rules:**

- HTML5, CSS3 and vanilla JavaScript (ES2020, `type="module"`). No React, Vue, TypeScript or build tools.
- **Chart.js 4** loaded from jsDelivr with a pinned version number (for example `chart.js@4.4.x`) and a Subresource Integrity hash. If loading fails, the page must still work, with a short message in place of each chart.
- Animation with inline SVG and CSS transitions. Do not use canvas for the queue animation, so that it stays sharp on a projector.
- Simulation engines are **pure functions** with no DOM access, so that the same code runs in the page and in the tests.
- Relative links only (for example `./js/rng.js`), so the site works both at the live URL and when opened from a local web server.
- No `localStorage` is required. If used for small conveniences (remembering the last speed setting), wrap every access in `try/catch`.

## 3. Simulation models and data

Both models follow Chapter 3 of the course slides, which follow Banks, Carson, Nelson and Nicol, *Discrete-Event System Simulation* (Examples 2.1 and 2.2). All values below must be stored in `data/` files and in `distributions.js`, never hard-coded inside UI code.

### 3.1 Common modeling assumptions

- Infinite calling population, unlimited queue capacity, FIFO queue discipline, no balking, reneging or jockeying.
- The system starts empty and idle. Customer 1 arrives at time 0 (its time between arrivals is shown as a dash).
- All times are integers, in minutes.
- Random digits are mapped to values with the cumulative probability table. A digit string of all zeros (`000` or `00`) represents the top of the last interval (1000 or 100).

### 3.2 Example 1: Grocery Checkout (single server)

**Time between arrivals:** discrete uniform on 1 to 8 minutes, three-digit random numbers.

| Time between arrivals (min) | Probability | Cumulative probability | Random-digit assignment |
| --- | --- | --- | --- |
| 1 | 0.125 | 0.125 | 001 to 125 |
| 2 | 0.125 | 0.250 | 126 to 250 |
| 3 | 0.125 | 0.375 | 251 to 375 |
| 4 | 0.125 | 0.500 | 376 to 500 |
| 5 | 0.125 | 0.625 | 501 to 625 |
| 6 | 0.125 | 0.750 | 626 to 750 |
| 7 | 0.125 | 0.875 | 751 to 875 |
| 8 | 0.125 | 1.000 | 876 to 000 |

**Service time:** two-digit random numbers.

| Service time (min) | Probability | Cumulative probability | Random-digit assignment |
| --- | --- | --- | --- |
| 1 | 0.10 | 0.10 | 01 to 10 |
| 2 | 0.20 | 0.30 | 11 to 30 |
| 3 | 0.30 | 0.60 | 31 to 60 |
| 4 | 0.25 | 0.85 | 61 to 85 |
| 5 | 0.10 | 0.95 | 86 to 95 |
| 6 | 0.05 | 1.00 | 96 to 00 |

Expected values: E(A) = 4.5 minutes, E(S) = 3.2 minutes.

**Textbook data for the 20-customer run** (verified in the instructor's Excel workbook `Grocery_Checkout_Single_Server_Queue.xlsm`):

| Customer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arrival random digits | - | 913 | 727 | 015 | 948 | 309 | 922 | 753 | 235 | 302 | 109 | 093 | 607 | 738 | 359 | 888 | 106 | 212 | 493 | 535 |
| Time between arrivals | - | 8 | 6 | 1 | 8 | 3 | 8 | 7 | 2 | 3 | 1 | 1 | 5 | 6 | 3 | 8 | 1 | 2 | 4 | 5 |
| Service time | 4 | 1 | 4 | 3 | 2 | 4 | 5 | 4 | 5 | 3 | 3 | 5 | 4 | 1 | 5 | 4 | 3 | 3 | 2 | 3 |

The service random digits are not yet confirmed from slide 8/14. In `grocery-textbook.js`, store them as `null` with a `TODO` comment. In textbook mode, the page uses the service times above directly and shows the digit cells as "see slide".

### 3.2.1 Reference implementation: the instructor's Excel workbook

The workbook `Grocery_Checkout_Single_Server_Queue.xlsm` is the reference for the Grocery Checkout part: the web page must reproduce its logic, its measures, its summary statistics and its charts. Its sheets map to the website as follows.

| Workbook sheet | Content | Website equivalent |
| --- | --- | --- |
| Distributions | Both probability tables, cumulative probabilities, random-digit bounds, E(A) = 4.5, E(S) = 3.2 | Distribution panel |
| Generated Times | 19 arrival digits converted to times and checked against the slides; service-digit column left blank until confirmed | Textbook replay, digit columns |
| Simulation Table | 20-customer table, totals, checks against the published totals | Textbook replay |
| Findings | 11 measures for the 20-customer run | Results panel, textbook replay |
| 100 customer | One day of 100 customers from random digits, 12 measures, 3 charts, "Run experiment" button | Mode "One day (100 customers)" |
| 50 Experiments | Measures per day for 50 days, summary statistics, key findings, frequency table, 2 charts | Mode "Fifty days" |
| 50 Runs Data | 5,000 calculation rows (50 blocks of 100 customers) | Engine internals and full CSV export |

**Random-digit conventions** (the web engine must follow them exactly):

- Arrival digits are integers from 1 to 1000 (Excel `RANDBETWEEN(1,1000)`); 1000 is displayed as `000`. Customer 1 has no arrival digit.
- Service digits are integers from 1 to 100 (`RANDBETWEEN(1,100)`); 100 is displayed as `00`. Customer 1 does receive a service digit.
- Lookup = Excel `MATCH(digit, lower bounds, 1)`: the last row whose lower random-digit bound is less than or equal to the digit.
- With the seeded generator, draw digits in this order: for each customer, first the arrival digit (from customer 2), then the service digit.

**Measures per day** (columns of the "50 Experiments" sheet): average waiting time; probability a customer waits; probability of idle server (total idle time / total run time); probability server busy; average service time; average time between arrivals (sum / (customers minus 1)); average wait of those who wait (0 when nobody waited); average time in system; total run time.

**Summary rows** under the daily table: average, sample standard deviation (Excel `STDEV.S`), minimum and maximum of each column.

**Key findings** over all days: overall average waiting time (the average of the daily averages); slide reference value 1.32 minutes (slide 14/14, findings 3/4); lowest and highest daily average wait; number of days with an average wait above 2 minutes; overall probability a customer waits (average of daily values); overall server utilization (average of daily busy probabilities); average time in system (average of daily values); E(S); E(A).

**Workbook snapshot for testing.** The file `grocery-workbook-fixture.json` (supplied with this specification) holds the random digits and the resulting values of the workbook as saved on 25 November 2026: one 100-customer day (total wait 255, total service 325, total idle 92, customers who waited 58, run time 417, maximum wait 14, average wait 2.55) and all 50 days (overall average wait 1.279, standard deviation 0.443, minimum 0.58, maximum 2.54). These values were reproduced independently from the digits. The file goes in `QueueSimulation/tests/fixtures/`.

### 3.3 Example 2: Able and Baker call center (two servers)

Two technical support staff answer calls. Able is more experienced and faster; Baker is newer and slower. **Default rule: if both are idle, Able takes the call.** Otherwise the call goes to whichever server is free first; if both are busy, the call waits in a single FIFO queue.

**Time between calls:** two-digit random numbers.

| Time between calls (min) | Probability | Cumulative probability | Random-digit assignment |
| --- | --- | --- | --- |
| 1 | 0.25 | 0.25 | 01 to 25 |
| 2 | 0.40 | 0.65 | 26 to 65 |
| 3 | 0.20 | 0.85 | 66 to 85 |
| 4 | 0.15 | 1.00 | 86 to 00 |

**Service times:** two-digit random numbers.

| Server | Service time (min) | Probability | Cumulative probability | Random-digit assignment |
| --- | --- | --- | --- | --- |
| Able | 2 | 0.30 | 0.30 | 01 to 30 |
| Able | 3 | 0.28 | 0.58 | 31 to 58 |
| Able | 4 | 0.25 | 0.83 | 59 to 83 |
| Able | 5 | 0.17 | 1.00 | 84 to 00 |
| Baker | 3 | 0.35 | 0.35 | 01 to 35 |
| Baker | 4 | 0.25 | 0.60 | 36 to 60 |
| Baker | 5 | 0.20 | 0.80 | 61 to 80 |
| Baker | 6 | 0.20 | 1.00 | 81 to 00 |

Expected values: E(time between calls) = 2.25 minutes, E(Able service) = 3.29 minutes, E(Baker service) = 4.25 minutes.

**Published results of the textbook run** (slides 113 to 115): 26 calls over 62 minutes; Able busy 90% of the time; Baker busy 69%; 9 of 26 callers waited (about 35%); average wait of all callers about 0.42 minutes; average wait of those who waited 1.22 minutes.

**Instructor action required:** the per-call random digits of the 26-call textbook run are on slides 84 to 112, which are images. Store them in `callcenter-textbook.js` as empty arrays with a `TODO` comment and a flag `confirmed: false`. While the flag is false, the page hides the "Textbook replay" option for the call center and shows only random mode. Do not invent these numbers. The distributions above are taken from the textbook and should also be checked against slides 79 to 82 before release.

## 4. Pages and functional requirements

Each simulation page has the same four-part layout: a control bar, an animated view of the system, the simulation table, and a results panel. Students move from guided textbook replay to free experiments.

### 4.1 Landing page (`index.html`)

- Title "Queueing Simulation", course name "Modeling and Simulation, Chapter 3", and a two-sentence explanation of what a queueing system is.
- A simple labeled diagram: calling population, arrivals, queue, server(s), departures.
- Two cards linking to the single-server and multi-server pages, and one link to `about.html`.

### 4.2 Single-server page (`single-server.html`)

**Modes** (tabs at the top):

1. **Textbook replay (20 customers)**, mirroring the workbook sheets "Generated Times", "Simulation Table" and "Findings". Uses the data in Section 3.2. Buttons: "Next event", "Next customer", "Run to end", "Reset", and a speed slider. Each click fills one row of the simulation table and highlights the cells that changed, with a short plain-language explanation under the table, for example: "Customer 4 arrives at minute 15, but the server is busy until minute 18, so the customer waits 3 minutes." Below the table, show the verification against the published totals (82, 68, 56, 124, 18, 13 waited, run time 86) with OK marks, as in the workbook.
2. **One day (100 customers)**, mirroring the sheet "100 customer". A "Run new day" button plays the role of the workbook's "Run experiment" button (F9): it draws a new seed and regenerates all digits. The seed is shown and can be typed in, so a class can share one run. The number of customers defaults to 100 (custom value up to 1000). Outputs:
   - The full simulation table with the workbook's 12 columns (Section 4.2 table plus "Customer waited? (1 = yes)"), a totals row and the total run time.
   - The 12 measures: the 11 measures of Section 5.3 plus the maximum waiting time.
   - Chart "Frequency of waiting time in queue": bars for the bins 0 (no wait), (0, 2\], (2, 4\], (4, 6\], (6, 8\], (8, 10\], (10, 12\], (12, 14\], > 14 minutes, with the counts table beside it.
   - Chart "Waiting time in queue by customer": one bar per customer.
   - Chart "Service time: simulated vs theoretical": grouped bars of the simulated relative frequency and the theoretical probability for service times 1 to 6.
3. **Fifty days (50 days of 100 customers)**, mirroring the sheets "50 Experiments" and "50 Runs Data". Inputs: number of days (default 50, maximum 500) and customers per day (default 100). Outputs:
   - A table with one row per day and the nine daily measures of Section 3.2.1.
   - Summary rows: average, standard deviation, minimum and maximum of each column.
   - The key-findings panel of Section 3.2.1, including the comparison with the slide value of 1.32 minutes.
   - Frequency table and bar chart of the daily average waiting times, bins (0, 0.5\], (0.5, 1\], (1, 1.5\], (1.5, 2\], (2, 2.5\], (2.5, 3\], (3, 3.5\], (3.5, 4\], (4, 4.5\], (4.5, 5\], > 5 minutes.
   - Line chart "Average waiting time by day" with a horizontal line at the overall average.
   - "Download all customer rows as CSV" (the equivalent of "50 Runs Data", one row per customer with its day number).

**Distribution panel** (collapsible): the two probability tables of Section 3.2 with cumulative probabilities and random-digit assignments, plus a bar chart of each probability distribution. In random and replication modes, the probabilities can be edited (the page checks that they sum to 1 and shows an error otherwise), so students can explore "what if" scenarios.

**Animation:** customers are small numbered circles that enter from the left, wait in a horizontal line, move into the server box, and leave to the right. A simulation clock shows the current minute. The server box shows "Busy" or "Idle". Animation must not change any computed value; it only replays the event list produced by the engine.

**Simulation table columns** (exact headings, in this order):

| # | Column |
| --- | --- |
| 1 | Customer |
| 2 | Random digits (arrival) |
| 3 | Time since last arrival (min) |
| 4 | Arrival time |
| 5 | Random digits (service) |
| 6 | Service time (min) |
| 7 | Time service begins |
| 8 | Waiting time in queue (min) |
| 9 | Time service ends |
| 10 | Time customer spends in system (min) |
| 11 | Idle time of server (min) |

A totals row is shown under the table. Each column heading has a small information icon that shows its formula on hover or tap.

**Results panel:** the eleven measures of Section 5.3 (twelve in the one-day mode, adding the maximum waiting time), each with its formula, the value to two decimal places, and the theoretical value (E(A), E(S)) beside the simulated one. Each mode ends with one interpretation sentence generated from the numbers, for example: "Over 50 days the average wait was 1.28 minutes (slides: 1.32); daily values ranged from 0.58 to 2.54 minutes, so one day is not enough to judge the system."

**Export:** "Download table as CSV" button.

### 4.3 Multi-server page (`multi-server.html`)

The call center page uses the same three-mode structure as the Grocery Checkout, so that students compare one server with two servers using the same tools.

**Modes:**

1. **Textbook replay (26 calls, 62 minutes)**, available only when `confirmed: true` (Section 3.3). Step-by-step buttons as in the grocery replay; the explanation line names the server rule, for example: "Both servers are idle at minute 5, so Able takes call 3." Below the table, show the checks against the published results (run length 62, Able 90%, Baker 69%, 9 of 26 waited, average delay 0.42, 1.22 for those who waited).
2. **One run (100 calls)**, mirroring slide 116. "Run new run" button, visible and editable seed, number of calls (default 100, up to 1000). Outputs:
   - The full simulation table (columns below) with a totals row.
   - The measures listed under "Results panel" below.
   - Chart "Frequency of caller delay": bins 0 (no delay), (0, 1\], (1, 2\], (2, 3\], (3, 4\], (4, 5\], > 5 minutes, with the counts and percentages (slide 116 reports 62% with no delay).
   - Chart "Delay by caller": one bar per caller.
   - Chart "Service time: simulated vs theoretical", one panel for Able (2 to 5 minutes) and one for Baker (3 to 6 minutes).
   - Chart "Server timeline": a Gantt-style strip per server showing busy and idle periods.
3. **Many runs (400 runs of 100 calls)**, mirroring slides 117 to 119. Inputs: number of runs (default 400, maximum 1000) and calls per run (default 100). Outputs:
   - A table with one row per run: average delay, probability a caller waits, Able utilization, Baker utilization, average delay of those who waited, average time in system, run length.
   - Summary rows: average, standard deviation, minimum and maximum of each column.
   - Frequency table and bar chart of the average delay per run, bins (0, 0.5\], (0.5, 1\], (1, 1.5\], (1.5, 2\], (2, 2.5\], (2.5, 3\], > 3 minutes, with the percentage of runs at or below 1 minute and above 1 minute, to compare with slide 119 (80.5% and 19.5%).
   - Line chart "Average delay by run" with a horizontal line at the overall average.
   - "Download all caller rows as CSV".

The instructor should confirm whether the 80.5% on slide 119 refers to runs or to individual callers; the page shows both percentages until this is settled.

**Animation:** one shared queue feeding two server boxes labeled "Able" and "Baker", side by side, each with its own Busy or Idle status and a running utilization bar.

**Simulation table columns:** Caller number, Random digits for arrival, Time between arrivals, Clock time of arrival, Time Able available, Time Baker available, Server chosen, Random digits for service, Service time, Time service begins, Time service ends, Caller delay, Time in system.

**Results panel**, each measure with its formula and the value to two decimal places:

| # | Measure | Formula |
| --- | --- | --- |
| 1 | Run length | time service of the last call ends |
| 2 | Able utilization | total Able service time / run length |
| 3 | Baker utilization | total Baker service time / run length |
| 4 | Calls handled by Able and by Baker | counts and percentages |
| 5 | Probability a caller waits | number of callers with delay > 0 / number of calls |
| 6 | Average delay of all callers | total delay / number of calls |
| 7 | Average delay of those who waited | total delay / number who waited (0 if none waited) |
| 8 | Average time in system | total time in system / number of calls |
| 9 | Average service time of Able and of Baker | beside E = 3.29 and E = 4.25 minutes |
| 10 | Average time between calls | sum of times between calls / (number of calls minus 1), beside E = 2.25 minutes |

The panel ends with one interpretation sentence, for example: "Able was busy 90% of the time and Baker 69%; the seniority rule keeps Baker less busy. One server could not handle all calls; a third server would reduce waiting to almost zero."

### 4.4 Instructor switches (`js/config.js`)

```js
export const CONFIG = {
  enableBakerFirstRule: false,   // Quiz 1 answer: keep false until after the due date
  enableProbabilityEditing: true,
  showFormulas: true,
  defaultSeed: 12345
};
```

When `enableBakerFirstRule` is `true`, the multi-server page shows a rule selector with "Able first (textbook)" and "Baker first", and a side-by-side comparison of both rules with the same seed. When it is `false`, the Baker-first rule is not reachable from the interface, because it is the subject of Quiz 1 (slide 120). The engine must still implement both rules so that tests cover them.

### 4.5 About page (`about.html`)

Short explanations of the simulation-table method, the random-digit assignment, the notation used, and a glossary (interarrival time, service time, utilization, FIFO, replication, seed). It ends with the source references and a responsible-use note: students may use the site to check their hand calculations, but graded work must show their own calculations.

## 5. Simulation engine, measures and verification

The engines reproduce the hand simulation table exactly; correctness is proven by automated tests against the textbook totals before any UI work is accepted.

### 5.1 Random numbers

- Use a small seeded generator (for example Mulberry32) in `rng.js`. Never use `Math.random()` in the engines, so that every run is reproducible from its seed.
- `randomDigits(k)` returns an integer from 0 to 10^k minus 1, displayed with leading zeros (`015`, `05`).
- `lookup(digits, table)` maps a digit value to a time: treat 0 as 10^k, then return the first row whose upper bound is greater than or equal to the value.
- Cumulative bounds are computed from the probabilities with rounding (`Math.round(cum * 10^k)`) to avoid floating-point errors.

### 5.2 Algorithms

**Single server** (customer i = 1 to n, with End(0) = 0):

```
Arrival(1) = 0;            Arrival(i) = Arrival(i-1) + A(i)
Begin(i)   = max(Arrival(i), End(i-1))
Wait(i)    = Begin(i) - Arrival(i)
End(i)     = Begin(i) + S(i)
System(i)  = End(i) - Arrival(i)
Idle(i)    = Begin(i) - End(i-1)
```

**Two servers** (keep `freeAble` and `freeBaker`, both starting at 0; `preferred` is Able by default, or Baker under the quiz rule):

```
if freeAble <= Arrival(i) and freeBaker <= Arrival(i):
    server = preferred                        // both idle
else:
    server = the server with the smaller free time
    if freeAble == freeBaker: server = preferred   // tie
S(i)     = service time drawn from the chosen server's distribution
Begin(i) = max(Arrival(i), free[server])
End(i)   = Begin(i) + S(i);  free[server] = End(i)
Delay(i) = Begin(i) - Arrival(i)
```

The service random digits are drawn after the server is chosen, as in the textbook table. Each engine also returns an ordered event list (arrival, service start, departure, with times) used only by the animation.

### 5.3 Performance measures (single server)

| # | Measure | Formula |
| --- | --- | --- |
| 1 | Average waiting time | total waiting time / number of customers |
| 2 | Probability that a customer waits | number who waited / number of customers |
| 3 | Probability of idle server | total idle time / total run time |
| 4 | Probability that the server is busy | 1 minus measure 3 |
| 5 | Average service time | total service time / number of customers |
| 6 | Expected service time E(S) | sum of s times p(s) |
| 7 | Average time between arrivals | sum of times between arrivals / (number of customers minus 1) |
| 8 | Expected time between arrivals E(A) | sum of a times p(a) |
| 9 | Average waiting time of those who wait | total waiting time / number who waited (show "none waited" if zero) |
| 10 | Average time in system | total time in system / number of customers |
| 11 | Check: average time in system | measure 1 plus measure 5 |

Total run time = End(n). Every division must be guarded against a zero denominator.

### 5.4 Verification tests (`tests/engine.test.js`)

All tests must pass in `tests/tests.html` before the work is considered complete.

1. **Grocery textbook run, totals:** sum of times between arrivals 82; service 68; waiting 56; time in system 124; idle 18; customers who waited 13; run time 86.
2. **Grocery textbook run, row by row:**
   - Time service begins: 0, 8, 14, 18, 23, 26, 34, 41, 45, 50, 53, 56, 61, 65, 66, 71, 75, 78, 81, 83.
   - Waiting time: 0, 0, 0, 3, 0, 0, 0, 0, 2, 4, 6, 8, 8, 6, 4, 1, 4, 5, 4, 1.
   - Time service ends: 4, 9, 18, 21, 25, 30, 39, 45, 50, 53, 56, 61, 65, 66, 71, 75, 78, 81, 83, 86.
3. **Grocery measures** (rounded to two decimals): 2.80, 0.65, 0.21, 0.79, 3.40, 3.20, 4.32, 4.50, 4.31, 6.20, 6.20.
4. **Digit lookup boundaries:** arrivals 001 gives 1, 125 gives 1, 126 gives 2, 875 gives 7, 876 gives 8, 000 gives 8; grocery service 01 gives 1, 10 gives 1, 11 gives 2, 95 gives 5, 96 gives 6, 00 gives 6; each of the 19 textbook arrival digits maps to its textbook time.
5. **Call center:** each distribution sums to 1; Able digits 30 gives 2, 31 gives 3, 00 gives 5; Baker digits 35 gives 3, 36 gives 4, 00 gives 6.
6. **Server-selection rule:** a hand-built case where both servers are idle sends the call to Able under the default rule and to Baker under the quiz rule; a case where only Baker is idle sends the call to Baker under both rules.
7. **Call center textbook run** (enabled only when `confirmed: true`): run length 62; Able utilization rounds to 0.90; Baker to 0.69; 9 of 26 callers waited; average delay rounds to 0.42; average delay of those who waited rounds to 1.22.
8. **Invariants** on 1,000 random seeds for both engines: no negative waiting or idle time; Begin is never before Arrival; for one server, total service plus total idle equals run time; for two servers, no server has overlapping service intervals.
9. **Reproducibility:** the same seed gives identical tables; different seeds give different tables.
10. **Distribution sanity:** over 100,000 draws, the sample mean is within 0.03 of E(A) = 4.5, E(S) = 3.2, 2.25, 3.29 and 4.25 respectively.

**11. Excel workbook equivalence** (uses `tests/fixtures/grocery-workbook-fixture.json`). The engine accepts digits supplied from outside (instead of drawing them), so that it can replay the workbook exactly:

- **One day of 100 customers:** replaying `oneDay100` gives, row by row, the same service begin times and waiting times as the workbook, and the totals: times between arrivals 411, service 325, waiting 255, time in system 580, idle 92, customers who waited 58, run time 417, maximum wait 14. The 12 measures equal `oneDay100.measures`; the waiting-time histogram equals `waitingHistogram.counts`; the service relative frequencies equal `serviceRelativeFrequency`.
- **Fifty days:** replaying each of the 50 days gives the nine daily measures in `days[k].expected` (tolerance 1e-9). The summary equals `fiftyDays.summary`: overall average wait 1.279, standard deviation 0.4435, minimum 0.58, maximum 2.54, 2 days above 2 minutes, overall utilization 0.7100, average time in system 4.488, and histogram counts 0, 15, 21, 12, 1, 1, 0, 0, 0, 0, 0.

## 6. Quality requirements, acceptance and handover

The work is accepted when all tests in Section 5.4 pass, the site works at the live URL, and no file outside `QueueSimulation/` has changed.

### 6.1 Non-functional requirements

- **Devices:** works on current Chrome, Edge, Firefox and Safari, on desktop and on phones (minimum width 360 px). On narrow screens, the simulation table scrolls horizontally with the Customer column fixed.
- **Projector use:** a "Presentation mode" toggle enlarges fonts and the animation, and hides secondary panels.
- **Performance:** a replication run of 500 runs of 1000 customers completes in under 2 seconds on a normal laptop, without freezing the page.
- **Accessibility:** keyboard operable controls, visible focus, labels on all inputs, colour never the only signal (Busy and Idle are also written), contrast at WCAG 2.1 AA, and a `prefers-reduced-motion` setting that replaces animation with instant updates.
- **Printing:** printing a page outputs the simulation table and results cleanly, without controls or animation.
- **Code quality:** clear comments that explain each formula in the vocabulary of the slides; no console errors; no unused files.

### 6.2 Acceptance checklist

- [ ] All eleven test groups in `tests/tests.html` pass.
- [ ] Textbook replay of the Grocery Checkout matches the instructor's Excel workbook row by row (totals 82, 68, 56, 124, 18; run time 86).
- [ ] The eleven single-server measures match Section 5.3 and test 3.
- [ ] The Baker-first rule is hidden while `enableBakerFirstRule` is `false`.
- [ ] The call center textbook replay is hidden while `confirmed` is `false`.
- [ ] `https://aghorab.github.io/QueueSimulation/` loads all pages without errors, and `https://aghorab.github.io/app-ads.txt` is unchanged.
- [ ] `git diff` against `main` shows changes only inside `QueueSimulation/`.
- [ ] `README.md` explains how to run locally (`python -m http.server` from the repository root, then open `http://localhost:8000/QueueSimulation/`), how to run the tests, and how to change `config.js` and the textbook data files.

### 6.3 Open items for the instructor

- Confirm the service random digits of the Grocery example (slide 8/14).
- Enter and confirm the 26 call-center textbook rows (slides 84 to 112), then set `confirmed: true`.
- Confirm the call-center distributions against slides 79 to 82.
- Decide when to set `enableBakerFirstRule: true` (after the Quiz 1 due date).

### 6.4 Prompt to give Claude Code

Place this document in the repository as `QueueSimulation/SPEC.md`, then give Claude Code the following instruction:

Also place the file `grocery-workbook-fixture.json` (supplied with this specification) at `QueueSimulation/tests/fixtures/grocery-workbook-fixture.json` before starting.

```
Read QueueSimulation/SPEC.md in the repository aghorab/aghorab.github.io and build the
QueueSimulation website exactly as specified.

Work rules:
1. Create a branch named queue-simulation from main. Do not commit to main directly.
2. Create or change files only inside QueueSimulation/. Do not touch app-ads.txt or any other
   existing file at the repository root.
3. Build in this order: rng.js and distributions.js, then the two engines and measures.js,
   then tests/engine.test.js and tests/tests.html. Run the tests and make them all pass
   before writing any UI code.
4. Then build index.html, single-server.html, multi-server.html and about.html, with the
   shared CSS and UI modules.
5. Do not invent textbook data. Where the specification marks data as TODO, leave it as
   specified.
6. Serve the folder locally, open every page, and fix all console errors.
7. Commit with clear messages, push the branch, and open a pull request that lists what
   was built, the test results, and the open items from Section 6.3.
```
