# Verified Air review cards

A phone demo of swipe review for the [Verified Air](https://github.com/samdengler/verified-air) rules. An expert answers one short case at a time, and each answer gets an immediate response from the Lean model. It tries out the ideas in [Scaling SME review of the Verified Air rules](https://claude.ai/artifact/LXLSezwVaHj9u3rHFdXUDW).

Verified Air is a proof of concept, not affiliated with IATA.

![Five screens from a batch: dragging toward an answer, three choices, a follow-up computed from the last answer, the proven result of a decision, and a check card](docs/screens.png)

## Run it

There is nothing to install or build. Open `web/index.html`, or serve it so a phone on the same Wi-Fi can reach it:

```sh
npm start
# then open http://<this computer's address>:8010
```

Swipe the card toward your answer, or tap a sign. On a keyboard, use the left and right arrows, 1 to 4 for a list of choices, D for "It depends" and N for "Not my area".

## The batch

Ten cards from Payment and the pilot rules, the scope the doc proposes for a first pilot.

| Card | Kind | What it shows |
| --- | --- | --- |
| Accepting an offer at its expiry | Predict | You call the outcome before you see it, so neither direction means "agree". A wrong call is a finding. |
| One method declined in a split payment | Predict | The same, on a case with a less obvious answer. |
| When a refund is accepted | Confirm | A plain yes or no on a rule whose status is "not checked". |
| The limit on refunds | Decide | Three choices use taps. 15 cards depend on the answer. |
| A payment after the time limit | Check | A proven rule changed to be wrong, to measure what a yes is worth. |
| A card payment completed after removal | Decide | An open question with two computed outcomes. |
| The result of your late payment answer | Follow-up | The card changes with your last answer. Choosing "It becomes successful" shows that the customer has paid for nothing. |
| The status of a removed item's services | Decide | One choice is already proven, and the reveal says so. Another turns on a further open question. |
| The rules and the code at expiry | Reconcile | A mismatch between the rules and code goes to whoever your answer points at. |
| Committing to pay nothing | Decide | The top question on "Decide these first", with 51 cards depending on it. |

"It depends" and "Not my area" are on every card. Real batches would be mostly Predict cards. This one shows each kind once or more.

## What comes from the model

People write a card's wording in `deck/pilot.toml`. `scripts/export_deck.py` reads the rest from the verified-air build and writes `web/deck.js`:

- example results, rule sentences and their statuses from `build/status.json`
- dependent counts and the ranking from `scripts/graph_model.py`
- proven versions of open questions, found by the names the deck gives them

The export stops when a card no longer matches: a computed value changed, an open question was proven, a decision was taken, or a named theorem is gone. It also enforces the card rules: at most 40 words, and no model vocabulary such as "reading" or "theorem" before the card is answered.

`web/deck.js` is committed, so the demo runs without Lean. To rebuild it, run `scripts/build-site.sh` in `../verified-air`, then:

```sh
python3 scripts/export_deck.py          # write web/deck.js
python3 scripts/export_deck.py --check  # fail if it is stale
```

## What is demo only

- **The drift card is illustrative.** No running system is connected. It uses the change to the Java expiry check that the verified-air README describes, and the card says it is a demo case.
- **Choices for decisions are drafts.** The sources leave these questions open, and no modeller or expert has reviewed the wording.
- **Answers stay on the device.** There is no sign-in and no answer service. "Copy answers" gives the JSON that a service would receive.
- **There is one expert.** The end screen describes how three independent answers and an area owner would work, and nothing here combines answers.
- **Voice notes are not built.** "It depends" takes one line of text and optional tags.
- **An answer changes no status.** Someone edits the Lean, and the build computes the status.

## Design

The screen is an airfield by day, because the people answering work in airlines and a card is a decision point. Each element is the sign it would be there: a location sign names the area, a runway distance sign counts the cards left, direction signs carry the choices, and a red mandatory sign means hold. The painted centreline forks toward your answer as you drag.

The game loop follows the doc: the model responds to each answer, and there are no points, streaks or leaderboards. Those would reward speed and discourage "It depends". The last screen borrows Lean's "No goals" message.

Sides swap by seed on outcome cards, so a habit of swiping one way produces no pattern of agreement. Yes stays on the right on yes or no cards.

The typeface is [Overpass](https://github.com/RedHatOfficial/Overpass), under the SIL Open Font License (`web/fonts/Overpass-LICENSE.txt`).

## Tests

```sh
npm test       # game rules in Node, export checks in Python
npm run e2e    # a whole batch in headless Chrome with real touch events
```

`npm run e2e` saves a screenshot of each step to `test/out`. Set `SIZE=320x568` to try another screen.
