'use client';

import { useEffect } from 'react';
import {
    Box,
    Grid,
    Card,
    CardBody,
    Stat,
    StatLabel,
    StatNumber,
    StatHelpText,
    Heading,
    Text,
    Badge,
    VStack,
    HStack,
    Progress,
} from '@chakra-ui/react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { Activity, AlertCircle, Zap, Network } from 'lucide-react';

export default function DashboardPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <Box display="flex" alignItems="center" justifyContent="center" h="100vh">
                <Progress size="xs" isIndeterminate w="200px" />
            </Box>
        );
    }

    const stats = [
        {
            label: 'Active Elements',
            value: '1,234',
            change: '+2.5%',
            icon: Network,
            color: 'blue',
        },
        {
            label: 'System Load',
            value: '85.4 MW',
            change: '+5.2%',
            icon: Zap,
            color: 'green',
        },
        {
            label: 'Active Alarms',
            value: '3',
            change: '-25%',
            icon: AlertCircle,
            color: 'red',
        },
        {
            label: 'System Health',
            value: '98.5%',
            change: '+0.5%',
            icon: Activity,
            color: 'purple',
        },
    ];

    const recentAlarms = [
        { id: 1, message: 'High voltage on Bus-12', severity: 'warning', time: '5 mins ago' },
        { id: 2, message: 'Line L23 overload', severity: 'critical', time: '12 mins ago' },
        { id: 3, message: 'Generator G5 offline', severity: 'info', time: '1 hour ago' },
    ];

    return (
        <MainLayout>
            <Box p={6}>
                <Heading size="lg" mb={6}>
                    Dashboard
                </Heading>

                {/* Stats Grid */}
                <Grid templateColumns="repeat(auto-fit, minmax(250px, 1fr))" gap={6} mb={8}>
                    {stats.map((stat) => {
                        const Icon = stat.icon;
                        return (
                            <Card key={stat.label}>
                                <CardBody>
                                    <HStack justify="space-between" mb={2}>
                                        <Icon size={24} color={`${stat.color}.500`} />
                                        <Badge colorScheme={stat.change.startsWith('+') ? 'green' : 'red'}>
                                            {stat.change}
                                        </Badge>
                                    </HStack>
                                    <Stat>
                                        <StatLabel color="gray.600">{stat.label}</StatLabel>
                                        <StatNumber fontSize="2xl">{stat.value}</StatNumber>
                                        <StatHelpText>vs last period</StatHelpText>
                                    </Stat>
                                </CardBody>
                            </Card>
                        );
                    })}
                </Grid>

                {/* Recent Activity */}
                <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6}>
                    <Card>
                        <CardBody>
                            <Heading size="md" mb={4}>
                                System Overview
                            </Heading>
                            <VStack align="stretch" spacing={4}>
                                <Box>
                                    <HStack justify="space-between" mb={2}>
                                        <Text color="gray.600">Voltage Stability</Text>
                                        <Text fontWeight="bold">Good</Text>
                                    </HStack>
                                    <Progress value={92} colorScheme="green" />
                                </Box>
                                <Box>
                                    <HStack justify="space-between" mb={2}>
                                        <Text color="gray.600">Network Load</Text>
                                        <Text fontWeight="bold">85.4%</Text>
                                    </HStack>
                                    <Progress value={85.4} colorScheme="orange" />
                                </Box>
                                <Box>
                                    <HStack justify="space-between" mb={2}>
                                        <Text color="gray.600">Generation Capacity</Text>
                                        <Text fontWeight="bold">78%</Text>
                                    </HStack>
                                    <Progress value={78} colorScheme="blue" />
                                </Box>
                            </VStack>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardBody>
                            <Heading size="md" mb={4}>
                                Recent Alarms
                            </Heading>
                            <VStack align="stretch" spacing={3}>
                                {recentAlarms.map((alarm) => (
                                    <Box
                                        key={alarm.id}
                                        p={3}
                                        bg="gray.50"
                                        borderRadius="md"
                                        borderLeft="4px solid"
                                        borderLeftColor={
                                            alarm.severity === 'critical'
                                                ? 'red.500'
                                                : alarm.severity === 'warning'
                                                    ? 'orange.500'
                                                    : 'blue.500'
                                        }
                                    >
                                        <Text fontSize="sm" fontWeight="medium">
                                            {alarm.message}
                                        </Text>
                                        <Text fontSize="xs" color="gray.600">
                                            {alarm.time}
                                        </Text>
                                    </Box>
                                ))}
                            </VStack>
                        </CardBody>
                    </Card>
                </Grid>
            </Box>
        </MainLayout>
    );
}