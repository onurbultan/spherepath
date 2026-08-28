# App Check rollout

Spherepath clients initialize Firebase App Check before using Auth, Functions, or Storage. Callable enforcement is controlled at deployment time with `ENFORCE_APP_CHECK` and defaults to `false` so an incomplete native rollout cannot lock out legitimate users.

## Registered providers

- Web app: reCAPTCHA Enterprise, key `spherepath-web-app-check`, for `localhost`, `spherepath-96ecd.web.app`, and `spherepath-96ecd.firebaseapp.com`.
- iOS app: App Attest, Apple Team ID `R7RWAD9FVH`. Production builds include the production App Attest entitlement. Development builds use the debug provider.
- Android app: SDK and Play Integrity production provider are configured in code. Firebase provider registration is intentionally pending because the console requires the account owner to accept the Google APIs and Play Integrity terms. Register the release signing SHA-256 fingerprint as well as any debug fingerprint that will be attested.

## Enforcement checklist

1. Register Android Play Integrity and the release SHA-256 fingerprint.
2. Create and register explicit App Check debug tokens for local iOS and Android development builds.
3. Deploy and exercise web, iOS, and Android builds while enforcement remains disabled.
4. Confirm valid-request metrics for all three apps in Firebase App Check.
5. Set `ENFORCE_APP_CHECK=true` in the Functions deployment environment and redeploy Functions.
6. Monitor structured `spherepath-api` client diagnostics and Cloud Functions request logs for rejected legitimate traffic.

Firestore remains API-first and denies all direct client reads and writes. Storage permits only authenticated, tenant-scoped voice uploads with validated type, size, and metadata.
