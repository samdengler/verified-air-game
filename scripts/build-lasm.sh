#!/usr/bin/env bash
# Build the Lasm engine inside a throwaway container, so its compiler and tools never
# run on this machine. Only a temporary copy of the game's Lean is mounted.
set -euo pipefail
cd "$(dirname "$0")/.."
LASM_VERSION="0.5.0"
WORK="$PWD/build/lasm-work"
mkdir -p "$WORK"
cp engines/lasm/lakefile.toml engines/lasm/lean-toolchain engines/lasm/Main.lean "$WORK/"
mkdir -p "$WORK/Game"
cp model/Game/{Session,Outcome,Standing,Streak,Crew,Engine}.lean "$WORK/Game/"
cat > "$WORK/index.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><title>Lean engine</title></head><body><div data-lasm-app></div></body></html>
HTML
docker run --rm -v "$WORK:/work" -w /work --memory=8g node:24-bookworm-slim sh -c "
  [ -f package.json ] || npm init -y >/dev/null
  [ -d node_modules/@lasm/cli ] || npm install -D --ignore-scripts @lasm/cli@$LASM_VERSION
  npm audit signatures | tail -3
  npx lasm --version &&
  npx lasm build Main.lean --target browser --output dist
"
rm -rf engines/lasm/dist
cp -R "$WORK/dist" engines/lasm/dist
ls -la engines/lasm/dist
