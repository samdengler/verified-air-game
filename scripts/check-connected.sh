#!/usr/bin/env bash
# Build the Lean that sees more than the game's model: the Rust proof and the deck.
# They use verified-air's compiled packages, so this needs ../verified-air built.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd model && lake build Game >/dev/null)
VA="$(cd ../verified-air && lake env printenv LEAN_PATH)"
OUT="$PWD/build/connect"
mkdir -p "$OUT/Rust"
export LEAN_PATH="$OUT:$PWD/model/.lake/build/lib/lean:$VA"
LEAN="$(cd model && lake env which lean)"
compile() { # root file olean
  "$LEAN" --root="$1" "$2" -o "$OUT/$3.olean" -i "$OUT/$3.ilean"
}
compile verify verify/Rust/ReviewGame.lean Rust/ReviewGame
compile verify verify/RustGame.lean RustGame
[ -f connect/Deck.lean ] && compile connect connect/Deck.lean Deck
echo "connected Lean checks"
python3 - <<'PY'
import json, re, sys
source = open("connect/Deck.lean").read()
fp = re.search(r'acceptFingerprint : String := "([0-9a-f]+)"', source).group(1)
decls = {d["name"]: d for d in json.load(open("../verified-air/build/status.json"))["declarations"]}
current = decls["Rules.OfferOrder.accept"]["fingerprint"]
if fp != current:
    sys.exit(f"Rules.OfferOrder.accept changed: the deck has {fp}, the build has {current}")
print("deck fingerprints match the build")
PY
