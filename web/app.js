// Gate Check's page. It keeps no rules: every decision comes from an engine built from the
// Lean model, or from model.js and deck.js, which are generated. This file draws what they return
// and handles gestures, motion and vibration.
(function () {
  const DECK = window.DECK;
  const MODEL = window.MODEL;
  const app = document.getElementById("app");
  const sheet = document.getElementById("sheet");
  const live = document.getElementById("live");
  const params = new URLSearchParams(location.search);
  const byId = Object.fromEntries(DECK.cards.map((card) => [card.id, card]));

  const PHASE = { INTRO: 0, ASKING: 1, REVEALED: 2, DONE: 3 };
  const EVENT = { START: 0, CALL: 1, DEPENDS: 2, NOT_MINE: 3, NEXT: 4 };
  const RESPONSE = { DEPENDS: 2, NOT_MINE: 3 };
  const OUTCOME = { SAME: 0, CATCH: 1, EXCEPTION: 2, DECISION: 3, CHECK_PASSED: 4, CHECK_MISSED: 5, ROUTED: 6 };
  const TITLES = ["Shift lead", "Duty manager", "Station manager"];
  const STORE = `review-game/${DECK.source.commit}`;
  const WEEK_MS = 7 * 24 * 3600 * 1000;

  // ------------------------------------------------------------ the engine

  let engine = null;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function loadEngine() {
    const js = window.JsEngine;
    const fallback = { name: "JavaScript", detail: "hand-written, and tested against the model", call: (f, a) => js[f](...a) };
    if (params.get("engine") === "js") return fallback;
    try {
      await Promise.race([import("./lean/app.js"), wait(5000).then(() => { throw new Error("slow"); })]);
      for (let waited = 0; waited < 5000 && !globalThis.__leanEngine; waited += 10) await wait(10);
      const lean = globalThis.__leanEngine;
      if (!lean || lean("shift_length", 3) !== js.shift_length(3)) return fallback;
      return { name: "Lean", detail: "the model itself, compiled to WebAssembly with Lasm", call: (f, a) => lean(f, ...a) };
    } catch {
      return fallback;
    }
  }

  const call = (name, ...args) => engine.call(name, args);

  // ------------------------------------------------------------ what is remembered

  function fresh() {
    const week = Math.floor(Date.now() / WEEK_MS);
    return {
      seed: params.has("seed") ? Number(params.get("seed")) : Math.floor(Math.random() * 1000),
      shift: 0,
      session: { phase: PHASE.INTRO, index: 0, length: 0 },
      answers: {},
      checksPassed: 0,
      streak: { weeks: 0, passes: MODEL.passLimit, week, answered: false },
    };
  }

  let state = fresh();

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (saved && !params.has("fresh")) state = saved;
    } catch {
      /* Private modes can refuse storage. The game still works for this visit. */
    }
    if (state.shift >= DECK.shifts.length) state.shift = 0;
    state.session.length = call("shift_length", DECK.shifts[state.shift].cards.length);
    closeElapsedWeeks();
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch {
      /* As above. */
    }
  }

  function closeElapsedWeeks() {
    const now = Math.floor(Date.now() / WEEK_MS);
    const streak = state.streak;
    while (streak.week < now) {
      const code = call("streak_week", streak.weeks, streak.passes, streak.answered ? 1 : 0);
      streak.weeks = code >> 8;
      streak.passes = code & 255;
      streak.answered = false;
      streak.week += 1;
    }
  }

  // ------------------------------------------------------------ the shift

  const shiftCards = () => DECK.shifts[state.shift].cards.slice(0, state.session.length).map((id) => byId[id]);
  const currentCard = () => shiftCards()[state.session.index];

  function step(event) {
    const s = state.session;
    const code = call("session_step", s.phase, s.index, s.length, event);
    if (code < 0) return false;
    s.phase = code >> 8;
    s.index = code & 255;
    return true;
  }

  function nextIsReport() {
    const s = state.session;
    return call("session_step", s.phase, s.index, s.length, EVENT.NEXT) >> 8 === PHASE.DONE;
  }

  // A follow-up exists only if the model says the answer before it allows one.
  function skipFollowUps() {
    for (;;) {
      if (state.session.phase !== PHASE.ASKING) return;
      const card = currentCard();
      if (!card.dependsOn) return;
      const parent = state.answers[card.dependsOn];
      if (parent && call("follow_up_shown", parent.response) === 1 && card.variants[parent.choice]) return;
      step(EVENT.NOT_MINE);
    }
  }

  function record(card, { choice, response, note = "", side = null }) {
    const outcome = call("judge", card.kindCode, response);
    state.answers[card.id] = { card: card.id, kind: card.kind, choice, response, outcome, note, side, shift: state.shift, seconds: Math.round((Date.now() - shownAt) / 100) / 10, at: new Date().toISOString().slice(0, 10) };
    if (outcome === OUTCOME.CHECK_PASSED) state.checksPassed += 1;
    state.streak.answered = true;
    return outcome;
  }

  function answer(card, details, event) {
    const outcome = record(card, details);
    step(event);
    skipFollowUps();
    save();
    render();
    feelMoment(call("loudness", outcome));
  }

  function moveOn() {
    step(EVENT.NEXT);
    skipFollowUps();
    save();
    render();
  }

  // ------------------------------------------------------------ small drawings

  const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const PLANE = '<rect x="-13" y="-2.8" width="27" height="5.6" rx="2.8"/><path d="M-1 -2 L-7 -13 H-3 L6 -2 Z"/><path d="M-1 2 L-7 13 H-3 L6 2 Z"/><path d="M-11 -2 L-14 -7 H-11 L-7 -2 Z"/><path d="M-11 2 L-14 7 H-11 L-7 2 Z"/>';

  function route(done, total, label = `${Math.min(done + 1, total)} of ${total} cases`) {
    const w = 350;
    const at = (t) => [12 + t * (w - 24), 34 - 22 * Math.sin(Math.PI * t)];
    const line = Array.from({ length: 41 }, (_, k) => at(k / 40).map((n) => n.toFixed(1)).join(" ")).join(" L");
    let dots = "";
    for (let i = 0; i <= total; i++) {
      const [x, y] = at(i / total);
      dots += `<circle class="${i <= done ? "done" : "todo"}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i <= done ? 5 : 4}"/>`;
    }
    const [px, py] = at(done / total);
    const slope = (-22 * Math.PI * Math.cos((Math.PI * done) / total)) / (w - 24);
    const angle = (Math.atan(slope) * 180) / Math.PI;
    return `<svg class="route" viewBox="0 0 ${w} 48" role="img" aria-label="${esc(label)}"><path class="line" d="M${line}"/>${dots}<g class="plane" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${angle.toFixed(1)})">${PLANE}</g></svg>`;
  }

  function rookie(mood, width) {
    return window.drawRookie(mood, width);
  }

  // Going home is only navigation: the shift stays exactly where it was, and the home screen offers to continue it.
  const shiftTop = (done, total) => `<div class="shift-top"><button class="home-button" data-home aria-label="Home"><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 L12 3.5 L21 11.5 M6 9.5 V20 H18 V9.5"/></svg></button>${route(done, total)}</div>`;

  const arrow = (dir) => `<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="${dir === "right" ? "M4 12 H20 M13 5 L20 12 L13 19" : "M20 12 H4 M11 5 L4 12 L11 19"}"/></svg>`;
  const stamp = (text, cls = "") => `<span class="stamp ${cls}">${esc(text)}</span>`;

  function pips(count) {
    let out = "";
    for (let i = 0; i < 4; i++) out += `<i class="${i < count ? "on" : ""}"></i>`;
    return `<div class="pips" role="img" aria-label="${count} of 4 weeks">${out}</div>`;
  }

  const weeksShown = () => state.streak.weeks + (state.streak.answered ? 1 : 0);
  const titleNow = () => TITLES[call("title", 0, state.checksPassed)];

  // ------------------------------------------------------------ screens

  function faceText(card) {
    if (!card.dependsOn) return card.short || card.case;
    return card.variants[state.answers[card.dependsOn].choice];
  }

  function fields(card) {
    if (!card.fields) return "";
    return `<div class="fields">${card.fields.map((f) => `<div class="field"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join("")}</div>`;
  }

  function bars(card) {
    if (!card.bars) return "";
    const asked = card.bars.parts.reduce((a, b) => a + b, 0);
    const widest = Math.max(asked, card.bars.whole);
    const pct = (n) => `${(n / widest) * 100}%`;
    return `<div class="bars" role="img" aria-label="Paid ${card.bars.whole}, asked ${asked}"><div><i class="paid" style="width:${pct(card.bars.whole)}"></i></div><div>${card.bars.parts.map((p) => `<i class="asked" style="width:${pct(p)}"></i>`).join("")}</div></div>`;
  }

  function upper(card, text) {
    const flag = card.reveal.illustrative ? `<span class="demo-flag">${esc(card.reveal.illustrative)}</span>` : "";
    const size = card.dependsOn ? "small" : "";
    return `<div class="upper"><span class="tag">${esc(card.area)}</span>${flag}<p class="case-text ${size}">${esc(text)}</p>${fields(card)}${bars(card)}</div>`;
  }

  function reach(card) {
    const d = card.reveal.dependents;
    if (!d || !d.count) return "";
    return `<div class="reach"><div class="dots" aria-hidden="true">${"<i></i>".repeat(d.count)}</div><span>${d.count} other cards depend on this answer</span></div>`;
  }

  function sides(card) {
    const swapped = call("sides_swapped", card.kindCode, state.seed, state.session.index) === 1;
    const [first, second] = card.choices;
    return swapped ? { left: second, right: first } : { left: first, right: second };
  }

  function signs(card) {
    const { left, right } = sides(card);
    return `<div class="answers"><button class="sign left" data-choice="${esc(left.id)}" data-side="left">${arrow("left")}<span>${esc(left.label)}</span></button><button class="sign right" data-choice="${esc(right.id)}" data-side="right">${arrow("right")}<span>${esc(right.label)}</span></button></div>`;
  }

  function renderHome() {
    const shift = DECK.shifts[state.shift];
    const s = state.session;
    const resuming = s.phase !== PHASE.INTRO;
    const stops = DECK.areas.map((area, i) => {
      const y = [84, 58, 34, 10][i];
      const node = i === 0 ? `<span class="node"><svg width="30" height="30" viewBox="-16 -16 32 32" aria-hidden="true"><g transform="rotate(-60)">${PLANE}</g></svg></span>` : '<span class="node"></span>';
      return `<div class="stop ${i % 2 ? "odd" : "even"} ${i === 0 ? "here" : ""}" style="top:${y}%">${node}<div><b>${esc(area.name)}</b><span>${area.openGoals} open goals</span></div></div>`;
    }).join("");
    return `
      <div class="top"><div class="week">Week ${state.streak.weeks + 1} on shift${pips(weeksShown())}</div><span class="title-chip">${esc(titleNow())}</span></div>
      <div class="head-row"><h1 class="big">Today's shift</h1>${rookie("happy", 92)}</div>
      <p class="sub">${resuming ? `Case ${s.index + 1} of ${s.length}. Your answers so far are saved.` : `${s.length} cases, about 2 minutes`}</p>
      <div class="map"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M7.6 84 C7.6 71 95.2 71 95.2 58 C95.2 46 4.8 46 4.8 34 C4.8 22 95.2 22 95.2 10"/></svg>${stops}</div>
      <button class="main" data-start>${resuming ? "Continue" : "Start"} ${esc(shift.name.toLowerCase())}</button>
      <button class="secondary" data-tour>Take the tour</button>
      <p class="fine">Gate Check is a demo. Answers stay on this device. Verified Air is a proof of concept, not affiliated with IATA.</p>
      <div class="row"><button class="link" data-reset>Start over</button></div>`;
  }

  function renderCase(card) {
    const s = state.session;
    const swipes = card.choices && card.choices.length === 2;
    const follow = Boolean(card.dependsOn);
    const parent = follow ? state.answers[card.dependsOn] : null;
    const headline = follow && card.headlines ? `<div class="head-row"><h1 class="big long">${esc(card.headlines[parent.choice])}</h1></div>` : "";
    const stub = card.show_today
      ? `<p class="today">${esc(card.reveal.today)}</p>`
      : follow && card.stamps
        ? `<div class="stamp-row">${card.stamps[parent.choice].map((st) => stamp(st.text, `small ${st.ink === "blue" ? "blue" : ""}`)).join("")}</div>`
        : swipes ? `<p data-hint>Swipe the ticket toward your call, or tap a sign below.</p><div class="ghost" data-ghost></div>` : `<p>Tap your answer below.</p>`;
    let controls;
    if (swipes) {
      controls = signs(card);
    } else {
      controls = `<div class="options">${card.choices.map((c, i) => `<button class="option" data-choice="${esc(c.id)}" data-key="${i + 1}">${esc(c.label)}</button>`).join("")}</div>`;
    }
    return `${shiftTop(s.index, s.length)}
      ${headline}
      <div class="say"><div class="bubble">${esc(card.say)}</div>${rookie(follow ? "proud" : "up", 78)}</div>
      <div class="ticket ${swipes ? "swipes" : ""}" ${swipes ? "data-swipe" : ""}>${upper(card, faceText(card))}<div class="tear"></div><div class="stub">${stub}</div></div>
      ${reach(card)}
      ${controls}
      <div class="escapes"><button class="quiet" data-depends>It depends</button><button class="quiet" data-notmine>Not my area</button></div>`;
  }

  const HEADLINE = {
    [OUTCOME.SAME]: "Same call.",
    [OUTCOME.CATCH]: "Possible catch!",
    [OUTCOME.EXCEPTION]: "Noted.",
    [OUTCOME.DECISION]: "Sent to the owner.",
    [OUTCOME.CHECK_PASSED]: "Good eye.",
    [OUTCOME.CHECK_MISSED]: "Thanks.",
  };
  const MOOD = { [OUTCOME.SAME]: "happy", [OUTCOME.CATCH]: "flustered", [OUTCOME.EXCEPTION]: "up", [OUTCOME.DECISION]: "up", [OUTCOME.CHECK_PASSED]: "happy", [OUTCOME.CHECK_MISSED]: "happy" };

  function ruleLines(rule) {
    if (!rule) return "";
    const meaning = { proven: "Holds for every input", "not checked": "Nothing checks this yet", open: "Still an open question", "example only": "Shown by an example" }[rule.status] || "";
    return `<div class="chip-row"><span class="chip">${esc(rule.status[0].toUpperCase() + rule.status.slice(1))}</span><span>${esc(meaning)}</span></div><p>${esc(rule.text)}</p>`;
  }

  function resultBody(card, record) {
    const chosen = (card.choices || []).find((c) => c.id === record.choice);
    const modelChoice = (card.choices || []).find((c) => c.model);
    switch (record.outcome) {
      case OUTCOME.SAME:
        if (card.reveal.onYes) return `<p class="lead">${esc(card.reveal.onYes)}</p>${ruleLines(card.reveal.rule)}`;
        return `<p class="lead">${esc(card.reveal.then || "The rulebook does the same.")}</p>${ruleLines(card.reveal.rule)}`;
      case OUTCOME.CATCH:
        if (card.reveal.onNo) return `<p class="lead">${esc(card.reveal.onNo)}</p>${ruleLines(card.reveal.rule)}<p class="tagged">Tagged for the area owner. It counts if they uphold it.</p>`;
        return `<div class="compare"><div><span>Your call</span><b>${esc(chosen.label)}</b></div><div><span>What the rulebook makes Rookie do</span><b>${esc(modelChoice ? modelChoice.label : card.reveal.then)}</b></div></div><p class="tagged">Tagged for the area owner. It counts if they uphold it.</p>`;
      case OUTCOME.DECISION: {
        const proven = chosen && chosen.proven ? `<div class="chip-row"><span class="chip">Proven</span><span>If we decide this</span></div><p>${esc(chosen.proven.text)}</p>` : "";
        return `<p class="lead">You chose: ${esc(chosen.label)}</p>${chosen.consequence ? `<p>${esc(chosen.consequence)}</p>` : ""}${proven}`;
      }
      case OUTCOME.CHECK_PASSED:
        return `<p class="lead">That was a check card, a rule we changed to be wrong.</p><p>The real rule:</p>${ruleLines(card.reveal.rule)}`;
      case OUTCOME.CHECK_MISSED:
        return `<p class="lead">Your answer goes to the area owner.</p>`;
      default:
        return `<p class="lead">It goes to the area owner, with your note.</p>${record.note ? `<p>${esc(record.note)}</p>` : ""}`;
    }
  }

  function resultStamp(card, record) {
    if (record.outcome === OUTCOME.CATCH || record.outcome === OUTCOME.SAME) {
      const model = (card.choices || []).find((c) => c.model);
      if (model && model.stamp) return stamp(model.stamp);
      return record.outcome === OUTCOME.CATCH ? stamp("TAGGED") : stamp("RECORDED", "blue");
    }
    if (record.outcome === OUTCOME.DECISION) return stamp("SENT", "blue");
    if (record.outcome === OUTCOME.CHECK_PASSED) return stamp("CHECK CARD");
    return stamp("NOTED", "blue");
  }

  function renderResult(card) {
    const record = state.answers[card.id];
    const s = state.session;
    const headline = HEADLINE[record.outcome];
    const text = card.dependsOn ? (card.headlines ? card.headlines[state.answers[card.dependsOn].choice] : faceText(card)) : faceText(card);
    return `${shiftTop(s.index + 1, s.length)}
      <div class="head-row"><h1 class="big ${headline.length > 14 ? "long" : ""}">${esc(headline)}</h1>${rookie(MOOD[record.outcome], 84)}</div>
      <div class="ticket result"><div class="upper"><span class="tag">${esc(card.area)}</span><p class="case-text">${esc(text)}</p></div><div class="tear"></div><div class="stub"><div class="stamp-row">${resultStamp(card, record)}</div></div></div>
      <div class="body">${resultBody(card, record)}</div>
      <button class="main" data-next>${nextIsReport() ? "See your report" : "Next case"}</button>
      <button class="link" data-behind>Behind this card</button>`;
  }

  const TILE = { [OUTCOME.SAME]: ["", "="], [OUTCOME.CATCH]: ["catch", "!"], [OUTCOME.EXCEPTION]: ["", "?"], [OUTCOME.DECISION]: ["", "→"], [OUTCOME.CHECK_PASSED]: ["catch", "!"], [OUTCOME.CHECK_MISSED]: ["", "="], [OUTCOME.ROUTED]: ["", "–"] };

  function renderReport() {
    const records = shiftCards().map((card) => state.answers[card.id]).filter(Boolean);
    const count = (...outcomes) => records.filter((r) => outcomes.includes(r.outcome)).length;
    const lines = [
      [count(OUTCOME.SAME, OUTCOME.CHECK_MISSED), "same call as the rulebook", "same calls as the rulebook"],
      [count(OUTCOME.CATCH), "possible catch, with the owner", "possible catches, with the owner"],
      [count(OUTCOME.CHECK_PASSED), "check card passed", "check cards passed"],
      [count(OUTCOME.DECISION), "decision sent to the owner", "decisions sent to the owner"],
      [count(OUTCOME.EXCEPTION), "exception noted", "exceptions noted"],
      [count(OUTCOME.ROUTED), "passed to someone else", "passed to someone else"],
    ].filter(([n]) => n > 0);
    const tiles = records.map((r) => {
      const [cls, mark] = TILE[r.outcome];
      return `<span class="tile ${cls}" aria-hidden="true">${mark}</span>`;
    }).join("");
    const waiting = count(OUTCOME.CATCH) + count(OUTCOME.DECISION) + count(OUTCOME.EXCEPTION);
    const more = state.shift + 1 < DECK.shifts.length;
    return `${route(state.session.length, state.session.length)}
      <div class="head-row"><h1 class="big">Shift done.</h1>${rookie("happy", 88)}</div>
      <div class="tiles">${tiles}</div>
      <div class="stats">${lines.map(([n, one, many]) => `<p><b>${n}</b> ${esc(n === 1 ? one : many)}</p>`).join("")}</div>
      ${waiting ? `<div class="panel"><span>Coming back to you</span><b>The area owners review these. In this demo nobody is reviewing yet, so nothing comes back.</b></div>` : ""}
      <div class="row"><div class="week">Week ${state.streak.weeks + 1} on shift${pips(weeksShown())}</div><span class="title-chip">${esc(titleNow())}</span></div>
      <p class="fine">One answer next week keeps the streak going. You hold ${state.streak.passes} standby ${state.streak.passes === 1 ? "pass" : "passes"} for weeks off.</p>
      <button class="main" data-done>${more ? "Done for today" : "Back to the start"}</button>
      <button class="link" data-copy>Copy my answers</button>`;
  }

  // ------------------------------------------------------------ the tour

  // A practice run through the game. It asks the real engine about a real rule that is in
  // neither shift, so it gives no case away. It never touches the answers, the streak or the
  // title. The one thing it remembers is that it has been seen.
  const TOUR_SEEN = "review-game/toured";
  const TOUR_STEPS = ["hello", "case", "result", "ways-out", "path", "counts", "ready"];
  const practiceCard = byId[DECK.practice];
  let tour = null;
  const tourStep = () => TOUR_STEPS[tour.step];

  function tourSeen() {
    try {
      return localStorage.getItem(TOUR_SEEN) !== null;
    } catch {
      return false;
    }
  }

  function startTour() {
    tour = { step: 0, record: null };
    render();
  }

  function tourMove(by) {
    tour.step += by;
    if (tourStep() === "case") tour.record = null;
    render();
  }

  function leaveTour(startShift) {
    tour = null;
    try {
      localStorage.setItem(TOUR_SEEN, "1");
    } catch {
      /* As with the game's own state. */
    }
    if (startShift) startOrContinue();
    else render();
  }

  function tourAnswered(card, choice) {
    const outcome = call("judge", card.kindCode, choice.response);
    tour.record = { choice: choice.id, outcome };
    tour.step += 1;
    render();
    feelMoment(call("loudness", outcome));
  }

  function tourNav(next = true) {
    const back = tour.step > 0 ? '<button class="link" data-tour-back>Back</button>' : "<span></span>";
    return `${next ? '<button class="main" data-tour-next>Next</button>' : ""}<div class="row">${back}<button class="link" data-tour-leave>Skip the tour</button></div>`;
  }

  function tourResult(top) {
    const card = practiceCard;
    const { choice, outcome } = tour.record;
    const said = card.choices.find((c) => c.id === choice);
    const rulebook = card.choices.find((c) => c.model);
    const note = outcome === OUTCOME.SAME
      ? ["A small win", "You and the rulebook agree, so this goal gets coverage.", "If you had disagreed, the whole screen would turn red. That is the big moment."]
      : ["The big moment", "You and the rulebook disagree. In a real shift this goes to the area owner, and it counts if they uphold it.", "You are never wrong here. Rookie's mistakes belong to the rulebook."];
    return `${top}
      <div class="head-row"><h1 class="big ${HEADLINE[outcome].length > 14 ? "long" : ""}">${esc(HEADLINE[outcome])}</h1>${rookie(MOOD[outcome], 84)}</div>
      <div class="compare"><div><span>Your call</span><b>${esc(said.label)}</b></div><div><span>What the rulebook makes Rookie do</span><b>${esc(rulebook.label)}</b></div></div>
      <div class="panel"><span>${note[0]}</span><b>${note[1]}</b></div>
      <p class="fine">${note[2]}</p>
      <div class="tour-gap"></div>${tourNav()}`;
  }

  function renderTour() {
    const total = TOUR_STEPS.length;
    const top = route(tour.step, total - 1, `Step ${tour.step + 1} of ${total}`);
    const gap = '<div class="tour-gap"></div>';
    switch (tourStep()) {
      case "hello":
        return { surface: "asking", html: `${top}
          <div class="head-row"><h1 class="big">Meet Rookie.</h1>${rookie("happy", 92)}</div>
          <p class="sub">A new hire who follows the rulebook to the letter, even when the result is absurd.</p>
          <div class="panel"><span>Your job, Coach</span><b>You know how the work really goes. Catch the rulebook before it embarrasses the airline.</b></div>
          <p class="fine">The rulebook is the airline's rules, written so exactly that a computer can check them.</p>
          ${gap}${tourNav()}` };
      case "case":
        return { surface: "asking", html: `${top}
          <div class="say"><div class="bubble">${esc(practiceCard.say)}</div>${rookie("up", 78)}</div>
          <div class="ticket swipes" data-swipe>${upper(practiceCard, faceText(practiceCard))}<div class="tear"></div><div class="stub"><p data-hint>Swipe the ticket toward your call, or tap a sign. This one is practice.</p><div class="ghost" data-ghost></div></div></div>
          ${signs(practiceCard)}${tourNav(false)}` };
      case "result":
        return { surface: MODEL.surfaceOfOutcome[tour.record.outcome], html: tourResult(top) };
      case "ways-out":
        return { surface: "asking", html: `${top}
          <div class="head-row"><h1 class="big long">Two ways out.</h1>${rookie("up", 84)}</div>
          <div class="tour-items">
            <div class="tour-item"><span class="quiet">It depends</span><p>The answer turns on something the case leaves out. It goes to the area owner as an exception, with a note if you like.</p></div>
            <div class="tour-item"><span class="quiet">Not my area</span><p>The case moves on to someone else, and it still counts for your streak.</p></div>
          </div>
          <p class="fine">Both are on every case, and neither costs you anything.</p>
          ${gap}${tourNav()}` };
      case "path":
        return { surface: "report", html: `${top}
          <div class="head-row"><h1 class="big long">Where your answer goes.</h1>${rookie("happy", 84)}</div>
          <ol class="tour-path">
            <li><b>You answer.</b> Nothing changes yet.</li>
            <li><b>The area owner reviews it.</b> Nobody reviews their own catch.</li>
            <li><b>A modeller edits the rule.</b> This is the only step that changes it.</li>
          </ol>
          <div class="panel"><span>In this demo</span><b>Answers stay on this device, and nobody reviews them yet.</b></div>
          ${gap}${tourNav()}` };
      case "counts":
        return { surface: "report", html: `${top}
          <div class="head-row"><h1 class="big long">What counts.</h1>${rookie("happy", 84)}</div>
          <div class="tour-items">
            <div class="tour-item"><div class="tour-chips">${TITLES.map((t) => `<span class="title-chip">${esc(t)}</span>`).join("")}</div><p>Titles come from upheld catches and check cards. Answering more earns nothing, and a title is never lost.</p></div>
            <div class="tour-item">${pips(1)}<p>One case a week keeps your streak. You hold ${MODEL.passLimit} standby passes for weeks off.</p></div>
            <div class="tour-item"><p>Some cards are rules we changed on purpose, to check for care.</p></div>
          </div>
          ${gap}${tourNav()}` };
      default: {
        const atStart = state.session.phase === PHASE.INTRO;
        const label = atStart ? `Start ${esc(DECK.shifts[state.shift].name.toLowerCase())}` : "Back to my shift";
        return { surface: "asking", html: `${top}
          <div class="head-row"><h1 class="big long">Ready, Coach?</h1>${rookie("proud", 92)}</div>
          <p class="sub">A shift is ${state.session.length} cases, about 2 minutes, with no timer.</p>
          <p class="fine">On any result, Behind this card shows the real rule, and you can run a check on your phone.</p>
          ${gap}<button class="main" data-tour-start>${label}</button>
          <div class="row"><button class="link" data-tour-back>Back</button>${atStart ? '<button class="link" data-tour-leave>Not yet</button>' : ""}</div>` };
      }
    }
  }

  let shownAt = Date.now();
  let atHome = false;

  function startOrContinue() {
    if (state.session.phase === PHASE.INTRO) {
      buzz(18);
      step(EVENT.START);
      skipFollowUps();
      save();
    }
    atHome = false;
    render();
  }

  function startOver() {
    state = fresh();
    state.session.length = call("shift_length", DECK.shifts[0].cards.length);
    atHome = false;
    save();
    render();
  }

  // Starting over clears the device, so it asks first if there is anything to lose.
  function askStartOver() {
    if (!Object.keys(state.answers).length && state.session.phase === PHASE.INTRO && state.shift === 0) {
      startOver();
      return;
    }
    openSheet(`<h2>Start over?</h2><p>This clears your answers, streak and title on this device, and goes back to the first shift.</p><div class="sheet-actions"><button data-close>Keep my answers</button><button class="go" data-confirm-reset>Start over</button></div>`);
  }

  function drawTour() {
    const view = renderTour();
    app.dataset.at = "tour";
    app.dataset.tour = tourStep();
    app.dataset.surface = view.surface;
    delete app.dataset.card;
    delete app.dataset.lean;
    if (tourStep() === "result") app.dataset.outcome = tour.record.outcome; else delete app.dataset.outcome;
    app.innerHTML = view.html;
    app.scrollTop = 0;
    live.textContent = tourStep() === "case" ? `${practiceCard.say} ${faceText(practiceCard)}` : (app.querySelector("h1") || {}).textContent || "";
    const swipe = app.querySelector("[data-swipe]");
    if (swipe) attachSwipe(swipe, practiceCard);
    if (usingKeys) (app.querySelector("[data-tour-next], [data-tour-start]") || { focus() {} }).focus();
  }

  function render() {
    if (tour) {
      drawTour();
      return;
    }
    delete app.dataset.tour;
    const s = state.session;
    let html;
    let at;
    let surface;
    let card = null;
    if (s.phase === PHASE.INTRO || atHome) {
      at = "home"; surface = "asking"; html = renderHome();
    } else if (s.phase === PHASE.DONE) {
      at = "report"; surface = "report"; html = renderReport();
    } else if (s.phase === PHASE.ASKING) {
      card = currentCard(); at = "case"; surface = MODEL.askingSurface[card.kindCode]; html = renderCase(card);
    } else {
      card = currentCard(); at = "result"; surface = MODEL.surfaceOfOutcome[state.answers[card.id].outcome]; html = renderResult(card);
    }
    app.dataset.at = at;
    app.dataset.surface = surface;
    app.dataset.phase = s.phase;
    app.dataset.index = s.index;
    if (card) app.dataset.card = card.id; else delete app.dataset.card;
    if (at === "result") app.dataset.outcome = state.answers[card.id].outcome; else delete app.dataset.outcome;
    delete app.dataset.lean;
    app.innerHTML = html;
    app.scrollTop = 0;
    shownAt = Date.now();
    live.textContent = at === "case" ? `${card.say} ${faceText(card)}` : (app.querySelector("h1") || {}).textContent || "";
    const swipe = app.querySelector("[data-swipe]");
    if (swipe) attachSwipe(swipe, card);
    if (usingKeys) (app.querySelector("[data-next], [data-start], [data-done]") || { focus() {} }).focus();
  }

  // ------------------------------------------------------------ gestures

  const motionMs = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--motion-${name}`)) || 0;

  function choose(card, choiceId, side) {
    const choice = card.choices.find((c) => c.id === choiceId);
    const go = () => (tour ? tourAnswered(card, choice) : answer(card, { choice: choiceId, response: choice.response, side }, EVENT.CALL));
    const stub = app.querySelector(".stub");
    if (!stub || app.dataset.landing) return;
    app.dataset.landing = "true";
    stub.innerHTML = `<div class="stamp-row">${stamp(choice.stamp || "CALLED", "landing")}</div>`;
    buzz(18);
    setTimeout(() => {
      delete app.dataset.landing;
      go();
    }, motionMs("stamp-landing") + (motionMs("stamp-landing") ? 150 : 0));
  }

  function attachSwipe(el, card) {
    const { left, right } = sides(card);
    const ghost = el.querySelector("[data-ghost]");
    const hint = el.querySelector("[data-hint]");
    const pupils = app.querySelector("[data-pupils]");
    let pointer = null;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let startedAt = 0;

    function lean(amount) {
      const direction = amount < 0 ? "left" : "right";
      const strength = Math.min(1, Math.abs(amount) / (el.offsetWidth * 0.3));
      if (Math.abs(amount) < 6) {
        delete app.dataset.lean;
      } else {
        app.dataset.lean = direction;
        const target = direction === "left" ? left : right;
        if (ghost) ghost.innerHTML = stamp(target.stamp || "CALLED");
      }
      if (ghost) ghost.style.setProperty("--amt", strength.toFixed(3));
      if (hint) hint.style.visibility = strength > 0.15 ? "hidden" : "";
      if (pupils) pupils.setAttribute("transform", `translate(${(Math.sign(amount) * strength * 5).toFixed(1)} 0)`);
    }

    function settle() {
      el.classList.remove("dragging");
      el.style.transform = "";
      lean(0);
      if (ghost) ghost.innerHTML = "";
    }

    el.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      pointer = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      startedAt = e.timeStamp;
      el.setPointerCapture(pointer);
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointer) return;
      dx = e.clientX - startX;
      if (Math.abs(e.clientY - startY) > Math.abs(dx) + 12) return;
      el.style.transform = `translateX(${dx}px) rotate(${dx * 0.022}deg)`;
      lean(dx);
    });
    el.addEventListener("pointerup", (e) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      const speed = Math.abs(dx) / Math.max(1, e.timeStamp - startedAt);
      const far = Math.abs(dx) > el.offsetWidth * 0.3;
      const flicked = Math.abs(dx) > 48 && speed > 0.55;
      if (far || flicked) {
        const side = dx < 0 ? "left" : "right";
        settle();
        choose(card, (side === "left" ? left : right).id, side);
      } else {
        settle();
      }
    });
    el.addEventListener("pointercancel", () => {
      pointer = null;
      settle();
    });
  }

  // ------------------------------------------------------------ touch feedback

  // Browsers refuse to vibrate before the person has touched the page.
  function buzz(pattern) {
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(pattern);
  }

  // How strong the vibration is comes from the model's size for the moment.
  function feelMoment(level) {
    if (level >= 3) buzz([20, 40, 30]);
  }

  // ------------------------------------------------------------ sheets

  function openSheet(html) {
    sheet.innerHTML = html;
    sheet.showModal();
  }

  function dependsSheet(card) {
    openSheet(`<h2>What does it depend on?</h2><label for="note">One line, if you like</label><input id="note" autocomplete="off" maxlength="200"><div class="sheet-actions"><button data-close>Back</button><button class="go" data-save-depends>Send</button></div>`);
    sheet.dataset.card = card.id;
  }

  function behindSheet(card) {
    const b = card.behind;
    openSheet(`<h2>Behind this card</h2>
      <p>${esc(card.label)}. Built from verified-air at <code>${esc(DECK.source.commit)}</code>.</p>
      ${b.note ? `<p>${esc(b.note)}</p>` : ""}
      ${b.lean.length ? `<p>In the Lean model:</p><ul>${b.lean.map((n) => `<li><code>${esc(n)}</code></li>`).join("")}</ul>` : ""}
      ${b.link ? `<p><a href="${esc(b.link)}" target="_blank" rel="noopener">See it on the site</a></p>` : ""}
      <p>This game's rules are running on ${esc(engine.name)}: ${esc(engine.detail)}.</p>
      <p data-check-result>You can check that on this device against every case the model wrote.</p>
      <div class="sheet-actions"><button data-close>Close</button><button class="go" data-run-check>Run the check</button></div>`);
  }

  async function selfCheck() {
    const response = await fetch("vectors.txt");
    const vectors = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    const started = performance.now();
    const failures = vectors.filter((v) => engine.call(v.f, v.a) !== v.r);
    return { engine: engine.name, passed: vectors.length - failures.length, total: vectors.length, ms: performance.now() - started };
  }

  function answersJson() {
    return JSON.stringify({ deck: DECK.title, model: DECK.source, engine: engine.name, answers: Object.values(state.answers) }, null, 1);
  }

  async function copyAnswers(button) {
    const text = answersJson();
    let done = false;
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      try {
        done = document.execCommand("copy");
      } catch {
        done = false;
      }
      area.remove();
    }
    button.textContent = done ? "Copied" : "Could not copy";
  }

  // ------------------------------------------------------------ events

  app.addEventListener("click", (e) => {
    const target = e.target.closest("button");
    if (!target) return;
    if (target.dataset.tour !== undefined) {
      startTour();
      return;
    }
    if (tour) {
      if (target.dataset.tourNext !== undefined) tourMove(1);
      else if (target.dataset.tourBack !== undefined) tourMove(-1);
      else if (target.dataset.tourLeave !== undefined) leaveTour(false);
      else if (target.dataset.tourStart !== undefined) leaveTour(true);
      else if (target.dataset.choice) choose(practiceCard, target.dataset.choice, target.dataset.side || null);
      return;
    }
    const card = state.session.phase === PHASE.ASKING || state.session.phase === PHASE.REVEALED ? currentCard() : null;
    if (target.dataset.start !== undefined) {
      startOrContinue();
    } else if (target.dataset.home !== undefined) {
      atHome = true;
      render();
    } else if (target.dataset.choice) {
      choose(card, target.dataset.choice, target.dataset.side || null);
    } else if (target.dataset.depends !== undefined) {
      dependsSheet(card);
    } else if (target.dataset.notmine !== undefined) {
      answer(card, { choice: "not-my-area", response: RESPONSE.NOT_MINE }, EVENT.NOT_MINE);
    } else if (target.dataset.next !== undefined) {
      moveOn();
    } else if (target.dataset.behind !== undefined) {
      behindSheet(card);
    } else if (target.dataset.done !== undefined) {
      state.shift = (state.shift + 1) % DECK.shifts.length;
      state.session = { phase: PHASE.INTRO, index: 0, length: call("shift_length", DECK.shifts[state.shift].cards.length) };
      save();
      render();
    } else if (target.dataset.copy !== undefined) {
      copyAnswers(target);
    } else if (target.dataset.reset !== undefined) {
      askStartOver();
    }
  });

  sheet.addEventListener("click", async (e) => {
    const target = e.target.closest("button");
    if (e.target === sheet) sheet.close();
    if (!target) return;
    if (target.dataset.close !== undefined) sheet.close();
    if (target.dataset.confirmReset !== undefined) {
      sheet.close();
      startOver();
    }
    if (target.dataset.saveDepends !== undefined) {
      const note = sheet.querySelector("#note").value.trim();
      const card = byId[sheet.dataset.card];
      sheet.close();
      answer(card, { choice: "depends", response: RESPONSE.DEPENDS, note }, EVENT.DEPENDS);
    }
    if (target.dataset.runCheck !== undefined) {
      const line = sheet.querySelector("[data-check-result]");
      line.textContent = "Checking.";
      try {
        const r = await selfCheck();
        line.textContent = `${r.passed} of ${r.total} cases passed on this device, on ${r.engine}, in ${r.ms.toFixed(0)} ms.`;
      } catch {
        line.textContent = "Could not load the cases here.";
      }
    }
  });

  let usingKeys = false;
  document.addEventListener("pointerdown", () => {
    usingKeys = false;
  });
  document.addEventListener("keydown", (e) => {
    usingKeys = true;
    if (sheet.open || e.target.matches?.("input, textarea")) return;
    if (tour ? tourStep() !== "case" : atHome || state.session.phase !== PHASE.ASKING) return;
    const card = tour ? practiceCard : currentCard();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const button = app.querySelector(`[data-side="${e.key === "ArrowLeft" ? "left" : "right"}"]`);
      if (button) choose(card, button.dataset.choice, button.dataset.side);
    } else if (tour) {
      /* The practice case has only the two signs. */
    } else if (/^[1-4]$/.test(e.key)) {
      const button = app.querySelector(`[data-key="${e.key}"]`);
      if (button) choose(card, button.dataset.choice, null);
    } else if (e.key.toLowerCase() === "d") {
      dependsSheet(card);
    } else if (e.key.toLowerCase() === "n") {
      answer(card, { choice: "not-my-area", response: RESPONSE.NOT_MINE }, EVENT.NOT_MINE);
    }
  });

  // ------------------------------------------------------------ start

  (async function start() {
    engine = await loadEngine();
    let returning = false;
    try {
      returning = localStorage.getItem(STORE) !== null;
    } catch {
      /* As above. */
    }
    restore();
    // An expert's first visit starts with the tour. Test links name a seed or ask for a fresh game.
    const firstVisit = !returning && !tourSeen() && !params.has("seed") && !params.has("fresh");
    if (params.has("tour") || firstVisit) tour = { step: 0, record: null };
    if (state.session.phase === PHASE.ASKING || state.session.phase === PHASE.REVEALED) skipFollowUps();
    render();
    window.__game = { engine: engine.name, selfCheck, get state() { return state; }, answersJson };
  })();
})();
