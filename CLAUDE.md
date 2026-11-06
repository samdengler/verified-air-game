# CLAUDE.md

A phone game for reviewing the Verified Air rules, with its own Lean model. The README explains the parts. The airline rules live in `../verified-air`, whose CLAUDE.md sets the rules for what may be claimed about them.

## Where things go

| Authored | Generated |
| --- | --- |
| `model/Game/`, `model/Design/`: the rules, the tokens and the theorems | `.kiro/specs/`, `vectors/`, `design/` (`npm run model`) |
| `model/Game/Spec.lean`, `model/Design/Spec.lean`: the specs, as Lean values | `web/tokens.css`, `web/model.js`, `web/engine.js`, `web/vectors.txt`, `web/lean/` (`scripts/sync-web.sh`) |
| `deck/pilot.toml`: card wording and the Lean names behind it | `web/deck.js` (`scripts/export_deck.py`) |
| `web/app.js`, `web/style.css`, `web/index.html`: the page | `verify/Rust/` (`scripts/translate-rust.sh`) |
| `engines/js`, `engines/rust`, `engines/lasm/Main.lean` | `engines/lasm/dist` (`scripts/build-lasm.sh`) |

## Rules for the model

- A rule goes in the model. If the page needs to decide something, add it to the model and to every engine, and let the vectors check them.
- Specs come from the model's values and compiled theorems. Never parse a docstring for them, and never hand-edit a generated file.
- A guarantee names a real theorem. An undecided point is an open question with a theorem showing the problem, as RG-009 was until it was decided.
- `model/Game` and `model/Design` import nothing from the airline rules, and those rules import nothing from here. Only `connect/` sees both.

## Rules for the page

- The page keeps no rules. `web/app.js` sends events to an engine and draws what returns. Layout, gestures, motion and copy live here.
- The page stays plain static files with no build step, so it also runs from `file://` and in a Claude artifact, on the JavaScript fallback.
- Use tokens only. `test/source.test.js` fails on a raw colour, and the browser test fails on any colour pair the design model does not allow.
- A new engine function needs a change in `model/Game/Engine.lean`, `Gen/Vectors.lean`, all three engines and `verify/RustGame.lean`.

## Rules for cards

- Statuses, example results and dependent counts come from the verified-air build. Never type one into `deck/pilot.toml`; use `requires`, `criterion`, `open`, `decision` or `proven`, so the export stops when the model changes.
- A card shows one case and one question in at most 40 words, with no model vocabulary. More waits behind "Behind this card".
- An answer changes no status. Don't write copy that implies it does.
- Rookie calls the expert Coach. Rookie's mistakes belong to the rulebook, and the game never tells an expert they are wrong.
- The game is called Gate Check. Internal names such as `review_game`, `review-game-*` and the `RG-` requirement IDs keep the old name, because renaming them means redoing the Rust proof.
- Going home from a shift is navigation in the page. It changes nothing in the session, so it is not an event in the model. Starting over clears the device, so it asks first.
- Rookie is a little jet, drawn once in `web/rookie.js`. Its eyes stay round and open in every mood, and it wears no cap: an earlier version with closed curved eyes and a cap could read as an ethnic caricature. Check any new character for that.
- Reward what cannot be farmed: nothing pays for volume or speed.
- Quote nothing from the EASD guide. Say "an example shows the rule breaking it", never "Lean found".

## Before committing

Run `npm run model`, `npm test`, `npm run e2e`, `npm run test:browsers` and `scripts/check-connected.sh`, and look at the screenshots for a visual change. After a change to `infra/`, also run `(cd infra && uv run --dev pytest -q)`.

The browser tests serve the game under `infra/csp.txt`, the live site's content security policy, so a page that needs more from the policy fails there first. Playwright's `waitForFunction` polls with `eval`, which the policy blocks, so tests on the game wait with `until`.

## Writing

No em or en dashes; short declarative sentences; headings that name the topic; no "X, not Y" contrasts, rhetorical setups or filler adverbs. Business-facing text uses the status words on the site: modelled, proven, open question, needs a decision, ready to build, waiting; and for criteria, proven, example only, open, not checked.
