# Spherepath

Spherepath is a mobile-first portfolio production system for real-estate advisors. It turns relationship and opportunity events into an explainable bottleneck diagnosis and a daily plan of three to five actions.

## Workspace

```text
apps/web        Next.js web application
apps/mobile     Expo + React Native mobile application
packages/shared Pure cross-platform domain, validation, analytics, and design contracts
functions       Trusted Firebase commands, triggers, queues, and scheduled work
firebase        Firestore/Storage rules, indexes, and emulator configuration
```

## Local setup

```bash
corepack enable
pnpm install
pnpm design:check
pnpm typecheck
pnpm test
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules
pnpm web:dev
```

The web application runs at `http://localhost:5050` by default.
`pnpm web:dev` connects to production Firebase; use `pnpm web:dev:emulators` only while the local Firebase emulators are running.

Firebase project alias: `spherepath-96ecd`.

Production Firebase resources use `europe-west8` (Milan):

```text
Firestore  Standard Native mode, delete protection enabled
Storage    spherepath-96ecd.firebasestorage.app
Functions  Node.js 22, 2nd gen, maximum 10 instances
Auth       Email/Password enabled
```

The project is on Blaze billing with a 500 TRY monthly email budget alert. Budget alerts notify; they do
not cap usage. Artifact Registry deletes Functions container images older than seven days.

The mobile app uses React Native Firebase and therefore requires a development build; Expo Go is not a supported runtime.

Firebase app registrations:

```text
web      spherepath-web       1:911341214997:web:f31e5bceaf569b327add1c
iOS      spherepath-ios       com.spherepath.app
Android  spherepath-android   com.spherepath.app
```

Web credentials live in ignored `apps/web/.env.local`. Native Firebase config files live in ignored
`apps/mobile/GoogleService-Info.plist` and `apps/mobile/google-services.json`; CI should restore them
from its secret store before native builds.

For Firebase emulators, keep `127.0.0.1` on the iOS simulator, use `10.0.2.2` on the Android emulator,
and use the development Mac's LAN address on a physical device.

## Firebase deployment

```bash
pnpm check
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules
pnpm exec firebase deploy --only firestore:rules,firestore:indexes,storage
pnpm exec firebase deploy --only functions
```
