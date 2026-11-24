# MIMELCHLO LOGISTICS NEXUS architecture

## Deployed boundaries

- Cloudflare Pages serves only `public/`. That directory contains the company site, logo and browser-only freight estimator.
- Hatchable V5 is the private operations application. Its six administrative routes use Hatchable's server-side admin gate and its five business tables live in the project's PostgreSQL database.
- The Python engine runs under the private Termux account. The existing `hunter.py` invokes the adapter from the sibling public checkout. The SQLite database, backup and run history remain outside that checkout. The public repository contains reusable implementation, tests and documentation.

## Discovery flow

Treasury OCDS pages enter a bounded importer. The importer validates pagination, extracts freight-related tender evidence, and saves evidence and the page checkpoint in one SQLite transaction. Repeated source and reference pairs deduplicate. The review view evaluates source status and deadlines at read time. Manual review decisions are recorded separately. The source provides procurement intelligence. Available loads need independent evidence of availability.

The review queue currently lives in SQLite. A future sync path needs a private ingest identity, payload and timestamp validation, durable replay and idempotency enforcement, and transactional updates. The existing Hatchable admin endpoints require administrator identity. Customer and driver identity and tenant ownership must be designed together before those portals are exposed.

## Costing boundary

Trip economics use explicit operator inputs in ZAR. Backhaul compares compatible, verified loads against the empty return using supplied route distances, vehicle capacity and time windows. Dashboard integration and actual trip financials remain open.
