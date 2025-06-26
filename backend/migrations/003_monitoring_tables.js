exports.up = (pgm) => {
    // Create monitoring schema if not exists
    pgm.createSchema('monitoring', { ifNotExists: true });

    // Create alarms table
    pgm.createTable({ schema: 'monitoring', name: 'alarms' }, {
        id: {
            type: 'uuid',
            primaryKey: true,
            default: pgm.func('uuid_generate_v4()'),
        },
        element_id: {
            type: 'varchar(100)',
            notNull: true,
        },
        element_type: {
            type: 'varchar(50)',
            notNull: true,
        },
        alarm_type: {
            type: 'varchar(50)',
            notNull: true,
        },
        severity: {
            type: 'varchar(20)',
            notNull: true,
        },
        message: {
            type: 'text',
            notNull: true,
        },
        is_active: {
            type: 'boolean',
            default: true,
        },
        is_acknowledged: {
            type: 'boolean',
            default: false,
        },
        acknowledged_by: {
            type: 'uuid',
            references: { schema: 'auth', name: 'users' },
        },
        acknowledged_at: {
            type: 'timestamptz',
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
        resolved_at: {
            type: 'timestamptz',
        },
    });

    // Create indexes
    pgm.createIndex({ schema: 'monitoring', name: 'alarms' }, 'element_id');
    pgm.createIndex({ schema: 'monitoring', name: 'alarms' }, 'is_active');
    pgm.createIndex({ schema: 'monitoring', name: 'alarms' }, 'created_at');
};

exports.down = (pgm) => {
    pgm.dropTable({ schema: 'monitoring', name: 'alarms' });
};