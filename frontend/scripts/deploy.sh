#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/fetch_memes.sh"
"${SCRIPT_DIR}/download_media.sh"

# Vite writes straight into ../backend/public (see vite.config.ts)
npm run build

cd ../backend

firebase use remote
firebase deploy --only hosting
firebase use local

cd ../frontend
