const { neo4jDriver } = require('../../config/database');

const seedTopology = async () => {
    console.log('Seeding topology...');

    const session = neo4jDriver.session();

    try {
        // Clear existing data
        await session.run('MATCH (n) DETACH DELETE n');

        // Create buses
        const buses = [
            { id: 'bus_1', name: 'Main Station', voltage_level: 220, x: 400, y: 200 },
            { id: 'bus_2', name: 'North Substation', voltage_level: 110, x: 200, y: 100 },
            { id: 'bus_3', name: 'South Substation', voltage_level: 110, x: 600, y: 100 },
            { id: 'bus_4', name: 'Industrial Zone', voltage_level: 33, x: 200, y: 400 },
            { id: 'bus_5', name: 'Residential Area', voltage_level: 11, x: 600, y: 400 },
        ];

        for (const bus of buses) {
            await session.run(
                `CREATE (b:Element:Bus {
          id: $id, 
          name: $name, 
          voltage_level: $voltage_level, 
          status: 'active',
          position: $position
        })`,
                {
                    ...bus,
                    position: JSON.stringify({ x: bus.x, y: bus.y })
                }
            );
            console.log(`Created bus: ${bus.name}`);
        }

        // Create generators connected to buses
        const generators = [
            { id: 'gen_1', name: 'Main Generator', bus_id: 'bus_1', capacity: 150, output: 120, x: 400, y: 50 },
            { id: 'gen_2', name: 'Backup Generator', bus_id: 'bus_1', capacity: 100, output: 0, x: 500, y: 200 },
            { id: 'gen_3', name: 'Solar Farm', bus_id: 'bus_3', capacity: 50, output: 35, x: 700, y: 100 },
        ];

        for (const gen of generators) {
            await session.run(
                `CREATE (g:Element:Generator {
          id: $id, 
          name: $name, 
          capacity: $capacity, 
          output: $output, 
          status: $status,
          position: $position,
          connected_bus: $bus_id
        })`,
                {
                    ...gen,
                    status: gen.output > 0 ? 'active' : 'standby',
                    position: JSON.stringify({ x: gen.x, y: gen.y })
                }
            );
            console.log(`Created generator: ${gen.name}`);
        }

        // Create loads connected to buses
        const loads = [
            { id: 'load_1', name: 'Industrial Load', bus_id: 'bus_4', demand: 45, priority: 'high', x: 100, y: 400 },
            { id: 'load_2', name: 'Residential Load', bus_id: 'bus_5', demand: 25, priority: 'medium', x: 600, y: 500 },
            { id: 'load_3', name: 'Commercial Load', bus_id: 'bus_5', demand: 15, priority: 'low', x: 700, y: 400 },
        ];

        for (const load of loads) {
            await session.run(
                `CREATE (l:Element:Load {
          id: $id, 
          name: $name, 
          demand: $demand, 
          priority: $priority,
          status: 'active',
          position: $position,
          connected_bus: $bus_id
        })`,
                {
                    ...load,
                    position: JSON.stringify({ x: load.x, y: load.y })
                }
            );
            console.log(`Created load: ${load.name}`);
        }

        // Create lines (as edge elements, not nodes)
        const lines = [
            { id: 'line_1', name: 'Main-North Line', from: 'bus_1', to: 'bus_2', capacity: 100 },
            { id: 'line_2', name: 'Main-South Line', from: 'bus_1', to: 'bus_3', capacity: 100 },
            { id: 'line_3', name: 'North-Industrial Line', from: 'bus_2', to: 'bus_4', capacity: 50 },
            { id: 'line_4', name: 'South-Residential Line', from: 'bus_3', to: 'bus_5', capacity: 50 },
        ];

        for (const line of lines) {
            await session.run(
                `CREATE (l:Element:Line {
          id: $id, 
          name: $name, 
          capacity: $capacity,
          from_bus: $from,
          to_bus: $to,
          status: 'active',
          resistance: 0.01,
          reactance: 0.05
        })`,
                line
            );
            console.log(`Created line: ${line.name}`);
        }

        // Create transformers (as edge elements)
        const transformers = [
            {
                id: 'tr_1',
                name: 'Step-down 220/110',
                from_bus: 'bus_1',
                to_bus: 'bus_2',
                rating: 200,
                tap_ratio: 0.5
            },
            {
                id: 'tr_2',
                name: 'Step-down 110/33',
                from_bus: 'bus_2',
                to_bus: 'bus_4',
                rating: 100,
                tap_ratio: 0.3
            },
        ];

        for (const transformer of transformers) {
            await session.run(
                `CREATE (t:Element:Transformer {
          id: $id, 
          name: $name, 
          rating: $rating, 
          tap_ratio: $tap_ratio,
          status: 'active',
          from_bus: $from_bus,
          to_bus: $to_bus,
          bus_id: $from_bus,
          secondary_bus_id: $to_bus
        })`,
                transformer
            );
            console.log(`Created transformer: ${transformer.name}`);
        }

        // Create connections for generators and loads to their buses
        await session.run(`
      MATCH (g:Generator)
      MATCH (b:Bus {id: g.connected_bus})
      CREATE (c:Element:Line {
        id: 'conn_' + g.id,
        name: g.name + ' Connection',
        from_bus: g.id,
        to_bus: b.id,
        capacity: g.capacity,
        status: 'active',
        connection_type: 'generator'
      })
    `);

        await session.run(`
      MATCH (l:Load)
      MATCH (b:Bus {id: l.connected_bus})
      CREATE (c:Element:Line {
        id: 'conn_' + l.id,
        name: l.name + ' Connection',
        from_bus: b.id,
        to_bus: l.id,
        capacity: l.demand * 1.2,
        status: 'active',
        connection_type: 'load'
      })
    `);

        console.log('Topology seeding completed');
    } catch (error) {
        console.error('Error seeding topology:', error);
        throw error;
    } finally {
        await session.close();
    }
};

module.exports = seedTopology;