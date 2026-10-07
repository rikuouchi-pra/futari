# Firestore process diagnostics (v291)

Settings → Firestoreの利用状況 → 処理別の読み取り.

- Counters are per browser/account and aggregate that account's tabs. They start after installing v290. No backend setup is required for process diagnostics.
- Today uses the same Pacific-midnight day boundary as Firestore. The UI/export can aggregate seven days; local records expire after forty days.
- `firestore-reads.js` performs no network requests. Records contain grouped process names and counters, never document IDs, user text, images or credentials. Each page session writes its own localStorage key, avoiding competing read/modify/write operations between tabs. Saves are throttled and flushed on hide/pagehide.
- `shim.js` instruments SDK single-document reads, collection reads, listeners, profile/photo reads and the recovery probe. Concurrent identical one-shot reads are shared; cache-only reads and normal reads use separate keys. Errors clear the in-flight slot.
- Snapshot metadata differentiates cache and pending local writes. The first confirmed server snapshot counts the result size (minimum one); subsequent snapshots count changed document fingerprints. Physical deletions are recorded separately and do not increase the estimate. Metadata-only notifications are not counted as additional reads. The application callback uses SDK changes independently of diagnostic fingerprints.
- These are **estimates of observed document delivery**, not billing records. SDK-internal reconnects, rules/index reads, other devices and independent backend operations are not fully observable. Initial/explicit rebind snapshots may overestimate reads when persistence resumes a listener. Do not subtract this device's estimate from the project total to infer other devices' usage.
- Legacy AI POST/JSONP gateway attempts appear as unknown-count requests, not invented successful reads. Direct AI bypasses Firestore. Cloud Monitoring polling is disabled, including startup, foregrounding, timers and manual refresh. Old cached project totals are ignored. No monitoring API, billing setup or additional Firestore traffic is required. Project-wide totals and remaining quota are not inferred from device-local estimates.
- The export includes daily/process/version aggregates and the separately labeled project usage report. Only the seven-day range is exported. Version comparisons include initial reads per listener attachment; different usage/periods do not establish causal savings.
- Suggestions are based on observed initial/update volume, repeated gets, failures and unobservable gateway attempts. They do not automatically disable shared synchronization or delete history.

Validation:
`node --test tests/firestore-reads.cjs tests/firestore.cjs tests/ai-transport.cjs tests/regression.cjs tests/gas/*.cjs`

Future optimization: collect representative use on each device, export diagnostics, inspect the largest contributors, then implement targeted limits/caching while preserving shared data visibility. Compare equivalent workloads after the next version.

## v291 API-free capacity dashboard
- Tracks successful document writes/deletes separately from attempts/errors at the SDK promise acknowledgement. All mutations (normal data, photos, legacy AI temp data and recovery replay) share the wrapper. Offline queued writes are not successful writes. Closing before acknowledgement can lose an observation.
- Dashboard: daily operation cards, current-month received document size proxy, known-document capacity, max document, browser storage estimate, photo usage if already loaded, metric-specific rankings, seven-day bars and optimization hints.
- Free Standard edition reference: 50k reads/day, 20k writes/day, 20k deletes/day, 1 GiB storage, 10 GiB outbound/month. These are comparison baselines, not inferred global remaining quota. Source checked 2026-10-07: https://firebase.google.com/docs/firestore/quotas and https://firebase.google.com/docs/firestore/storage-size
- Capacity is deduplicated in memory per current tab. It excludes unobserved documents and all indexes. Merged writes invalidate a known size until a snapshot returns, rather than reporting a partial patch as a full document. Only aggregate sizes are exported; document paths and contents are never persisted by diagnostics.
- Received document size is a proxy, not measured network traffic: protocol overhead, index traffic, SDK reconnection, cache promotion and other devices cannot be reconciled without server metrics. Forty-day local retention supports the current calendar month; pre-upgrade usage is unknown.
- Browser storage estimate is a local browser call, not a monitoring network API. Browser quota can change and is not localStorage-specific. Photo 700 MiB/5,000 are existing app targets, not enforced Firestore service quotas. No monitoring-initiated photo listing.
- Per-document 1 MiB, field 1 MiB-89 B, nesting 20 and request 10 MiB are shown with their observation limits. Index/rule limits and AI/GAS/Auth/hosting account quotas are explicitly unmeasured; no claims to measure all service quotas without APIs.


## v292: bounded history and duplicate-write fixes

- The activity listener now uses `orderBy("at", "desc")` and `limit(100)` on the server. The log offers explicit 100-row cursor pages. Equal timestamps are handled with native snapshot cursors. Other shared-data listeners are unchanged. Every existing activity writer supplies numeric `at`; legacy documents without `at` remain stored but are not included in this ordered history view.
- Historical pages are one-shot reads, not additional listeners. They are snapshots; only the latest 100 rows update live. Cache-only pages do not advance the cursor or declare the end of history. Local queued overlays obey the same ordering, cursor and limit.
- Existing 60-day activity cleanup is bounded to 40 expired documents, once per browser/account/local day after a successful check, with no full collection scan. This preserves gradual cleanup without deleting the history as an optimization migration.
- Shared AI-profile and work-calendar comparisons now ignore object-key order. AI-profile updates touch only the current role's profile and update timestamp. Identical account preferences are not rewritten; a failed write clears the deduplication key for retry. Edits are still saved immediately.
- Unchanged automatic notification registration is skipped for ten minutes after a successful acknowledgement. Changed schedules/settings, new queued notifications, explicit test/refresh and the regular ten-minute refresh still send. Failed requests retain their queued changes and are retried.
- Automatic weekly usage reports wait for the report collection's server snapshot and recheck the last report before writing. Previously the usage collection could arrive first and schedule a redundant report at every startup.
- Diagnostics classify new shared/private notification writes as `push` rather than `other`. Capacity observations from bounded queries no longer erase previously observed pages or treat a row leaving the limited window as a confirmed deletion. Capacity remains a partial, potentially stale estimate of observed documents, not project storage usage.

Validation: `node --test --test-force-exit tests/regression.cjs tests/history-query.cjs tests/firestore-reads.cjs tests/firestore.cjs tests/ai-transport.cjs tests/gas/*.cjs`. Query-adapter fixtures contain 3,508 synthetic rows: initial retrieval is 100, all subsequent pages are at most 100, and paging recovers every row once even with equal timestamps. This is a 97.1% initial activity-result reduction for that fixture, not a measured billing reduction or a project-wide saving. An isolated preview build parses all shipped inline scripts successfully. Browser/iPhone visual QA was not completed in this environment because the browser runtime was unavailable.
