CREATE TABLE IF NOT EXISTS commercial_relay_settings (
  singleton boolean PRIMARY KEY CHECK (singleton),
  token text NOT NULL CHECK (length(token)=64)
);
CREATE TABLE IF NOT EXISTS commercial_leads (
  reference uuid PRIMARY KEY,
  sequence bigint NOT NULL UNIQUE,
  received_at timestamptz NOT NULL,
  submission jsonb NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','qualified','won','lost')),
  follow_up date,
  revision integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS commercial_leads_status ON commercial_leads(status, received_at);
CREATE INDEX IF NOT EXISTS commercial_leads_follow_up ON commercial_leads(follow_up) WHERE follow_up IS NOT NULL;
CREATE TABLE IF NOT EXISTS commercial_quotes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference uuid NOT NULL REFERENCES commercial_leads(reference),
  terms jsonb NOT NULL,
  cost_cents bigint NOT NULL CHECK (cost_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents >= cost_cents),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
CREATE INDEX IF NOT EXISTS commercial_quotes_reference ON commercial_quotes(reference, id DESC);
