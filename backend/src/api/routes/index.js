const express = require('express');
const authRoutes = require('./auth.routes');
const elementRoutes = require('./element.routes');
const topologyRoutes = require('./topology.routes');
const monitoringRoutes = require('./monitoring.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/elements', elementRoutes);
router.use('/topology', topologyRoutes);
router.use('/monitoring', monitoringRoutes);

module.exports = router;