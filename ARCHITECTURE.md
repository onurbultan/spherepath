# Spherepath architecture

## Dependency direction

```text
packages/shared
      ↑
apps/web   apps/mobile   functions
```

`packages/shared` cannot import React, Next.js, React Native, Expo, Firebase client SDKs, Firebase Admin, DOM-only APIs, or Node-only APIs.

## Runtime responsibilities

- Client Firestore: offline-capable drafts, contacts, interaction capture, and bounded tenant-scoped reads.
- Firebase Functions: role claims, stage transitions, immutable stage events, daily-plan generation, metrics, retention, verified webhooks, and voice processing.
- Cloud Tasks: retryable or long-running work such as STT, masking, extraction, and deletion propagation.

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
