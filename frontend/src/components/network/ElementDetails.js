'use client';

import { useState, useEffect } from 'react';
import {
    VStack,
    HStack,
    Text,
    Badge,
    Divider,
    FormControl,
    FormLabel,
    Input,
    NumberInput,
    NumberInputField,
    Select,
    Button,
    Stat,
    StatLabel,
    StatNumber,
    StatHelpText,
    StatArrow,
    Box,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    TableContainer,
    Alert,
    AlertIcon,
    useToast,
} from '@chakra-ui/react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { useAuth } from '@/hooks/useAuth';
import api from '@/utils/api';

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

export default function ElementDetails({ element, telemetry, onUpdate }) {
    const { user } = useAuth();
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [formData, setFormData] = useState({});
    const [historicalData, setHistoricalData] = useState(null);
    const [alarms, setAlarms] = useState([]);

    const canEdit = user?.role === 'engineer' || user?.role === 'admin';

    useEffect(() => {
        if (element) {
            setFormData(element.data);
            loadHistoricalData();
            loadAlarms();
        }
    }, [element]);

    const loadHistoricalData = async () => {
        try {
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

            const response = await api.get('/api/monitoring/telemetry/history', {
                params: {
                    elementId: element.id,
                    metricName: 'voltage',
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                },
            });

            setHistoricalData(response.data.data);
        } catch (error) {
            console.error('Failed to load historical data:', error);
        }
    };

    const loadAlarms = async () => {
        try {
            const response = await api.get('/api/monitoring/alarms', {
                params: { elementId: element.id },
            });
            setAlarms(response.data.alarms);
        } catch (error) {
            console.error('Failed to load alarms:', error);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await api.put(`/api/elements/${element.id}`, formData);
            onUpdate(formData);
            setEditMode(false);
            toast({
                title: 'Element updated',
                status: 'success',
                duration: 3000,
            });
        } catch (error) {
            toast({
                title: 'Update failed',
                description: error.response?.data?.error || 'Failed to update element',
                status: 'error',
                duration: 5000,
            });
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'active': return 'green';
            case 'standby': return 'yellow';
            case 'offline': return 'red';
            case 'maintenance': return 'orange';
            default: return 'gray';
        }
    };

    const chartData = historicalData ? {
        labels: historicalData.map(d => new Date(d.time).toLocaleTimeString()),
        datasets: [{
            label: 'Voltage',
            data: historicalData.map(d => d.value),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
            tension: 0.1,
        }],
    } : null;

    const chartOptions = {
        responsive: true,
        plugins: {
            legend: { display: false },
            title: { display: false },
        },
        scales: {
            y: {
                beginAtZero: false,
                title: {
                    display: true,
                    text: 'Voltage (kV)',
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

    return (
        <VStack align="stretch" spacing={4}>
            {/* Header */}
            <HStack justify="space-between">
                <VStack align="start" spacing={1}>
                    <Text fontSize="xl" fontWeight="bold">{element.data.label}</Text>
                    <HStack>
                        <Badge colorScheme="blue">{element.data.type}</Badge>
                        <Badge colorScheme={getStatusColor(element.data.status || 'active')}>
                            {element.data.status || 'Active'}
                        </Badge>
                    </HStack>
                </VStack>
                {canEdit && (
                    <Button
                        size="sm"
                        onClick={() => editMode ? handleSave() : setEditMode(true)}
                        isLoading={loading}
                        colorScheme={editMode ? "green" : "blue"}
                    >
                        {editMode ? 'Save' : 'Edit'}
                    </Button>
                )}
            </HStack>

            <Divider />

            {/* Tabs */}
            <Tabs size="sm">
                <TabList>
                    <Tab>Properties</Tab>
                    <Tab>Telemetry</Tab>
                    <Tab>History</Tab>
                    <Tab>Alarms ({alarms.length})</Tab>
                </TabList>

                <TabPanels>
                    {/* Properties Tab */}
                    <TabPanel>
                        <VStack align="stretch" spacing={3}>
                            <FormControl>
                                <FormLabel>Name</FormLabel>
                                <Input
                                    value={formData.label || ''}
                                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                    isReadOnly={!editMode}
                                />
                            </FormControl>

                            <FormControl>
                                <FormLabel>Status</FormLabel>
                                <Select
                                    value={formData.status || 'active'}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    isDisabled={!editMode}
                                >
                                    <option value="active">Active</option>
                                    <option value="standby">Standby</option>
                                    <option value="offline">Offline</option>
                                    <option value="maintenance">Maintenance</option>
                                </Select>
                            </FormControl>

                            {element.data.type === 'Bus' && (
                                <FormControl>
                                    <FormLabel>Voltage Level (kV)</FormLabel>
                                    <NumberInput
                                        value={formData.voltageLevel || 0}
                                        onChange={(value) => setFormData({ ...formData, voltageLevel: parseFloat(value) })}
                                        isReadOnly={!editMode}
                                    >
                                        <NumberInputField />
                                    </NumberInput>
                                </FormControl>
                            )}

                            {element.data.type === 'Generator' && (
                                <>
                                    <FormControl>
                                        <FormLabel>Capacity (MW)</FormLabel>
                                        <NumberInput
                                            value={formData.capacity || 0}
                                            onChange={(value) => setFormData({ ...formData, capacity: parseFloat(value) })}
                                            isReadOnly={!editMode}
                                        >
                                            <NumberInputField />
                                        </NumberInput>
                                    </FormControl>
                                    <FormControl>
                                        <FormLabel>Output (MW)</FormLabel>
                                        <NumberInput
                                            value={formData.output || 0}
                                            onChange={(value) => setFormData({ ...formData, output: parseFloat(value) })}
                                            isReadOnly={!editMode}
                                            max={formData.capacity}
                                        >
                                            <NumberInputField />
                                        </NumberInput>
                                    </FormControl>
                                </>
                            )}

                            {element.data.type === 'Load' && (
                                <>
                                    <FormControl>
                                        <FormLabel>Demand (MW)</FormLabel>
                                        <NumberInput
                                            value={formData.demand || 0}
                                            onChange={(value) => setFormData({ ...formData, demand: parseFloat(value) })}
                                            isReadOnly={!editMode}
                                        >
                                            <NumberInputField />
                                        </NumberInput>
                                    </FormControl>
                                    <FormControl>
                                        <FormLabel>Priority</FormLabel>
                                        <Select
                                            value={formData.priority || 'medium'}
                                            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                            isDisabled={!editMode}
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                            <option value="critical">Critical</option>
                                        </Select>
                                    </FormControl>
                                </>
                            )}

                            {editMode && (
                                <Button variant="outline" onClick={() => {
                                    setEditMode(false);
                                    setFormData(element.data);
                                }}>
                                    Cancel
                                </Button>
                            )}
                        </VStack>
                    </TabPanel>

                    {/* Telemetry Tab */}
                    <TabPanel>
                        <VStack align="stretch" spacing={3}>
                            {telemetry ? (
                                <>
                                    <Stat>
                                        <StatLabel>Voltage</StatLabel>
                                        <StatNumber>{telemetry.metrics.voltage?.toFixed(2) || 'N/A'} kV</StatNumber>
                                        <StatHelpText>
                                            <StatArrow type={telemetry.metrics.voltageChange > 0 ? 'increase' : 'decrease'} />
                                            {Math.abs(telemetry.metrics.voltageChange || 0).toFixed(1)}%
                                        </StatHelpText>
                                    </Stat>

                                    {element.data.type === 'Generator' && (
                                        <Stat>
                                            <StatLabel>Power Output</StatLabel>
                                            <StatNumber>{telemetry.metrics.power?.toFixed(1) || 'N/A'} MW</StatNumber>
                                            <StatHelpText>
                                                {((telemetry.metrics.power / formData.capacity) * 100).toFixed(1)}% of capacity
                                            </StatHelpText>
                                        </Stat>
                                    )}

                                    {element.data.type === 'Line' && (
                                        <>
                                            <Stat>
                                                <StatLabel>Current</StatLabel>
                                                <StatNumber>{telemetry.metrics.current?.toFixed(1) || 'N/A'} A</StatNumber>
                                            </Stat>
                                            <Stat>
                                                <StatLabel>Loading</StatLabel>
                                                <StatNumber>{telemetry.metrics.loading?.toFixed(1) || 'N/A'}%</StatNumber>
                                                <StatHelpText>
                                                    {telemetry.metrics.loading > 90 ? 'Overloaded' : 'Normal'}
                                                </StatHelpText>
                                            </Stat>
                                        </>
                                    )}

                                    <Text fontSize="xs" color="gray.500">
                                        Last updated: {new Date(telemetry.timestamp).toLocaleString()}
                                    </Text>
                                </>
                            ) : (
                                <Alert status="info">
                                    <AlertIcon />
                                    No telemetry data available
                                </Alert>
                            )}
                        </VStack>
                    </TabPanel>

                    {/* History Tab */}
                    <TabPanel>
                        <VStack align="stretch" spacing={3}>
                            {chartData ? (
                                <Box h="300px">
                                    <Line data={chartData} options={chartOptions} />
                                </Box>
                            ) : (
                                <Alert status="info">
                                    <AlertIcon />
                                    No historical data available
                                </Alert>
                            )}
                        </VStack>
                    </TabPanel>

                    {/* Alarms Tab */}
                    <TabPanel>
                        <TableContainer>
                            <Table size="sm">
                                <Thead>
                                    <Tr>
                                        <Th>Time</Th>
                                        <Th>Type</Th>
                                        <Th>Severity</Th>
                                        <Th>Message</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {alarms.length > 0 ? (
                                        alarms.map((alarm) => (
                                            <Tr key={alarm.id}>
                                                <Td>{new Date(alarm.created_at).toLocaleTimeString()}</Td>
                                                <Td>{alarm.alarm_type}</Td>
                                                <Td>
                                                    <Badge colorScheme={
                                                        alarm.severity === 'critical' ? 'red' :
                                                            alarm.severity === 'warning' ? 'orange' : 'blue'
                                                    }>
                                                        {alarm.severity}
                                                    </Badge>
                                                </Td>
                                                <Td>{alarm.message}</Td>
                                            </Tr>
                                        ))
                                    ) : (
                                        <Tr>
                                            <Td colSpan={4} textAlign="center">No active alarms</Td>
                                        </Tr>
                                    )}
                                </Tbody>
                            </Table>
                        </TableContainer>
                    </TabPanel>
                </TabPanels>
            </Tabs>
        </VStack>
    );
}