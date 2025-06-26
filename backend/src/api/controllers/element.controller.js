const { neo4jDriver } = require('../../config/database');

const getAllElements = async (req, res, next) => {
    const session = neo4jDriver.session();

    try {
        const result = await session.run(
            'MATCH (n:Element) RETURN n ORDER BY n.name'
        );

        const elements = result.records.map(record => ({
            ...record.get('n').properties,
            labels: record.get('n').labels,
        }));

        res.json({ elements });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const getElementById = async (req, res, next) => {
    const session = neo4jDriver.session();
    const { id } = req.params;

    try {
        const result = await session.run(
            'MATCH (n:Element {id: $id}) RETURN n',
            { id }
        );

        if (result.records.length === 0) {
            return res.status(404).json({ error: 'Element not found' });
        }

        const element = {
            ...result.records[0].get('n').properties,
            labels: result.records[0].get('n').labels,
        };

        res.json({ element });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const createElement = async (req, res, next) => {
    const session = neo4jDriver.session();
    const { type, name, properties = {} } = req.body;

    try {
        const id = `${type.toLowerCase()}_${Date.now()}`;

        const result = await session.run(
            `CREATE (n:Element:${type} $props) RETURN n`,
            {
                props: {
                    id,
                    name,
                    ...properties,
                    created_at: new Date().toISOString(),
                },
            }
        );

        const element = {
            ...result.records[0].get('n').properties,
            labels: result.records[0].get('n').labels,
        };

        res.status(201).json({ element });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const updateElement = async (req, res, next) => {
    const session = neo4jDriver.session();
    const { id } = req.params;
    const updates = req.body;

    try {
        const result = await session.run(
            `MATCH (n:Element {id: $id})
       SET n += $updates
       SET n.updated_at = $updated_at
       RETURN n`,
            {
                id,
                updates,
                updated_at: new Date().toISOString(),
            }
        );

        if (result.records.length === 0) {
            return res.status(404).json({ error: 'Element not found' });
        }

        const element = {
            ...result.records[0].get('n').properties,
            labels: result.records[0].get('n').labels,
        };

        res.json({ element });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const deleteElement = async (req, res, next) => {
    const session = neo4jDriver.session();
    const { id } = req.params;

    try {
        const result = await session.run(
            'MATCH (n:Element {id: $id}) DELETE n RETURN count(n) as deleted',
            { id }
        );

        const deleted = result.records[0].get('deleted').toNumber();

        if (deleted === 0) {
            return res.status(404).json({ error: 'Element not found' });
        }

        res.json({ message: 'Element deleted successfully' });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

module.exports = {
    getAllElements,
    getElementById,
    createElement,
    updateElement,
    deleteElement,
};