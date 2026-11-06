#!/usr/bin/env bash
# The headless browser tests, in a container with Chromium, Firefox and WebKit.
set -euo pipefail
cd "$(dirname "$0")/.."
PW_VERSION="1.63.0"
mkdir -p build/pw
docker run --rm --ipc=host -v "$PWD:/work:ro" -v "$PWD/build/pw:/out" -w /out \
  "mcr.microsoft.com/playwright:v$PW_VERSION-noble" sh -c "
    [ -d node_modules/playwright ] || (npm init -y >/dev/null && npm install --no-audit --no-fund playwright@$PW_VERSION >/dev/null)
    cp /work/test/cross-browser.mjs /out/cross-browser.mjs
    ROOT=/work OUT=/out node /out/cross-browser.mjs
  "
