# Security audit

## Verified technical controls

- All six Hatchable V5 business endpoints declared `admin` access in the deployment manifest. Signed-out requests independently returned HTTP 401. The app root returned HTTP 302. Authenticated authorization for collaborator roles and customer or driver ownership was outside the verified test set.
- Cloudflare Pages returned the deployed CSP and frame protection headers over HTTPS. Build output is confined to `public/`.
- SQLite uses bound parameters, a single importer lock per database, transactional checkpoints, source identity uniqueness, and private on-device paths. The review CLI uses the operating-system identity. It lacks distinct reviewer identities. No private SQLite files were committed.

## Outstanding controls

Scoped synchronization credentials, revocation, replay prevention, tenant isolation, ingress rate limiting, role matrix tests, backup encryption independent of device storage, retention enforcement, privacy rights workflows, dependency automation and incident drills remain open. The device backup is a point-in-time copy in the same private storage boundary. The importer-source retry throttle does not implement platform ingress rate limiting.

## Incident response

Once unauthorized access is suspected, suspend the affected credential or job, preserve access and database audit evidence, determine the records and identities affected, and coordinate notification with the responsible Information Officer. Restore from a validated private backup and verify privileged and anonymous access before restoring operation. Determine POPIA notification obligations from the facts and applicable law. [Protection of Personal Information Act](https://www.gov.za/documents/protection-personal-information-act)
