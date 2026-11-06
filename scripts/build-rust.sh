#!/usr/bin/env bash
# Compile the proved Rust rules to engines/rust/game.wasm.
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --quiet --release --target wasm32-unknown-unknown --manifest-path engines/rust/wasm/Cargo.toml
cp engines/rust/wasm/target/wasm32-unknown-unknown/release/review_game_wasm.wasm engines/rust/game.wasm
