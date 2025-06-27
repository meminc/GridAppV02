exports.up = (pgm) => {
    // Add missing columns to users table
    pgm.addColumns({ schema: 'auth', name: 'users' }, {
        email_verified: {
            type: 'boolean',
            default: false,
            notNull: true,
        },
        verification_token: {
            type: 'varchar(255)',
            unique: true,
        },
        password_reset_token: {
            type: 'varchar(255)',
        },
        password_reset_expires: {
            type: 'timestamptz',
        },
        last_login_at: {
            type: 'timestamptz',
        },
        password_changed_at: {
            type: 'timestamptz',
        },
    });

    // Create refresh tokens table
    pgm.createTable({ schema: 'auth', name: 'refresh_tokens' }, {
        id: {
            type: 'uuid',
            primaryKey: true,
            default: pgm.func('uuid_generate_v4()'),
        },
        user_id: {
            type: 'uuid',
            notNull: true,
            references: { schema: 'auth', name: 'users' },
            onDelete: 'CASCADE',
        },
        token: {
            type: 'varchar(255)',
            notNull: true,
            unique: true,
        },
        expires_at: {
            type: 'timestamptz',
            notNull: true,
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
        revoked_at: {
            type: 'timestamptz',
        },
    });

    // Create sessions table for additional security
    pgm.createTable({ schema: 'auth', name: 'sessions' }, {
        id: {
            type: 'uuid',
            primaryKey: true,
            default: pgm.func('uuid_generate_v4()'),
        },
        user_id: {
            type: 'uuid',
            notNull: true,
            references: { schema: 'auth', name: 'users' },
            onDelete: 'CASCADE',
        },
        ip_address: {
            type: 'inet',
        },
        user_agent: {
            type: 'text',
        },
        last_activity: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
    });

    // Create password history table
    pgm.createTable({ schema: 'auth', name: 'password_history' }, {
        id: {
            type: 'uuid',
            primaryKey: true,
            default: pgm.func('uuid_generate_v4()'),
        },
        user_id: {
            type: 'uuid',
            notNull: true,
            references: { schema: 'auth', name: 'users' },
            onDelete: 'CASCADE',
        },
        password_hash: {
            type: 'varchar(255)',
            notNull: true,
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
    });

    // Create indexes
    pgm.createIndex({ schema: 'auth', name: 'refresh_tokens' }, 'user_id');
    pgm.createIndex({ schema: 'auth', name: 'refresh_tokens' }, 'token');
    pgm.createIndex({ schema: 'auth', name: 'refresh_tokens' }, 'expires_at');
    pgm.createIndex({ schema: 'auth', name: 'sessions' }, 'user_id');
    pgm.createIndex({ schema: 'auth', name: 'password_history' }, 'user_id');
};

exports.down = (pgm) => {
    pgm.dropTable({ schema: 'auth', name: 'password_history' });
    pgm.dropTable({ schema: 'auth', name: 'sessions' });
    pgm.dropTable({ schema: 'auth', name: 'refresh_tokens' });

    pgm.dropColumns({ schema: 'auth', name: 'users' }, [
        'email_verified',
        'verification_token',
        'password_reset_token',
        'password_reset_expires',
        'last_login_at',
        'password_changed_at',
    ]);
};