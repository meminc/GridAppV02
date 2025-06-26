// Create uniqueness constraints
CREATE CONSTRAINT element_id_unique IF NOT EXISTS
FOR (n:Element) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT bus_name_unique IF NOT EXISTS
FOR (n:Bus) REQUIRE n.name IS UNIQUE;

// Create node key constraints
CREATE CONSTRAINT line_endpoints IF NOT EXISTS
FOR (l:Line) REQUIRE (l.from_bus, l.to_bus) IS NODE KEY;

// Create indexes for performance
CREATE INDEX element_type_index IF NOT EXISTS
FOR (n:Element) ON (n.type);

CREATE INDEX bus_voltage_level IF NOT EXISTS
FOR (n:Bus) ON (n.voltage_level);

CREATE INDEX element_status IF NOT EXISTS
FOR (n:Element) ON (n.status);