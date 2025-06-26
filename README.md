# Grid Monitoring and Simulation Tool

A web-based platform for real-time monitoring, visualization, and simulation of electrical grid networks.

## Features

- 🔌 **Real-time Monitoring**: Live telemetry data and system status
- 🗺️ **Interactive Network Visualization**: Drag-and-drop topology editor
- ⚡ **Power Flow Simulation**: Run simulations with various scenarios
- 👥 **Role-based Access Control**: Admin, Engineer, and Operator roles
- 🚨 **Alarm Management**: Real-time alerts with acknowledgment
- 📊 **Historical Data**: Time-series data storage and analysis

## Tech Stack

- **Frontend**: Next.js, React, Chakra UI, Cytoscape.js
- **Backend**: Node.js, Express, Socket.IO
- **Databases**: PostgreSQL (TimescaleDB), Neo4j
- **Cache/Queue**: Redis, BullMQ
- **Infrastructure**: Docker, Kubernetes-ready

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ & npm
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd grid-monitoring-tool