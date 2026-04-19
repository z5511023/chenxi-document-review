#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Installing Python PyMuPDF (if available)..."
pip3 install PyMuPDF 2>/dev/null || echo "Python/PyMuPDF not available, will use Node.js fallback for PDF parsing"

echo "Building frontend with Vite..."
pnpm vite build

echo "Bundling server with tsup..."
pnpm tsup server/server.ts --format cjs --platform node --target node20 --outDir dist-server --no-splitting --no-minify --external vite

echo "Copying PDF parser script to dist..."
mkdir -p dist-server/src
cp server/src/pdf-parser.py dist-server/src/pdf-parser.py

echo "Build completed successfully!"
