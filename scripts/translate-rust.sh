#!/usr/bin/env bash
# Translate engines/rust/core into Lean with Charon and Aeneas, writing verify/Rust/ReviewGame.lean.
# Uses the Aeneas release verified-air already pins and has unpacked.
set -euo pipefail
cd "$(dirname "$0")/.."
AENEAS_DIR="${AENEAS_DIR:-../verified-air/.aeneas/nightly-2026.10.26-da2b22e}"
AENEAS_DIR="$(cd "$AENEAS_DIR" && pwd)"
toolchain="$(sed -n 's/^channel = "\(.*\)"/\1/p' "$AENEAS_DIR/rust-toolchain")"
mkdir -p build/rust verify/Rust
(cd engines/rust/core && RUSTUP_TOOLCHAIN="$toolchain" "$AENEAS_DIR/charon" cargo --preset=aeneas \
  --dest-file ../../../build/rust/review_game.llbc)
"$AENEAS_DIR/aeneas" -backend lean -dest verify/Rust build/rust/review_game.llbc
