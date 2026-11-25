-- Run only in a dedicated NEXUS Supabase project.
BEGIN;
CREATE SCHEMA IF NOT EXISTS nexus_customer;
REVOKE ALL ON SCHEMA nexus_customer FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA nexus_customer TO authenticated, service_role;

CREATE TABLE nexus_customer.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE nexus_customer.memberships (
  organization_id uuid REFERENCES nexus_customer.organizations ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  PRIMARY KEY (user_id,organization_id)
);
CREATE TABLE nexus_customer.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE DEFAULT auth.uid(),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE nexus_customer.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES nexus_customer.organizations,
  reference text NOT NULL CHECK (char_length(reference) BETWEEN 1 AND 120),
  status text NOT NULL CHECK (status IN ('scheduled','collected','in_transit','delivered','cancelled')),
  status_at timestamptz NOT NULL,
  UNIQUE (organization_id,reference)
);
CREATE TABLE nexus_customer.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES nexus_customer.organizations,
  reference text NOT NULL CHECK (char_length(reference) BETWEEN 1 AND 120),
  published_at timestamptz NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 0 AND 1000000000000),
  UNIQUE (organization_id,reference)
);
CREATE TABLE nexus_customer.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES nexus_customer.organizations,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  object_name text NOT NULL UNIQUE CHECK (split_part(object_name,'/',1)=organization_id::text),
  published_at timestamptz NOT NULL
);
ALTER TABLE nexus_customer.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_customer.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_customer.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_customer.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_customer.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_customer.documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA nexus_customer FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA nexus_customer TO authenticated;
GRANT INSERT(display_name), UPDATE(display_name) ON nexus_customer.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nexus_customer TO service_role;

CREATE POLICY select_profile ON nexus_customer.profiles FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY insert_profile ON nexus_customer.profiles FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()));
CREATE POLICY update_profile ON nexus_customer.profiles FOR UPDATE TO authenticated
  USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
CREATE POLICY select_membership ON nexus_customer.memberships FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY select_organization ON nexus_customer.organizations FOR SELECT TO authenticated
  USING (id IN (SELECT organization_id FROM nexus_customer.memberships));
CREATE POLICY select_shipment ON nexus_customer.shipments FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM nexus_customer.memberships));
CREATE POLICY select_quotation ON nexus_customer.quotations FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM nexus_customer.memberships));
CREATE POLICY select_document ON nexus_customer.documents FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM nexus_customer.memberships));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('nexus-customer-documents','nexus-customer-documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png']);

-- Restrictive guard also prevents an unrelated permissive storage policy from exposing this bucket.
CREATE POLICY nexus_document_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (
  bucket_id <> 'nexus-customer-documents' OR EXISTS (
    SELECT 1 FROM nexus_customer.documents AS d WHERE d.object_name=storage.objects.name
  )
);
CREATE POLICY nexus_document_anon_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon
  USING (bucket_id <> 'nexus-customer-documents');
CREATE POLICY nexus_document_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='nexus-customer-documents' AND EXISTS (
    SELECT 1 FROM nexus_customer.documents AS d WHERE d.object_name=storage.objects.name
  )
);
CREATE POLICY nexus_document_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
  WITH CHECK (bucket_id <> 'nexus-customer-documents');
CREATE POLICY nexus_document_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
  USING (bucket_id <> 'nexus-customer-documents') WITH CHECK (bucket_id <> 'nexus-customer-documents');
CREATE POLICY nexus_document_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
  USING (bucket_id <> 'nexus-customer-documents');
COMMIT;
