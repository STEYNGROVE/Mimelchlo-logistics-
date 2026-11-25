INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO nexus_customer.organizations(id,name) VALUES
  ('10000000-0000-0000-0000-000000000001','Synthetic A'),('10000000-0000-0000-0000-000000000002','Synthetic B');
INSERT INTO nexus_customer.memberships VALUES
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
INSERT INTO nexus_customer.shipments(organization_id,reference,status,status_at) VALUES
  ('10000000-0000-0000-0000-000000000001','ONE','scheduled',now()),
  ('10000000-0000-0000-0000-000000000002','TWO','scheduled',now());
INSERT INTO nexus_customer.quotations(organization_id,reference,published_at,amount_cents) VALUES
  ('10000000-0000-0000-0000-000000000001','ONE',now(),10000),
  ('10000000-0000-0000-0000-000000000002','TWO',now(),10000);
INSERT INTO nexus_customer.documents(organization_id,title,object_name,published_at) VALUES
  ('10000000-0000-0000-0000-000000000001','Document A','10000000-0000-0000-0000-000000000001/a.pdf',now()),
  ('10000000-0000-0000-0000-000000000002','Document B','10000000-0000-0000-0000-000000000002/b.pdf',now());
INSERT INTO storage.objects VALUES
  ('nexus-customer-documents','10000000-0000-0000-0000-000000000001/a.pdf'),
  ('nexus-customer-documents','10000000-0000-0000-0000-000000000002/b.pdf'),
  ('nexus-customer-documents','10000000-0000-0000-0000-000000000001/unpublished.pdf'),
  ('unrelated','public.pdf');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
INSERT INTO nexus_customer.profiles(display_name) VALUES ('Synthetic A');
DO $$
BEGIN
  IF (SELECT array_agg(reference) FROM nexus_customer.shipments) IS DISTINCT FROM ARRAY['ONE']
    OR (SELECT array_agg(reference) FROM nexus_customer.quotations) IS DISTINCT FROM ARRAY['ONE']
    OR (SELECT array_agg(name) FROM nexus_customer.organizations) IS DISTINCT FROM ARRAY['Synthetic A']
    OR (SELECT array_agg(title) FROM nexus_customer.documents) IS DISTINCT FROM ARRAY['Document A']
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id='nexus-customer-documents') <> 1 THEN
    RAISE EXCEPTION 'Tenant A visibility mismatch';
  END IF;
  BEGIN
    INSERT INTO nexus_customer.memberships VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Customer granted access directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO storage.objects VALUES ('nexus-customer-documents','malicious.pdf');
    RAISE EXCEPTION 'Customer uploaded to managed bucket';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$
BEGIN
  IF (SELECT array_agg(reference) FROM nexus_customer.shipments) IS DISTINCT FROM ARRAY['TWO']
    OR (SELECT array_agg(reference) FROM nexus_customer.quotations) IS DISTINCT FROM ARRAY['TWO']
    OR (SELECT count(*) FROM nexus_customer.profiles) <> 0
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id='nexus-customer-documents') <> 1 THEN
    RAISE EXCEPTION 'Tenant B visibility mismatch';
  END IF;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='nexus-customer-documents') <> 0
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id='unrelated') <> 1 THEN
    RAISE EXCEPTION 'Anonymous storage isolation mismatch';
  END IF;
END $$;
RESET ROLE;
SELECT 'RLS and private storage isolation passed';
