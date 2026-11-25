# Infinity verification evidence

The [release and blocker register](INFINITY_COMPLETION.md) records scope, provider decisions and owner actions.

## Public production

- Canonical site [mimelchlo-logistics.pages.dev](https://mimelchlo-logistics.pages.dev/) returned HTTP 200. Cloudflare reported a successful deployment of `0a1fa108d798837e7dd72ba5e4b04b4bd5c21bae` at [its immutable deployment URL](https://30ff5e69.mimelchlo-logistics.pages.dev/).
- [Run 45534836540](https://github.com/STEYNGROVE/Mimelchlo-logistics-/actions/runs/45534836540) passed desktop and mobile Chromium with Lighthouse 13.6.0. Production scores were 99 mobile performance and 100 desktop performance. Accessibility, best practices and SEO each scored 100 on both.
- The deployed English, Afrikaans and account pages, provider scripts, service worker, styling and artwork matched release bytes. The original logo, derived brand asset, stylesheet and security headers match the baseline. CSP, frame denial and no-sniff headers were observed.
- Enquiry availability was true. Customer account, routing and AI availability were false. Chromium verified protected request handling and the Afrikaans portal's disabled state. No live identity credentials or provider request was exercised.
- Updated browser toolchain dependency audit reported zero vulnerabilities. Gitleaks reported no findings with redaction on the repository history.

## Private production

- Hatchable NEXUS v12 remained personal/private. The deployed procurement read succeeded as administrator, and a public call to the discovery scheduler route returned 404. The scheduler fired at 02:42 UTC on 25 November. It advanced the 23 November checkpoint to page 3. Two real pages had been processed, with zero freight candidates. The historical HTTP 500 persists at the tested page sizes. No page was skipped.
- Prospect evidence validation returned 400 for contact without authorization evidence. The fixture was accepted at 201, duplicate evidence returned 409, a follow-up update returned 200 and the stale update returned 409. The synthetic record was removed. A non-admin member was denied at 403.
- Dispatch readiness returned 200 to staff and 401 to anonymous callers. The disabled reservation returned 409. No real assignment, booking or dispatch was created.

## Local tests

- Eight Node tests passed for configuration, validation, durable usage caps, caching and simulated provider or session contracts.
- Thirteen Python freight and finance tests passed. The prior SQLite backup/restore test is included. The release run had nine Python freight tests before the local finance tools were added to the implementation branch.
- Isolated PostgreSQL verified two customer accounts against RLS and the private storage policies. A synthetic dispatch fixture verified missing evidence, resource conflicts, illegal transitions, shutdown and audit rows. These tests use synthetic records and do not establish live Supabase Auth, SMTP or operational compliance.
- A real production restore and a live two-customer account drill remain pending. No live records were exported to GitHub artifacts.
