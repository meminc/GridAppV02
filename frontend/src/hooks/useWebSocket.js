import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './useAuth';

export function useWebSocket() {
    const { user } = useAuth();
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const [telemetryData, setTelemetryData] = useState({});
    const [alarms, setAlarms] = useState([]);

    useEffect(() => {
        if (!user) return;

        const token = localStorage.getItem('token');
        const socket = io(process.env.NEXT_PUBLIC_WS_URL, {
            auth: { token },
            transports: ['websocket'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('WebSocket connected');
            setConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            setConnected(false);
        });

        socket.on('telemetry:update', (data) => {
            setTelemetryData((prev) => ({
                ...prev,
                [data.elementId]: data.data,
            }));
        });

        socket.on('alarm:new', (alarm) => {
            setAlarms((prev) => [alarm, ...prev].slice(0, 50)); // Keep last 50 alarms
        });

        return () => {
            socket.disconnect();
        };
    }, [user]);

    const subscribeToElements = (elementIds) => {
        if (socketRef.current && connected) {
            socketRef.current.emit('subscribe:monitoring', elementIds);
        }
    };

    const unsubscribeFromElements = (elementIds) => {
        if (socketRef.current && connected) {
            socketRef.current.emit('unsubscribe:monitoring', elementIds);
        }
    };

    return {
        connected,
        telemetryData,
        alarms,
        subscribeToElements,
        unsubscribeFromElements,
    };
}