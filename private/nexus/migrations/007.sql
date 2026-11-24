CREATE TABLE IF NOT EXISTS commercial_operational_checks (
  check_date date PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  treasury_health text NOT NULL,
  followups_due integer NOT NULL,
  fleet_alerts integer NOT NULL,
  driver_alerts integer NOT NULL
);
