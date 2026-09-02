# Spherepath contributor contract

## Product boundary

Spherepath is not a generic CRM. Every feature must advance one of these outcomes: relationship activity, qualified lead creation, portfolio acquisition, or closing.

## Architecture

- Web and mobile share domain types, runtime validation, pure rules, copy constants, analytics contracts, and design intent through `@spherepath/shared`.
- Web and mobile do not share React components, navigation, authentication implementations, Firebase SDK instances, or concrete styling.
- Web and mobile are the same product on two screens. A capability shipped on one ships on the other in the same change; a deliberate exception is declared with its reason in `scripts/check-platform-parity.mjs`.
- Firebase Web SDK belongs under `apps/web`; React Native Firebase belongs under `apps/mobile`; Firebase Admin belongs under `functions`.
- Client Firebase SDKs are limited to Auth, Functions transport, and Storage. Feature code must not access Firestore directly or instantiate callable functions outside the platform API adapter.
- Domain traffic follows view → React Query → feature resource → shared API client → callable Function. Mutations use idempotent command IDs and invalidate explicit shared query keys.
- Trusted transitions are server commands. A client must not directly advance an opportunity, manufacture a stage event, or write verified delivery/webhook state.
- Routes stay thin. Feature code follows `features/<feature>/{views,viewModels,resources,components}`.

## Permanent safety constraints

- Never record the other party. Voice input is only the advisor's post-conversation note.
- Never infer personality, trust, education, emotion, or sensitive traits.
- Never persist an unmasked raw transcript.
- External phone or personal WhatsApp activity is not completed without user confirmation or an official verified webhook.
- Every tenant-owned document carries `officeId` and `ownerUid`.

## Quality gates

- TypeScript stays strict.
- Code symbols, database collections and fields, enum values, schemas, events, and API payloads use English only. Turkish is reserved for user-facing copy.
- Pure domain rules require unit tests.
- Firestore/Storage rules require Emulator tests before production deployment.
- Web and mobile use the same user-facing Turkish copy and analytics event names for the same product action.
- Both platforms call the same set of callable Functions. `pnpm parity:check` fails when one reaches a server capability the other cannot.
- Form controls come from the shared control layer: `shared/ui/SpField` on both platforms, and `.sp-control` on web. A screen must not name its own field height, corner, or border — a control looks the way it does because of what it is, not where it sits.
- Design values come from generated semantic tokens; feature code must not hardcode colors.
