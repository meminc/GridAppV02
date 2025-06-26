const { neo4jDriver } = require('../../config/database');

const seedTopology = async () => {
    console.log('Seeding topology...');

    const session = neo4jDriver.session();

    try {
        // Clear existing data
        await session.run('MATCH (n) DETACH DELETE n');

        // Create buses
        const buses = [
            { id: 'bus_1', name: 'Main Station', voltage_level: 220 },
            { id: 'bus_2', name: 'North Substation', voltage_level: 110 },
            { id: 'bus_3', name: 'South Substation', voltage_level: 110 },
            { id: 'bus_4', name: 'Industrial Zone', voltage_level: 33 },
            { id: 'bus_5', name: 'Residential Area', voltage_level: 11 },
        ];

        for (const bus of buses) {
            await session.run(
                'CREATE (b:Element:Bus {id: $id, name: $name, voltage_level: $voltage_level, status: "active"})',
                bus
            );
            console.log(`Created bus: ${bus.name}`);
        }

        // Create generators
        const generators = [
            { id: 'gen_1', name: 'Main Generator', bus_id: 'bus_1', capacity: 150, output: 120 },
            { id: 'gen_2', name: 'Backup Generator', bus_id: 'bus_1', capacity: 100, output: 0 },
            { id: 'gen_3', name: 'Solar Farm', bus_id: 'bus_3', capacity: 50, output: 35 },
        ];

        for (const gen of generators) {
            await session.run(
                `MATCH (b:Bus {id: $bus_id})
         CREATE (g:Element:Generator {
           id: $id, 
           name: $name, 
           capacity: $capacity, 
           output: $output, 
           status: $status
         })
         CREATE (g)-[:CONNECTED_TO]->(b)`,
                { ...gen, status: gen.output > 0 ? 'active' : 'standby' }
            );
            console.log(`Created generator: ${gen.name}`);
        }

        // Create loads
        const loads = [
            { id: 'load_1', name: 'Industrial Load', bus_id: 'bus_4', demand: 45, priority: 'high' },
            { id: 'load_2', name: 'Residential Load', bus_id: 'bus_5', demand: 25, priority: 'medium' },
            { id: 'load_3', name: 'Commercial Load', bus_id: 'bus_5', demand: 15, priority: 'low' },
        ];

        for (const load of loads) {
            await session.run(
                `MATCH (b:Bus {id: $bus_id})
         CREATE (l:Element:Load {
           id: $id, 
           name: $name, 
           demand: $demand, 
           priority: $priority,
           status: "active"
         })
         CREATE (l)-[:CONNECTED_TO]->(b)`,
                load
            );
            console.log(`Created load: ${load.name}`);
        }

        // Create lines
        const lines = [
            { id: 'line_1', name: 'Main-North Line', from: 'bus_1', to: 'bus_2', capacity: 100 },
            { id: 'line_2', name: 'Main-South Line', from: 'bus_1', to: 'bus_3', capacity: 100 },
            { id: 'line_3', name: 'North-Industrial Line', from: 'bus_2', to: 'bus_4', capacity: 50 },
            { id: 'line_4', name: 'South-Residential Line', from: 'bus_3', to: 'bus_5', capacity: 50 },
        ];

        for (const line of lines) {
            await session.run(
                `MATCH (from:Bus {id: $from}), (to:Bus {id: $to})
         CREATE (l:Element:Line {
           id: $id, 
           name: $name, 
           capacity: $capacity,
           from_bus: $from,
           to_bus: $to,
           status: "active"
         })
         CREATE (from)-[:CONNECTED_BY {line_id: $id}]->(to)
         CREATE (to)-[:CONNECTED_BY {line_id: $id}]->(from)`,
                line
            );
            console.log(`Created line: ${line.name}`);
        }

        // Create transformers
        const transformers = [
            { id: 'tr_1', name: 'Main Transformer', bus_id: 'bus_1', rating: 200, tap_ratio: 1.0 },
            { id: 'tr_2', name: 'North Transformer', bus_id: 'bus_2', rating: 100, tap_ratio: 0.98 },
        ];

        for (const transformer of transformers) {
            await session.run(
                `MATCH (b:Bus {id: $bus_id})
         CREATE (t:Element:Transformer {
           id: $id, 
           name: $name, 
           rating: $rating, 
           tap_ratio: $tap_ratio,
           status: "active"
         })
         CREATE (t)-[:CONNECTED_TO]->(b)`,
                transformer
            );
            console.log(`Created transformer: ${transformer.name}`);
        }

        console.log('Topology seeding completed');
    } catch (error) {
        console.error('Error seeding topology:', error);
        throw error;
    } finally {
        await session.close();
    }
};

module.exports = seedTopology;