# Implementation register

| Component | Implementation | Test and deployment evidence |
| --- | --- | --- |
| Public landing page and estimator | Existing, preserved. Added browser security headers. | Live verified on Cloudflare Pages. JavaScript syntax and calculation checked. Mobile browser interaction unverified. |
| Treasury adapter | Implemented. Documented parameters, bounded retries, size limits, strict next links, checkpointing, source-run audit, incremental and historical modes. | Live verified successful pages and upstream failure preservation. Terminal pagination and qualifying production records unverified. |
| Procurement review | Implemented as private SQL view and CLI audit. Deadline state derived separately from human review. | Tested with synthetic records. Live schema verified. No live matched record to review. |
| Other revenue sources | Not implemented. National Treasury data covers the country subject to publisher participation. | Province matching supports explicitly supplied regions. Coverage and completeness across nine provinces unverified. |
| Profit and backhaul | Implemented reusable calculations and ranking. | Tested with synthetic inputs. Route, shipment and dashboard integration unimplemented. |
| Fleet, driver, records, compliance, shipments | Existing Hatchable APIs, tables and UI components provide basic record management. | Live route presence and signed-out denial verified. Full authenticated workflows unverified. |
| Dispatch, fleet allocation, routes, tracking and POD | Not implemented. | No transactional dispatch or verified compliance gate. |
| Sync and dashboard | Existing basic Hatchable screens. SQLite synchronization and command centre not implemented. | Admin-gated read access verified at public ingress only. |
| Customer and driver portals | Not implemented. | Role, ownership and tenant tests pending. |
| Finance and documentation | Trip estimates implemented. Invoicing, actual profitability, debtor aging, cash flow and accounting exports not implemented. | Synthetic calculation test only. |
| Marketplace and SaaS | Not implemented. | Paid brokerage, billing and payment processing inactive. |
| Scheduling | Incremental CLI supports bounded unattended invocation. | Tested locally and against live API in isolated SQLite. Hosted scheduling and end-to-end job monitoring unimplemented. |
| Recovery | SQLite point-in-time copy and integrity verification implemented. | Restore from test backup verified. Actual private backup passed integrity check. Off-device encryption and restoration drill pending. |
