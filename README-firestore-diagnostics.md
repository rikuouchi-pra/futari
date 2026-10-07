# Google API usage monitoring (v293 — current)

Settings → Firestoreの利用状況 shows **二人全体の使用状況** first:

- Read/write/delete counts for the default Firestore database, accumulated from Pacific midnight (DST-aware), across both accounts, all devices and server operations represented by the metrics.
- The latest `firestore.googleapis.com/storage/data_and_index_storage_bytes` gauge, including data and indexes. Successive size samples are never added together. The query looks back 24 hours so a daily reset does not erase the latest known size.
- Four separate graphical cards with free-tier reference ratios, measurement timestamps and explicit unknown/stale states. These are Google measurements, not exact billing counts or guaranteed remaining quota. Network transfer and other unmeasured service limits remain unknown.
- Both accounts route authenticated form POSTs to the owner's Apps Script endpoint. No ID token is put in a URL. The backend re-verifies the family account before returning a shared five-minute script cache; monitoring never reads/writes Firestore documents.
- The visible, online client checks at most every five minutes (manual checks have a 30-second cooldown and still use the server cache). Setup errors stop automatic polling until manual retry. Billing, disabled API, OAuth scope and IAM failures have distinct messages and project-specific setup links.
- v1 servers remain readable for operation counts; storage is unknown with an explicit server-update notice. v2 reports add the storage metric. Cache versions are separate.
- Existing local diagnostics, rankings, capacity estimates and offline recovery remain available. They are labeled as this device's observations and never added to Google totals. Diagnostic JSON exports include the separately labeled Google report.
- Existing full-history display, filters, unread/update counts, notifications and the v292 duplicate-operation reductions remain unchanged.

Activation: update the existing Apps Script `Code` file without replacing its manifest or other files, then run `setupFirestoreMonitoring`. If it adds `monitoring.read`, run it again and approve Google's consent. The setup checks access before publishing at the existing URL. Enable Cloud Monitoring API / grant Monitoring Viewer if the response asks. If the project requires billing, the owner must link a billing account; this makes Firestore free-tier overages billable as well. This change does not enable billing or alter IAM on its own.

Validation: `node --test --test-force-exit tests/regression.cjs tests/firestore-reads.cjs tests/firestore.cjs tests/ai-transport.cjs tests/gas/*.cjs`. Tests cover gauge semantics, paging, unknown/zero distinctions, malformed/partial data, owner/partner shared cache, family authorization, setup errors, old-server compatibility, background throttling, stale values, HTML escaping and the original application behavior. Live Google authentication, billing activation and production API results require an authenticated owner session.

Official metric reference checked 2026-10-07: https://docs.cloud.google.com/monitoring/api/metrics_gcp_d_h#firestore

The sections below describe earlier releases; their local-only monitoring policy is superseded by v293.

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


## v292: preserve full history and reduce redundant operations

The earlier 100-row limit and manual history pagination have been withdrawn. The existing history view (300 rows after applying the person filter), all unread/update counts, the last-36-hour agenda, automatic synchronization, and 60-day cleanup retain their original inputs and behavior. No history migration, truncation, new manual loading step, or new retention policy is introduced.

- Identical active subscriptions share one SDK listener, including its full snapshot, updates, deletions and offline overlays. Releasing one consumer does not stop another. Failed subscriptions can be rebound; recovery rebinds each shared listener once. This reuses Firebase's existing persistent, multi-tab cache without treating a cached snapshot as an authoritative replacement for a server resynchronization.
- Shared AI-profile and work-calendar comparisons ignore object-key order. Profile writes update only the current role's profile and timestamp. Identical account preferences are not rewritten; failed writes remain retryable. Genuine edits are saved immediately.
- Unchanged automatic notification registration is skipped for ten minutes after a successful acknowledgement. Changed schedules/settings, new queued notifications, explicit test/refresh and the existing periodic refresh still send. Failed requests retain queued notifications.
- Weekly usage reports wait for the report collection's server snapshot and recheck before writing, preventing startup ordering from creating duplicate reports.
- Diagnostics identify new shared/private notification writes as `push` instead of `other`. Monitoring remains local-only.

Validation: `node --test --test-force-exit tests/regression.cjs tests/firestore-reads.cjs tests/firestore.cjs tests/ai-transport.cjs tests/gas/*.cjs`. A 3,508-row synthetic history reaches both consumers intact through one SDK listener; modifications, deletions, unsubscribe, error recovery, local overlays, full unread counts and the original person-filtered 300-row view are tested. All inline scripts parse successfully. Browser/iPhone visual QA is unavailable in this environment.

The previous 97.1% initial-history reduction no longer applies. A required full history synchronization still reads all matching documents; sharing only saves when otherwise duplicated subscriptions overlap, and suppressing unchanged writes reduces resulting update reads. Existing diagnostic counters do not establish that its past seven attaches overlapped. Project-wide savings and actual billed counts must not be inferred from these synthetic tests.
