const { neo4jDriver } = require('../config/database');
const monitoringService = require('./monitoring.service');
const { logger } = require('../config/database');
const { emitTelemetryUpdate, emitAlarm } = require('./websocket');

class TelemetrySimulator {
    constructor() {
        this.isRunning = false;
        this.interval = null;
        this.baseValues = new Map();
    }

    async start(intervalMs = 10000) {
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
            let alarmTriggered = false;

            switch (baseValue.type) {
                case 'Bus':
                    // Simulate voltage variations with more realistic patterns
                    const nominalVoltage = baseValue.voltage;
                    const voltageVariation = this.addNoise(nominalVoltage, 0.02);
                    metrics.voltage = Math.max(0, voltageVariation);
                    metrics.voltageLevel = nominalVoltage;
                    metrics.voltageChange = ((metrics.voltage - nominalVoltage) / nominalVoltage) * 100;

                    // Check for voltage alarms
                    if (metrics.voltage > nominalVoltage * 1.05) {
                        alarmTriggered = await this.createAlarm(elementId, 'HIGH_VOLTAGE', 'warning',
                            `High voltage detected: ${metrics.voltage.toFixed(2)}kV (${metrics.voltageChange.toFixed(1)}%)`);
                    } else if (metrics.voltage < nominalVoltage * 0.95) {
                        alarmTriggered = await this.createAlarm(elementId, 'LOW_VOLTAGE', 'critical',
                            `Low voltage detected: ${metrics.voltage.toFixed(2)}kV (${metrics.voltageChange.toFixed(1)}%)`);
                    }
                    break;

                case 'Generator':
                    if (baseValue.properties.status === 'active') {
                        const capacity = baseValue.properties.capacity || 100;
                        const targetOutput = Math.min(capacity * loadFactor * this.random(0.8, 1.0), capacity);

                        metrics.power = targetOutput;
                        metrics.capacity = capacity;
                        metrics.loadFactor = (targetOutput / capacity) * 100;
                        metrics.frequency = this.addNoise(50, 0.002); // ±0.1 Hz
                        metrics.voltage = this.addNoise(baseValue.properties.voltage_level || 220, 0.01);
                        metrics.efficiency = Math.max(85, Math.min(95, 90 + this.random(-5, 5)));

                        // Check for generator alarms
                        if (metrics.frequency > 50.5 || metrics.frequency < 49.5) {
                            alarmTriggered = await this.createAlarm(elementId, 'FREQUENCY_DEVIATION', 'warning',
                                `Frequency deviation: ${metrics.frequency.toFixed(2)}Hz`);
                        }

                        if (metrics.loadFactor > 95) {
                            alarmTriggered = await this.createAlarm(elementId, 'GENERATOR_OVERLOAD', 'warning',
                                `Generator approaching capacity: ${metrics.loadFactor.toFixed(1)}%`);
                        }
                    } else {
                        metrics.power = 0;
                        metrics.frequency = 0;
                        metrics.voltage = 0;
                        metrics.loadFactor = 0;
                        metrics.efficiency = 0;
                    }
                    break;

                case 'Load':
                    if (baseValue.properties.status === 'active') {
                        const baseDemand = baseValue.power || baseValue.properties.demand || 50;
                        metrics.power = baseDemand * loadFactor * this.random(0.9, 1.1);
                        metrics.demand = baseDemand;
                        metrics.powerFactor = this.addNoise(baseValue.powerFactor || 0.95, 0.05);
                        metrics.current = metrics.power / (baseValue.properties.voltage_level || 11) / Math.sqrt(3) / metrics.powerFactor;
                        metrics.utilizationRate = (metrics.power / baseDemand) * 100;

                        // Simulate load shedding scenarios
                        if (Math.random() < 0.001) { // 0.1% chance
                            metrics.power *= 0.3; // Emergency load reduction
                            alarmTriggered = await this.createAlarm(elementId, 'LOAD_SHED', 'info',
                                `Load shedding activated for ${elementId}`);
                        }
                    } else {
                        metrics.power = 0;
                        metrics.powerFactor = 0;
                        metrics.current = 0;
                        metrics.utilizationRate = 0;
                    }
                    break;

                case 'Line':
                    // More sophisticated line modeling
                    const capacity = baseValue.properties.capacity || 100;
                    const baseLoading = this.random(20, 80) * loadFactor;

                    metrics.current = baseLoading * 10; // Simplified current calculation
                    metrics.loading = Math.min(100, baseLoading);
                    metrics.capacity = capacity;
                    metrics.powerFlow = (metrics.loading / 100) * capacity;
                    metrics.powerLoss = Math.pow(metrics.current / 1000, 2) * (baseValue.properties.resistance || 0.01);
                    metrics.temperature = 25 + (metrics.loading / 100) * 40; // Temperature based on loading

                    // Check for line alarms
                    if (metrics.loading > 95) {
                        alarmTriggered = await this.createAlarm(elementId, 'LINE_OVERLOAD', 'critical',
                            `Line critically overloaded: ${metrics.loading.toFixed(1)}%`);
                    } else if (metrics.loading > 85) {
                        alarmTriggered = await this.createAlarm(elementId, 'LINE_HIGH_LOAD', 'warning',
                            `Line high loading: ${metrics.loading.toFixed(1)}%`);
                    }

                    if (metrics.temperature > 80) {
                        alarmTriggered = await this.createAlarm(elementId, 'HIGH_TEMPERATURE', 'warning',
                            `Line temperature high: ${metrics.temperature.toFixed(1)}°C`);
                    }
                    break;

                case 'Transformer':
                    const rating = baseValue.properties.rating || 100;
                    const tapRatio = baseValue.properties.tap_ratio || 1.0;

                    metrics.loading = this.random(30, 90) * loadFactor;
                    metrics.powerFlow = (metrics.loading / 100) * rating;
                    metrics.tapPosition = tapRatio;
                    metrics.oilTemperature = 40 + (metrics.loading / 100) * 30;
                    metrics.windingTemperature = metrics.oilTemperature + 15;

                    // Transformer-specific alarms
                    if (metrics.oilTemperature > 85) {
                        alarmTriggered = await this.createAlarm(elementId, 'HIGH_OIL_TEMP', 'warning',
                            `Transformer oil temperature high: ${metrics.oilTemperature.toFixed(1)}°C`);
                    }
                    break;
            }

            // Add common metrics
            metrics.timestamp = timestamp.toISOString();
            metrics.status = baseValue.properties.status || 'active';
            metrics.type = baseValue.type;

            // Emit real-time telemetry update with priority
            const priority = alarmTriggered ? 'high' : 'normal';
            emitTelemetryUpdate(elementId, { metrics }, { priority });

            // Record telemetry in monitoring service
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
        // Use normal distribution for more realistic noise
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const noise = z0 * percentage * 0.3; // Reduce noise magnitude
        return value * (1 + noise);
    }

    random(min, max) {
        return Math.random() * (max - min) + min;
    }

    async createAlarm(elementId, alarmType, severity, message) {
        try {
            // Check if similar alarm already exists (avoid spam)
            const recentAlarms = await this.getRecentAlarms(elementId, alarmType);
            if (recentAlarms.length > 0) {
                return false; // Don't create duplicate alarm
            }

            const alarm = {
                id: `alarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                element_id: elementId,
                element_type: this.baseValues.get(elementId)?.type || 'Unknown',
                alarm_type: alarmType,
                severity,
                message,
                is_active: true,
                is_acknowledged: false,
                created_at: new Date().toISOString(),
            };

            // Emit alarm via WebSocket
            emitAlarm(alarm);

            // Store in database (if monitoring service available)
            if (typeof monitoringService !== 'undefined') {
                await monitoringService.createAlarm(alarm);
            }

            return true;
        } catch (error) {
            logger.error(`Failed to create alarm for ${elementId}:`, error);
            return false;
        }
    }

    async getRecentAlarms(elementId, alarmType) {
        // Simple in-memory check - in production, query database
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return []; // Simplified - implement proper recent alarm checking
    }

}

module.exports = new TelemetrySimulator();