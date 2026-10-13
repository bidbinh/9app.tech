ALTER TABLE shipments ADD COLUMN payload_hash text NOT NULL DEFAULT '';
ALTER TABLE shipments ADD COLUMN offer jsonb;
ALTER TABLE shipments ADD COLUMN request jsonb;
