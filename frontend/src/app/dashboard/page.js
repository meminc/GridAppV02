'use client';

import { useEffect, useState } from 'react';
import {
    Box,
    Grid,
    Card,
    CardBody,
    CardHeader,
    Stat,
    StatLabel,
    StatNumber,
    StatHelpText,
    StatArrow,
    Heading,
    Text,
    Badge,
    VStack,
    HStack,
    Progress,
    Button,
    IconButton,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    TableContainer,
    Alert,
    AlertIcon,
    AlertTitle,
    AlertDescription,
    Flex,
    Spinner,
    useToast,
    Accordion,
    AccordionItem,
    AccordionButton,
    AccordionPanel,
    AccordionIcon,
    Circle,
} from '@chakra-ui/react';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import RealTimeCharts from '@/components/monitoring/RealTimeCharts';
import {
    Activity,
    AlertCircle,
    Zap,
    Network,
    TrendingUp,
    TrendingDown,
    Users,
    Server,
    Wifi,
    WifiOff,
    CheckCircle,
    XCircle,
    Clock,
    Bell,
    Settings,
    RefreshCw,
} from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

export default function DashboardPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const toast = useToast();

    const {
        connected,
        connecting,
        telemetryData,
        alarms,
        systemStatus,
        userActivity,
        subscribeToElements,
        acknowledgeAlarm,
        requestSystemStatus,
        latency,
    } = useWebSocket();

    const [stats, setStats] = useState({
        totalElements: 0,
        activeElements: 0,
        totalGeneration: 0,
        totalLoad: 0,
        systemHealth: 98.5,
        activeAlarms: 0,
        criticalAlarms: 0,
    });

    const [historicalData, setHistoricalData] = useState([]);
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    // Load initial statistics
    useEffect(() => {
        const loadStats = async () => {
            try {
                setLoadingStats(true);
                // Load from API and WebSocket data
                const mockStats = {
                    totalElements: 1234,
                    activeElements: 1198,
                    totalGeneration: 854.2,
                    totalLoad: 723.8,
                    systemHealth: 98.5,
                    activeAlarms: alarms.filter(a => a.is_active).length,
                    criticalAlarms: alarms.filter(a => a.severity === 'critical' && a.is_active).length,
                };
                setStats(mockStats);

                // Generate historical data
                const now = Date.now();
                const historical = Array.from({ length: 24 }, (_, i) => ({
                    time: new Date(now - (23 - i) * 60 * 60 * 1000).toLocaleTimeString('en-US', { hour: '2-digit' }),
                    generation: 800 + Math.random() * 100,
                    load: 700 + Math.random() * 80,
                    voltage: 220 + (Math.random() - 0.5) * 10,
                }));
                setHistoricalData(historical);
            } catch (error) {
                console.error('Failed to load stats:', error);
            } finally {
                setLoadingStats(false);
            }
        };

        loadStats();
    }, [alarms]);

    // Update stats based on telemetry data
    useEffect(() => {
        if (Object.keys(telemetryData).length > 0) {
            // Calculate real-time totals from telemetry
            let totalGen = 0;
            let totalLoad = 0;
            let activeCount = 0;

            Object.entries(telemetryData).forEach(([elementId, data]) => {
                if (data.status === 'active') activeCount++;
                if (data.power && data.type === 'Generator') totalGen += data.power;
                if (data.power && data.type === 'Load') totalLoad += data.power;
            });

            setStats(prev => ({
                ...prev,
                activeElements: activeCount,
                totalGeneration: totalGen || prev.totalGeneration,
                totalLoad: totalLoad || prev.totalLoad,
                systemHealth: calculateSystemHealth(telemetryData),
            }));
        }
    }, [telemetryData]);

    const calculateSystemHealth = (telemetryData) => {
        const elements = Object.values(telemetryData);
        if (elements.length === 0) return 98.5;

        const healthyElements = elements.filter(el =>
            el.status === 'active' &&
            (!el.voltage || (el.voltage > 0.95 && el.voltage < 1.05))
        );

        return Math.round((healthyElements.length / elements.length) * 100 * 10) / 10;
    };

    const getStatusColor = (value, thresholds) => {
        if (value >= thresholds.good) return 'green';
        if (value >= thresholds.warning) return 'yellow';
        return 'red';
    };

    const getTrendDirection = (current, previous) => {
        if (current > previous) return 'increase';
        if (current < previous) return 'decrease';
        return null;
    };

    if (loading) {
        return (
            <Box display="flex" alignItems="center" justifyContent="center" h="100vh">
                <VStack>
                    <Spinner size="xl" color="blue.500" />
                    <Text>Loading dashboard...</Text>
                </VStack>
            </Box>
        );
    }

    const statCards = [
        {
            label: 'Active Elements',
            value: `${stats.activeElements}/${stats.totalElements}`,
            change: '+2.5%',
            icon: Network,
            color: 'blue',
            status: stats.activeElements / stats.totalElements > 0.95 ? 'good' : 'warning',
        },
        {
            label: 'Total Generation',
            value: `${stats.totalGeneration.toFixed(1)} MW`,
            change: '+5.2%',
            icon: Zap,
            color: 'green',
            status: 'good',
        },
        {
            label: 'Active Alarms',
            value: stats.activeAlarms.toString(),
            change: stats.criticalAlarms > 0 ? 'CRITICAL' : '-25%',
            icon: AlertCircle,
            color: stats.criticalAlarms > 0 ? 'red' : stats.activeAlarms > 10 ? 'orange' : 'green',
            status: stats.criticalAlarms > 0 ? 'critical' : stats.activeAlarms > 10 ? 'warning' : 'good',
        },
        {
            label: 'System Health',
            value: `${stats.systemHealth}%`,
            change: '+0.5%',
            icon: Activity,
            color: getStatusColor(stats.systemHealth, { good: 95, warning: 90 }),
            status: stats.systemHealth >= 95 ? 'good' : stats.systemHealth >= 90 ? 'warning' : 'critical',
        },
    ];

    const recentAlarms = alarms.slice(0, 5);

    const chartData = {
        labels: historicalData.map(d => d.time),
        datasets: [
            {
                label: 'Generation (MW)',
                data: historicalData.map(d => d.generation),
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                tension: 0.4,
            },
            {
                label: 'Load (MW)',
                data: historicalData.map(d => d.load),
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                tension: 0.4,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: false,
            },
        },
        scales: {
            y: {
                beginAtZero: false,
                title: {
                    display: true,
                    text: 'Power (MW)',
                },
            },
            x: {
                title: {
                    display: true,
                    text: 'Time',
                },
            },
        },
    };

    const systemStatusData = {
        labels: ['Operational', 'Warning', 'Critical'],
        datasets: [{
            data: [
                stats.totalElements - stats.activeAlarms,
                stats.activeAlarms - stats.criticalAlarms,
                stats.criticalAlarms,
            ],
            backgroundColor: [
                'rgba(34, 197, 94, 0.8)',
                'rgba(251, 191, 36, 0.8)',
                'rgba(239, 68, 68, 0.8)',
            ],
            borderColor: [
                'rgb(34, 197, 94)',
                'rgb(251, 191, 36)',
                'rgb(239, 68, 68)',
            ],
            borderWidth: 2,
        }],
    };

    return (
        <MainLayout>
            <Box p={6}>
                {/* Header */}
                <Flex justify="space-between" align="center" mb={6}>
                    <VStack align="start" spacing={1}>
                        <Heading size="lg">Dashboard</Heading>
                        <HStack>
                            <Text color="gray.600">
                                Welcome back, {user?.firstName}
                            </Text>
                            <Badge colorScheme={connected ? 'green' : 'red'} ml={2}>
                                {connected ? (
                                    <HStack spacing={1}>
                                        <Wifi size={12} />
                                        <Text>LIVE</Text>
                                    </HStack>
                                ) : (
                                    <HStack spacing={1}>
                                        <WifiOff size={12} />
                                        <Text>OFFLINE</Text>
                                    </HStack>
                                )}
                            </Badge>
                            {latency && (
                                <Badge colorScheme="gray" variant="outline">
                                    {latency}ms
                                </Badge>
                            )}
                        </HStack>
                    </VStack>

                    <HStack>
                        <Button
                            leftIcon={<RefreshCw size={18} />}
                            onClick={requestSystemStatus}
                            size="sm"
                            variant="outline"
                            isLoading={connecting}
                        >
                            Refresh
                        </Button>
                        <IconButton
                            icon={<Settings size={18} />}
                            aria-label="Settings"
                            size="sm"
                            variant="outline"
                        />
                    </HStack>
                </Flex>

                {/* Connection Status Alert */}
                {!connected && (
                    <Alert status="warning" mb={6} borderRadius="md">
                        <AlertIcon />
                        <AlertTitle>Real-time monitoring unavailable</AlertTitle>
                        <AlertDescription>
                            {connecting ? 'Connecting...' : 'Connection lost. Some data may be outdated.'}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Stats Grid */}
                <Grid templateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap={6} mb={8}>
                    {statCards.map((stat) => {
                        const Icon = stat.icon;
                        return (
                            <Card key={stat.label} shadow="sm" borderWidth={1}>
                                <CardBody>
                                    <HStack justify="space-between" mb={3}>
                                        <Circle size="40px" bg={`${stat.color}.100`} color={`${stat.color}.600`}>
                                            <Icon size={20} />
                                        </Circle>
                                        <Badge
                                            colorScheme={
                                                stat.change.includes('CRITICAL') ? 'red' :
                                                    stat.change.startsWith('+') ? 'green' : 'red'
                                            }
                                            variant={stat.change.includes('CRITICAL') ? 'solid' : 'subtle'}
                                        >
                                            {stat.change}
                                        </Badge>
                                    </HStack>
                                    <Stat>
                                        <StatLabel color="gray.600" fontSize="sm">
                                            {stat.label}
                                        </StatLabel>
                                        <StatNumber fontSize="2xl" fontWeight="bold">
                                            {stat.value}
                                        </StatNumber>
                                        <StatHelpText fontSize="xs">
                                            <HStack>
                                                {stat.status === 'good' && <CheckCircle size={14} color="green" />}
                                                {stat.status === 'warning' && <AlertCircle size={14} color="orange" />}
                                                {stat.status === 'critical' && <XCircle size={14} color="red" />}
                                                <Text>vs last period</Text>
                                            </HStack>
                                        </StatHelpText>
                                    </Stat>
                                </CardBody>
                            </Card>
                        );
                    })}
                </Grid>

                {/* Main Content Grid */}
                {/* Real-time Charts Section */}
                <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
                    <RealTimeCharts
                        elementIds={Object.keys(telemetryData).slice(0, 5)} // Show first 5 elements
                        chartType="voltage"
                        maxDataPoints={30}
                    />

                    <RealTimeCharts
                        elementIds={Object.keys(telemetryData).filter(id =>
                            telemetryData[id]?.metrics?.type === 'Generator'
                        )}
                        chartType="power"
                        maxDataPoints={30}
                    />
                </Grid>
                <Grid templateColumns={{ base: '1fr', xl: '2fr 1fr' }} gap={6} mb={6}>
                    {/* Historical Trends Chart */}
                    <Card>
                        <CardHeader>
                            <Heading size="md">Power Trends (24 Hours)</Heading>
                        </CardHeader>
                        <CardBody>
                            <Box h="300px">
                                <Line data={chartData} options={chartOptions} />
                            </Box>
                        </CardBody>
                    </Card>

                    {/* System Status Pie Chart */}
                    <Card>
                        <CardHeader>
                            <Heading size="md">System Status Distribution</Heading>
                        </CardHeader>
                        <CardBody>
                            <Box h="300px" display="flex" alignItems="center" justifyContent="center">
                                <Doughnut
                                    data={systemStatusData}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: {
                                                position: 'bottom',
                                            },
                                        },
                                    }}
                                />
                            </Box>
                        </CardBody>
                    </Card>
                </Grid>

                {/* Bottom Section */}
                <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
                    {/* Recent Alarms */}
                    <Card>
                        <CardHeader>
                            <HStack justify="space-between">
                                <Heading size="md">Recent Alarms</Heading>
                                <Badge colorScheme="red" variant="subtle">
                                    {alarms.filter(a => a.is_active).length} Active
                                </Badge>
                            </HStack>
                        </CardHeader>
                        <CardBody>
                            <VStack align="stretch" spacing={3} maxH="300px" overflowY="auto">
                                {recentAlarms.length > 0 ? (
                                    recentAlarms.map((alarm) => (
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
                                            <HStack justify="space-between" align="start">
                                                <VStack align="start" spacing={1} flex="1">
                                                    <HStack>
                                                        <Badge
                                                            colorScheme={
                                                                alarm.severity === 'critical' ? 'red' :
                                                                    alarm.severity === 'warning' ? 'orange' : 'blue'
                                                            }
                                                            size="sm"
                                                        >
                                                            {alarm.severity.toUpperCase()}
                                                        </Badge>
                                                        <Text fontSize="xs" color="gray.500">
                                                            {alarm.element_id}
                                                        </Text>
                                                    </HStack>
                                                    <Text fontSize="sm" fontWeight="medium">
                                                        {alarm.message}
                                                    </Text>
                                                    <Text fontSize="xs" color="gray.600">
                                                        {new Date(alarm.created_at).toLocaleString()}
                                                    </Text>
                                                </VStack>
                                                {!alarm.is_acknowledged && (
                                                    <Button
                                                        size="xs"
                                                        colorScheme="blue"
                                                        variant="outline"
                                                        onClick={() => acknowledgeAlarm(alarm.id)}
                                                    >
                                                        ACK
                                                    </Button>
                                                )}
                                            </HStack>
                                        </Box>
                                    ))
                                ) : (
                                    <Alert status="success" borderRadius="md">
                                        <AlertIcon />
                                        <Text>No active alarms</Text>
                                    </Alert>
                                )}
                            </VStack>
                        </CardBody>
                    </Card>

                    {/* System Information */}
                    <Card>
                        <CardHeader>
                            <Heading size="md">System Information</Heading>
                        </CardHeader>
                        <CardBody>
                            <VStack align="stretch" spacing={4}>
                                {/* Connection Status */}
                                <Box>
                                    <Text fontWeight="medium" mb={2}>Connection Status</Text>
                                    <HStack justify="space-between">
                                        <Text color="gray.600">WebSocket</Text>
                                        <Badge colorScheme={connected ? 'green' : 'red'}>
                                            {connected ? 'Connected' : 'Disconnected'}
                                        </Badge>
                                    </HStack>
                                    {latency && (
                                        <HStack justify="space-between">
                                            <Text color="gray.600">Latency</Text>
                                            <Text fontSize="sm">{latency}ms</Text>
                                        </HStack>
                                    )}
                                </Box>

                                {/* System Load */}
                                <Box>
                                    <Text fontWeight="medium" mb={2}>System Performance</Text>
                                    <VStack align="stretch" spacing={2}>
                                        <Box>
                                            <HStack justify="space-between" mb={1}>
                                                <Text fontSize="sm" color="gray.600">Generation Capacity</Text>
                                                <Text fontSize="sm" fontWeight="bold">
                                                    {((stats.totalGeneration / 1000) * 100).toFixed(1)}%
                                                </Text>
                                            </HStack>
                                            <Progress
                                                value={(stats.totalGeneration / 1000) * 100}
                                                colorScheme="green"
                                                size="sm"
                                            />
                                        </Box>
                                        <Box>
                                            <HStack justify="space-between" mb={1}>
                                                <Text fontSize="sm" color="gray.600">Load Factor</Text>
                                                <Text fontSize="sm" fontWeight="bold">
                                                    {((stats.totalLoad / stats.totalGeneration) * 100).toFixed(1)}%
                                                </Text>
                                            </HStack>
                                            <Progress
                                                value={(stats.totalLoad / stats.totalGeneration) * 100}
                                                colorScheme="blue"
                                                size="sm"
                                            />
                                        </Box>
                                        <Box>
                                            <HStack justify="space-between" mb={1}>
                                                <Text fontSize="sm" color="gray.600">System Health</Text>
                                                <Text fontSize="sm" fontWeight="bold">{stats.systemHealth}%</Text>
                                            </HStack>
                                            <Progress
                                                value={stats.systemHealth}
                                                colorScheme={getStatusColor(stats.systemHealth, { good: 95, warning: 90 })}
                                                size="sm"
                                            />
                                        </Box>
                                    </VStack>
                                </Box>

                                {/* Quick Actions */}
                                <Box>
                                    <Text fontWeight="medium" mb={2}>Quick Actions</Text>
                                    <VStack spacing={2}>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            w="full"
                                            leftIcon={<Network size={16} />}
                                            onClick={() => router.push('/network')}
                                        >
                                            View Network
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            w="full"
                                            leftIcon={<Bell size={16} />}
                                            onClick={() => router.push('/alarms')}
                                        >
                                            Manage Alarms
                                        </Button>
                                    </VStack>
                                </Box>
                            </VStack>
                        </CardBody>
                    </Card>
                </Grid>
            </Box>
        </MainLayout>
    );
}