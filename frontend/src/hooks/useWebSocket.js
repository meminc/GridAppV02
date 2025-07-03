// frontend/src/hooks/useWebSocket.js - ENHANCED VERSION

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './useAuth';
import { useToast } from '@chakra-ui/react';

export function useWebSocket() {
    const { user } = useAuth();
    const toast = useToast();
    const socketRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const heartbeatIntervalRef = useRef(null);

    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [telemetryData, setTelemetryData] = useState({});
    const [alarms, setAlarms] = useState([]);
    const [systemStatus, setSystemStatus] = useState(null);
    const [userActivity, setUserActivity] = useState([]);
    const [subscriptions, setSubscriptions] = useState(new Set());

    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const maxReconnectAttempts = 5;
    const reconnectDelay = [1000, 2000, 5000, 10000, 30000]; // Progressive delay

    const connect = useCallback(() => {
        if (!user || socketRef.current || connecting || connected) return;

        setConnecting(true);
        setConnectionError(null);

        const token = localStorage.getItem('accessToken');
        if (!token) {
            setConnectionError('No authentication token available');
            setConnecting(false);
            return;
        }

        const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001', {
            auth: { token },
            transports: ['websocket', 'polling'],
            timeout: 10000,
            forceNew: true,
        });

        socketRef.current = socket;

        // Connection handlers
        socket.on('connect', () => {
            console.log('WebSocket connected successfully');
            setConnected(true);
            setConnecting(false);
            setConnectionError(null);
            setReconnectAttempts(0);

            toast({
                title: 'Connected',
                description: 'Real-time monitoring active',
                status: 'success',
                duration: 3000,
                isClosable: true,
            });

            // Start heartbeat
            startHeartbeat();
        });

        socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error.message);
            setConnectionError(error.message);
            setConnecting(false);
            setConnected(false);

            // Attempt reconnection
            handleReconnect();
        });

        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            setConnected(false);
            stopHeartbeat();

            if (reason === 'io server disconnect') {
                // Server initiated disconnect - don't auto-reconnect
                toast({
                    title: 'Disconnected',
                    description: 'Server disconnected the session',
                    status: 'warning',
                    duration: 5000,
                    isClosable: true,
                });
            } else {
                // Client-side disconnect - attempt reconnection
                handleReconnect();
            }
        });

        // Enhanced data handlers
        socket.on('connection:confirmed', (data) => {
            console.log('Connection confirmed:', data);
            setSystemStatus(prev => ({
                ...prev,
                userInfo: data,
                lastUpdate: data.serverTime,
            }));
        });

        socket.on('telemetry:update', (data) => {
            setTelemetryData(prev => ({
                ...prev,
                [data.elementId]: {
                    ...data.data,
                    timestamp: data.timestamp,
                    priority: data.priority,
                },
            }));
        });

        socket.on('telemetry:priority', (data) => {
            // Handle high-priority telemetry updates
            setTelemetryData(prev => ({
                ...prev,
                [data.elementId]: {
                    ...data.data,
                    timestamp: data.timestamp,
                    priority: data.priority,
                },
            }));

            // Show notification for critical updates
            if (data.priority === 'critical') {
                toast({
                    title: 'Critical Update',
                    description: `Critical telemetry update for ${data.elementId}`,
                    status: 'error',
                    duration: 10000,
                    isClosable: true,
                });
            }
        });

        socket.on('alarm:new', (alarm) => {
            setAlarms(prev => {
                const updated = [alarm, ...prev].slice(0, 100); // Keep last 100 alarms
                return updated;
            });

            // Show alarm notification
            toast({
                title: `${alarm.severity.toUpperCase()} Alarm`,
                description: alarm.message,
                status: alarm.severity === 'critical' ? 'error' : 'warning',
                duration: alarm.severity === 'critical' ? 0 : 8000, // Critical alarms stay until dismissed
                isClosable: true,
            });
        });

        socket.on('alarm:critical', (alarm) => {
            // Handle critical alarms with special attention
            setAlarms(prev => [alarm, ...prev].slice(0, 100));

            // Critical alarm notification with sound (if supported)
            toast({
                title: '🚨 CRITICAL ALARM',
                description: alarm.message,
                status: 'error',
                duration: 0, // Stay until dismissed
                isClosable: true,
            });

            // Browser notification if permission granted
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Critical Grid Alarm', {
                    body: alarm.message,
                    icon: '/alarm-icon.png',
                    requireInteraction: true,
                });
            }
        });

        socket.on('alarm:acknowledged', (data) => {
            setAlarms(prev => prev.map(alarm =>
                alarm.id === data.alarmId
                    ? {
                        ...alarm,
                        acknowledged: true,
                        acknowledgedBy: data.acknowledgedBy,
                        acknowledgedAt: data.acknowledgedAt,
                        comment: data.comment,
                    }
                    : alarm
            ));
        });

        socket.on('system:status:update', (status) => {
            setSystemStatus(prev => ({
                ...prev,
                ...status,
            }));
        });

        socket.on('initial:data', (data) => {
            // Handle initial data load
            Object.entries(data).forEach(([elementId, elementData]) => {
                if (elementData.telemetry) {
                    setTelemetryData(prev => ({
                        ...prev,
                        [elementId]: elementData.telemetry,
                    }));
                }

                if (elementData.alarms) {
                    setAlarms(prev => [...elementData.alarms, ...prev].slice(0, 100));
                }
            });
        });

        socket.on('subscribed', (data) => {
            console.log('Subscribed to elements:', data.elementIds);
            setSubscriptions(prev => new Set([...prev, ...data.elementIds]));
        });

        socket.on('unsubscribed', (data) => {
            console.log('Unsubscribed from elements:', data.elementIds);
            setSubscriptions(prev => {
                const updated = new Set(prev);
                data.elementIds.forEach(id => updated.delete(id));
                return updated;
            });
        });

        socket.on('user:activity', (activity) => {
            setUserActivity(prev => [activity, ...prev].slice(0, 50));
        });

        socket.on('error', (error) => {
            console.error('WebSocket error:', error);
            toast({
                title: 'WebSocket Error',
                description: error.message,
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        });

        // Heartbeat response
        socket.on('pong', (data) => {
            // Calculate latency
            const latency = Date.now() - parseInt(data.timestamp);
            setSystemStatus(prev => ({
                ...prev,
                latency,
                lastHeartbeat: new Date().toISOString(),
            }));
        });

    }, [user, connecting, connected, toast]);

    const handleReconnect = useCallback(() => {
        if (reconnectAttempts >= maxReconnectAttempts) {
            setConnectionError('Max reconnection attempts reached');
            toast({
                title: 'Connection Failed',
                description: 'Unable to reconnect. Please refresh the page.',
                status: 'error',
                duration: 0,
                isClosable: true,
            });
            return;
        }

        const delay = reconnectDelay[reconnectAttempts] || 30000;
        setReconnectAttempts(prev => prev + 1);

        toast({
            title: 'Reconnecting...',
            description: `Attempt ${reconnectAttempts + 1} of ${maxReconnectAttempts}`,
            status: 'info',
            duration: 3000,
            isClosable: true,
        });

        reconnectTimeoutRef.current = setTimeout(() => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            connect();
        }, delay);
    }, [reconnectAttempts, connect, toast]);

    const startHeartbeat = useCallback(() => {
        heartbeatIntervalRef.current = setInterval(() => {
            if (socketRef.current && connected) {
                socketRef.current.emit('ping');
            }
        }, 30000); // Every 30 seconds
    }, [connected]);

    const stopHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
    }, []);

    const subscribeToElements = useCallback((elementIds, types = ['telemetry', 'alarms', 'status']) => {
        if (socketRef.current && connected) {
            socketRef.current.emit('subscribe:monitoring', { elementIds, types });
        }
    }, [connected]);

    const unsubscribeFromElements = useCallback((elementIds, types = ['telemetry', 'alarms', 'status']) => {
        if (socketRef.current && connected) {
            socketRef.current.emit('unsubscribe:monitoring', { elementIds, types });
        }
    }, [connected]);

    const acknowledgeAlarm = useCallback((alarmId, comment = '') => {
        if (socketRef.current && connected) {
            socketRef.current.emit('alarm:acknowledge', { alarmId, comment });
        }
    }, [connected]);

    const requestSystemStatus = useCallback(() => {
        if (socketRef.current && connected) {
            socketRef.current.emit('system:status');
        }
    }, [connected]);

    const disconnect = useCallback(() => {
        stopHeartbeat();

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        setConnected(false);
        setConnecting(false);
        setSubscriptions(new Set());
    }, []);

    // Request notification permission
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Auto-connect when user is available
    useEffect(() => {
        if (user) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, [user]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        connected,
        connecting,
        connectionError,
        telemetryData,
        alarms,
        systemStatus,
        userActivity,
        subscriptions: Array.from(subscriptions),

        // Actions
        subscribeToElements,
        unsubscribeFromElements,
        acknowledgeAlarm,
        requestSystemStatus,
        connect,
        disconnect,

        // Stats
        reconnectAttempts,
        latency: systemStatus?.latency,
    };
}