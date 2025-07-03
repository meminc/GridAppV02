export const cytoscapeStyles = [
    // Base node styles
    {
        selector: 'node',
        style: {
            'background-color': '#666',
            'label': 'data(label)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'font-size': '12px',
            'text-margin-y': 5,
            'overlay-padding': '6px',
            'z-index': '10',
            'width': 40,
            'height': 40,
        },
    },

    // Bus nodes
    {
        selector: 'node[type="Bus"]',
        style: {
            'shape': 'ellipse',
            'background-color': '#3182ce',
            'border-width': 3,
            'border-color': '#2c5aa0',
            'width': 50,
            'height': 50,
        },
    },

    // Generator nodes
    {
        selector: 'node[type="Generator"]',
        style: {
            'shape': 'star',
            'background-color': '#48bb78',
            'border-width': 3,
            'border-color': '#38a169',
            'width': 60,
            'height': 60,
        },
    },

    // Load nodes
    {
        selector: 'node[type="Load"]',
        style: {
            'shape': 'triangle',
            'background-color': '#ed8936',
            'border-width': 3,
            'border-color': '#dd6b20',
            'width': 45,
            'height': 45,
        },
    },

    // Base edge styles
    {
        selector: 'edge',
        style: {
            'width': 3,
            'line-color': '#718096',
            'target-arrow-color': '#718096',
            'curve-style': 'straight',
            'label': 'data(label)',
            'font-size': '10px',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-rotation': 'autorotate',
            'text-margin-y': -10,
        },
    },

    // Line edges
    {
        selector: 'edge[type="Line"]',
        style: {
            'line-color': '#4a5568',
            'width': 4,
            'line-style': 'solid',
        },
    },

    // Transformer edges
    {
        selector: 'edge[type="Transformer"]',
        style: {
            'line-color': '#9f7aea',
            'width': 5,
            'line-style': 'solid',
            'mid-source-arrow-shape': 'circle',
            'mid-source-arrow-color': '#9f7aea',
            'mid-source-arrow-fill': 'filled',
        },
    },

    // Active/Selected styles
    {
        selector: 'node:selected',
        style: {
            'border-width': 6,
            'border-color': '#fbbf24',
            'overlay-color': '#fbbf24',
            'overlay-opacity': 0.2,
        },
    },

    {
        selector: 'edge:selected',
        style: {
            'width': 6,
            'line-color': '#fbbf24',
            'target-arrow-color': '#fbbf24',
            'mid-source-arrow-color': '#fbbf24',
        },
    },

    // Status-based styles
    {
        selector: 'node[status="offline"]',
        style: {
            'background-color': '#e53e3e',
            'opacity': 0.6,
        },
    },

    {
        selector: 'edge[status="offline"]',
        style: {
            'line-color': '#e53e3e',
            'opacity': 0.5,
            'line-style': 'dashed',
        },
    },

    {
        selector: 'node[status="warning"]',
        style: {
            'border-color': '#f59e0b',
            'border-width': 5,
            'border-style': 'double',
        },
    },

    {
        selector: 'edge[?loading > 90]',
        style: {
            'line-color': '#ef4444',
            'width': 6,
        },
    },

    {
        selector: 'edge[?loading > 70][?loading <= 90]',
        style: {
            'line-color': '#f59e0b',
            'width': 5,
        },
    },

    // Power flow animation
    {
        selector: '.power-flow',
        style: {
            'line-style': 'dashed',
            'line-dash-pattern': [6, 3],
            'line-dash-offset': 0,
        },
    },

    // Alarm states
    {
        selector: '.alarm',
        style: {
            'background-color': '#ef4444',
            'border-color': '#dc2626',
            'border-width': 4,
            'z-index': 999,
            'overlay-color': '#ef4444',
            'overlay-opacity': 0.3,
        },
    },

    {
        selector: 'edge.alarm',
        style: {
            'line-color': '#ef4444',
            'width': 6,
            'z-index': 999,
        },
    },

    // Hover effects
    {
        selector: 'node:hover',
        style: {
            'z-index': 999,
            'overlay-opacity': 0.2,
        },
    },

    {
        selector: 'edge:hover',
        style: {
            'width': 5,
            'z-index': 999,
        },
    },
];

export const cytoscapeLayoutOptions = {
    fcose: {
        name: 'fcose',
        quality: 'proof',
        randomize: false,
        animate: true,
        animationDuration: 1000,
        animationEasing: 'ease-out',
        fit: true,
        padding: 50,
        nodeDimensionsIncludeLabels: true,
        uniformNodeDimensions: false,
        packComponents: true,
        nodeRepulsion: 8000,
        idealEdgeLength: 100,
        edgeElasticity: 0.45,
        nestingFactor: 0.1,
        gravity: 0.25,
        numIter: 2500,
        tile: true,
        tilingPaddingVertical: 10,
        tilingPaddingHorizontal: 10,
        gravityRangeCompound: 1.5,
        gravityCompound: 1.2,
        gravityRange: 3.8,
        initialEnergyOnIncremental: 0.3,
    },

    cola: {
        name: 'cola',
        animate: true,
        refresh: 1,
        maxSimulationTime: 4000,
        ungrabifyWhileSimulating: false,
        fit: true,
        padding: 30,
        nodeSpacing: 50,
        flow: { axis: 'y', minSeparation: 30 },
        avoidOverlap: true,
        handleDisconnected: true,
        convergenceThreshold: 0.01,
    },

    hierarchical: {
        name: 'dagre',
        rankDir: 'TB',
        animate: true,
        animationDuration: 1000,
        fit: true,
        padding: 50,
        spacingFactor: 1.5,
        nodeSep: 100,
        rankSep: 150,
        avoidOverlap: true,
    },

    circular: {
        name: 'circle',
        fit: true,
        padding: 50,
        avoidOverlap: true,
        animate: true,
        animationDuration: 1000,
        radius: undefined,
        startAngle: 3 / 2 * Math.PI,
        sweep: undefined,
        clockwise: true,
        sort: undefined,
    },
};