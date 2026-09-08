# Contact imports

Web and mobile offer the same one-way contact import at `/contact-imports`, reached from Contacts. Google CSV works without Google OAuth credentials. Google account import uses the same preview, selection and server commit pipeline.

## Boundaries

- Up to 5,000 contacts per import; CSV files up to 2 MB; notes up to 20,000 characters; up to 30 phone numbers and 30 email addresses per incoming contact. Exceeding a limit fails explicitly, without truncation or a partial Google preview. CSV validation logs contain the error code, request ID and byte count, never contact values or notes.
- CSV supports Google's `Name` or `First Name`/`Middle Name`/`Last Name` (also legacy `Given Name`/`Family Name`) headers, repeated phone/email value columns, BOM, quoted commas and multiline notes. Address-book exports also support `Display Name` (falling back to first/last name when blank), `Home Phone`, `Business Phone`, `Mobile Phone`, `Other Phone`, `Primary Phone` and numbered variants, plus `E-mail Address`, `E-mail 2 Address` and subsequent numbered addresses. Google CSV remains the recommended export format; vCard is unsupported. Other columns such as fax, birthday, gender, addresses, company and labels are not imported in this version.
- All eligible rows start selected across the entire file, including unopened pages. Before confirming, the user can exclude and restore individual rows or all eligible rows; the selected/excluded counts update immediately. Exclusions survive pagination, preview refresh and switching jobs while the screen stays mounted; leaving/reloading the screen starts a fresh selection. No contact is created before confirmation. Ambiguous, invalid, archived and repeated rows are excluded and explained. Correct these rows in the source and run a new import. Names alone never cause a merge. CSV rows without phone/email can be recognized only when the exact same file snapshot is imported again; changing that file requires manual review of those identity-free rows.
- Existing advisor names, roles, relationship state, memory, tasks and permissions are preserved. Phone/email values are added; an empty primary phone may be filled. Imported contacts have `metAt: null`. Imported notes have an import timestamp and `sourceDate: null`; no historical interaction is manufactured.
- Notes are separate `contactImportNotes` records. The existing deterministic sensitive-content masker runs before temporary storage. Notes are treated as text and are never automatically sent for AI analysis. The same text for the same contact is not duplicated on replay; a changed note is appended as another sourced note, never overwritten.
- Google import is one-time. It does not synchronize, write to Google or retain access/refresh tokens. A subsequent import requests authorization again. Users may revoke the app's grant in their Google account permissions.
- Imports belong to the authenticated advisor, including when the advisor is a broker. Matching never crosses owners/offices. Normal contact access rules govern viewing imported notes after commit.

## Implementation

Shared schemas, CSV parsing, identity matching, channel merging and Turkish copy live in `packages/shared/src/contacts/contact-import.ts`. Each platform owns its views, view model, resources and file access. Only the platform API adapter instantiates callable Functions.

`prepareContactImport` parses and stages CSV. `beginGoogleContactImport` creates an expiring state and PKCE verifier; `googleContactImportCallback` forwards the authorization result to the configured app. It does not import on callback: `finishGoogleContactImport` also requires the original authenticated Spherepath owner, consumes the state transactionally, exchanges the code, checks the granted read scope, reads every People API page and stages a preview. This prevents a forwarded OAuth URL from importing another user's Google data. Google source identity includes the account subject and stable CONTACT source ID.

`commitContactImport` freezes selected row IDs under an idempotent command ID. `processContactImport` processes 20 rows per Firestore event and advances a version/cursor for the next event. Each row, contact, source link, note and outcome counter are one transaction. Source links, hashed identity records and a per-advisor transaction fence prevent concurrent imports from creating duplicates. The worker rechecks identity and archive/deletion status against the preview; changed matches become conflicts. `controlContactImport` resumes failed batches without reapplying completed rows. Before confirmation, cancellation stops contact creation. Confirmation/completion audit events use shared analytics names and contain counts, not notes or contact details.

Preview and OAuth documents are server-only. Firestore client rules remain deny-all. Preview payloads and imported note bodies are excluded from indexes. A scheduled purge deletes expired preview rows/jobs after seven days and expired OAuth state after ten minutes (physical cleanup runs daily). The mobile query persister excludes preview/note queries and all mutations; the temporary picked CSV copy is deleted after reading.

Contact data exports include imported notes. The deletion worker deletes those notes and scrubs related preview rows. Hashed source/identity links retain no note or communication value and act as replay suppression tombstones, so the same source does not resurrect a deleted contact. This tombstone retention should be included in the product's documented retention policy before production use.

`listContacts` is paginated at 500 records (legacy null/undefined requests keep their original 1,000-record first page); both platform resources retrieve subsequent pages so importing a larger address book does not hide contacts beyond the old 1,000-record limit. Today and funnel contact inputs also include the complete scoped set.

## Google setup before production

1. Enable **Google People API** in the Google Cloud project.
2. Configure the OAuth consent screen and create a **Web application** OAuth client. Request `openid` and `https://www.googleapis.com/auth/contacts.readonly`. Configure test users while testing; complete Google's required consent-screen verification before public release.
3. Register the exact redirect URI of `googleContactImportCallback`, for example `https://europe-west8-spherepath-96ecd.cloudfunctions.net/googleContactImportCallback`.
4. Set Functions parameters `GOOGLE_CONTACTS_CLIENT_ID`, `GOOGLE_CONTACTS_CALLBACK_URL` and `GOOGLE_CONTACTS_WEB_RETURN_URL`. The web return URL must be the application's `/contact-imports/` page, e.g. `https://spherepath-96ecd.web.app/contact-imports/`. Both configured URLs must use HTTPS. Mobile returns through the existing `spherepath:///contact-imports` scheme.
5. Set `GOOGLE_CONTACTS_CLIENT_SECRET` using `firebase functions:secrets:set GOOGLE_CONTACTS_CLIENT_SECRET`. It must not be exposed in web/mobile environment variables. The first local emulator test can use a dummy secret in `functions/.secret.local`; live Google verification requires real credentials and an HTTPS callback.
6. Deploy the updated indexes and Functions, then web and mobile together. The native app needs a new build for `expo-document-picker` and `expo-file-system`. Verify consent denial, account switching, multivalued fields, long notes and an actual sample of Google Contacts before rollout.

Without configured parameters, the UI explains that CSV is available and disables Google connection. A CSV-only deployment does not bind the unused OAuth secret. Setting `GOOGLE_CONTACTS_CLIENT_ID` in the project Functions dotenv enables the secret binding during discovery; set the real secret and redeploy the Google endpoints to activate the integration. OAuth provisioning remains a separate setup step.

## Production release — 2026-09-07

- Firebase project: `spherepath-96ecd`, Functions region: `europe-west8`; web: `https://spherepath-96ecd.web.app/contact-imports`.
- Published the CSV preview/exclusion/import flow, all 12 import endpoints/workers, seven related contact/privacy/today/funnel endpoints, and the import indexes. The preview cleanup schedule is enabled daily; the worker retries failures. App Check remains enforced.
- Google OAuth is disabled until real client configuration and the secret are supplied and the Google endpoints redeployed. No placeholder secret was created.
- Native source and API parity are complete, but the native release is pending: this repository has no configured EAS project or store signing/release workflow. The release exception is recorded in `scripts/check-platform-parity.mjs`; the document-picker dependency requires a new binary.
- Verification: workspace checks; five rules tests; five import API/worker integration tests; desktop/mobile browser selection tests; production build and published asset hash match; live route HTTP 200 and unauthenticated callable rejection. The production browser check reached the sign-in screen; no production contacts were created for testing.

## Verification

Pure tests cover the 5,000/5,001-row boundary, address-book header aliases, normalization, ambiguous matches, merging and five Google pages. `firebase-tests/contact-import.integration.test.ts` exercises actual callable commands and worker events, including previewing and committing all 5,000 rows, preserving all 5,000 sourced notes and replaying the confirmation without creating duplicates. It accepts `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST` and `SPHEREPATH_IMPORT_FUNCTIONS_PORT` overrides for an isolated emulator suite. `apps/web/e2e/contact-import.spec.ts` exercises CSV selection, preview, completion and reading the imported note on both desktop and mobile browser sizes, including accessibility checks. Run `pnpm check`, `pnpm test:api`, and the import Playwright test against emulators. OAuth network responses are tested with a fake fetcher; a live Google grant is an additional deployment check.

Primary references: [People API](https://developers.google.com/people/api/rest/v1/people.connections/list), [Google OAuth web flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Firestore triggers and delivery semantics](https://firebase.google.com/docs/functions/firestore-events).
