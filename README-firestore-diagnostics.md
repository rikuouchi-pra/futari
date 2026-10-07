# Firestore process diagnostics (v290)

Settings → Firestoreの利用状況 → 処理別の読み取り.

- Counters are per browser/account and aggregate that account's tabs. They start after installing v290. No backend setup is required for process diagnostics.
- Today uses the same Pacific-midnight day boundary as Firestore. The UI/export can aggregate seven days; local records expire after fourteen days.
- `firestore-reads.js` performs no network requests. Records contain grouped process names and counters, never document IDs, user text, images or credentials. Each page session writes its own localStorage key, avoiding competing read/modify/write operations between tabs. Saves are throttled and flushed on hide/pagehide.
- `shim.js` instruments SDK single-document reads, collection reads, listeners, profile/photo reads and the recovery probe. Concurrent identical one-shot reads are shared; cache-only reads and normal reads use separate keys. Errors clear the in-flight slot.
- Snapshot metadata differentiates cache and pending local writes. The first confirmed server snapshot counts the result size (minimum one); subsequent snapshots count changed document fingerprints. Physical deletions are recorded separately and do not increase the estimate. Metadata-only notifications are not counted as additional reads. The application callback uses SDK changes independently of diagnostic fingerprints.
- These are **estimates of observed document delivery**, not billing records. SDK-internal reconnects, rules/index reads, other devices and independent backend operations are not fully observable. Initial/explicit rebind snapshots may overestimate reads when persistence resumes a listener. Do not subtract this device's estimate from the project total to infer other devices' usage.
- Legacy AI POST/JSONP gateway attempts appear as unknown-count requests, not invented successful reads. Direct AI bypasses Firestore. Existing Cloud Monitoring project totals remain separate and retain their setup/latency status.
- The export includes daily/process/version aggregates and the separately labeled project usage report. Only the seven-day range is exported. Version comparisons include initial reads per listener attachment; different usage/periods do not establish causal savings.
- Suggestions are based on observed initial/update volume, repeated gets, failures and unobservable gateway attempts. They do not automatically disable shared synchronization or delete history.

Validation:
`node --test tests/firestore-reads.cjs tests/firestore.cjs tests/ai-transport.cjs tests/regression.cjs tests/gas/*.cjs`

Future optimization: collect representative use on each device, export diagnostics, inspect the largest contributors, then implement targeted limits/caching while preserving shared data visibility. Compare equivalent workloads after the next version.
