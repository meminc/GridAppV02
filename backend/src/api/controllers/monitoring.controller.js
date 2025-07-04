const monitoringService = require('../../services/monitoring.service');
const { neo4jDriver } = require('../../config/database');
const systemStatusService = require('../../services/systemStatus.service');

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

const getSystemHealth = async (req, res, next) => {
    try {
        const health = await systemStatusService.getSystemHealth();
        res.json(health);
    } catch (error) {
        next(error);
    }
};

const getDetailedSystemStatus = async (req, res, next) => {
    try {
        const status = await systemStatusService.getDetailedStatus();
        res.json(status);
    } catch (error) {
        next(error);
    }
};

const getPerformanceMetrics = async (req, res, next) => {
    try {
        const { timeRange = '1h' } = req.query;

        // Convert time range to hours
        const hours = {
            '1h': 1,
            '6h': 6,
            '24h': 24,
            '7d': 168,
        }[timeRange] || 1;

        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - (hours * 60 * 60 * 1000));

        // Get telemetry statistics
        const telemetryStats = await pgPool.query(`
            SELECT 
                date_trunc('minute', time) as minute,
                count(*) as telemetry_count,
                count(DISTINCT element_id) as active_elements
            FROM monitoring.telemetry 
            WHERE time >= $1 AND time <= $2
            GROUP BY date_trunc('minute', time)
            ORDER BY minute
        `, [startTime, endTime]);

        // Get alarm statistics
        const alarmStats = await pgPool.query(`
            SELECT 
                severity,
                count(*) as count,
                count(CASE WHEN is_acknowledged THEN 1 END) as acknowledged_count
            FROM monitoring.alarms 
            WHERE created_at >= $1 AND created_at <= $2
            GROUP BY severity
        `, [startTime, endTime]);

        const metrics = {
            timeRange,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            telemetry: telemetryStats.rows,
            alarms: alarmStats.rows,
            system: await systemStatusService.getSystemMetrics(),
        };

        res.json({ metrics });
    } catch (error) {
        next(error);
    }
};

const getAlertsSummary = async (req, res, next) => {
    try {
        const { timeRange = '24h' } = req.query;

        const hours = {
            '1h': 1,
            '6h': 6,
            '24h': 24,
            '7d': 168,
        }[timeRange] || 24;

        const startTime = new Date(Date.now() - (hours * 60 * 60 * 1000));

        // Get alarm summary
        const alarmSummary = await pgPool.query(`
            SELECT 
                severity,
                alarm_type,
                element_type,
                count(*) as count,
                count(CASE WHEN is_active THEN 1 END) as active_count,
                count(CASE WHEN is_acknowledged THEN 1 END) as acknowledged_count,
                min(created_at) as first_occurrence,
                max(created_at) as last_occurrence
            FROM monitoring.alarms 
            WHERE created_at >= $1
            GROUP BY severity, alarm_type, element_type
            ORDER BY count DESC, severity DESC
        `, [startTime]);

        // Get top problematic elements
        const problematicElements = await pgPool.query(`
            SELECT 
                element_id,
                element_type,
                count(*) as alarm_count,
                count(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
                count(CASE WHEN is_active THEN 1 END) as active_alarm_count
            FROM monitoring.alarms 
            WHERE created_at >= $1
            GROUP BY element_id, element_type
            HAVING count(*) > 1
            ORDER BY critical_count DESC, alarm_count DESC
            LIMIT 10
        `, [startTime]);

        const summary = {
            timeRange,
            period: `${hours} hours`,
            alarmTypes: alarmSummary.rows,
            problematicElements: problematicElements.rows,
            totals: {
                totalAlarms: alarmSummary.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
                activeAlarms: alarmSummary.rows.reduce((sum, row) => sum + parseInt(row.active_count), 0),
                criticalAlarms: alarmSummary.rows
                    .filter(row => row.severity === 'critical')
                    .reduce((sum, row) => sum + parseInt(row.count), 0),
            },
        };

        res.json({ summary });
    } catch (error) {
        next(error);
    }
};

const getDashboardData = async (req, res, next) => {
    try {
        // Get current system status
        const systemHealth = await systemStatusService.getSystemHealth();

        // Get recent telemetry summary
        const recentTelemetry = await pgPool.query(`
            SELECT 
                element_type,
                count(DISTINCT element_id) as element_count,
                avg(metric_value) as avg_value,
                max(time) as last_update
            FROM monitoring.telemetry 
            WHERE time >= NOW() - INTERVAL '5 minutes'
            AND metric_name IN ('voltage', 'power', 'loading')
            GROUP BY element_type
        `);

        // Get active alarms count by severity
        const activeAlarms = await pgPool.query(`
            SELECT 
                severity,
                count(*) as count
            FROM monitoring.alarms 
            WHERE is_active = true
            GROUP BY severity
        `);

        const dashboardData = {
            timestamp: new Date().toISOString(),
            systemHealth,
            telemetry: recentTelemetry.rows,
            alarms: activeAlarms.rows,
            status: 'operational',
        };

        res.json(dashboardData);
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
    getSystemHealth,
    getDetailedSystemStatus,
    getPerformanceMetrics,
    getAlertsSummary,
    getDashboardData,
};