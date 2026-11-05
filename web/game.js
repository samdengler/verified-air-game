// The game's rules, with no DOM: which card is next, which side each answer
// sits on, what an answer means, and what the batch adds up to. Tests run this
// file directly in Node.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Game = api;
})(typeof self !== "undefined" ? self : this, function () {
  const DEPENDS = "depends";
  const NOT_MINE = "not-my-area";
  const YES_ON_RIGHT = new Set(["confirm", "seeded", "followup"]);

  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function newGame(deck, seed) {
    return { seed, commit: deck.source.commit, at: "intro", index: 0, answers: {}, shownAt: null };
  }

  // A follow-up card exists only when the answer it follows has a computed result.
  function activeCards(game, deck) {
    return deck.cards.filter((card) => {
      if (!card.dependsOn) return true;
      const parent = game.answers[card.dependsOn];
      return !parent || Boolean(card.variants[parent.choice]);
    });
  }

  function current(game, deck) {
    const card = activeCards(game, deck)[game.index];
    if (!card) return null;
    if (!card.dependsOn) return card;
    return { ...card, case: card.variants[game.answers[card.dependsOn].choice] };
  }

  function cardsLeft(game, deck) {
    const total = activeCards(game, deck).length;
    if (game.at === "intro") return total;
    if (game.at === "end") return 0;
    return total - game.index - (game.at === "reveal" ? 1 : 0);
  }

  // Two outcomes go on a swipe. Yes and no stay put. Outcome cards swap sides by
  // seed, so a habit of swiping one way produces no pattern of agreement.
  function sides(card, seed) {
    if (card.choices.length !== 2) return null;
    const [first, second] = card.choices.map((choice) => choice.id);
    if (YES_ON_RIGHT.has(card.kind)) return { left: first, right: second };
    return hash(`${seed}:${card.id}`) % 2 ? { left: second, right: first } : { left: first, right: second };
  }

  function outcomeOf(card, choice) {
    if (choice === DEPENDS) return "depends";
    if (choice === NOT_MINE) return "passed";
    switch (card.kind) {
      case "predict":
        return card.choices.find((c) => c.id === choice).model ? "match" : "mismatch";
      case "seeded":
        return choice === "no" ? "caught" : "missed";
      case "confirm":
      case "followup":
        return choice === "yes" ? "agreed" : "finding";
      case "reconcile":
        return "routed";
      default:
        return "decided";
    }
  }

  function start(game, now) {
    return { ...game, at: "card", index: 0, shownAt: now };
  }

  function advance(game, deck, now) {
    const index = game.index + 1;
    if (index >= activeCards(game, deck).length) return { ...game, at: "end", index, shownAt: null };
    return { ...game, at: "card", index, shownAt: now };
  }

  // Answering moves to the reveal. "Not my area" moves straight to the next card,
  // so an expert never sees the model's result for a case they passed on.
  function answer(game, deck, { choice, side = null, note = "", now }) {
    const card = current(game, deck);
    const record = {
      card: card.id,
      kind: card.kind,
      choice,
      side,
      note,
      seconds: Math.max(0, (now - game.shownAt) / 1000),
      outcome: outcomeOf(card, choice),
    };
    const next = { ...game, answers: { ...game.answers, [card.id]: record } };
    return choice === NOT_MINE ? advance(next, deck, now) : { ...next, at: "reveal" };
  }

  function addException(game, cardId, note) {
    const record = { ...game.answers[cardId], exception: true, note };
    return { ...game, answers: { ...game.answers, [cardId]: record } };
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function labelOf(card, choiceId) {
    const choice = card.choices.find((c) => c.id === choiceId);
    return choice ? choice.label : choiceId;
  }

  function dependsText(record) {
    return record.note ? `It depends: ${record.note}` : "It depends.";
  }

  function summary(game, deck) {
    const findings = [];
    const decisions = [];
    const routed = [];
    const passed = [];
    let check = null;

    for (const card of deck.cards) {
      const record = game.answers[card.id];
      if (!record) continue;
      const said = labelOf(card, record.choice);
      if (record.outcome === "mismatch") {
        const model = card.choices.find((c) => c.model).label;
        findings.push({ label: card.label, text: `You said: ${said}. The model says: ${model}.` });
      } else if (record.outcome === "finding") {
        findings.push({ label: card.label, text: "You said no." });
      } else if (record.outcome === "depends" && card.kind !== "decide") {
        findings.push({ label: card.label, text: dependsText(record) });
      }
      if (record.exception) {
        findings.push({ label: card.label, text: record.note ? `There are exceptions: ${record.note}` : "There are exceptions." });
      }
      if (record.outcome === "decided" || (record.outcome === "depends" && card.kind === "decide")) {
        const answer = record.outcome === "decided" ? `You chose: ${said}.` : `${dependsText(record)}${record.note ? "." : ""}`;
        decisions.push({ label: card.label, answer, dependents: card.reveal.dependents ? card.reveal.dependents.count : 0 });
      }
      if (record.outcome === "routed") routed.push({ label: card.label, said });
      if (record.outcome === "passed") passed.push({ label: card.label, who: record.note });
      if (record.outcome === "caught" || record.outcome === "missed") check = record.outcome;
    }
    decisions.sort((a, b) => b.dependents - a.dependents);

    const answered = Object.values(game.answers);
    return {
      answered: answered.length,
      medianSeconds: median(answered.map((a) => a.seconds)),
      findings,
      decisions,
      routed,
      passed,
      check,
    };
  }

  function exportAnswers(game, deck) {
    return {
      deck: deck.title,
      model: deck.source,
      answers: deck.cards
        .filter((card) => game.answers[card.id])
        .map((card) => {
          const { seconds, ...record } = game.answers[card.id];
          return { ...record, seconds: Math.round(seconds * 10) / 10, lean: card.behind.lean };
        }),
    };
  }

  return {
    DEPENDS,
    NOT_MINE,
    newGame,
    activeCards,
    current,
    cardsLeft,
    sides,
    outcomeOf,
    start,
    advance,
    answer,
    addException,
    median,
    labelOf,
    summary,
    exportAnswers,
  };
});
