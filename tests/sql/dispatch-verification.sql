INSERT INTO nexus_fleet VALUES ('00000000-0000-0000-0000-000000000001',30000,'available',10,10000,current_date+90);
INSERT INTO nexus_drivers VALUES ('00000000-0000-0000-0000-000000000002',true,current_date+90,current_date+90);
INSERT INTO nexus_trailers(id,registration,category,payload_kg) VALUES ('00000000-0000-0000-0000-000000000003','TEST-ONLY','flatbed',20000);
INSERT INTO nexus_shipments VALUES ('00000000-0000-0000-0000-000000000004','quoted',15000);
DO $$
DECLARE
  vehicle uuid := '00000000-0000-0000-0000-000000000001';
  driver uuid := '00000000-0000-0000-0000-000000000002';
  trailer uuid := '00000000-0000-0000-0000-000000000003';
  shipment uuid := '00000000-0000-0000-0000-000000000004';
  job uuid;
  starts timestamptz := now()+interval '5 hours';
  ends timestamptz := now()+interval '10 hours';
BEGIN
  BEGIN
    PERFORM nexus_reserve_dispatch(shipment,vehicle,trailer,driver,starts,ends,'fixture');
    RAISE EXCEPTION 'Unexpected allowed reserve' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'Dispatch is disabled' THEN RAISE; END IF;
  END;
  UPDATE nexus_dispatch_control SET enabled=true,policy_reference='Synthetic test policy';
  BEGIN
    PERFORM nexus_reserve_dispatch(shipment,vehicle,trailer,driver,starts,ends,'fixture');
    RAISE EXCEPTION 'Unexpected allowed reserve' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'Verified evidence is missing or expired' THEN RAISE; END IF;
  END;
  INSERT INTO nexus_dispatch_evidence VALUES
    ('vehicle',vehicle,'roadworthiness','SYNTHETIC',now(),current_date+90,'fixture'),
    ('vehicle',vehicle,'insurance','SYNTHETIC',now(),current_date+90,'fixture'),
    ('trailer',trailer,'roadworthiness','SYNTHETIC',now(),current_date+90,'fixture'),
    ('driver',driver,'driver_file','SYNTHETIC',now(),current_date+90,'fixture'),
    ('shipment',shipment,'load_release','SYNTHETIC',now(),current_date+90,'fixture');
  job := nexus_reserve_dispatch(shipment,vehicle,trailer,driver,starts,ends,'fixture');
  BEGIN
    PERFORM nexus_reserve_dispatch(shipment,vehicle,trailer,driver,starts,ends,'fixture');
    RAISE EXCEPTION 'Duplicate reservation permitted' USING ERRCODE='XX000';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM nexus_transition_dispatch(job,'delivered',0,'fixture');
    RAISE EXCEPTION 'Skipped transition permitted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
  UPDATE nexus_dispatch_control SET enabled=false;
  BEGIN
    PERFORM nexus_transition_dispatch(job,'dispatched',0,'fixture');
    RAISE EXCEPTION 'Kill switch ignored' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'Dispatch is disabled' THEN RAISE; END IF;
  END;
  PERFORM nexus_transition_dispatch(job,'cancelled',0,'fixture');
  IF (SELECT count(*) FROM nexus_dispatch_audit WHERE job_id=job)<>2 THEN RAISE EXCEPTION 'Audit mismatch'; END IF;
END $$;
SELECT 'Dispatch checks passed';
