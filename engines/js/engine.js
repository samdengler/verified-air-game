// The game's rules, written by hand in JavaScript. Nothing proves this file equals
// the Lean model. test/engines.mjs checks it against every vector the model writes.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JsEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  const SHIFT = { INTRO: 0, ASKING: 1, REVEALED: 2, DONE: 3 };
  const EVENT = { START: 0, CALL: 1, DEPENDS: 2, NOT_MINE: 3, NEXT: 4 };

  function advance(phase, index, length) {
    if (index + 1 < length) return SHIFT.ASKING * 256 + index + 1;
    return SHIFT.DONE * 256 + index;
  }

  function session_step(phase, index, length, event) {
    if (phase > 3 || event > 4) return -2;
    if (phase === SHIFT.INTRO && event === EVENT.START) {
      return (length === 0 ? SHIFT.DONE : SHIFT.ASKING) * 256 + index;
    }
    if (phase === SHIFT.ASKING && (event === EVENT.CALL || event === EVENT.DEPENDS)) {
      return SHIFT.REVEALED * 256 + index;
    }
    if (phase === SHIFT.ASKING && event === EVENT.NOT_MINE) return advance(phase, index, length);
    if (phase === SHIFT.REVEALED && event === EVENT.NEXT) return advance(phase, index, length);
    return -1;
  }

  // sameCall 0, possibleCatch 1, exception 2, decisionSent 3, checkPassed 4, checkMissed 5, routed 6
  // Kinds: predict 0, confirm 1, decide 2, check 3, followUp 4, reconcile 5.
  function judge(kind, response) {
    if (kind > 5 || response > 3) return -2;
    if (response === 3) return 6;
    if (response === 2) return 2;
    if (kind === 2 || kind === 5) return 3;
    if (kind === 3) return response === 1 ? 4 : 5;
    return response === 0 ? 0 : 1;
  }

  const LOUDNESS = [1, 3, 1, 2, 3, 0, 0];
  function loudness(outcome) {
    return outcome < LOUDNESS.length ? LOUDNESS[outcome] : -2;
  }

  function title(upheld, checks) {
    if (upheld >= 6 && checks >= 6) return 2;
    if (upheld >= 3 && checks >= 3) return 1;
    return 0;
  }

  function streak_week(weeks, passes, answered) {
    if (answered !== 0) return (weeks + 1) * 256 + passes;
    if (passes > 0) return weeks * 256 + passes - 1;
    return passes;
  }

  function crew_revealed(rule, answered, notMine, onLeave, waiting) {
    if (rule > 1) return -2;
    if (rule === 0) return waiting === 0 && notMine === 0 && onLeave === 0 && answered > 0 ? 1 : 0;
    return waiting === 0 && answered > 0 ? 1 : 0;
  }

  const SHIFT_LIMIT = 5;
  function shift_length(cases) {
    return Math.min(cases, SHIFT_LIMIT);
  }

  function follow_up_shown(response) {
    if (response > 3) return -2;
    return response < 2 ? 1 : 0;
  }

  const YES_STAYS_RIGHT = [false, true, false, true, true, false];
  function sides_swapped(kind, seed, index) {
    if (kind > 5) return -2;
    if (YES_STAYS_RIGHT[kind]) return 0;
    return (seed % 2 + index % 2) % 2 === 1 ? 1 : 0;
  }

  return { session_step, judge, loudness, title, streak_week, crew_revealed, shift_length, follow_up_shown, sides_swapped };
});
