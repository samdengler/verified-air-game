#!/usr/bin/env bash
# Copy what the model and the engines generate into web/, so the page stays plain static files.
set -euo pipefail
cd "$(dirname "$0")/.."
cp design/tokens.css web/tokens.css
cp design/model.js web/model.js
cp engines/js/engine.js web/engine.js
cp vectors/engine.jsonl web/vectors.txt
rm -rf web/lean
mkdir -p web/lean
cp engines/lasm/dist/app.js engines/lasm/dist/app.*.js engines/lasm/dist/app.*.wasm engines/lasm/dist/THIRD_PARTY_NOTICES.txt web/lean/
echo "web/ is in sync with the model"
