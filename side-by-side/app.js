// The page holds no game rules. It sends each tap to every engine and draws what
// each engine returns. Vectors come from the Lean model.
const DECK_IDS = ["accept-at-expiry", "declined-card", "refund-rule", "late-payment-check", "zero-commitment"];
const KIND = { predict: 0, confirm: 1, decide: 2, seeded: 3, followup: 4, reconcile: 5 };
const PHASE = { INTRO: 0, ASKING: 1, REVEALED: 2, DONE: 3 };
const EVENT = { START: 0, CALL: 1, DEPENDS: 2, NOT_MINE: 3, NEXT: 4 };
const RESPONSE = { AGREES: 0, DIFFERS: 1, DEPENDS: 2, NOT_MINE: 3 };
const SURFACE = ["same-call", "possible-catch", "asking", "decision", "possible-catch", "asking", "asking"];
const HEADLINE = ["Same call.", "Possible catch!", "Noted for the owner.", "Sent to the owner.", "Good eye. That was a check card.", "Thanks.", ""];
const cards = DECK_IDS.map((id) => window.DECK.cards.find((c) => c.id === id));

const WIRE = { rust: { judge: "judge_code", loudness: "loudness_code", title: "title_code", shift_length: "shift_length_code", follow_up_shown: "follow_up_shown_code", sides_swapped: "sides_swapped_code" } };

async function loadEngines() {
  const engines = [];
  const js = window.JsEngine;
  engines.push({
    key: "js", name: "JavaScript", call: (f, a) => js[f](...a), loadMs: 0,
    assurance: "Tested. It passes every vector, and nothing proves it equals the model.",
    trusts: "Everything the vectors do not reach, and the browser",
    size: "engines/js/engine.js",
  });
  let t = performance.now();
  const response = await fetch("../engines/rust/game.wasm");
  const { instance } = await WebAssembly.instantiateStreaming(response);
  const exports = instance.exports;
  engines.push({
    key: "rust", name: "Rust to WebAssembly", call: (f, a) => exports[WIRE.rust[f] || f](...a), loadMs: performance.now() - t,
    assurance: "Proved. Lean checks that the translated Rust equals the model on every input in range.",
    trusts: "Charon, Aeneas, rustc, LLVM, the wrapper, and the browser",
    size: "engines/rust/game.wasm",
  });
  t = performance.now();
  await import("../engines/lasm/dist/app.js");
  await new Promise((resolve, reject) => {
    const started = performance.now();
    (function wait() {
      if (globalThis.__leanEngine) resolve();
      else if (performance.now() - started > 20000) reject(new Error("the Lean engine did not start"));
      else setTimeout(wait, 5);
    })();
  });
  const lean = globalThis.__leanEngine;
  engines.push({
    key: "lean", name: "Lean to WebAssembly (Lasm)", call: (f, a) => lean(f, ...a), loadMs: performance.now() - t,
    assurance: "The model itself. The theorems are about this same source.",
    trusts: "Lean's compiler, Lasm's compiler and runtime, and the browser",
    size: "engines/lasm/dist",
  });
  return engines;
}

function runVectors(engine, vectors) {
  const t = performance.now();
  let passed = 0;
  const failures = [];
  for (const v of vectors) {
    const got = engine.call(v.f, v.a);
    if (got === v.r) passed++;
    else if (failures.length < 5) failures.push({ ...v, got });
  }
  return { passed, total: vectors.length, ms: performance.now() - t, failures };
}

const fresh = () => ({ phase: PHASE.INTRO, index: 0, length: cards.length, outcome: null });

function send(engine, state, event, response) {
  const card = cards[state.index];
  const code = engine.call("session_step", [state.phase, state.index, state.length, event]);
  if (code < 0) return state;
  const next = { ...state, phase: code >> 8, index: code & 255, outcome: null };
  if (response !== undefined) next.outcome = engine.call("judge", [KIND[card.kind], response]);
  return next;
}

function rookie(mood) {
  return window.drawRookie(mood, 72);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function progress(state) {
  const done = state.phase === PHASE.DONE ? state.length : state.index + (state.phase === PHASE.REVEALED ? 1 : 0);
  let bars = "";
  for (let i = 0; i < state.length; i++) bars += `<i class="${i < done ? "done" : ""}"></i>`;
  return `<div class="progress" role="img" aria-label="${done} of ${state.length} cases done">${bars}</div>`;
}

function answersFor(card) {
  if (card.choices && card.choices.length === 2) {
    return card.choices.map((choice) => ({
      label: choice.label,
      response: card.kind === "predict" && !choice.model ? RESPONSE.DIFFERS : RESPONSE.AGREES,
    }));
  }
  return [{ label: "No", response: RESPONSE.DIFFERS }, { label: "Yes", response: RESPONSE.AGREES }];
}

function screen(state) {
  if (state.phase === PHASE.INTRO) {
    return { surface: "asking", html: `<div class="say">${rookie("happy")}<div class="bubble">Five cases today, Coach.</div></div><div class="ticket"><p>A shift takes about 2 minutes. You make the call, then see what the rulebook does.</p></div><button class="main" data-event="${EVENT.START}">Start shift</button>` };
  }
  if (state.phase === PHASE.DONE) {
    return { surface: "report", html: `${progress(state)}<div class="say">${rookie("happy")}<p class="big">Shift done.</p></div><div class="ticket"><p>Your answers go to the area owners. You will hear when they decide.</p></div>` };
  }
  const card = cards[state.index];
  if (state.phase === PHASE.ASKING) {
    const answers = answersFor(card).map((a) => `<button data-event="${EVENT.CALL}" data-response="${a.response}">${escapeHtml(a.label)}</button>`).join("");
    return { surface: "asking", html: `${progress(state)}<div class="say">${rookie("up")}<div class="bubble">What do I do, Coach?</div></div><div class="ticket"><span class="tag">${escapeHtml(card.area)}</span><p>${escapeHtml(card.case)}</p></div><div class="answers">${answers}</div><div class="answers"><button class="quiet" data-event="${EVENT.DEPENDS}" data-response="${RESPONSE.DEPENDS}">It depends</button><button class="quiet" data-event="${EVENT.NOT_MINE}" data-response="${RESPONSE.NOT_MINE}">Not my area</button></div>` };
  }
  const surface = SURFACE[state.outcome];
  const then = card.reveal && card.reveal.then ? `<p>${escapeHtml(card.reveal.then)}</p>` : `<p>${escapeHtml(card.case)}</p>`;
  return { surface, html: `${progress(state)}<div class="say">${rookie("happy")}<p class="big">${HEADLINE[state.outcome]}</p></div><div class="ticket"><span class="tag">${escapeHtml(card.area)}</span>${then}</div><button class="main" data-event="${EVENT.NEXT}">Next case</button>` };
}

const fingerprint = (s) => [s.phase, s.index, s.outcome].join(",");

async function start() {
  const agree = document.getElementById("agree");
  const vectors = (await (await fetch("../vectors/engine.jsonl")).text()).trim().split("\n").map((l) => JSON.parse(l));
  const sizes = await (await fetch("sizes.json")).json().catch(() => ({}));
  const engines = await loadEngines();
  const results = {};
  for (const e of engines) results[e.key] = runVectors(e, vectors);
  const states = {};
  const phones = document.getElementById("phones");
  phones.innerHTML = engines.map((e) => `<section class="engine" data-engine="${e.key}"><h2>${e.name}</h2><div class="phone"></div><dl class="facts"><dt>Vectors</dt><dd class="vectors"></dd><dt>Download</dt><dd>${sizes[e.key] || "not measured"}</dd><dt>Load</dt><dd>${e.loadMs.toFixed(0)} ms</dd><dt>Assurance</dt><dd>${e.assurance}</dd><dt>Trusts</dt><dd>${e.trusts}</dd></dl></section>`).join("");
  for (const e of engines) {
    const r = results[e.key];
    phones.querySelector(`[data-engine="${e.key}"] .vectors`).textContent = `${r.passed} of ${r.total} in ${r.ms.toFixed(1)} ms`;
    states[e.key] = fresh();
  }
  let taps = 0;
  function draw() {
    for (const e of engines) {
      const view = screen(states[e.key]);
      const phone = phones.querySelector(`[data-engine="${e.key}"] .phone`);
      phone.dataset.surface = view.surface;
      phone.dataset.phase = states[e.key].phase;
      phone.innerHTML = view.html;
    }
    const prints = engines.map((e) => fingerprint(states[e.key]));
    const same = prints.every((p) => p === prints[0]);
    const allPass = engines.every((e) => results[e.key].passed === results[e.key].total);
    agree.textContent = `${same ? "All three engines agree" : "THE ENGINES DISAGREE"} after ${taps} taps. ${allPass ? `All three pass all ${vectors.length} vectors.` : "A vector failed."}`;
    window.__sideBySide = { same, taps, states, results, phases: engines.map((e) => states[e.key].phase) };
  }
  phones.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-event]");
    if (!button) return;
    const ev = Number(button.dataset.event);
    const resp = button.dataset.response === undefined ? undefined : Number(button.dataset.response);
    for (const e of engines) states[e.key] = send(e, states[e.key], ev, resp);
    taps++;
    draw();
  });
  draw();
  window.__ready = true;
}
start().catch((error) => {
  document.getElementById("agree").textContent = `Could not start: ${error.message}`;
  window.__error = String(error);
});
