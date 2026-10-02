CREATE UNIQUE INDEX shipments_carrier_code_uniq ON shipments(carrier, carrier_code) WHERE carrier_code IS NOT NULL;
