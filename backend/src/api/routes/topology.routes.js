const express = require('express');
const topologyController = require('../controllers/topology.controller');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { body, param } = require('express-validator');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get full topology
router.get('/', topologyController.getTopology);

// Get topology stats
router.get('/stats', topologyController.getTopologyStats);

// Get subgraph
router.get('/subgraph/:nodeId',
    [param('nodeId').notEmpty()],
    validate,
    topologyController.getSubgraph
);

// Update topology (engineers and admins only)
router.put('/update',
    authorize('engineer', 'admin'),
    topologyController.updateTopology
);

// Save layout
router.post('/layout',
    authorize('engineer', 'admin'),
    [body('layout').isObject()],
    validate,
    topologyController.saveLayout
);

// Get saved layouts
router.get('/layouts', topologyController.getLayouts);

// Create connection
router.post('/connections',
    authorize('engineer', 'admin'),
    [
        body('sourceId').notEmpty(),
        body('targetId').notEmpty(),
        body('type').isIn(['Line', 'Cable']),
    ],
    validate,
    topologyController.createConnection
);

// Delete connection
router.delete('/connections/:id',
    authorize('engineer', 'admin'),
    [param('id').notEmpty()],
    validate,
    topologyController.deleteConnection
);

module.exports = router;