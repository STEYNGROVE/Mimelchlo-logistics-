# NEXUS commercial integration

## Operational scope

The English and Afrikaans public Pages site accepts user-initiated enquiry submissions. Download remains available. Static assets bypass Pages Functions. Intake stores a validated request in a separate D1 database for each environment and returns an opaque reference. The production relay reads only enquiry records, in insertion order, using a dedicated server credential. The private Hatchable CRM imports them in bounded, retryable batches. It remains on the existing collaborator-only project. No browser on the public site receives the relay credential or the private service address.

The CRM displays lead status, cargo and customer requirements, follow-up dates, enquiry source, and counts by source and status. Staff can enter operating costs and verified cargo details, preserve quote drafts, then approve an internal draft. Approval sends no message and creates no booking, invoice or payment. Customer-submitted distance is advisory. Staff record the distance source and cargo verification before saving a quote. The dashboard counts outcomes manually recorded by staff. There are no visitor cookies, advertising pixels, or individual click trails.

## Operator workflow

1. Sign in to the existing NEXUS Hatchable project and open the private commercial page at `/commercial.html`.
2. Use **Import public enquiries** to process up to 30 submissions. Repeat until the import reports zero. An hourly scheduler also imports batches. Review statuses, follow-up dates and the daily operations snapshot.
3. Confirm collection, delivery, cargo, vehicle capacities and route restrictions. Record the source and rationale for the distance entered.
4. Save an internal draft, review its totals and approve only after the actual commercial and operating conditions are checked.
5. Retain or remove submitted personal data according to the owner's approved policy across the D1 inbox and Hatchable CRM. Review access and rotate the intake relay credential as part of routine operations.

## Consolidated owner checklist

- [ ] Confirm which staff should have Hatchable administrator access and agree a retention and deletion policy for the intake inbox and CRM.
- [ ] Approve the monitored business telephone, reply channel and permitted follow-up procedures. Provide evidence of ownership and authorize any later automated communication separately.
- [ ] Supply an authorized routing API account, its terms and hard budget limits. Confirm a heavy-vehicle routing source that covers South Africa and required restrictions.
- [ ] Choose the customer identity plane and provide test identities, shipment ownership mappings, document repositories and access rules. Keep the existing staff project private.
- [ ] Confirm free AI capacity and a hard spending ceiling before enabling model requests. Keep financial estimates and operational checks deterministic.
- [ ] Select a monitored private runtime for the existing Python freight discovery importer and approved matching workflows. The Hatchable scheduler already runs enquiry imports, source reachability checks and internal follow-up and compliance counts.
- [ ] Approve verified freight sources, commercial qualification criteria, permitted acquisition channels and a policy for reviewing candidate matches before outreach.
- [ ] Supply fleet, driver, document and financial operational requirements, verified records and test accounts before activating production transport-management and SaaS workflows.
- [ ] Review the delivered Afrikaans commercial copy and prioritize further South African languages. Static and runtime phrase files can be added under `localization/`.
- [ ] Approve retention, recovery ownership, incident procedures and legal requirements covering customer data, insurance, commercial authorization and regulatory obligations.

## Deployment verification

The GitHub Actions public-site workflow tests the preview intake with a synthetic enquiry and retries the submission using the same reference. Production browser checks verify availability and rejection of invalid or cross-origin requests without sending a customer enquiry. The deploy record and evidence must be read from the corresponding workflow run. Preview and production databases are isolated.

A production synthetic test returned HTTP 201 on first submission and HTTP 200 with the same reference on retry. A staff import pulled one new lead, and the private CRM accepted a status and follow-up update. It rejected a load that exceeded the confirmed payload and produced an internally approved draft for R15,730 before tax. The synthetic lead and quote were removed from both stores. Anonymous CRM reads returned 401, member reads returned 403, and scheduler-only paths returned 404 publicly. The hourly import logged a successful actual run.

An isolated live Treasury discovery run consumed three pages, found zero matching records and retained a resumable checkpoint. SQLite integrity passed. Nine freight tests cover the existing Python importer and deterministic backhaul tools. The private daily health check observed Treasury HTTP 200; a reachability result does not establish source coverage or freight availability.

Production acquisition counts use only the submitted coarse campaign category and staff status. Read the [implementation register](IMPLEMENTATION_REGISTER.md) for remaining procurement, operational and SaaS scope.
