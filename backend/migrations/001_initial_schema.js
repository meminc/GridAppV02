exports.up = (pgm) => {
    // Create auth schema and users table
    pgm.createSchema('auth', { ifNotExists: true });

    pgm.createTable({ schema: 'auth', name: 'users' }, {
        id: {
            type: 'uuid',
            primaryKey: true,
            default: pgm.func('uuid_generate_v4()'),
        },
        email: {
            type: 'varchar(255)',
            notNull: true,
            unique: true,
        },
        password_hash: {
            type: 'varchar(255)',
            notNull: true,
        },
        first_name: {
            type: 'varchar(100)',
        },
        last_name: {
            type: 'varchar(100)',
        },
        role: {
            type: 'varchar(50)',
            notNull: true,
            default: 'operator',
        },
        is_active: {
            type: 'boolean',
            default: true,
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
        updated_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
    },
        { ifNotExists: true });

    // Create grid schema and scenarios table
    pgm.createSchema('grid', { ifNotExists: true });

    pgm.createTable({ schema: 'grid', name: 'scenarios' }, {
        id: {
            type: 'uuid',
            primaryKey: true,
            default: pgm.func('uuid_generate_v4()'),
        },
        name: {
            type: 'varchar(255)',
            notNull: true,
        },
        description: {
            type: 'text',
        },
        owner_id: {
            type: 'uuid',
            references: { schema: 'auth', name: 'users' },
        },
        base_topology_version: {
            type: 'varchar(50)',
        },
        is_active: {
            type: 'boolean',
            default: true,
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
        updated_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
    }, { ifNotExists: true });

    // Create indexes
    pgm.createIndex({ schema: 'auth', name: 'users' }, 'email', {
        name: 'users_email_index',
        ifNotExists: true,
    }, {
        name: 'scenarios_owner_id_index',
        ifNotExists: true,
    });
    pgm.createIndex({ schema: 'grid', name: 'scenarios' }, 'owner_id');
};

exports.down = (pgm) => {
    pgm.dropTable({ schema: 'grid', name: 'scenarios' });
    pgm.dropTable({ schema: 'auth', name: 'users' });
    pgm.dropSchema('grid');
    pgm.dropSchema('auth');
};