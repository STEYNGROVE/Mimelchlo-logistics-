# Security audit

See the [commercial integration completion report and owner checklist](COMMERCIAL_COMPLETION.md) for current release evidence and owner actions.
## Verified technical controls

- All six Hatchable V5 business endpoints declared `admin` access in the deployment manifest. Signed-out requests independently returned HTTP 401. The app root returned HTTP 302. Authenticated authorization for collaborator roles and customer or driver ownership was outside the verified test set.
- Cloudflare Pages returned the deployed CSP and frame protection headers over HTTPS. Build output is confined to `public/`.
- SQLite uses bound parameters, a single importer lock per database, transactional checkpoints, source identity uniqueness, and private on-device paths. The review CLI uses the operating-system identity. It lacks distinct reviewer identities. No private SQLite files were committed.

- Commercial intake uses same-origin JSON, bounded payloads, pseudonymous rate limiting and idempotent receipts. The relay has a separately scoped credential and returns only intake rows. Member and anonymous CRM access were denied in deployed role checks.
- Preview and production data are isolated. Synthetic production leads and draft quotes used for end-to-end verification were removed after testing.

## Outstanding controls

Credential rotation drills, customer and driver tenant isolation and role tests, backup encryption independent of device storage, retention enforcement, privacy rights workflows, dependency automation and incident drills remain open. The device backup is a point-in-time copy in the same private storage boundary. The importer-source retry throttle does not implement platform ingress rate limiting.

## Incident response

Once unauthorized access is suspected, suspend the affected credential or job, preserve access and database audit evidence, determine the records and identities affected, and coordinate notification with the responsible Information Officer. Restore from a validated private backup and verify privileged and anonymous access before restoring operation. Determine POPIA notification obligations from the facts and applicable law. [Protection of Personal Information Act](https://www.gov.za/documents/protection-personal-information-act)
