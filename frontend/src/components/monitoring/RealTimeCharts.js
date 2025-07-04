// frontend/src/components/monitoring/RealTimeCharts.js - NEW FILE

'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Box,
    Card,
    CardHeader,
    CardBody,
    VStack,
    HStack,
    Text,
    Select,
    Button,
    IconButton,
    Tooltip,
    Badge,
    Flex,
    Heading,
} from '@chakra-ui/react';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip as ChartTooltip,
    Legend,
} from 'chart.js';
import { Play, Pause, RotateCcw, Download } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    ChartTooltip,
    Legend
);

export default function RealTimeCharts({ elementIds = [], chartType = 'voltage', maxDataPoints = 50 }) {
    const { telemetryData, connected } = useWebSocket();
    const [isPlaying, setIsPlaying] = useState(true);
    const [timeRange, setTimeRange] = useState('5m');
    const [chartData, setChartData] = useState({
        labels: [],
        datasets: [],
    });

    const chartRef = useRef(null);
    const dataBufferRef = useRef(new Map());

    // Color palette for different elements
    const colors = [
        '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
        '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6B7280'
    ];

    useEffect(() => {
        if (!isPlaying) return;

        const now = new Date();
        const timeLabel = now.toLocaleTimeString();

        // Update data buffer for each element
        elementIds.forEach((elementId, index) => {
            if (!dataBufferRef.current.has(elementId)) {
                dataBufferRef.current.set(elementId, {
                    labels: [],
                    data: [],
                    color: colors[index % colors.length],
                });
            }

            const buffer = dataBufferRef.current.get(elementId);
            const telemetry = telemetryData[elementId];

            if (telemetry?.metrics) {
                let value = 0;

                // Extract the relevant metric based on chart type
                switch (chartType) {
                    case 'voltage':
                        value = telemetry.metrics.voltage || 0;
                        break;
                    case 'power':
                        value = telemetry.metrics.power || 0;
                        break;
                    case 'current':
                        value = telemetry.metrics.current || 0;
                        break;
                    case 'loading':
                        value = telemetry.metrics.loading || 0;
                        break;
                    case 'frequency':
                        value = telemetry.metrics.frequency || 0;
                        break;
                    default:
                        value = 0;
                }

                // Add new data point
                buffer.labels.push(timeLabel);
                buffer.data.push(value);

                // Limit data points
                if (buffer.labels.length > maxDataPoints) {
                    buffer.labels.shift();
                    buffer.data.shift();
                }
            }
        });

        // Update chart data
        updateChartData();
    }, [telemetryData, elementIds, chartType, isPlaying, maxDataPoints]);

    const updateChartData = () => {
        const datasets = [];
        let commonLabels = [];

        // Find the longest label array for common x-axis
        dataBufferRef.current.forEach((buffer) => {
            if (buffer.labels.length > commonLabels.length) {
                commonLabels = [...buffer.labels];
            }
        });

        // Create datasets for each element
        elementIds.forEach((elementId) => {
            const buffer = dataBufferRef.current.get(elementId);
            if (buffer && buffer.data.length > 0) {
                datasets.push({
                    label: elementId,
                    data: buffer.data,
                    borderColor: buffer.color,
                    backgroundColor: buffer.color + '20',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                });
            }
        });

        setChartData({
            labels: commonLabels,
            datasets,
        });
    };

    const getChartOptions = () => {
        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: isPlaying ? 750 : 0,
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time',
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    },
                },
                y: {
                    title: {
                        display: true,
                        text: getYAxisLabel(),
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    },
                    beginAtZero: chartType === 'loading',
                },
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'start',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: (tooltipItems) => {
                            return `Time: ${tooltipItems[0].label}`;
                        },
                        label: (context) => {
                            const value = typeof context.parsed.y === 'number'
                                ? context.parsed.y.toFixed(2)
                                : context.parsed.y;
                            return `${context.dataset.label}: ${value} ${getUnit()}`;
                        },
                    },
                },
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false,
            },
        };

        return baseOptions;
    };

    const getYAxisLabel = () => {
        switch (chartType) {
            case 'voltage': return 'Voltage (kV)';
            case 'power': return 'Power (MW)';
            case 'current': return 'Current (A)';
            case 'loading': return 'Loading (%)';
            case 'frequency': return 'Frequency (Hz)';
            default: return 'Value';
        }
    };

    const getUnit = () => {
        switch (chartType) {
            case 'voltage': return 'kV';
            case 'power': return 'MW';
            case 'current': return 'A';
            case 'loading': return '%';
            case 'frequency': return 'Hz';
            default: return '';
        }
    };

    const clearData = () => {
        dataBufferRef.current.clear();
        setChartData({ labels: [], datasets: [] });
    };

    const exportData = () => {
        const exportData = {
            timestamp: new Date().toISOString(),
            chartType,
            elements: {},
        };

        dataBufferRef.current.forEach((buffer, elementId) => {
            exportData.elements[elementId] = {
                labels: buffer.labels,
                data: buffer.data,
            };
        });

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `telemetry-${chartType}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Card h="400px">
            <CardHeader pb={2}>
                <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                    <VStack align="start" spacing={1}>
                        <Heading size="sm">
                            Real-time {chartType.charAt(0).toUpperCase() + chartType.slice(1)} Monitoring
                        </Heading>
                        <HStack spacing={2}>
                            <Badge colorScheme={connected ? 'green' : 'red'} size="sm">
                                {connected ? 'LIVE' : 'OFFLINE'}
                            </Badge>
                            <Text fontSize="xs" color="gray.600">
                                {elementIds.length} element{elementIds.length !== 1 ? 's' : ''}
                            </Text>
                        </HStack>
                    </VStack>

                    <HStack spacing={2}>
                        <Select
                            size="sm"
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            w="auto"
                        >
                            <option value="1m">1 min</option>
                            <option value="5m">5 min</option>
                            <option value="15m">15 min</option>
                            <option value="1h">1 hour</option>
                        </Select>

                        <Tooltip label={isPlaying ? 'Pause updates' : 'Resume updates'}>
                            <IconButton
                                icon={isPlaying ? <Pause size={16} /> : <Play size={16} />}
                                onClick={() => setIsPlaying(!isPlaying)}
                                size="sm"
                                colorScheme={isPlaying ? 'red' : 'green'}
                                variant="outline"
                            />
                        </Tooltip>

                        <Tooltip label="Clear data">
                            <IconButton
                                icon={<RotateCcw size={16} />}
                                onClick={clearData}
                                size="sm"
                                variant="outline"
                            />
                        </Tooltip>

                        <Tooltip label="Export data">
                            <IconButton
                                icon={<Download size={16} />}
                                onClick={exportData}
                                size="sm"
                                variant="outline"
                            />
                        </Tooltip>
                    </HStack>
                </Flex>
            </CardHeader>

            <CardBody pt={2}>
                <Box h="300px">
                    {chartData.datasets.length > 0 ? (
                        <Line
                            ref={chartRef}
                            data={chartData}
                            options={getChartOptions()}
                        />
                    ) : (
                        <Flex
                            h="100%"
                            align="center"
                            justify="center"
                            direction="column"
                            color="gray.500"
                        >
                            <Text mb={2}>No data available</Text>
                            <Text fontSize="sm">
                                {!connected ? 'Connection required for real-time data' :
                                    elementIds.length === 0 ? 'No elements selected' :
                                        'Waiting for telemetry data...'}
                            </Text>
                        </Flex>
                    )}
                </Box>
            </CardBody>
        </Card>
    );
}