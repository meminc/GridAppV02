const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { redisClient } = require('../config/database');

let io;

const initializeWebSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            credentials: true,
        },
    });

    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.id;
            socket.userRole = decoded.role;
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    // Connection handler
    io.on('connection', (socket) => {
        console.log(`User ${socket.userId} connected`);

        // Join user-specific room
        socket.join(`user:${socket.userId}`);

        // Subscribe to monitoring updates
        socket.on('subscribe:monitoring', async (elementIds) => {
            if (!Array.isArray(elementIds)) return;

            elementIds.forEach((elementId) => {
                socket.join(`element:${elementId}`);
            });

            socket.emit('subscribed', { elementIds });
        });

        // Unsubscribe from monitoring
        socket.on('unsubscribe:monitoring', async (elementIds) => {
            if (!Array.isArray(elementIds)) return;

            elementIds.forEach((elementId) => {
                socket.leave(`element:${elementId}`);
            });

            socket.emit('unsubscribed', { elementIds });
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User ${socket.userId} disconnected`);
        });
    });

    return io;
};

// Emit telemetry update
const emitTelemetryUpdate = (elementId, data) => {
    if (io) {
        io.to(`element:${elementId}`).emit('telemetry:update', {
            elementId,
            data,
            timestamp: new Date().toISOString(),
        });
    }
};

// Emit alarm
const emitAlarm = (alarm) => {
    if (io) {
        // Emit to all connected clients
        io.emit('alarm:new', alarm);

        // Also emit to specific element room
        if (alarm.elementId) {
            io.to(`element:${alarm.elementId}`).emit('alarm:element', alarm);
        }
    }
};

module.exports = {
    initializeWebSocket,
    emitTelemetryUpdate,
    emitAlarm,
};