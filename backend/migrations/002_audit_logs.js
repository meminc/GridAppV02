exports.up = (pgm) => {
    pgm.createTable({ schema: 'auth', name: 'audit_logs' }, {
        id: {
            type: 'uuid',
            primaryKey: true,
            default: pgm.func('uuid_generate_v4()'),
        },
        action: {
            type: 'varchar(100)',
            notNull: true,
        },
        user_id: {
            type: 'uuid',
            references: { schema: 'auth', name: 'users' },
        },
        entity_type: {
            type: 'varchar(50)',
        },
        entity_id: {
            type: 'varchar(100)',
        },
        changes: {
            type: 'jsonb',
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
    });

    pgm.createIndex({ schema: 'auth', name: 'audit_logs' }, 'user_id');
    pgm.createIndex({ schema: 'auth', name: 'audit_logs' }, 'entity_type');
    pgm.createIndex({ schema: 'auth', name: 'audit_logs' }, 'created_at');
};

exports.down = (pgm) => {
    pgm.dropTable({ schema: 'auth', name: 'audit_logs' });
};