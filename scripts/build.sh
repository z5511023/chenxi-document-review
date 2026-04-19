#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --loglevel warn

echo "Copying pdf.js worker to public..."
mkdir -p public
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs

echo "Building frontend with Vite..."
pnpm vite build

echo "Bundling server with tsup..."
pnpm tsup server/server.ts --format cjs --platform node --target node20 --outDir dist-server --no-splitting --no-minify --external vite --external jszip

echo "Build completed successfully!"
