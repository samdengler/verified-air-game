const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const G = require("../web/game.js");

function loadDeck() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../web/deck.js"), "utf8"), context);
  return JSON.parse(JSON.stringify(context.window.DECK));
}

const deck = loadDeck();
const byId = Object.fromEntries(deck.cards.map((c) => [c.id, c]));

function play(game, choices, now = 1000) {
  let g = game;
  for (const choice of choices) {
    g = G.answer(g, deck, { choice, now });
    if (g.at === "reveal") g = G.advance(g, deck, now);
  }
  return g;
}

const REST = ["created", "whole-fails", "yes", "per-payment", "no"];

test("a batch holds 5 to 10 cards and every kind the deck promises", () => {
  assert.ok(deck.cards.length >= 5 && deck.cards.length <= 10);
  assert.deepEqual(new Set(deck.cards.map((c) => c.kind)), new Set(["predict", "confirm", "decide", "seeded", "followup", "reconcile"]));
});

test("outcome cards swap sides by seed, and each seed keeps its layout", () => {
  const card = byId["accept-at-expiry"];
  const rights = new Set();
  let modelOnRight = 0;
  for (let i = 0; i < 400; i++) {
    const placed = G.sides(card, `seed-${i}`);
    assert.deepEqual(placed, G.sides(card, `seed-${i}`));
    rights.add(placed.right);
    if (placed.right === "rejected") modelOnRight++;
  }
  assert.equal(rights.size, 2);
  assert.ok(modelOnRight > 150 && modelOnRight < 250, `model on the right ${modelOnRight} of 400 times`);
});

test("yes stays on the right, and three choices get no swipe", () => {
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(G.sides(byId["refund-rule"], `s${i}`), { left: "no", right: "yes" });
    assert.deepEqual(G.sides(byId["late-payment-check"], `s${i}`), { left: "no", right: "yes" });
  }
  assert.equal(G.sides(byId["refund-limit"], "s"), null);
});

test("a prediction that differs from the model is a mismatch and a finding", () => {
  let g = G.start(G.newGame(deck, "s"), 0);
  g = G.answer(g, deck, { choice: "created", side: "left", now: 3000 });
  const record = g.answers["accept-at-expiry"];
  assert.equal(record.outcome, "mismatch");
  assert.equal(record.seconds, 3);
  assert.equal(g.at, "reveal");
  const s = G.summary(g, deck);
  assert.equal(s.findings.length, 1);
  assert.match(s.findings[0].text, /The model says: The offer is rejected as expired/);
});

test("the check card counts as caught on no and missed on yes", () => {
  assert.equal(G.outcomeOf(byId["late-payment-check"], "no"), "caught");
  assert.equal(G.outcomeOf(byId["late-payment-check"], "yes"), "missed");
});

test("the follow-up shows the result of the answer given", () => {
  const start = G.start(G.newGame(deck, "s"), 0);
  const failed = play(start, [...REST, "stays-failed"]);
  const success = play(start, [...REST, "becomes-successful"]);
  assert.equal(G.current(failed, deck).id, "late-capture-result");
  assert.match(G.current(failed, deck).case, /stays failed/);
  assert.match(G.current(success, deck).case, /paid for nothing/);
});

test("without a chosen answer the follow-up is skipped and the count shrinks", () => {
  const start = G.start(G.newGame(deck, "s"), 0);
  const before = play(start, REST);
  assert.equal(G.cardsLeft(before, deck), 5);
  const depends = play(start, [...REST, G.DEPENDS]);
  assert.equal(G.current(depends, deck).id, "removal-status");
  assert.equal(G.cardsLeft(depends, deck), 3);
});

test("not my area moves straight on, with no reveal of the model's result", () => {
  let g = G.start(G.newGame(deck, "s"), 0);
  g = G.answer(g, deck, { choice: G.NOT_MINE, note: "Revenue accounting", now: 10 });
  assert.equal(g.at, "card");
  assert.equal(g.index, 1);
  assert.deepEqual(G.summary(g, deck).passed, [{ label: byId["accept-at-expiry"].label, who: "Revenue accounting" }]);
});

test("an exception on a matching prediction becomes a finding", () => {
  let g = G.start(G.newGame(deck, "s"), 0);
  g = G.answer(g, deck, { choice: "rejected", now: 10 });
  g = G.addException(g, "accept-at-expiry", "Market");
  const s = G.summary(g, deck);
  assert.equal(s.findings.length, 1);
  assert.match(s.findings[0].text, /There are exceptions: Market/);
});

test("a full batch ends, ranks decisions by reach and exports every answer", () => {
  const g = play(G.start(G.newGame(deck, "s"), 0), [
    "rejected",
    "whole-fails",
    "yes",
    "per-payment",
    "no",
    "becomes-successful",
    "no",
    "removed",
    "rules",
    "ready",
  ]);
  assert.equal(g.at, "end");
  assert.equal(G.cardsLeft(g, deck), 0);
  const s = G.summary(g, deck);
  assert.equal(s.answered, 10);
  assert.equal(s.check, "caught");
  assert.equal(s.decisions[0].label, "Committing to pay nothing");
  assert.ok(s.decisions[0].dependents > s.decisions[1].dependents);
  assert.equal(s.findings.length, 1);
  const exported = G.exportAnswers(g, deck);
  assert.equal(exported.answers.length, 10);
  assert.equal(exported.model.commit, deck.source.commit);
  assert.ok(exported.answers.find((a) => a.card === "refund-limit").lean.includes("Rules.OfferOrder.refunds_le_payments"));
});

test("it depends on a decision goes to the owner with its reach", () => {
  const g = play(G.start(G.newGame(deck, "s"), 0), [...REST, "stays-failed", "yes", "removed", "rules", G.DEPENDS]);
  const s = G.summary(g, deck);
  assert.equal(s.decisions[0].label, "Committing to pay nothing");
  assert.equal(s.decisions[0].answer, "It depends.");
  assert.ok(!s.findings.some((f) => f.label === "Committing to pay nothing"));
});

test("the median handles odd, even and empty lists", () => {
  assert.equal(G.median([3, 1, 2]), 2);
  assert.equal(G.median([4, 1, 2, 3]), 2.5);
  assert.equal(G.median([]), 0);
});

test("no card shows model vocabulary or more than 40 words before it is answered", () => {
  for (const card of deck.cards) {
    for (const text of card.variants ? Object.values(card.variants) : [card.case]) {
      const face = `${text} ${card.question}`;
      assert.ok(face.split(/\s+/).length <= 40, `${card.id} is too long`);
      assert.doesNotMatch(face, /\b(reading|guarantee|theorem|lean)\b/i, card.id);
    }
  }
});
