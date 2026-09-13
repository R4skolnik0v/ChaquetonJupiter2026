#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

IMAGE_NAME="chaqueton-backend:dev"

echo "Building Docker image..."
docker build -t "$IMAGE_NAME" .

echo "Seeding the database inside a temporary container..."
docker run --rm -v "$PWD":/app -w /app "$IMAGE_NAME" python3 -m app.seed

echo "Starting backend container (attached). Visit http://localhost:8000"
docker run --rm -p 8000:8000 -v "$PWD":/app -w /app "$IMAGE_NAME"
