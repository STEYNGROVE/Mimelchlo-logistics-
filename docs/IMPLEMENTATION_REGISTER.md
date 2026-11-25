# Implementation register

Current release status and owner actions are in the [Infinity release and blocker register](INFINITY_COMPLETION.md).

See the [commercial integration completion report and owner checklist](COMMERCIAL_COMPLETION.md) for current release evidence and owner actions.
| Component | Implementation | Test and deployment evidence |
| --- | --- | --- |
| Public experience and intake | Cinematic site, bilingual planner, estimator, equipment guide, online enquiries and download fallback. | Desktop and mobile Chromium, visual snapshots and Lighthouse run against production. |
| Treasury adapter | Implemented. Documented parameters, bounded retries, size limits, strict next links, checkpointing, source-run audit, incremental and historical modes. | Live verified successful pages and upstream failure preservation. Terminal pagination and qualifying production records unverified. |
| Procurement review | Implemented as private SQL view and CLI audit. Deadline state derived separately from human review. | Tested with synthetic records. Live schema verified. No live matched record to review. |
| Other revenue sources | Not implemented. National Treasury data covers the country subject to publisher participation. | Province matching supports explicitly supplied regions. Coverage and completeness across nine provinces unverified. |
| Profit and backhaul | Implemented reusable calculations and ranking. | Tested with synthetic inputs. Route, shipment and dashboard integration unimplemented. |
| Fleet, driver, records, compliance, shipments | Existing Hatchable APIs, tables and UI components provide basic record management. | Live route presence and signed-out denial verified. Full authenticated workflows unverified. |
| Dispatch and field operations | Private transactional reservation and evidence gates are deployed in disabled mode. Driver application, live GPS and proof-of-delivery workflow remain open. | Local conflict and transition tests passed. The deployed API rejected a reservation while disabled. |
| CRM relay and dashboard | Shipped private commercial command centre and idempotent enquiry import. | Deployed end-to-end enquiry, quote and role checks. SQLite procurement sync remains open. |
| Customer portal | Bilingual UI and scoped Supabase adapters delivered with activation disabled. | Local role, ownership and tenant fixture passed. Dedicated hosted project, SMTP and driver application remain open. |
| Finance and documentation | Trip estimates and local tools for draft totals, payment allocation, debtor aging, statement export and cash-flow scenarios. Customer document access uses a scoped private bucket when configured. | Synthetic finance and PostgreSQL tests passed. Live accounting and OCR remain open. |
| Marketplace and SaaS | Not implemented. | Paid brokerage, billing and payment processing inactive. |
| Scheduling | Hatchable runs hourly enquiry imports and daily internal operational checks. Incremental procurement importer runs separately. | Hourly scheduler observed; see current release report for operational-check evidence. |
| Recovery | SQLite point-in-time copy and integrity verification implemented. | Restore from test backup verified. Actual private backup passed integrity check. Off-device encryption and restoration drill pending. |
