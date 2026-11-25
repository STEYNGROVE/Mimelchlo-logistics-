CREATE TABLE IF NOT EXISTS nexus_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL CHECK (char_length(btrim(business_name)) BETWEEN 1 AND 160),
  evidence_url text NOT NULL CHECK (char_length(evidence_url) BETWEEN 8 AND 1500),
  evidence_summary text NOT NULL CHECK (char_length(btrim(evidence_summary)) BETWEEN 1 AND 1600),
  industry text NOT NULL CHECK (industry IN ('agriculture','mining','industrial','container','distribution','other')),
  location text NOT NULL CHECK (char_length(btrim(location)) BETWEEN 1 AND 140),
  requirement text NOT NULL CHECK (char_length(btrim(requirement)) BETWEEN 1 AND 1600),
  business_contact text CHECK (char_length(business_contact)<=200),
  contact_evidence text,
  estimate_cents bigint CHECK (estimate_cents BETWEEN 0 AND 1000000000000),
  valuation_evidence text,
  status text NOT NULL DEFAULT 'research' CHECK(status IN ('research','qualified','contacted','won','lost')),
  follow_up date,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (business_contact IS NULL OR nullif(btrim(contact_evidence),'') IS NOT NULL),
  CHECK (estimate_cents IS NULL OR nullif(btrim(valuation_evidence),'') IS NOT NULL),
  UNIQUE (business_name,evidence_url)
);
CREATE INDEX IF NOT EXISTS nexus_prospect_followup ON nexus_prospects(follow_up) WHERE follow_up IS NOT NULL;
