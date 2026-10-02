ALTER TABLE shipments RENAME COLUMN delivered_at TO closed_at;
ALTER TABLE shipments ADD COLUMN polled_at timestamptz;
ALTER TABLE shipments ADD COLUMN cancel_note text NOT NULL DEFAULT '';
CREATE INDEX shipments_active ON shipments(shipping_status) WHERE shipping_status IN ('created','picked_up','in_transit','delivery_failed','returning');
