'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
    Box,
    Card,
    VStack,
    HStack,
    Button,
    ButtonGroup,
    Select,
    IconButton,
    Tooltip,
    useToast,
    Drawer,
    DrawerBody,
    DrawerHeader,
    DrawerOverlay,
    DrawerContent,
    DrawerCloseButton,
    useDisclosure,
} from '@chakra-ui/react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';
import { cytoscapeStyles, cytoscapeLayoutOptions } from '@/config/cytoscapeStyles';
import {
    ZoomIn,
    ZoomOut,
    Maximize,
    Download,
    Upload,
    Grid3x3,
    Play,
    Pause,
    RefreshCw,
    Eye,
    EyeOff,
    Settings,
} from 'lucide-react';
import ElementDetails from './ElementDetails';
// import NetworkToolbar from './NetworkToolbar';
import { useWebSocket } from '@/hooks/useWebSocket';
import api from '@/utils/api';

// Register Cytoscape extensions
cytoscape.use(fcose);
cytoscape.use(cola);
cytoscape.use(dagre);

export default function NetworkViewer() {
    const containerRef = useRef(null);
    const cyRef = useRef(null);
    const [selectedElement, setSelectedElement] = useState(null);
    const [layout, setLayout] = useState('fcose');
    const [isAnimating, setIsAnimating] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [showPowerFlow, setShowPowerFlow] = useState(false);
    const [overlayMode, setOverlayMode] = useState('none');
    const { isOpen, onOpen, onClose } = useDisclosure();
    const toast = useToast();

    // WebSocket for real-time updates
    const { telemetryData, subscribeToElements } = useWebSocket();

    // Initialize Cytoscape
    useEffect(() => {
        if (!containerRef.current) return;

        const cy = cytoscape({
            container: containerRef.current,
            style: cytoscapeStyles,
            elements: [],
            layout: { name: 'preset' },
            minZoom: 0.1,
            maxZoom: 4,
            wheelSensitivity: 0.2,
            boxSelectionEnabled: true,
            autounselectify: false,
            autoungrabify: false,
        });

        cyRef.current = cy;

        // Event handlers
        cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            setSelectedElement({
                type: 'node',
                data: node.data(),
                id: node.id(),
            });
            onOpen();
        });

        cy.on('tap', 'edge', (evt) => {
            const edge = evt.target;
            setSelectedElement({
                type: 'edge',
                data: edge.data(),
                id: edge.id(),
            });
            onOpen();
        });

        cy.on('tap', (evt) => {
            if (evt.target === cy) {
                setSelectedElement(null);
            }
        });

        // Load initial topology
        loadTopology();

        return () => {
            cy.destroy();
        };
    }, []);

    // Load topology from backend
    const loadTopology = async () => {
        try {
            const response = await api.get('/api/topology');
            const { nodes, edges } = response.data;

            const elements = [
                ...nodes.map(node => ({
                    group: 'nodes',
                    data: {
                        id: node.id,
                        label: node.name,
                        type: node.type,
                        ...node.properties,
                    },
                    position: node.position || undefined,
                })),
                ...edges.map(edge => ({
                    group: 'edges',
                    data: {
                        id: edge.id,
                        source: edge.source,
                        target: edge.target,
                        label: edge.name || '',
                        ...edge.properties,
                    },
                })),
            ];

            cyRef.current.add(elements);

            // Subscribe to telemetry for all elements
            const elementIds = nodes.map(n => n.id);
            subscribeToElements(elementIds);

            // Apply initial layout
            applyLayout(layout);
        } catch (error) {
            toast({
                title: 'Failed to load network',
                description: error.response?.data?.error || 'Network load failed',
                status: 'error',
                duration: 5000,
            });
        }
    };

    // Apply layout
    const applyLayout = useCallback((layoutName) => {
        if (!cyRef.current) return;

        setIsAnimating(true);
        const layoutOptions = cytoscapeLayoutOptions[layoutName] || cytoscapeLayoutOptions.fcose;

        const layout = cyRef.current.layout(layoutOptions);
        layout.run();

        layout.on('layoutstop', () => {
            setIsAnimating(false);
        });
    }, []);

    // Update telemetry data
    useEffect(() => {
        if (!cyRef.current || !telemetryData) return;

        Object.entries(telemetryData).forEach(([elementId, data]) => {
            const element = cyRef.current.getElementById(elementId);
            if (element) {
                // Update element data
                element.data('telemetry', data.metrics);

                // Update visual properties based on telemetry
                if (data.metrics.voltage) {
                    element.data('voltageLevel', data.metrics.voltage);
                }

                if (data.metrics.status) {
                    element.data('status', data.metrics.status);
                }

                // Add alarm class if needed
                if (data.metrics.alarm) {
                    element.addClass('alarm');
                } else {
                    element.removeClass('alarm');
                }
            }
        });
    }, [telemetryData]);

    // Toolbar actions
    const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
    const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
    const handleFit = () => cyRef.current?.fit(50);

    const handleExport = () => {
        const topology = {
            nodes: cyRef.current.nodes().map(n => ({
                id: n.id(),
                data: n.data(),
                position: n.position(),
            })),
            edges: cyRef.current.edges().map(e => ({
                id: e.id(),
                data: e.data(),
            })),
        };

        const blob = new Blob([JSON.stringify(topology, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `network-topology-${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleLabels = () => {
        setShowLabels(!showLabels);
        cyRef.current.style()
            .selector('node')
            .style('label', showLabels ? '' : 'data(label)')
            .update();
    };

    const togglePowerFlow = () => {
        setShowPowerFlow(!showPowerFlow);
        if (!showPowerFlow) {
            cyRef.current.edges().addClass('power-flow');
            animatePowerFlow();
        } else {
            cyRef.current.edges().removeClass('power-flow');
        }
    };

    const animatePowerFlow = () => {
        let offset = 0;
        const animate = () => {
            if (!showPowerFlow) return;

            offset = (offset + 1) % 24;
            cyRef.current.style()
                .selector('.power-flow')
                .style('line-dash-offset', offset)
                .update();

            requestAnimationFrame(animate);
        };
        animate();
    };

    return (
        <Box h="full" position="relative">
            <Card h="full">
                <VStack h="full" spacing={0}>
                    {/* Toolbar */}
                    <HStack w="full" p={4} borderBottom="1px" borderColor="gray.200" spacing={4}>
                        <ButtonGroup size="sm" isAttached variant="outline">
                            <Tooltip label="Zoom In">
                                <IconButton icon={<ZoomIn size={18} />} onClick={handleZoomIn} />
                            </Tooltip>
                            <Tooltip label="Zoom Out">
                                <IconButton icon={<ZoomOut size={18} />} onClick={handleZoomOut} />
                            </Tooltip>
                            <Tooltip label="Fit to Screen">
                                <IconButton icon={<Maximize size={18} />} onClick={handleFit} />
                            </Tooltip>
                        </ButtonGroup>

                        <Select size="sm" value={layout} onChange={(e) => {
                            setLayout(e.target.value);
                            applyLayout(e.target.value);
                        }} w="150px">
                            <option value="fcose">Force-Directed</option>
                            <option value="cola">Cola</option>
                            <option value="hierarchical">Hierarchical</option>
                            <option value="circular">Circular</option>
                        </Select>

                        <ButtonGroup size="sm" variant="outline">
                            <Tooltip label={showLabels ? "Hide Labels" : "Show Labels"}>
                                <IconButton
                                    icon={showLabels ? <Eye size={18} /> : <EyeOff size={18} />}
                                    onClick={toggleLabels}
                                    colorScheme={showLabels ? "blue" : undefined}
                                />
                            </Tooltip>
                            <Tooltip label="Toggle Power Flow">
                                <IconButton
                                    icon={showPowerFlow ? <Pause size={18} /> : <Play size={18} />}
                                    onClick={togglePowerFlow}
                                    colorScheme={showPowerFlow ? "green" : undefined}
                                />
                            </Tooltip>
                        </ButtonGroup>

                        <Select size="sm" value={overlayMode} onChange={(e) => setOverlayMode(e.target.value)} w="150px">
                            <option value="none">No Overlay</option>
                            <option value="voltage">Voltage Levels</option>
                            <option value="load">Load Status</option>
                            <option value="alarms">Active Alarms</option>
                        </Select>

                        <ButtonGroup size="sm" variant="outline">
                            <Tooltip label="Export Topology">
                                <IconButton icon={<Download size={18} />} onClick={handleExport} />
                            </Tooltip>
                            <Tooltip label="Refresh">
                                <IconButton
                                    icon={<RefreshCw size={18} />}
                                    onClick={loadTopology}
                                    isLoading={isAnimating}
                                />
                            </Tooltip>
                        </ButtonGroup>
                    </HStack>

                    {/* Cytoscape Container */}
                    <Box ref={containerRef} flex="1" w="full" bg="gray.50" />
                </VStack>
            </Card>

            {/* Element Details Drawer */}
            <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
                <DrawerOverlay />
                <DrawerContent>
                    <DrawerCloseButton />
                    <DrawerHeader>
                        {selectedElement?.data.type} Details
                    </DrawerHeader>
                    <DrawerBody>
                        {selectedElement && (
                            <ElementDetails
                                element={selectedElement}
                                telemetry={telemetryData[selectedElement.id]}
                                onUpdate={(updates) => {
                                    // Update element in Cytoscape
                                    const el = cyRef.current.getElementById(selectedElement.id);
                                    if (el) {
                                        Object.entries(updates).forEach(([key, value]) => {
                                            el.data(key, value);
                                        });
                                    }
                                }}
                            />
                        )}
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </Box>
    );
}