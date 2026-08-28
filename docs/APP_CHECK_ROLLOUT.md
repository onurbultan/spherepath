# App Check rollout

Spherepath clients initialize Firebase App Check before using Auth, Functions, or Storage. Production callable enforcement is committed in `functions/.env.spherepath-96ecd` with `ENFORCE_APP_CHECK=true`; Functions detect the Firebase Emulator explicitly and keep enforcement disabled for deterministic local integration tests.

## Registered providers

- Web app: reCAPTCHA Enterprise, key `spherepath-web-app-check`, for `localhost`, `spherepath-96ecd.web.app`, and `spherepath-96ecd.firebaseapp.com`.
- iOS app: App Attest, Apple Team ID `R7RWAD9FVH`. Production builds include the production App Attest entitlement. Development builds use the debug provider.
- Android app: Play Integrity, with the current development signing SHA-256 fingerprint. Production builds use Play Integrity; development builds use the debug provider.
- Local native testing: explicit Firebase App Check debug tokens are registered for the iOS Simulator and Android Emulator used on 2026-08-28. Their secret values are not stored in the repository and must be revoked when those test environments are retired.

## Enforcement state

- Callable Functions: enforced. A tokenless request is rejected with HTTP 401, while verified web, iOS, and Android requests succeed.
- Cloud Firestore: enforced. Firestore remains API-first and its rules deny all direct client reads and writes.
- Cloud Storage: enforced. Storage additionally permits only authenticated, tenant-scoped voice uploads with validated type, size, and metadata.
- Firebase Authentication: monitoring. Authentication App Check enforcement remains a Firebase Preview feature; verified request coverage was 100% when the rollout was completed.

## Release gate

Before the first Google Play release, add the final Play App Signing SHA-256 fingerprint to the Android Play Integrity provider. Continue monitoring structured `spherepath-api` client diagnostics and Cloud Functions request logs for rejected legitimate traffic.
