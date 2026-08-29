# Product limits and next infrastructure

This document separates the current Spherepath product surface from integrations that are not yet implemented. It is intentionally explicit: a visible button, draft, or status in the UI does not imply that an external provider is connected.

## Current boundary

| Capability | Current behavior | Missing infrastructure |
| --- | --- | --- |
| WhatsApp office portfolio intake | An advisor pastes one or more exported messages. AI extracts structured portfolio drafts and each draft requires review before it enters the office pool. | No WhatsApp Business provider, webhook receiver, group synchronization, attachment ingestion, sender identity mapping, or background import exists. |
| Outbound WhatsApp, SMS, and email | Spherepath creates an editable presentation/message draft. The advisor manually confirms delivery stages. | No provider API, approved message templates, external message ID reconciliation, delivery/read/reply webhooks, retry queue, or provider opt-out synchronization exists. |
| Match notifications | Explainable matches and in-app notification records are available while the user is in Spherepath. | No web push service worker, FCM registration-token lifecycle, APNs delivery, notification preference center, or background delivery worker exists. |
| Calendar and reminders | Daily tasks and rescheduling are stored and shown inside Spherepath. | No Google/Outlook calendar OAuth, calendar event synchronization, device-local notification scheduling, or reminder delivery worker exists. |
| Listing publication | Own listings and external listing URLs can be stored and matched. | No property portal feed, XML export, portal authentication, publication status reconciliation, media pipeline, or syndication job exists. |
| Analytics periods | The explainable Today funnel is computed for the current 30-day product window. | The 90-day and yearly controls are intentionally disabled. Historical aggregation, snapshots, trend comparison, and office-level analytics jobs do not exist. |
| Voice intelligence | Audio or test text is processed into a masked transcript, structured interaction, memories, property preferences, and a suggested next action. User review is mandatory. | No dedicated voice/privacy settings page, per-device recording diagnostics, long-running job progress channel, speaker diarization, or multilingual model routing exists. |
| Data export | A data-subject request can produce a contact-scoped export through the trusted API. | No bulk workspace export, scheduled backup export, downloadable archive builder, or administrator export audit screen exists. |
| Deal closing | Presentation and deal stages are tracked. Closing a deal atomically marks its linked listing as sold or rented. | No commission calculation, deposit/payment schedule, contract document storage, e-signature provider, accounting integration, or settlement ledger exists. |
| Search and matching | Structured buyer/tenant preferences are compared with office-pool inventory using deterministic, explainable metrics. | No map radius, travel-time, parcel/zoning registry, title-deed verification, live market valuation, or external inventory search exists. Extracted facts remain advisor-confirmed data. |

## Required implementation order

1. **Notification delivery:** introduce device/browser token registration, user preferences, FCM/APNs/web push delivery, revocation, and delivery telemetry.
2. **Provider message bridge:** choose one approved business messaging provider; add tenant credentials, templates, webhook verification, idempotent inbound/outbound events, and consent enforcement.
3. **Calendar synchronization:** add OAuth connections, one-way task publishing first, then conflict-aware two-way synchronization.
4. **Historical analytics:** persist daily office/advisor snapshots and enable 90-day/year comparisons only after backfill and data-quality checks.
5. **Bulk export and backup:** build asynchronous export jobs, signed download URLs, expiry, audit events, and deletion handling.
6. **Listing distribution and enrichment:** add portal adapters and authoritative geospatial/title/zoning sources without weakening the current human review gate.

## Product rules that must remain true

- Firestore is not a client-side domain API. Web and mobile clients continue to use callable Functions for trusted reads and commands.
- All persisted schema names, collection names, event types, API fields, and code terminology remain English.
- AI output is a draft. Property facts, consent, sensitive-data handling, match decisions, and outbound messages remain reviewable by a person.
- Tenant isolation and owner/broker authorization apply to every provider callback, background job, and export.
- External delivery states must come from provider evidence; the UI must not present a manually advanced state as verified delivery.
- Unsupported capabilities stay disabled or are labeled as manual until their end-to-end infrastructure and observability are deployed.
