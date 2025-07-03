const { neo4jDriver } = require('../config/database');
const monitoringService = require('./monitoring.service');
const { logger } = require('../config/database');

class TelemetrySimulator {
    constructor() {
        this.isRunning = false;
        this.interval = null;
        this.baseValues = new Map();
    }

    async start(intervalMs = 5000) {
        if (this.isRunning) {
            logger.warn('Telemetry simulator already running');
            return;
        }

        logger.info('Starting telemetry simulator');
        this.isRunning = true;

        // Initialize base values
        await this.initializeBaseValues();

        // Start simulation loop
        this.interval = setInterval(() => {
            this.simulateTelemetry();
        }, intervalMs);
    }

    stop() {
        if (!this.isRunning) return;

        logger.info('Stopping telemetry simulator');
        this.isRunning = false;

        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async initializeBaseValues() {
        const session = neo4jDriver.session();

        try {
            // Get all elements
            const result = await session.run(`
        MATCH (n:Element)
        RETURN n.id as id, labels(n) as labels, properties(n) as props
      `);

            result.records.forEach(record => {
                const id = record.get('id');
                const labels = record.get('labels');
                const props = record.get('props');
                const type = labels.find(l => l !== 'Element');

                const baseValue = {
                    type,
                    properties: props,
                };

                // Set base values based on type
                switch (type) {
                    case 'Bus':
                        baseValue.voltage = props.voltage_level || 110;
                        break;
                    case 'Generator':
                        baseValue.power = props.output || 0;
                        baseValue.frequency = 50;
                        break;
                    case 'Load':
                        baseValue.power = props.demand || 0;
                        baseValue.powerFactor = 0.95;
                        break;
                    case 'Line':
                        baseValue.current = 0;
                        baseValue.loading = 0;
                        break;
                }

                this.baseValues.set(id, baseValue);
            });
        } finally {
            await session.close();
        }
    }

    async simulateTelemetry() {
        const timestamp = new Date();
        const hour = timestamp.getHours();

        // Simulate daily load pattern
        const loadFactor = this.getLoadFactor(hour);

        for (const [elementId, baseValue] of this.baseValues) {
            const metrics = {};

            switch (baseValue.type) {
                case 'Bus':
                    // Simulate voltage variations
                    metrics.voltage = this.addNoise(baseValue.voltage, 0.02); // ±2% variation
                    metrics.voltageChange = (metrics.voltage - baseValue.voltage) / baseValue.voltage * 100;
                    break;

                case 'Generator':
                    // Simulate generator output based on load
                    if (baseValue.properties.status === 'active') {
                        const capacity = baseValue.properties.capacity || 100;
                        metrics.power = Math.min(capacity * loadFactor * this.random(0.8, 1.0), capacity);
                        metrics.frequency = this.addNoise(50, 0.002); // ±0.1 Hz
                        metrics.voltage = this.addNoise(baseValue.properties.voltage_level || 220, 0.01);
                    } else {
                        metrics.power = 0;
                        metrics.frequency = 0;
                        metrics.voltage = 0;
                    }
                    break;

                case 'Load':
                    // Simulate load variations
                    if (baseValue.properties.status === 'active') {
                        metrics.power = baseValue.power * loadFactor * this.random(0.9, 1.1);
                        metrics.powerFactor = this.addNoise(baseValue.powerFactor, 0.05);
                        metrics.current = metrics.power / (baseValue.properties.voltage_level || 11) / Math.sqrt(3) / metrics.powerFactor;
                    } else {
                        metrics.power = 0;
                        metrics.powerFactor = 0;
                        metrics.current = 0;
                    }
                    break;

                case 'Line':
                    // Simulate line loading
                    metrics.current = this.random(100, 500) * loadFactor;
                    metrics.loading = this.random(20, 80) * loadFactor;
                    metrics.powerLoss = Math.pow(metrics.current, 2) * 0.01; // I²R losses
                    break;
            }

            // Add common metrics
            metrics.timestamp = timestamp.toISOString();
            metrics.status = baseValue.properties.status || 'active';

            // Record telemetry
            try {
                await monitoringService.recordTelemetry(elementId, baseValue.type, metrics);
            } catch (error) {
                logger.error(`Failed to record telemetry for ${elementId}:`, error);
            }
        }
    }

    getLoadFactor(hour) {
        // Simulate typical daily load curve
        const loadCurve = [
            0.6,  // 00:00
            0.55, // 01:00
            0.5,  // 02:00
            0.5,  // 03:00
            0.55, // 04:00
            0.6,  // 05:00
            0.7,  // 06:00
            0.85, // 07:00
            0.95, // 08:00
            1.0,  // 09:00
            1.0,  // 10:00
            0.95, // 11:00
            0.9,  // 12:00
            0.95, // 13:00
            1.0,  // 14:00
            1.0,  // 15:00
            0.95, // 16:00
            0.9,  // 17:00
            0.95, // 18:00
            1.0,  // 19:00
            0.95, // 20:00
            0.85, // 21:00
            0.75, // 22:00
            0.65, // 23:00
        ];

        return loadCurve[hour] || 0.8;
    }

    addNoise(value, percentage) {
        const noise = (Math.random() - 0.5) * 2 * percentage;
        return value * (1 + noise);
    }

    random(min, max) {
        return Math.random() * (max - min) + min;
    }
}

module.exports = new TelemetrySimulator();