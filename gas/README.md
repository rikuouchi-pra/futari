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
