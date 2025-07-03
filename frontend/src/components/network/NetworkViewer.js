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

            // Filter nodes to exclude Lines and Transformers (they should be edges)
            const actualNodes = nodes.filter(node =>
                !['Line', 'Transformer'].includes(node.type)
            );

            // Create Cytoscape elements
            const elements = [
                // Add actual nodes (Buses, Generators, Loads)
                ...actualNodes.map(node => ({
                    group: 'nodes',
                    data: {
                        id: node.id,
                        label: node.name,
                        type: node.type,
                        ...node.properties,
                    },
                    position: node.position || undefined,
                })),

                // Add edges (Lines and Transformers as connections)
                ...edges.map(edge => {
                    // Ensure we have valid source and target
                    if (!edge.source || !edge.target) {
                        console.warn('Edge missing source/target:', edge);
                        return null;
                    }

                    return {
                        group: 'edges',
                        data: {
                            id: edge.id,
                            source: edge.source,
                            target: edge.target,
                            label: edge.name || `${edge.source}-${edge.target}`,
                            type: edge.type || 'Line',
                            elementType: edge.type || 'Line', // For compatibility
                            ...edge.properties,
                        },
                    };
                }).filter(Boolean) // Remove null entries
            ];

            console.log('Loading elements:', {
                nodes: actualNodes.length,
                edges: edges.length,
                elements: elements.length
            });

            // Clear existing elements and add new ones
            cyRef.current.elements().remove();
            cyRef.current.add(elements);

            // Subscribe to telemetry for all actual nodes
            const elementIds = actualNodes.map(n => n.id);
            subscribeToElements(elementIds);

            // Apply initial layout if we have elements
            if (elements.length > 0) {
                applyLayout(layout);
            }

            toast({
                title: 'Network loaded',
                description: `Loaded ${actualNodes.length} nodes and ${edges.length} connections`,
                status: 'success',
                duration: 3000,
            });
        } catch (error) {
            console.error('Failed to load topology:', error);
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
        if (!cyRef.current || cyRef.current.elements().length === 0) return;

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
            if (element && element.isNode()) {
                // Update element data
                element.data('telemetry', data.metrics);

                // Update visual properties based on telemetry
                if (data.metrics.voltage !== undefined) {
                    element.data('voltage', data.metrics.voltage);

                    // Update voltage level for visual feedback
                    const baseVoltage = element.data('voltageLevel') || element.data('voltage_level') || 110;
                    const voltageRatio = data.metrics.voltage / baseVoltage;

                    // Color coding based on voltage
                    if (voltageRatio > 1.05) {
                        element.addClass('high-voltage');
                        element.removeClass('low-voltage normal-voltage');
                    } else if (voltageRatio < 0.95) {
                        element.addClass('low-voltage');
                        element.removeClass('high-voltage normal-voltage');
                    } else {
                        element.addClass('normal-voltage');
                        element.removeClass('high-voltage low-voltage');
                    }
                }

                if (data.metrics.status) {
                    element.data('status', data.metrics.status);
                }

                // Handle power output for generators
                if (data.metrics.power !== undefined && element.data('type') === 'Generator') {
                    element.data('output', data.metrics.power);

                    // Update generator visual based on output
                    const capacity = element.data('capacity') || 100;
                    const outputRatio = data.metrics.power / capacity;

                    if (outputRatio > 0.8) {
                        element.addClass('high-output');
                    } else if (outputRatio > 0.5) {
                        element.addClass('medium-output');
                    } else if (outputRatio > 0) {
                        element.addClass('low-output');
                    } else {
                        element.addClass('offline');
                    }
                }

                // Handle load data
                if (data.metrics.power !== undefined && element.data('type') === 'Load') {
                    element.data('currentDemand', data.metrics.power);
                }

                // Add alarm class if needed
                if (data.metrics.alarm || data.metrics.voltageChange > 5) {
                    element.addClass('alarm');
                } else {
                    element.removeClass('alarm');
                }
            }

            // Update edge data for lines and transformers
            if (element && element.isEdge()) {
                if (data.metrics.current !== undefined) {
                    element.data('current', data.metrics.current);
                }

                if (data.metrics.loading !== undefined) {
                    element.data('loading', data.metrics.loading);

                    // Visual feedback for line loading
                    if (data.metrics.loading > 90) {
                        element.addClass('overloaded');
                        element.removeClass('normal-load warning-load');
                    } else if (data.metrics.loading > 70) {
                        element.addClass('warning-load');
                        element.removeClass('overloaded normal-load');
                    } else {
                        element.addClass('normal-load');
                        element.removeClass('overloaded warning-load');
                    }
                }
            }
        });
    }, [telemetryData]);

    // Apply overlay mode
    useEffect(() => {
        if (!cyRef.current) return;

        // Remove existing overlay classes
        cyRef.current.elements().removeClass('overlay-voltage overlay-load overlay-alarms');

        switch (overlayMode) {
            case 'voltage':
                cyRef.current.nodes().addClass('overlay-voltage');
                break;
            case 'load':
                cyRef.current.nodes('[type="Load"]').addClass('overlay-load');
                cyRef.current.nodes('[type="Generator"]').addClass('overlay-load');
                break;
            case 'alarms':
                cyRef.current.elements('.alarm').addClass('overlay-alarms');
                break;
        }
    }, [overlayMode]);

    // Toolbar actions
    const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
    const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
    const handleFit = () => cyRef.current?.fit(50);

    const handleExport = () => {
        if (!cyRef.current) return;

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
        a.download = `network-topology-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        toast({
            title: 'Topology exported',
            description: 'Network topology has been exported successfully',
            status: 'success',
            duration: 3000,
        });
    };

    const toggleLabels = () => {
        setShowLabels(!showLabels);
        if (cyRef.current) {
            cyRef.current.style()
                .selector('node, edge')
                .style('label', !showLabels ? 'data(label)' : '')
                .update();
        }
    };

    const togglePowerFlow = () => {
        setShowPowerFlow(!showPowerFlow);
        if (!showPowerFlow) {
            cyRef.current?.edges().addClass('power-flow');
            animatePowerFlow();
        } else {
            cyRef.current?.edges().removeClass('power-flow');
        }
    };

    const animatePowerFlow = () => {
        if (!showPowerFlow || !cyRef.current) return;

        let offset = 0;
        const animate = () => {
            if (!showPowerFlow || !cyRef.current) return;

            offset = (offset + 2) % 24;
            cyRef.current.style()
                .selector('.power-flow')
                .style('line-dash-offset', offset)
                .update();

            requestAnimationFrame(animate);
        };
        animate();
    };

    const saveLayout = async () => {
        if (!cyRef.current) return;

        try {
            const positions = {};
            cyRef.current.nodes().forEach(node => {
                positions[node.id()] = node.position();
            });

            await api.put('/api/topology/update', {
                nodes: cyRef.current.nodes().map(n => ({
                    id: n.id(),
                    position: n.position(),
                })),
            });

            toast({
                title: 'Layout saved',
                description: 'Node positions have been saved',
                status: 'success',
                duration: 3000,
            });
        } catch (error) {
            toast({
                title: 'Failed to save layout',
                description: error.response?.data?.error || 'An error occurred',
                status: 'error',
                duration: 5000,
            });
        }
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
                            <Tooltip label="Toggle Power Flow Animation">
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
                            <Tooltip label="Save Layout">
                                <IconButton icon={<Upload size={18} />} onClick={saveLayout} />
                            </Tooltip>
                            <Tooltip label="Export Topology">
                                <IconButton icon={<Download size={18} />} onClick={handleExport} />
                            </Tooltip>
                            <Tooltip label="Refresh Network">
                                <IconButton
                                    icon={<RefreshCw size={18} />}
                                    onClick={loadTopology}
                                    isLoading={isAnimating}
                                />
                            </Tooltip>
                        </ButtonGroup>
                    </HStack>

                    {/* Cytoscape Container */}
                    <Box ref={containerRef} flex="1" w="full" bg="gray.50" position="relative">
                        {/* Loading overlay */}
                        {isAnimating && (
                            <Box
                                position="absolute"
                                top="50%"
                                left="50%"
                                transform="translate(-50%, -50%)"
                                bg="white"
                                p={4}
                                borderRadius="md"
                                shadow="md"
                                zIndex={1000}
                            >
                                Applying layout...
                            </Box>
                        )}
                    </Box>
                </VStack>
            </Card>

            {/* Element Details Drawer */}
            <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
                <DrawerOverlay />
                <DrawerContent>
                    <DrawerCloseButton />
                    <DrawerHeader>
                        {selectedElement?.data.type || selectedElement?.data.elementType} Details
                    </DrawerHeader>
                    <DrawerBody>
                        {selectedElement && (
                            <ElementDetails
                                element={selectedElement}
                                telemetry={telemetryData[selectedElement.id]}
                                onUpdate={(updates) => {
                                    // Update element in Cytoscape
                                    const el = cyRef.current?.getElementById(selectedElement.id);
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