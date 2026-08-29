# Real estate advisor acceptance audit

Date: 2026-08-29  
Environment: local web application on port 5050 with production callable Functions for AI extraction

## Objective

The audit exercised Spherepath as a real estate advisor handling five new contacts in one working day. It checked whether the product can turn conversations into trusted contact memory, follow-up work, opportunities, explainable portfolio matches, presentations, and a closed deal without bypassing human review.

## Reference design coverage

The implemented pages were compared with the supplied Claude reference files for Today, Contacts, Opportunities, Listings, Settings, product behavior, and dialogs. The current application now includes the important reference behaviors:

- responsive desktop and mobile layouts;
- contact table selection, selected-contact export, inline actions, detail access, and safe archive confirmation;
- opportunity list and board modes, direct creation, priority navigation, and missing or overdue action emphasis;
- keyboard-accessible sheets and dialogs with focus containment, Escape dismissal, scroll locking, and opener focus restoration;
- command-palette actions and global shortcuts for voice capture and opportunity creation;
- a visible contact-identity warning before an extracted interaction is saved;
- explainable portfolio scores, office-pool intake review, presentation tracking, and linked listing status after deal closing.

The deliberate product and infrastructure limits are listed in [PRODUCT_LIMITS_AND_NEXT_INFRA.md](./PRODUCT_LIMITS_AND_NEXT_INFRA.md).

## Five-contact working-day scenario

| Scenario | Advisor need | Evidence checked | Result |
| --- | --- | --- | --- |
| Buyer discovery | Capture budget, areas, requirements, exclusions, and next follow-up | AI extraction, reviewed memory, buyer opportunity, daily task | Pass |
| Seller valuation | Preserve property facts and prepare a valuation appointment | Contact timeline, seller opportunity, valuation action | Pass |
| Commercial tenant | Capture size, rent ceiling, parking, meeting room, transport, and move date | Structured preferences and reviewed memory | Pass |
| Residential tenant | Remember requirements and schedule a portfolio follow-up | Contact memory, due task, opportunity priority | Pass |
| Undecided buyer or tenant | Avoid premature outreach while retaining revised criteria | No-action state, negative outcome, retained preferences | Pass |

The seeded acceptance workspace contained six contacts, four open opportunities, three office-pool items, one explainable 90% match, one replied presentation, one closed deal, and one sold listing. The additional contact is retained for regression coverage.

## End-to-end observations

### What already saves time

- One reviewed conversation produces the summary, durable facts, structured property criteria, opportunity proposal, and next action together.
- The Today page turns follow-up dates into an operational queue instead of leaving them in contact notes.
- Contact history and property memory remove the need to reread past conversations.
- Explainable matching shows both the score and the criteria behind it, so the advisor can judge a suggested portfolio instead of trusting an opaque recommendation.
- Office-pool paste intake makes WhatsApp-originated inventory useful while keeping every extracted listing behind a human review gate.
- Opportunity priority navigation surfaces the nearest due work and visually distinguishes records with missing or overdue actions.

### Friction discovered and corrected

- Native archive confirmation did not match the design and was weak for keyboard users. It was replaced with a destructive confirmation dialog.
- Sheets and dialogs did not reliably contain focus. Keyboard focus now loops inside the active layer and returns to the opener.
- Starting common work took too many navigation steps. Voice capture and opportunity creation are now available from the command palette and global shortcuts.
- A pasted test conversation could describe a different person than the selected contact. Review now prominently states which contact will receive the record and instructs the user to discard and restart if it is wrong.
- Contact scanning lacked the reference table's selection and row-level actions. Page selection, bulk export, clear selection, and inline actions were added.
- Missing or overdue opportunity actions were not visually urgent enough. Those records now receive the reference-style warning edge.

## Safety and correctness checks

- An AI extraction draft was generated from a realistic Turkish buyer conversation and then discarded; no interaction or opportunity was persisted.
- Contact archiving was opened and cancelled; the contact remained intact.
- Task resolution was opened and closed without completing, rescheduling, or skipping the task.
- Closing a deal was previously verified to atomically update the linked listing to sold or rented.
- All domain reads and commands continue through the trusted callable Function API; the client does not use Firestore as a domain API.
- Persisted schema, collection, event, API, and code terminology remains English. Turkish is confined to the product interface and user content.

## Acceptance conclusion

The current product is suitable for a controlled pilot with an individual advisor or a small office, provided users understand that outbound messaging, calendar synchronization, background notifications, WhatsApp group ingestion, and portal publication are still manual or unavailable. The core daily loop—capture, review, remember, follow up, match, present, and close—is coherent and testable end to end.
