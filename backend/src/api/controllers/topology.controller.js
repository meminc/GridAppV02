const { neo4jDriver, pgPool } = require('../../config/database');
const auditService = require('../../services/audit.service');

const getTopology = async (req, res, next) => {
    const session = neo4jDriver.session();

    try {
        // Get all nodes (excluding Lines and Transformers as they are edges)
        const nodesResult = await session.run(`
      MATCH (n:Element)
      WHERE NOT n:Line AND NOT n:Transformer
      RETURN n, labels(n) as labels
      ORDER BY n.type, n.name
    `);

        const nodes = nodesResult.records.map(record => {
            const node = record.get('n').properties;
            const labels = record.get('labels');
            return {
                id: node.id,
                name: node.name || node.id,
                type: labels.find(l => l !== 'Element') || 'Unknown',
                properties: node,
                position: node.position ? JSON.parse(node.position) : null,
            };
        });

        // Get all connections (Lines and Transformers as edges)
        const edgesResult = await session.run(`
      MATCH (n)
      WHERE n:Line OR n:Transformer
      RETURN n, labels(n) as labels
    `);

        const edges = edgesResult.records.map(record => {
            const element = record.get('n').properties;
            const labels = record.get('labels');
            const type = labels.find(l => l !== 'Element');

            return {
                id: element.id,
                source: element.from_bus || element.bus_id,
                target: element.to_bus || element.secondary_bus_id,
                type: type,
                name: element.name || element.id,
                properties: {
                    ...element,
                    elementType: type,
                },
            };
        }).filter(edge => edge.source && edge.target); // Only include edges with valid connections

        res.json({ nodes, edges });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const getTopologyStats = async (req, res, next) => {
    const session = neo4jDriver.session();

    try {
        const statsResult = await session.run(`
    MATCH (n:Element)
    WHERE NOT n:Line AND NOT n:Transformer
    WITH count(n) as totalNodes,
        sum(CASE WHEN n.status = 'active' THEN 1 ELSE 0 END) as activeNodes

    MATCH (g:Generator)
    WHERE g.status = 'active'
    WITH totalNodes, activeNodes,
        sum(g.output) as totalGeneration

    MATCH (l:Load)
    WHERE l.status = 'active'
    WITH totalNodes, activeNodes, totalGeneration,
        sum(l.demand) as totalLoad

    MATCH (line:Line)
    WHERE line.status = 'active'
    WITH totalNodes, activeNodes, totalGeneration, totalLoad,
        count(line) as activeLines

    MATCH (tr:Transformer)
    WHERE tr.status = 'active'
    WITH totalNodes, activeNodes, totalGeneration, totalLoad, activeLines,
        count(tr) as activeTransformers

    RETURN totalNodes, activeNodes,
        coalesce(totalGeneration, 0) as totalGeneration,
        coalesce(totalLoad, 0) as totalLoad,
        (activeLines + activeTransformers) as activeConnections
    `);

        const stats = statsResult.records[0] || {
            totalNodes: 0,
            activeNodes: 0,
            totalGeneration: 0,
            totalLoad: 0,
            activeConnections: 0,
        };

        res.json({
            totalElements: stats.get('totalNodes').toNumber(),
            activeElements: stats.get('activeNodes').toNumber(),
            totalGeneration: stats.get('totalGeneration'),
            totalLoad: stats.get('totalLoad'),
            activeConnections: stats.get('activeConnections').toNumber(),
        });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const getSubgraph = async (req, res, next) => {
    const session = neo4jDriver.session();
    const { nodeId } = req.params;
    const depth = parseInt(req.query.depth) || 2;

    try {
        const result = await session.run(`
      MATCH path = (start:Element {id: $nodeId})-[*0..${depth}]-(connected:Element)
      WITH collect(distinct connected) as nodes,
           collect(distinct relationships(path)) as rels
      UNWIND nodes as node
      WITH node, rels
      RETURN collect(distinct node) as nodes, rels
    `, { nodeId });

        if (result.records.length === 0) {
            return res.status(404).json({ error: 'Node not found' });
        }

        const nodes = result.records[0].get('nodes').map(node => ({
            id: node.properties.id,
            name: node.properties.name || node.properties.id,
            type: node.labels.find(l => l !== 'Element') || 'Unknown',
            properties: node.properties,
        }));

        // Process relationships
        const edges = [];
        const rels = result.records[0].get('rels');
        rels.forEach(relArray => {
            relArray.forEach(rel => {
                if (rel.start && rel.end) {
                    edges.push({
                        id: rel.properties.line_id || `${rel.start}-${rel.end}`,
                        source: rel.start.toString(),
                        target: rel.end.toString(),
                        type: rel.type,
                        properties: rel.properties || {},
                    });
                }
            });
        });

        res.json({ nodes, edges: [...new Set(edges)] });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const updateTopology = async (req, res, next) => {
    const session = neo4jDriver.session();
    const { nodes, edges } = req.body;

    try {
        await session.writeTransaction(async (tx) => {
            // Update node positions
            if (nodes) {
                for (const node of nodes) {
                    await tx.run(`
            MATCH (n:Element {id: $id})
            SET n.position = $position
          `, {
                        id: node.id,
                        position: JSON.stringify(node.position),
                    });
                }
            }

            // Log the update
            await auditService.log(
                'TOPOLOGY_UPDATED',
                req.user.id,
                'topology',
                null,
                { nodeCount: nodes?.length || 0 }
            );
        });

        res.json({ message: 'Topology updated successfully' });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const saveLayout = async (req, res, next) => {
    const { name, description, layout } = req.body;
    const userId = req.user.id;

    try {
        const result = await pgPool.query(`
      INSERT INTO grid.saved_layouts (name, description, layout_data, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, description, JSON.stringify(layout), userId]);

        res.status(201).json({ layout: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

const getLayouts = async (req, res, next) => {
    try {
        const result = await pgPool.query(`
      SELECT l.*, u.first_name, u.last_name
      FROM grid.saved_layouts l
      JOIN auth.users u ON l.created_by = u.id
      ORDER BY l.created_at DESC
    `);

        res.json({ layouts: result.rows });
    } catch (error) {
        next(error);
    }
};

const createConnection = async (req, res, next) => {
    const session = neo4jDriver.session();
    const { sourceId, targetId, type, properties = {} } = req.body;

    try {
        const connectionId = `${type.toLowerCase()}_${Date.now()}`;

        let query;
        if (type === 'Line') {
            query = `
        MATCH (source:Bus {id: $sourceId})
        MATCH (target:Bus {id: $targetId})
        CREATE (line:Element:Line {
          id: $connectionId,
          name: $name,
          from_bus: $sourceId,
          to_bus: $targetId,
          status: 'active',
          capacity: $capacity,
          resistance: $resistance,
          reactance: $reactance
        })
        RETURN line
      `;
        } else if (type === 'Transformer') {
            query = `
        MATCH (source:Bus {id: $sourceId})
        MATCH (target:Bus {id: $targetId})
        CREATE (tr:Element:Transformer {
          id: $connectionId,
          name: $name,
          from_bus: $sourceId,
          to_bus: $targetId,
          bus_id: $sourceId,
          secondary_bus_id: $targetId,
          status: 'active',
          rating: $rating,
          tap_ratio: $tapRatio
        })
        RETURN tr as line
      `;
        }

        const result = await session.run(query, {
            sourceId,
            targetId,
            connectionId,
            name: properties.name || `${sourceId}-${targetId}`,
            capacity: properties.capacity || 100,
            resistance: properties.resistance || 0.01,
            reactance: properties.reactance || 0.05,
            rating: properties.rating || 100,
            tapRatio: properties.tapRatio || 1.0,
        });

        // Log the creation
        await auditService.log(
            'CONNECTION_CREATED',
            req.user.id,
            'connection',
            connectionId,
            { sourceId, targetId, type }
        );

        res.status(201).json({
            connection: result.records[0].get('line').properties,
        });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const deleteConnection = async (req, res, next) => {
    const session = neo4jDriver.session();
    const { id } = req.params;

    try {
        await session.run(`
      MATCH (n:Element {id: $id})
      WHERE n:Line OR n:Transformer
      DELETE n
    `, { id });

        // Log the deletion
        await auditService.log(
            'CONNECTION_DELETED',
            req.user.id,
            'connection',
            id,
            {}
        );

        res.json({ message: 'Connection deleted successfully' });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

module.exports = {
    getTopology,
    getTopologyStats,
    getSubgraph,
    updateTopology,
    saveLayout,
    getLayouts,
    createConnection,
    deleteConnection,
};