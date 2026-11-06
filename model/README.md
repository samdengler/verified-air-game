# The review game's model

The app's rules and the design system's rules, in Lean. `lake build` checks every theorem.

| Command | Writes |
| --- | --- |
| `lake exe vectors` | `vectors/engine.jsonl`, the cases every engine must answer as the model does |
| `lake exe specs` | `.kiro/specs/`, from values in `Game/Spec.lean`, `Design/Spec.lean` and the compiled theorems. It parses no docstring, and stops if a named theorem is missing or rests on `sorry` |
| `lake exe design-tokens` | `design/`: CSS, W3C design tokens, Swift, Kotlin, documentation and UI check expectations |

`npm run model` from the repository root runs all of them.

This package imports nothing from the airline rules, and they import nothing from it. `connect/Deck.lean` is the one file that sees both, and `scripts/check-connected.sh` checks it and the Rust proof against a built `../verified-air`.
