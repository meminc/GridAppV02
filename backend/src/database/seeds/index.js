const seedUsers = require('./01-users');
const seedTopology = require('./02-topology');
const { pgPool, neo4jDriver } = require('../../config/database');

const runSeeds = async () => {
    try {
        console.log('Starting database seeding...');

        // Run seeds in order
        await seedUsers();
        await seedTopology();

        console.log('Database seeding completed successfully');
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    } finally {
        await pgPool.end();
        await neo4jDriver.close();
        process.exit(0);
    }
};

// Run if called directly
if (require.main === module) {
    runSeeds();
}

module.exports = runSeeds;