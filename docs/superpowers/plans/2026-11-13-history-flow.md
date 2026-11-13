# History Data Flow Simplification

User requested review, fixes and a shorter flow. Implement inline; preserve all existing local changes.

Findings: date filter does not load its requested range; progressive load and active date conflict; endpoint caps before account filtering; group.latestRow favors QC over latest update; order lookup ignores stored orderNumber; status filter misses 0% incomplete; empty state can claim nonexistent server data despite partial loading.

Approach: one date-driven load via existing /api/history/recordings (uncapped, authorized) with optional updatedSince query. Use Jakarta boundaries matching local date predicates. Remove independent progressive window controls. Keep client account/task/search/status/sort and ensure grouping represents latest activity. Reject superseded responses with request generation and session cleanup.

- [x] Add regression tests for ordering/grouping, order search, incomplete filter, honest empty text and date boundaries.
- [x] Implement shared history helpers, correct scope/group selection and final counts/empty state.
- [x] Add optional updatedSince to history API client/backend, preserve authorization and other callers.
- [x] Unify mobile loading and date selection, reset to today, remove redundant load UI and use final result count.
- [x] Run unit, mobile build, lint comparison, browser date/query/reset/race checks and code review.

Validation must cover another account, old QC/new packing, mixed-case resi, 0/50/100%, Jakarta midnight, direct order number, empty/date results, and latest-response-wins.


Final: date is the only server-load range; client uses the same Jakarta boundary. API authorizes rows before expanding active resis to preserve counterpart stages across dates. Client applies task/search/account/date, groups case-insensitive resis by latest activity, then document status and final count. Progress selects latest task record. Nonmatching filters produce contextual empty text. All date loads/refreshes share a request generation; reset returns to today. Old load-more UI removed and date-only filters no longer consume an extra summary row.

Verification: 11/11 history unit tests PASS; real temporary DB API test PASS (>300 rows, old counterparts, authorization-before-window, admin, all, invalid timestamp, 401); browser mocked API date/query/reset/incomplete/progress/current-account/audit/stale response/detail checks PASS at 320/390. Mobile build PASS; changed standalone history/helper lint PASS; App lint unchanged baseline hook error+warning. Backend build has 12 errors, compiler-host comparison against HEAD shows same 12 and zero new diagnostics. Reviewer found no concrete regressions. graphify update attempted; CLI unavailable.
