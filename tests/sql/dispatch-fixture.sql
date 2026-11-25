CREATE TABLE nexus_fleet(id uuid PRIMARY KEY, payload_kg numeric, status text, odometer integer, service_at integer, licence_expiry date);
CREATE TABLE nexus_drivers(id uuid PRIMARY KEY, active boolean, licence_expiry date, prdp_expiry date);
CREATE TABLE nexus_shipments(id uuid PRIMARY KEY, status text, weight_kg numeric);
