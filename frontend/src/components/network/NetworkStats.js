'use client';

import { useEffect, useState } from 'react';
import { HStack, Stat, StatLabel, StatNumber, StatHelpText } from '@chakra-ui/react';
import api from '@/utils/api';

export default function NetworkStats() {
    const [stats, setStats] = useState({
        totalElements: 0,
        activeElements: 0,
        totalLoad: 0,
        totalGeneration: 0,
    });

    useEffect(() => {
        loadStats();
        const interval = setInterval(loadStats, 30000); // Update every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const loadStats = async () => {
        try {
            const response = await api.get('/api/topology/stats');
            setStats(response.data);
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    };

    return (
        <HStack spacing={8}>
            <Stat size="sm">
                <StatLabel>Elements</StatLabel>
                <StatNumber>{stats.activeElements}/{stats.totalElements}</StatNumber>
                <StatHelpText>Active/Total</StatHelpText>
            </Stat>

            <Stat size="sm">
                <StatLabel>Generation</StatLabel>
                <StatNumber>{stats.totalGeneration.toFixed(1)} MW</StatNumber>
            </Stat>

            <Stat size="sm">
                <StatLabel>Load</StatLabel>
                <StatNumber>{stats.totalLoad.toFixed(1)} MW</StatNumber>
            </Stat>

            <Stat size="sm">
                <StatLabel>Balance</StatLabel>
                <StatNumber
                    color={(stats.totalGeneration - stats.totalLoad) >= 0 ? 'green.500' : 'red.500'}
                >
                    {(stats.totalGeneration - stats.totalLoad).toFixed(1)} MW
                </StatNumber>
            </Stat>
        </HStack>
    );
}