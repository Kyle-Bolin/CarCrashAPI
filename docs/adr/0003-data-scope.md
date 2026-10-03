# ADR-003: Data source, license and scope

- **Status:** Proposed
- **Date:** 2026-10-03
- **Issue:** #14

## Context

The legacy schema (`create_crashes.sql`) matches Kaggle's **US Accidents** dataset by Sobhan Moosavi et al. (2016–2023, about 7.7M rows, about 3 GB of CSV). The API needs a decision on four things: the license terms, how much data to host, how data gets loaded, and what test data lives in the repo.

Constraints:

- **License.** Kaggle lists the dataset as CC BY-NC-SA 4.0. That requires attribution, non-commercial use, and share-alike for anything redistributed, such as test fixtures. **This was not confirmed from the source:** the Kaggle page was unreachable from the automated session that drafted this ADR, so the owner must check the dataset page before accepting.
- **Hosting budget.** ADR-002 (#13) proposes RDS PostgreSQL on `db.t4g.micro` with 1 GB of RAM and 20 GB of storage. The full table probably fits on disk, but its indexes will not fit in memory, so query latency and index size matter more than disk.
- **Portfolio project.** The demo should stay cheap, loading should be reproducible, and tests must run without a multi-GB download.
- **Non-commercial use.** The API is a portfolio demo with no revenue, which is compatible with an NC license. Any change to that needs a new look at this ADR.

## Options considered

### Hosted scope

- **Full dataset (about 7.7M rows).** Most realistic and the best demo of "real" data. On a 1 GB instance, indexes on time, state and location will exceed RAM, so queries that are not index-only will hit disk and slow down. Loading and index builds take a long time, and storage use leaves little headroom in 20 GB.
- **Recent-years subset (for example 2021–2023).** Keeps the data current and cuts the row count substantially. Years are an arbitrary cut, and the 2016–2020 history is lost.
- **State subset (for example 5–10 states).** Smaller tables with predictable indexes and a coherent story ("these states, all years"). Skews the data geographically, so the API must say clearly what it covers.
- **Both: a state subset, all years, as the default, with the loader able to take the full file.** Hosted demo stays small, and nothing in the code assumes the subset.

### Refresh

- **One-time manual load.** Simplest, but not reproducible, and it conflicts with the project's "no manual steps" rule.
- **Re-runnable loader script (proposed).** Issue #19 builds an idempotent loader that reads the CSV, filters by a configured scope, and upserts by crash ID. The dataset itself is a static, occasionally updated Kaggle release, so no scheduled refresh is needed.

### Fixtures

- **Generated synthetic rows.** No license concern, but unrealistic and a maintenance cost.
- **A committed sample of about 1,000 real rows (proposed).** Realistic for tests and local dev. The sample is a redistributed subset, so it must carry the dataset's attribution and CC BY-NC-SA 4.0 notice, kept apart from the code license.

## Decision

Proposed:

1. **License and attribution.** Treat the data as CC BY-NC-SA 4.0 (to be confirmed by the owner). Keep the data license separate from the code license. Add an attribution section to the README that names the authors and cites their two papers (below). Keep a notice next to the fixtures.
2. **Scope.** Host a **state subset, all years**. The loader takes the scope from configuration, so the full dataset can be loaded locally or on larger hardware. The exact state list is the owner's choice and should be set when the loader (#19) lands, once index sizes have been measured on a `t4g.micro`-sized instance.
3. **Refresh.** A re-runnable, idempotent loader script (#19), run by the deploy pipeline or by hand. No scheduled refresh.
4. **Fixtures.** Commit a sample of about 1,000 rows, drawn across several states and years so tests exercise filters, under `test/fixtures/` (path to be settled in #19 and #22), with its own license notice.

**Recommendation:** accept. The state subset is the cheapest way to keep queries fast on 1 GB of RAM while leaving the code scope-agnostic. Revisit if measured index sizes show the full set is viable, or if the project ever stops being non-commercial.

### Citation

Cite both papers, as the dataset authors request:

- Sobhan Moosavi, Mohammad Hossein Samavatian, Srinivasan Parthasarathy, and Rajiv Ramnath. "A Countrywide Traffic Accident Dataset." 2019.
- Sobhan Moosavi, Mohammad Hossein Samavatian, Srinivasan Parthasarathy, Radu Teodorescu, and Rajiv Ramnath. "Accident Risk Prediction based on Heterogeneous Sparse Data: New Dataset and Insights." In proceedings of the 27th ACM SIGSPATIAL International Conference on Advances in Geographic Information Systems, ACM, 2019.

The owner should check these against the Kaggle page when confirming the license.

## Consequences

- **Good:** queries stay fast on the smallest RDS instance. Loading is reproducible, and tests and local dev run offline on realistic data. The license obligations are met in one place.
- **Bad:** the hosted API covers only some states, so its docs must say so. A real-data fixture file carries the share-alike license into the repo. Non-commercial use limits what the project can become.
- **Follow-ups:**
  - Owner: confirm the license and citations on the Kaggle page, choose the state list, then change the status to Accepted.
  - #19: build the loader with configurable scope and idempotent upserts, and generate the fixture sample.
  - #18: schema and migrations should not hard-code the subset.
  - ADR-002 (#13): confirm the instance size once index sizes are measured.
