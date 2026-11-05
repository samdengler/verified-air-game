# CLAUDE.md

A phone demo of swipe review for the Verified Air rules. The README explains the design and what is demo only. The model lives in `../verified-air`, whose CLAUDE.md sets the rules for what may be claimed about it.

## Layout

| Authored | Generated |
| --- | --- |
| `deck/pilot.toml`: card wording and the Lean names behind it | `web/deck.js` (`scripts/export_deck.py`, committed) |
| `web/game.js`: the rules, with no DOM | `test/out/` (`npm run e2e`, ignored) |
| `web/app.js`, `web/style.css`, `web/index.html`: the page | |

The page is plain files with classic scripts, so it also runs from `file://` and inside a Claude artifact. Keep it free of build steps and packages.

## Rules for cards

- Statuses, example results and dependent counts come from the verified-air build. Never type one into `deck/pilot.toml`; use `requires`, `criterion`, `open`, `decision` or `proven`, so the export stops when the model changes.
- A card shows one case and one question in at most 40 words, with no model vocabulary. More waits behind "Behind this card".
- No suggested answers, and no points, streaks or leaderboards. The reasons are in the Claude Doc the README links.
- An answer changes no status. Don't write copy that implies it does.
- Anything not from the model says so on the card, as the drift card does.
- Quote nothing from the EASD guide. Say "an example shows the rule breaking it", never "Lean found".

## Before committing

Run `npm test` and `npm run e2e`, and look at the screenshots for a visual change. Run `python3 scripts/export_deck.py --check` if the deck or the model changed.

## Writing

No em or en dashes; short declarative sentences; headings that name the topic; no "X, not Y" contrasts, rhetorical setups or filler adverbs. Business-facing text uses the status words on the site: modelled, proven, open question, needs a decision, ready to build, waiting; and for criteria, proven, example only, open, not checked.
