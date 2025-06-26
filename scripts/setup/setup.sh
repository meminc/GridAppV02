#!/bin/bash

echo "🚀 Grid Monitoring Tool - Development Setup"
echo "=========================================="

# Check prerequisites
echo "📋 Checking prerequisites..."

command -v docker >/dev/null 2>&1 || { 
  echo "❌ Docker is required but not installed. Please install Docker first." >&2; 
  exit 1; 
}

command -v docker-compose >/dev/null 2>&1 || command -v docker compose >/dev/null 2>&1 || { 
  echo "❌ Docker Compose is required but not installed." >&2; 
  exit 1; 
}

command -v node >/dev/null 2>&1 || { 
  echo "❌ Node.js is required but not installed." >&2; 
  exit 1; 
}

echo "✅ All prerequisites met!"

# Copy environment files
echo "📁 Setting up environment files..."
cp backend/.env.example backend/.env 2>/dev/null || echo "⚠️  Backend .env already exists"
cp frontend/.env.example frontend/.env 2>/dev/null || echo "⚠️  Frontend .env already exists"

# Build containers
echo "🔨 Building Docker containers..."
docker compose build

# Start services
echo "🚀 Starting services..."
docker compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🏥 Checking service health..."
docker compose ps

# Run database migrations
echo "📊 Running database migrations..."
docker compose exec -T backend npm run migrate up

# Seed initial data
echo "🌱 Seeding initial data..."
docker compose exec -T backend npm run seed

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎉 Grid Monitoring Tool is ready!"
echo "================================="
echo "📍 Frontend: http://localhost:3000"
echo "📍 Backend API: http://localhost:3001"
echo "📍 Neo4j Browser: http://localhost:7474"
echo ""
echo "🔐 Default credentials:"
echo "   Admin: admin@gridmonitor.com / admin123"
echo "   Engineer: engineer@gridmonitor.com / engineer123"
echo "   Operator: operator@gridmonitor.com / operator123"
echo ""
echo "📝 Useful commands:"
echo "   make logs     - View logs"
echo "   make down     - Stop services"
echo "   make restart  - Restart services"
echo "   make test     - Run tests"