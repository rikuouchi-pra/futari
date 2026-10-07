# Apps Script notification backend

The production Apps Script project uses Code.gs, Push.gs, PushCrypto.gs and appsscript.json. Code.gs retains the existing calendar, AI, and deployment handlers. The manifest adds no OAuth scopes.

Setup: save these four files in the existing project, run `setupPushNotifications` once, then update the existing web-app deployment to a new version. Keep its URL unchanged. `pushServerStatus` logs only operational status; `testPushBackend` checks the VAPID signature in Apps Script. The setup is idempotent and retains the VAPID key and trigger.

Each authenticated device uploads its shared and private snapshot through Firebase security rules. The backend verifies the Firebase account, derives its role, checks the exact private document path, and stores a device snapshot in the script owner's private Drive folder. Firebase ID tokens are never persisted. VAPID keys are generated inside Apps Script and remain in Script Properties. The inbox requires a hashed, per-device secret.

The five-minute trigger sends empty Web Push requests with VAPID (RFC 8030/8292); the existing service worker retrieves the notification text over HTTPS. Endpoint hosts are restricted to Apple, Google and Mozilla, with redirects disabled. Failed requests retry; 404/410 disables the subscription. The client must be opened to refresh the today/tomorrow schedule. Recently due entries are retained for ten minutes so a client sync cannot remove them before the next scheduled sender run.

Crypto: bundled `@noble/curves` 2.0.1 and its locked `@noble/hashes` dependency, both MIT. Rebuild from this directory:

```
npm ci --ignore-scripts
node node_modules/esbuild/bin/esbuild crypto-entry.mjs --bundle --format=iife --global-name=FutariP256 --target=es2020 --minify --legal-comments=inline --outfile=PushCrypto.gs
```

Tests from repository root: `node --test tests/regression.cjs tests/ai-transport.cjs tests/gas/push.cjs`. Tests independently verify the JWT using Node crypto and cover ownership, private/shared separation, endpoint restrictions, retry, deduplication, expiry and device shutdown.

Notification policy: each device retains its own weekday and quiet-hour policy (Japan time). Suppressed notifications are discarded, not deferred. Manual tests bypass quiet hours. Shared updates are rescheduled using the recipient device’s lead, morning and evening times; one partner cannot overwrite the other device’s timing preferences.

## Firestore monitoring and quota recovery (v289)

AI now uses an authenticated form POST directly to Apps Script (`aiDirect`). Audio,
images and prompts are never placed in temporary Firestore documents on this path.
The HTML reply uses a random request nonce and a fixed app origin; the client
validates the nonce and the Google Apps Script response origin. There is no automatic
resend of model requests. Existing `ai` and calendar/notification endpoints remain
compatible with older clients.

`firestoreUsage` verifies the Firebase account and restricts access to the registered
family before reading Cloud Monitoring. It reads the default database's document
operation DELTA metrics, with a Pacific-midnight boundary (including DST), handles
pagination, and caches results for five minutes. Missing metrics remain unknown.
These metrics are delayed estimates, not an exact billing counter or a guarantee
against exhaustion. They do not consume Firestore document reads.

The existing deployed OAuth manifest is deliberately unchanged. After deploying
Code.gs, the Firebase project owner should run `setupFirestoreMonitoring` in the
Apps Script editor. Its first run adds only `monitoring.read` to the HEAD manifest
without changing the deployed version. Reopen the editor and run it again, approve
Google's consent, and the function verifies monitoring access before publishing the
new version at the same URL. If required, enable Cloud Monitoring API and grant
`roles/monitoring.viewer` to the script owner on the Firebase project. No billing
plan is changed. Do not publish the new scope before consent and a successful probe.

The frontend shows usage at Settings → Firestoreの利用状況 and foreground warnings
at 80%, 95% and 100% of the free-tier reference values. It polls while visible at most
once per five minutes, stops automatic attempts if setup is required, and labels
stale, unavailable and previous-day values. Local status and count metadata contain
no tokens.

On a Firestore resource-exhausted error the client disables Firestore network access.
Text document changes are durably queued in a separate IndexedDB database scoped to
project and Firebase user, with overlays on existing cached data. Photos not already
cached and photo mutations wait for recovery. At the next Pacific reset, or on an
explicit recovery request, listeners are temporarily detached, one server document
is probed, and pending operations are replayed in order. Only acknowledged operations
are removed. An IndexedDB lease prevents concurrent replay across tabs; a failed
recovery retains the queue and retries after 15 minutes while the app is open.
Conflicting edits use the existing last-write-wins semantics. Unsent changes can
be exported from the same settings card. IndexedDB failures must never be reported
as successful saves. This does not make another device's latest data available during
a server outage, and clearing browser data removes local unsynced changes.

Validation: `node --test tests/regression.cjs tests/ai-transport.cjs tests/firestore.cjs tests/gas/push.cjs tests/gas/firestore.cjs`.


## Google usage and storage monitoring (v293)

The current endpoint returns schema 2 with `metrics.reads`, `writes`, `deletes` and
`storage` (`bytes`, `lastPointAt`). Document operation metrics are DELTA totals
for the Pacific quota day. Storage is the latest GAUGE sample from a 24-hour
window, including indexes; it is not summed over time. Empty responses mean
unknown, not zero. Pages and errors are checked before caching the whole report.
Both family accounts use the owner's endpoint and the same five-minute script
cache. An authenticated request must pass `verifyUser_` and the family allowlist
before any cached report is returned. No Firestore document calls are involved.

Update only Code.gs in the existing owner project, preserving its other files,
configuration and manifest. Run `setupFirestoreMonitoring` after updating. The
scope-consent staging and successful-probe gate above still apply. A billing-required
response now links to the exact Firebase project's billing page; API-disabled,
scope and IAM errors have separate instructions. No function enables billing or
grants IAM roles. The monitoring response is an observation, not a billing ledger.
The frontend's 1 GiB/50k/20k/20k references remain free-tier comparison values,
not enforced spending caps for a billing-enabled project.
