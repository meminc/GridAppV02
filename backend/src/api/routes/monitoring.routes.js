const express = require('express');
const monitoringController = require('../controllers/monitoring.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { body, query } = require('express-validator');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get latest telemetry for multiple elements
router.post('/telemetry/latest',
    [body('elementIds').isArray()],
    validate,
    monitoringController.getLatestTelemetry
);

// Get historical telemetry
router.get('/telemetry/history',
    [
        query('elementId').notEmpty(),
        query('metricName').notEmpty(),
        query('startTime').isISO8601(),
        query('endTime').isISO8601(),
    ],
    validate,
    monitoringController.getHistoricalTelemetry
);

// Get active alarms
router.get('/alarms',
    [
        query('elementId').optional(),
        query('severity').optional().isIn(['info', 'warning', 'critical']),
    ],
    validate,
    monitoringController.getActiveAlarms
);

// Acknowledge alarm
router.post('/alarms/:id/acknowledge',
    monitoringController.acknowledgeAlarm
);

// Get system metrics
router.get('/metrics/system',
    monitoringController.getSystemMetrics
);

// Submit telemetry (for testing/simulation)
router.post('/telemetry',
    [
        body('elementId').notEmpty(),
        body('metrics').isObject(),
    ],
    validate,
    monitoringController.submitTelemetry
);

module.exports = router;