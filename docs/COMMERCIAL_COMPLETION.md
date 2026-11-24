# NEXUS commercial integration

## Operational scope

The public Pages site accepts user-initiated enquiry submissions. Download remains available. Static assets bypass Pages Functions. Intake stores a validated request in a separate D1 database for each environment and returns an opaque reference. The production relay reads only enquiry records, in insertion order, using a dedicated server credential. The private Hatchable CRM imports them in bounded, retryable batches. It remains on the existing collaborator-only project. No browser on the public site receives the relay credential or the private service address.

The CRM displays lead status, cargo and customer requirements, follow-up dates, enquiry source, and counts by source and status. Staff can enter operating costs and verified cargo details, preserve quote drafts, then approve an internal draft. Approval sends no message and creates no booking, invoice or payment. Customer-submitted distance is advisory. Staff record the distance source and cargo verification before saving a quote. The dashboard counts outcomes manually recorded by staff. There are no visitor cookies, advertising pixels, or individual click trails.

## Operator workflow

1. Sign in to the existing NEXUS Hatchable project and open the private commercial page at `/commercial.html`.
2. Use **Import public enquiries** to process up to 30 submissions. Repeat until the import reports zero. Review statuses and follow-up dates.
3. Confirm collection, delivery, cargo, vehicle capacities and route restrictions. Record the source and rationale for the distance entered.
4. Save an internal draft, review its totals and approve only after the actual commercial and operating conditions are checked.
5. Retain or remove submitted personal data according to the owner's approved policy across the D1 inbox and Hatchable CRM. Review access and rotate the intake relay credential as part of routine operations.

## Consolidated owner checklist

- [ ] Confirm which staff should have Hatchable administrator access and agree a retention and deletion policy for the intake inbox and CRM.
- [ ] Approve the monitored business telephone, reply channel and permitted follow-up procedures. Provide evidence of ownership and authorize any later automated communication separately.
- [ ] Supply an authorized routing API account, its terms and hard budget limits. Confirm a heavy-vehicle routing source that covers South Africa and required restrictions.
- [ ] Choose the customer identity plane and provide test identities, shipment ownership mappings, document repositories and access rules. Keep the existing staff project private.
- [ ] Confirm free AI capacity and a hard spending ceiling before enabling model requests. Keep financial estimates and operational checks deterministic.
- [ ] Confirm scheduler entitlement and a monitored private runtime for enquiry imports, freight discovery, source health and compliance alerts. Existing enquiry import is on demand and follow-up dates are stored for staff.
- [ ] Approve verified freight sources, commercial qualification criteria, permitted acquisition channels and a policy for reviewing candidate matches before outreach.
- [ ] Supply fleet, driver, document and financial operational requirements, verified records and test accounts before activating production transport-management and SaaS workflows.
- [ ] Arrange review of the full Afrikaans translation and prioritize further South African languages. The existing Afrikaans planning guide remains available.
- [ ] Approve retention, recovery ownership, incident procedures and legal requirements covering customer data, insurance, commercial authorization and regulatory obligations.

## Deployment verification

The GitHub Actions public-site workflow tests the preview intake with a synthetic enquiry and retries the submission using the same reference. Production browser checks verify availability and rejection of invalid or cross-origin requests without sending a customer enquiry. The deploy record and evidence must be read from the corresponding workflow run. Preview and production databases are isolated.

The previous freight discovery completion report and implementation registers are on `nexus/freight-discovery`. Freight source coverage, autonomous scheduling, direct customer acquisition, customer access and wider operating modules remain separate workstreams.
