CREATE TABLE IF NOT EXISTS nexus_trailers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration text NOT NULL UNIQUE CHECK (char_length(registration) BETWEEN 1 AND 30),
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 80),
  payload_kg integer NOT NULL CHECK (payload_kg BETWEEN 1 AND 100000),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS nexus_dispatch_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  policy_reference text,
  CHECK(NOT enabled OR nullif(btrim(policy_reference),'') IS NOT NULL)
);
INSERT INTO nexus_dispatch_control(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS nexus_dispatch_evidence (
  resource_type text NOT NULL CHECK (resource_type IN ('vehicle','trailer','driver','shipment')),
  resource_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('roadworthiness','insurance','driver_file','load_release')),
  reference text NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 300),
  verified_at timestamptz NOT NULL,
  valid_until date NOT NULL,
  recorded_by text NOT NULL,
  PRIMARY KEY(resource_type,resource_id,kind)
);
CREATE TABLE IF NOT EXISTS nexus_dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES nexus_shipments,
  vehicle_id uuid NOT NULL REFERENCES nexus_fleet,
  trailer_id uuid NOT NULL REFERENCES nexus_trailers,
  driver_id uuid NOT NULL REFERENCES nexus_drivers,
  departure timestamptz NOT NULL,
  expected_return timestamptz NOT NULL CHECK (expected_return > departure),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','dispatched','collected','delivered','closed','cancelled')),
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nexus_dispatch_shipment_open ON nexus_dispatch_jobs(shipment_id) WHERE status NOT IN ('closed','cancelled');
CREATE UNIQUE INDEX IF NOT EXISTS nexus_dispatch_vehicle_open ON nexus_dispatch_jobs(vehicle_id) WHERE status NOT IN ('closed','cancelled');
CREATE UNIQUE INDEX IF NOT EXISTS nexus_dispatch_trailer_open ON nexus_dispatch_jobs(trailer_id) WHERE status NOT IN ('closed','cancelled');
CREATE UNIQUE INDEX IF NOT EXISTS nexus_dispatch_driver_open ON nexus_dispatch_jobs(driver_id) WHERE status NOT IN ('closed','cancelled');
CREATE TABLE IF NOT EXISTS nexus_dispatch_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES nexus_dispatch_jobs,
  event text NOT NULL,
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL,
  UNIQUE(job_id,version)
);

CREATE OR REPLACE FUNCTION nexus_verify_dispatch(
  shipment uuid, vehicle uuid, trailer uuid, driver uuid, until_time timestamptz
) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE must_be_valid_through date := (until_time AT TIME ZONE 'Africa/Johannesburg')::date;
BEGIN
  -- A shared lock serializes emergency disabling with new departures.
  PERFORM 1 FROM nexus_dispatch_control WHERE singleton AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispatch is disabled' USING ERRCODE='P0001'; END IF;
  IF until_time <= now() THEN RAISE EXCEPTION 'Invalid booking window' USING ERRCODE='P0001'; END IF;
  PERFORM 1 FROM nexus_shipments WHERE id=shipment FOR SHARE;
  PERFORM 1 FROM nexus_fleet WHERE id=vehicle FOR SHARE;
  PERFORM 1 FROM nexus_trailers WHERE id=trailer FOR SHARE;
  PERFORM 1 FROM nexus_drivers WHERE id=driver FOR SHARE;
  IF NOT EXISTS (
    SELECT FROM nexus_shipments s,nexus_fleet v,nexus_trailers t,nexus_drivers d
    WHERE s.id=shipment AND v.id=vehicle AND t.id=trailer AND d.id=driver
      AND s.status IN ('quoted','approved') AND s.weight_kg>0 AND s.weight_kg<=least(v.payload_kg,t.payload_kg)
      AND v.status='available' AND v.odometer<v.service_at AND t.active AND d.active
      AND least(v.licence_expiry,d.licence_expiry,d.prdp_expiry)>=must_be_valid_through
  ) THEN RAISE EXCEPTION 'Vehicle, load or driver failed readiness checks' USING ERRCODE='P0001'; END IF;

  PERFORM 1 FROM nexus_dispatch_evidence
    WHERE (resource_type,resource_id,kind) IN (('vehicle',vehicle,'roadworthiness'),('vehicle',vehicle,'insurance'),
      ('trailer',trailer,'roadworthiness'),('driver',driver,'driver_file'),('shipment',shipment,'load_release'))
      AND verified_at<=now() AND valid_until>=must_be_valid_through FOR SHARE;
  IF (SELECT count(*) FROM nexus_dispatch_evidence
    WHERE (resource_type,resource_id,kind) IN (('vehicle',vehicle,'roadworthiness'),('vehicle',vehicle,'insurance'),
      ('trailer',trailer,'roadworthiness'),('driver',driver,'driver_file'),('shipment',shipment,'load_release'))
      AND verified_at<=now() AND valid_until>=must_be_valid_through) <> 5 THEN
    RAISE EXCEPTION 'Verified evidence is missing or expired' USING ERRCODE='P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION nexus_reserve_dispatch(
  shipment uuid, vehicle uuid, trailer uuid, driver uuid, starts timestamptz, ends timestamptz, by_actor text
) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE job uuid;
BEGIN
  IF starts<now() OR starts>=ends OR starts IS NULL OR ends IS NULL OR nullif(btrim(by_actor),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid booking input' USING ERRCODE='P0001';
  END IF;
  PERFORM nexus_verify_dispatch(shipment,vehicle,trailer,driver,ends);
  INSERT INTO nexus_dispatch_jobs(shipment_id,vehicle_id,trailer_id,driver_id,departure,expected_return)
    VALUES(shipment,vehicle,trailer,driver,starts,ends) RETURNING id INTO job;
  INSERT INTO nexus_dispatch_audit(job_id,event,actor,version) VALUES(job,'reserved',by_actor,0);
  RETURN job;
END $$;

CREATE OR REPLACE FUNCTION nexus_transition_dispatch(job_id uuid,next_state text,expected integer,by_actor text)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE job nexus_dispatch_jobs;
BEGIN
  SELECT * INTO job FROM nexus_dispatch_jobs WHERE id=job_id FOR UPDATE;
  IF NOT FOUND OR job.version IS DISTINCT FROM expected OR nullif(btrim(by_actor),'') IS NULL OR NOT coalesce((
      (job.status='reserved' AND next_state IN ('dispatched','cancelled')) OR
      (job.status='dispatched' AND next_state='collected') OR
      (job.status='collected' AND next_state='delivered') OR
      (job.status='delivered' AND next_state='closed')
    ),false) THEN RAISE EXCEPTION 'Invalid or stale state transition' USING ERRCODE='P0001'; END IF;
  IF next_state='dispatched' THEN
    PERFORM nexus_verify_dispatch(job.shipment_id,job.vehicle_id,job.trailer_id,job.driver_id,job.expected_return);
  END IF;
  UPDATE nexus_dispatch_jobs SET status=next_state,version=version+1 WHERE id=job.id;
  INSERT INTO nexus_dispatch_audit(job_id,event,actor,version) VALUES(job.id,next_state,by_actor,job.version+1);
  RETURN job.version+1;
END $$;
