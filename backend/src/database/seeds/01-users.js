const bcrypt = require('bcrypt');
const { pgPool } = require('../../config/database');

const seedUsers = async () => {
    console.log('Seeding users...');

    const users = [
        {
            email: 'admin@gridmonitor.com',
            password: 'admin123',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
        },
        {
            email: 'engineer@gridmonitor.com',
            password: 'engineer123',
            firstName: 'John',
            lastName: 'Engineer',
            role: 'engineer',
        },
        {
            email: 'operator@gridmonitor.com',
            password: 'operator123',
            firstName: 'Jane',
            lastName: 'Operator',
            role: 'operator',
        },
    ];

    for (const user of users) {
        const passwordHash = await bcrypt.hash(user.password, 10);

        try {
            await pgPool.query(
                `INSERT INTO auth.users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING`,
                [user.email, passwordHash, user.firstName, user.lastName, user.role]
            );
            console.log(`Created user: ${user.email}`);
        } catch (error) {
            console.error(`Error creating user ${user.email}:`, error.message);
        }
    }
};

module.exports = seedUsers;