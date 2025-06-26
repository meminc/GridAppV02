const { pgPool, redisClient } = require('../config/database');
const { emitTelemetryUpdate, emitAlarm } = require('./websocket');

class MonitoringService {
    constructor() {
        this.alarmThresholds = {
            voltage_high: 1.05, // 105% of nominal
            voltage_low: 0.95,  // 95% of nominal
            line_overload: 0.9, // 90% of capacity
            frequency_high: 50.5,
            frequency_low: 49.5,
        };
    }

    async recordTelemetry(elementId, elementType, metrics) {
        const timestamp = new Date();

        // Store in TimescaleDB
        const values = [];
        const params = [];
        let paramCount = 1;

        for (const [metricName, metricValue] of Object.entries(metrics)) {
            params.push(
                `(${paramCount}, ${paramCount + 1}, ${paramCount + 2}, ${paramCount + 3}, ${paramCount + 4})`
            );
            values.push(timestamp, elementId, elementType, metricName, metricValue);
            paramCount += 5;
        }

        if (params.length > 0) {
            await pgPool.query(
                `INSERT INTO monitoring.telemetry (time, element_id, element_type, metric_name, metric_value)
         VALUES ${params.join(', ')}`,
                values
            );
        }

        // Store latest values in Redis for quick access
        const redisKey = `telemetry:${elementId}`;
        await redisClient.hSet(redisKey, {
            ...metrics,
            timestamp: timestamp.toISOString(),
        });
        await redisClient.expire(redisKey, 3600); // 1 hour TTL

        // Check for alarms
        await this.checkAlarms(elementId, elementType, metrics);

        // Emit real-time update
        emitTelemetryUpdate(elementId, {
            metrics,
            timestamp: timestamp.toISOString(),
        });
    }

    async checkAlarms(elementId, elementType, metrics) {
        const alarms = [];

        // Voltage checks
        if (metrics.voltage !== undefined) {
            if (metrics.voltage > this.alarmThresholds.voltage_high) {
                alarms.push({
                    type: 'HIGH_VOLTAGE',
                    severity: 'warning',
                    message: `High voltage detected: ${metrics.voltage}`,
                });
            } else if (metrics.voltage < this.alarmThresholds.voltage_low) {
                alarms.push({
                    type: 'LOW_VOLTAGE',
                    severity: 'critical',
                    message: `Low voltage detected: ${metrics.voltage}`,
                });
            }
        }

        // Line loading checks
        if (elementType === 'Line' && metrics.loading !== undefined) {
            if (metrics.loading > this.alarmThresholds.line_overload) {
                alarms.push({
                    type: 'LINE_OVERLOAD',
                    severity: 'warning',
                    message: `Line overload: ${(metrics.loading * 100).toFixed(1)}%`,
                });
            }
        }

        // Create alarms in database
        for (const alarm of alarms) {
            const result = await pgPool.query(
                `INSERT INTO monitoring.alarms 
         (element_id, element_type, alarm_type, severity, message, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
                [elementId, elementType, alarm.type, alarm.severity, alarm.message]
            );

            // Emit alarm
            emitAlarm({
                ...result.rows[0],
                elementId,
            });
        }
    }

    async getLatestTelemetry(elementIds) {
        const results = {};

        // Try Redis first
        for (const elementId of elementIds) {
            const redisData = await redisClient.hGetAll(`telemetry:${elementId}`);

            if (Object.keys(redisData).length > 0) {
                results[elementId] = redisData;
            } else {
                // Fallback to database
                const dbResult = await pgPool.query(
                    `SELECT DISTINCT ON (metric_name) 
           metric_name, metric_value, time
           FROM monitoring.telemetry
           WHERE element_id = $1
           ORDER BY metric_name, time DESC`,
                    [elementId]
                );

                const metrics = {};
                let latestTime = null;

                dbResult.rows.forEach((row) => {
                    metrics[row.metric_name] = row.metric_value;
                    if (!latestTime || row.time > latestTime) {
                        latestTime = row.time;
                    }
                });

                if (Object.keys(metrics).length > 0) {
                    results[elementId] = {
                        ...metrics,
                        timestamp: latestTime.toISOString(),
                    };
                }
            }
        }

        return results;
    }

    async getHistoricalData(elementId, metricName, startTime, endTime) {
        const result = await pgPool.query(
            `SELECT time, metric_value
       FROM monitoring.telemetry
       WHERE element_id = $1 
       AND metric_name = $2
       AND time >= $3 
       AND time <= $4
       ORDER BY time ASC`,
            [elementId, metricName, startTime, endTime]
        );

        return result.rows.map((row) => ({
            time: row.time.toISOString(),
            value: row.metric_value,
        }));
    }

    async getActiveAlarms(filters = {}) {
        let query = `
      SELECT * FROM monitoring.alarms
      WHERE is_active = true
    `;
        const values = [];
        let paramCount = 1;

        if (filters.elementId) {
            query += ` AND element_id = ${paramCount}`;
            values.push(filters.elementId);
            paramCount++;
        }

        if (filters.severity) {
            query += ` AND severity = ${paramCount}`;
            values.push(filters.severity);
            paramCount++;
        }

        query += ' ORDER BY created_at DESC';

        const result = await pgPool.query(query, values);
        return result.rows;
    }

    async acknowledgeAlarm(alarmId, userId) {
        const result = await pgPool.query(
            `UPDATE monitoring.alarms
       SET is_acknowledged = true,
           acknowledged_by = $2,
           acknowledged_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [alarmId, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Alarm not found');
        }

        return result.rows[0];
    }
}

module.exports = new MonitoringService();