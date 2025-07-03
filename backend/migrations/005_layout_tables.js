exports.up = (pgm) => {
    // Create saved layouts table
    pgm.createTable({ schema: 'grid', name: 'saved_layouts' }, {
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
        layout_data: {
            type: 'jsonb',
            notNull: true,
        },
        created_by: {
            type: 'uuid',
            notNull: true,
            references: { schema: 'auth', name: 'users' },
        },
        is_public: {
            type: 'boolean',
            default: false,
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
    });

    // Create indexes
    pgm.createIndex({ schema: 'grid', name: 'saved_layouts' }, 'created_by');
    pgm.createIndex({ schema: 'grid', name: 'saved_layouts' }, 'created_at');
};

exports.down = (pgm) => {
    pgm.dropTable({ schema: 'grid', name: 'saved_layouts' });
};