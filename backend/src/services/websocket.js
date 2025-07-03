// backend/src/services/websocket.js - ENHANCED VERSION

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { redisClient, logger } = require('../config/database');

let io;
const connectedUsers = new Map(); // Track connected users
const elementSubscriptions = new Map(); // Track element subscriptions

const initializeWebSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'], // Fallback support
    });

    // Enhanced authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                return next(new Error('Authentication token required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Verify user is still active
            const userCheck = await redisClient.get(`user:${decoded.id}:active`);
            if (userCheck === 'false') {
                return next(new Error('User account inactive'));
            }

            socket.userId = decoded.id;
            socket.userRole = decoded.role;
            socket.userEmail = decoded.email;

            logger.info(`WebSocket authentication successful for user ${socket.userId}`);
            next();
        } catch (err) {
            logger.error('WebSocket authentication failed:', err.message);
            next(new Error('Authentication failed'));
        }
    });

    // Enhanced connection handler
    io.on('connection', (socket) => {
        logger.info(`User ${socket.userId} (${socket.userRole}) connected via WebSocket`);

        // Track connection
        connectedUsers.set(socket.userId, {
            socketId: socket.id,
            role: socket.userRole,
            email: socket.userEmail,
            connectedAt: new Date(),
            subscriptions: new Set(),
        });

        // Join user-specific room
        socket.join(`user:${socket.userId}`);
        socket.join(`role:${socket.userRole}`);

        // Send connection confirmation with user info
        socket.emit('connection:confirmed', {
            userId: socket.userId,
            role: socket.userRole,
            serverTime: new Date().toISOString(),
            features: getAvailableFeatures(socket.userRole),
        });

        // Enhanced monitoring subscription
        socket.on('subscribe:monitoring', async (data) => {
            const { elementIds, types = ['telemetry', 'alarms', 'status'] } = data;

            if (!Array.isArray(elementIds)) {
                socket.emit('error', { message: 'Invalid elementIds format' });
                return;
            }

            try {
                // Validate element access based on user role
                const accessibleElements = await validateElementAccess(elementIds, socket.userRole);

                accessibleElements.forEach((elementId) => {
                    // Join element-specific rooms
                    types.forEach(type => {
                        socket.join(`${type}:${elementId}`);
                    });

                    // Track subscription
                    if (!elementSubscriptions.has(elementId)) {
                        elementSubscriptions.set(elementId, new Set());
                    }
                    elementSubscriptions.get(elementId).add(socket.userId);

                    // Track user's subscriptions
                    connectedUsers.get(socket.userId)?.subscriptions.add(elementId);
                });

                socket.emit('subscribed', {
                    elementIds: accessibleElements,
                    types,
                    timestamp: new Date().toISOString(),
                });

                // Send initial data for subscribed elements
                const initialData = await getInitialElementData(accessibleElements, types);
                socket.emit('initial:data', initialData);

                logger.info(`User ${socket.userId} subscribed to ${accessibleElements.length} elements`);
            } catch (error) {
                logger.error('Subscription error:', error);
                socket.emit('error', { message: 'Subscription failed', details: error.message });
            }
        });

        // Enhanced unsubscribe
        socket.on('unsubscribe:monitoring', async (data) => {
            const { elementIds, types = ['telemetry', 'alarms', 'status'] } = data;

            if (!Array.isArray(elementIds)) return;

            elementIds.forEach((elementId) => {
                types.forEach(type => {
                    socket.leave(`${type}:${elementId}`);
                });

                // Update subscription tracking
                if (elementSubscriptions.has(elementId)) {
                    elementSubscriptions.get(elementId).delete(socket.userId);
                    if (elementSubscriptions.get(elementId).size === 0) {
                        elementSubscriptions.delete(elementId);
                    }
                }

                connectedUsers.get(socket.userId)?.subscriptions.delete(elementId);
            });

            socket.emit('unsubscribed', {
                elementIds,
                types,
                timestamp: new Date().toISOString(),
            });
        });

        // Alarm acknowledgment
        socket.on('alarm:acknowledge', async (data) => {
            const { alarmId, comment } = data;

            try {
                // This would integrate with your alarm service
                await acknowledgeAlarm(alarmId, socket.userId, comment);

                // Broadcast acknowledgment to all relevant users
                io.to(`alarm:${alarmId}`).emit('alarm:acknowledged', {
                    alarmId,
                    acknowledgedBy: socket.userId,
                    acknowledgedAt: new Date().toISOString(),
                    comment,
                });
            } catch (error) {
                socket.emit('error', { message: 'Failed to acknowledge alarm', details: error.message });
            }
        });

        // System status request
        socket.on('system:status', async () => {
            try {
                const systemStatus = await getSystemStatus();
                socket.emit('system:status', systemStatus);
            } catch (error) {
                socket.emit('error', { message: 'Failed to get system status' });
            }
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            logger.info(`User ${socket.userId} disconnected: ${reason}`);

            // Cleanup subscriptions
            const userData = connectedUsers.get(socket.userId);
            if (userData) {
                userData.subscriptions.forEach(elementId => {
                    if (elementSubscriptions.has(elementId)) {
                        elementSubscriptions.get(elementId).delete(socket.userId);
                        if (elementSubscriptions.get(elementId).size === 0) {
                            elementSubscriptions.delete(elementId);
                        }
                    }
                });
            }

            connectedUsers.delete(socket.userId);

            // Notify admins about user disconnection if unexpected
            if (reason !== 'client namespace disconnect') {
                io.to('role:admin').emit('user:disconnected', {
                    userId: socket.userId,
                    reason,
                    timestamp: new Date().toISOString(),
                });
            }
        });

        // Heartbeat for connection monitoring
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: new Date().toISOString() });
        });
    });

    // Periodic cleanup of stale connections
    setInterval(() => {
        cleanupStaleConnections();
    }, 30000); // Every 30 seconds

    return io;
};

// Enhanced telemetry update with filtering
const emitTelemetryUpdate = (elementId, data, options = {}) => {
    if (!io) return;

    const { priority = 'normal', subscribers } = options;

    const updateData = {
        elementId,
        data,
        timestamp: new Date().toISOString(),
        priority,
    };

    if (subscribers) {
        // Send to specific subscribers only
        subscribers.forEach(userId => {
            io.to(`user:${userId}`).emit('telemetry:update', updateData);
        });
    } else {
        // Send to all subscribers of this element
        io.to(`telemetry:${elementId}`).emit('telemetry:update', updateData);
    }

    // High priority updates also go to monitoring dashboards
    if (priority === 'high' || priority === 'critical') {
        io.to('role:operator').to('role:engineer').to('role:admin')
            .emit('telemetry:priority', updateData);
    }
};

// Enhanced alarm emission with severity routing
const emitAlarm = (alarm) => {
    if (!io) return;

    const alarmData = {
        ...alarm,
        timestamp: new Date().toISOString(),
    };

    // Send to element subscribers
    if (alarm.elementId) {
        io.to(`alarms:${alarm.elementId}`).emit('alarm:new', alarmData);
    }

    // Send to all monitoring users based on severity
    const targetRoles = ['operator', 'engineer', 'admin'];
    if (alarm.severity === 'critical') {
        // Critical alarms go to all roles immediately
        targetRoles.forEach(role => {
            io.to(`role:${role}`).emit('alarm:critical', alarmData);
        });
    } else {
        // Normal alarms go to subscribed users
        io.emit('alarm:new', alarmData);
    }

    // Log alarm for audit
    logger.warn(`Alarm emitted: ${alarm.severity} - ${alarm.message}`, {
        elementId: alarm.elementId,
        alarmType: alarm.alarm_type,
    });
};

// System status broadcast
const emitSystemStatus = (status) => {
    if (!io) return;

    io.emit('system:status:update', {
        ...status,
        timestamp: new Date().toISOString(),
    });
};

// User activity notification
const emitUserActivity = (activity) => {
    if (!io) return;

    // Send to admins for monitoring
    io.to('role:admin').emit('user:activity', {
        ...activity,
        timestamp: new Date().toISOString(),
    });
};

// Helper functions
const getAvailableFeatures = (role) => {
    const features = {
        operator: ['monitoring', 'alarms', 'dashboard'],
        engineer: ['monitoring', 'alarms', 'dashboard', 'simulation', 'editing'],
        admin: ['monitoring', 'alarms', 'dashboard', 'simulation', 'editing', 'user-management'],
    };

    return features[role] || features.operator;
};

const validateElementAccess = async (elementIds, userRole) => {
    // Implement role-based element access validation
    // For now, return all elements but this should be enhanced
    return elementIds;
};

const getInitialElementData = async (elementIds, types) => {
    // Fetch initial data for elements
    const data = {};

    for (const elementId of elementIds) {
        data[elementId] = {};

        if (types.includes('telemetry')) {
            // Get latest telemetry from Redis or database
            data[elementId].telemetry = await getLatestTelemetry(elementId);
        }

        if (types.includes('alarms')) {
            data[elementId].alarms = await getActiveAlarms(elementId);
        }

        if (types.includes('status')) {
            data[elementId].status = await getElementStatus(elementId);
        }
    }

    return data;
};

const cleanupStaleConnections = () => {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [userId, userData] of connectedUsers.entries()) {
        if (now - userData.connectedAt > staleThreshold) {
            const socket = io.sockets.sockets.get(userData.socketId);
            if (!socket || !socket.connected) {
                logger.info(`Cleaning up stale connection for user ${userId}`);
                connectedUsers.delete(userId);
            }
        }
    }
};

// Placeholder functions - implement based on your services
const acknowledgeAlarm = async (alarmId, userId, comment) => {
    // Implement alarm acknowledgment logic
};

const getSystemStatus = async () => {
    // Implement system status retrieval
    return {
        status: 'operational',
        connectedUsers: connectedUsers.size,
        activeElements: elementSubscriptions.size,
    };
};

const getLatestTelemetry = async (elementId) => {
    // Implement telemetry retrieval
    return {};
};

const getActiveAlarms = async (elementId) => {
    // Implement alarm retrieval
    return [];
};

const getElementStatus = async (elementId) => {
    // Implement status retrieval
    return 'active';
};

module.exports = {
    initializeWebSocket,
    emitTelemetryUpdate,
    emitAlarm,
    emitSystemStatus,
    emitUserActivity,
    getConnectedUsers: () => connectedUsers,
    getElementSubscriptions: () => elementSubscriptions,
};