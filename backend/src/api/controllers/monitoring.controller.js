const monitoringService = require('../../services/monitoring.service');
const { neo4jDriver } = require('../../config/database');

const getLatestTelemetry = async (req, res, next) => {
    try {
        const { elementIds } = req.body;
        const telemetry = await monitoringService.getLatestTelemetry(elementIds);
        res.json({ data: telemetry });
    } catch (error) {
        next(error);
    }
};

const getHistoricalTelemetry = async (req, res, next) => {
    try {
        const { elementId, metricName, startTime, endTime } = req.query;
        const data = await monitoringService.getHistoricalData(
            elementId,
            metricName,
            new Date(startTime),
            new Date(endTime)
        );
        res.json({ data });
    } catch (error) {
        next(error);
    }
};

const getActiveAlarms = async (req, res, next) => {
    try {
        const filters = {
            elementId: req.query.elementId,
            severity: req.query.severity,
        };
        const alarms = await monitoringService.getActiveAlarms(filters);
        res.json({ alarms });
    } catch (error) {
        next(error);
    }
};

const acknowledgeAlarm = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const alarm = await monitoringService.acknowledgeAlarm(id, userId);
        res.json({ alarm });
    } catch (error) {
        next(error);
    }
};

const getSystemMetrics = async (req, res, next) => {
    const session = neo4jDriver.session();

    try {
        // Get system-wide metrics
        const metricsResult = await session.run(`
      MATCH (g:Generator)
      WHERE g.status = 'active'
      WITH sum(g.output) as totalGeneration, count(g) as activeGenerators
      MATCH (l:Load)
      WHERE l.status = 'active'
      WITH totalGeneration, activeGenerators, sum(l.demand) as totalDemand, count(l) as activeLoads
      MATCH (b:Bus)
      WHERE b.status = 'active'
      WITH totalGeneration, activeGenerators, totalDemand, activeLoads, 
           avg(b.voltage_level) as avgVoltage, count(b) as activeBuses
      RETURN {
        generation: {
          total: coalesce(totalGeneration, 0),
          units: activeGenerators
        },
        load: {
          total: coalesce(totalDemand, 0),
          units: activeLoads
        },
        buses: {
          active: activeBuses,
          avgVoltage: coalesce(avgVoltage, 0)
        },
        balance: coalesce(totalGeneration, 0) - coalesce(totalDemand, 0)
      } as metrics
    `);

        const metrics = metricsResult.records[0]?.get('metrics') || {
            generation: { total: 0, units: 0 },
            load: { total: 0, units: 0 },
            buses: { active: 0, avgVoltage: 0 },
            balance: 0,
        };

        res.json({ metrics });
    } catch (error) {
        next(error);
    } finally {
        await session.close();
    }
};

const submitTelemetry = async (req, res, next) => {
    try {
        const { elementId, metrics } = req.body;

        // Get element type from Neo4j
        const session = neo4jDriver.session();
        try {
            const result = await session.run(
                'MATCH (n:Element {id: $id}) RETURN labels(n) as labels',
                { id: elementId }
            );

            if (result.records.length === 0) {
                return res.status(404).json({ error: 'Element not found' });
            }

            const labels = result.records[0].get('labels');
            const elementType = labels.find(l => l !== 'Element') || 'Unknown';

            await monitoringService.recordTelemetry(elementId, elementType, metrics);

            res.json({ message: 'Telemetry recorded successfully' });
        } finally {
            await session.close();
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getLatestTelemetry,
    getHistoricalTelemetry,
    getActiveAlarms,
    acknowledgeAlarm,
    getSystemMetrics,
    submitTelemetry,
};