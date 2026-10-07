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
