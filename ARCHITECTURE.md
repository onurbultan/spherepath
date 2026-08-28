# Spherepath architecture

## Dependency direction

```text
packages/shared
      ↑
apps/web   apps/mobile   functions
```

`packages/shared` cannot import React, Next.js, React Native, Expo, Firebase client SDKs, Firebase Admin, DOM-only APIs, or Node-only APIs.

## Runtime responsibilities

- Firebase Auth client SDK: sign-in, account creation, sign-out, and ID token lifecycle only.
- API client: every feature query and command passes through the platform adapter in `shared/api`, with a request ID, normalized errors, retry policy, and React Query cache/invalidation.
- Firebase callable Functions: every domain read and write, tenant/owner authorization, idempotent commands, stage transitions, immutable events, daily-plan generation, metrics, retention, verified webhooks, and voice processing.
- Firestore client access: denied for every collection. Firebase Admin inside Functions is the only database access path.
- Offline support: a future local command queue may replay idempotent API commands; it must never write domain documents directly.
- Cloud Tasks: retryable or long-running work such as STT, masking, extraction, and deletion propagation.

## API request path

```text
view → React Query → feature resource → shared API client → platform callable adapter
     → Firebase Function → authorization + validation → Firestore Admin
```

Queries use bounded React Query retries for transient failures. Commands carry a stable `commandId`; the server persists a receipt so a retried command cannot apply twice. Every call also carries a separate `requestId` for logs and diagnosis.

## Product features

Both apps use the same feature names:

```text
today
contacts
capture
opportunities
listings
profile
```

UI is implemented natively per platform. Domain state machines and decision rules remain shared.

## Language boundary

Internal terminology is English across TypeScript, Firestore fields, enum values, schemas, analytics events, and Function payloads. Turkish is used only for user-facing product copy.
