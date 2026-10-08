# Firestore quota-based diagnostics (v295)

The goal is attributing unnecessary work to application processes, without billing setup or Monitoring API calls. The dashboard uses Firestore Standard free quotas (50k reads/day, 20k writes/day, 20k deletes/day, 1 GiB storage, 10 GiB outbound/month) and hard limits (1 MiB document, 1 MiB−89 B field, 10 MiB request, 20 nesting levels). Free quotas and per-operation hard limits are not interchangeable.

Per-process rankings now include observed maximum document/field/body sizes and nesting as well as operation counts and capacity. Maxima are compared as maxima, never added as usage shares. Scalar timestamp/bytes/geopoint/reference values do not add map/array nesting. A failed send still contributes to attempted request-body size, not stored capacity. SDK batching/protocol bytes remain unmeasured. Received document size remains a transfer proxy, not actual network usage. No path or document content is exported.

Indexes, rules evaluation, transactions, names/paths and administrative limits have explicit unmeasured/reference entries with official thresholds. Unobserved data is not presented as zero or safe. Browser storage and the application's photo targets remain accessible in a separate reference panel and are not Firestore quotas. Size/structure trends are unrecorded and no longer replaced by a read-count chart. Initial reads per listener attachment are shown beside the operation breakdown; load alone does not establish waste or improvement.

Official reference checked 2026-10-07: https://firebase.google.com/docs/firestore/quotas

# Current policy (v294): no billing setup

The user requested proceeding without billing. The unshipped v293 Google API activation is withdrawn; its code remains in git history only. The frontend uses local-only diagnostics, never polls Monitoring (including manual refresh/startup/foreground), ignores old project reports, and has no billing activation link. No Google login, billing, IAM, Apps Script deployment, or OAuth scope change is needed for this release.

The screen explicitly labels two-person project totals as unavailable; local counts are never presented as global actuals. The v292 full-history preserving optimizations remain included. Existing display inputs, synchronization, notifications, local diagnostics and offline recovery remain intact.

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


## v302: reuse cached photos and avoid redundant settings work

- Full history queries, all visible records, unread counts, shared real-time updates, deletion handling and the existing retention policy are unchanged. No history documents are migrated or removed by this release. Firebase already provides delta synchronization; this change does not claim to turn a full history query into an incremental application query.
- Recovery leaves healthy listeners attached when only the SDK network state changes. Failed or explicitly detached listeners still reconnect. The quota probe continues to detach listeners before enabling the network, preventing a large history resync ahead of the probe.
- Persistent multi-tab cache target is now 100 MiB instead of the SDK default 40 MiB. This reduces eviction pressure but does not guarantee quota savings; browser storage availability and disconnected time still matter.
- Requested photos use one shared document listener per image instead of a default get on each page load. Cached bytes can render immediately; unchanged server confirmations reuse the object URL. Same-ID restores and remote deletion update existing image elements and the background. The SDK controls server validation and resume tokens, so a cache display is never treated as proof that no server read was billed. Cold starts and long disconnections can still read each full photo.
- Shared settings and account preferences compare against server-confirmed, non-pending snapshots. Timestamp-only changes are omitted. Real changes use merge patches; same-turn compatible changes share one promise and one write. Nulls, arrays and explicit empty maps retain their semantics. Resets that cannot be safely composed remain separate ordered operations. An already-started write does not cause a later full preference save to drop fields if the earlier write fails.
- Genuine writes still enter the existing durable offline queue/SDK persistence immediately (at most one microtask of coalescing, no timed debounce). No billing settings, Monitoring API, extra metadata collection or background polling are introduced.
- Photo attribution moves from `get:blobs` to `listen:blobs`; compare both when inspecting pre/post diagnostics. Existing initial-snapshot estimates can still overcount billing. No production percentage reduction is claimed.

Targeted validation covers no-op writes, changed-only nested patches, both roles, empty-map reset ordering, retries, pending-write failures, durable offline queuing, listener recovery, cached photo confirmation, same-ID replacement, MIME changes, deletion and background replacement. Existing full-history and person-filtered 300-row tests remain applicable.

Validation for this release: 274 distinct automated tests passed across the efficiency, read diagnostics, quota/offline, regression, daily-activity and weekly-meal suites (273 in the integrated run plus the metadata-acknowledgement test added during final review). Eight inline scripts and all changed standalone scripts pass syntax checks. These are synthetic tests; real billed savings and iPhone device behavior are not measured by this run.
