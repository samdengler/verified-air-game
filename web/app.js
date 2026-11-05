// The page: draws the current state of the game and turns touches, taps and
// keys into answers. The rules live in game.js.
(function () {
  const deck = window.DECK;
  const G = window.Game;
  const app = document.getElementById("app");
  const sheet = document.getElementById("sheet");
  const live = document.getElementById("live");
  const STORE = `verified-air-cards/${deck.source.commit}`;
  const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let game = restore() || G.newGame(deck, freshSeed());
  let taxi = 0;
  let usingKeyboard = false;

  // ------------------------------------------------------------- state

  function freshSeed() {
    return Math.floor(Math.random() * 2 ** 31).toString(36);
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (!saved || !saved.at) return null;
      return saved.at === "card" ? { ...saved, shownAt: Date.now() } : saved;
    } catch {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(game));
    } catch {
      // The demo still works when the browser refuses storage: a reload starts over.
    }
  }

  function update(next, { rolled = false } = {}) {
    game = next;
    save();
    if (rolled) rollForward();
    render();
  }

  // Each new card moves the concrete one slab joint along, as if taxiing.
  function rollForward() {
    taxi += 120;
    document.body.style.setProperty("--taxi", `${taxi}px`);
  }

  // ------------------------------------------------------------ markup

  function esc(text) {
    return String(text ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  const ARROW = {
    left: '<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3 2 12l9 9v-6h11V9H11z"/></svg>',
    right: '<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3l9 9-9 9v-6H2V9h11z"/></svg>',
  };

  const FORK = `<svg class="fork" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
    <path class="casing branch-left" d="M200 0V10C200 40 100 26 100 60"/>
    <path class="casing branch-right" d="M200 0V10C200 40 300 26 300 60"/>
    <path class="paint branch-left" d="M200 0V10C200 40 100 26 100 60"/>
    <path class="paint branch-right" d="M200 0V10C200 40 300 26 300 60"/>
  </svg>`;

  function topline(area) {
    const left = G.cardsLeft(game, deck);
    return `<header class="topline">
      <p class="plate plate-location">${esc(area)}</p>
      <p class="plate plate-distance" aria-label="${left} ${left === 1 ? "card" : "cards"} left"><b>${left}</b> left</p>
    </header><div class="stub" aria-hidden="true"></div>`;
  }

  function sign(side, id, label) {
    return `<button type="button" class="sign sign-${side}" data-choice="${esc(id)}" data-side="${side}">
      ${ARROW[side]}<span>${esc(label)}</span></button>`;
  }

  function twoSigns(card, placed) {
    return `${FORK}<div class="signs">
      ${sign("left", placed.left, G.labelOf(card, placed.left))}
      ${sign("right", placed.right, G.labelOf(card, placed.right))}
    </div>`;
  }

  function exits(card) {
    return `<div class="exits">${card.choices
      .map((c) => `<button type="button" class="sign exit" data-choice="${esc(c.id)}">${ARROW.right}<span>${esc(c.label)}</span></button>`)
      .join("")}</div>`;
  }

  // ----------------------------------------------------------- screens

  function renderIntro() {
    app.innerHTML = `<div class="screen screen-intro">
      ${topline(deck.title)}
      <article class="card card-intro" data-swipe>
        <h1>${deck.cards.length} cards from the Verified Air rules</h1>
        <p>Each card is one case and one question, with nothing to read first.</p>
        <p>Swipe the card toward your answer, or tap a sign.</p>
        <p class="fineprint">A demo of the review flow. Answers stay on this device. Verified Air is a proof of concept, not affiliated with IATA.</p>
      </article>
      ${FORK}
      <div class="signs">
        <button type="button" class="sign sign-left" data-start data-side="left">${ARROW.left}<span>Start</span></button>
        <button type="button" class="sign sign-right" data-start data-side="right">${ARROW.right}<span>Start</span></button>
      </div>
    </div>`;
    attachSwipe(app.querySelector("[data-swipe]"), () => update(G.start(game, Date.now()), { rolled: true }));
  }

  function renderCard(card) {
    const placed = G.sides(card, game.seed);
    app.innerHTML = `<div class="screen screen-card">
      ${topline(card.area)}
      <article class="card card-question enter" ${placed ? "data-swipe" : ""}>
        ${card.reveal.illustrative ? `<p class="flag">${esc(card.reveal.illustrative)}</p>` : ""}
        <p class="case ${card.case.split(/\s+/).length <= 20 ? "case-short" : ""}">${esc(card.case)}</p>
        <p class="question">${esc(card.question)}</p>
      </article>
      ${placed ? twoSigns(card, placed) : exits(card)}
      <div class="also">
        <button type="button" data-sheet="${G.DEPENDS}">It depends</button>
        <button type="button" data-sheet="${G.NOT_MINE}">Not my area</button>
      </div>
    </div>`;
    if (placed) {
      attachSwipe(app.querySelector("[data-swipe]"), (side) => choose(placed[side], side));
    }
  }

  function plateFor(card, record) {
    switch (record.outcome) {
      case "match":
        return ["location", "Matches the model"];
      case "mismatch":
        return ["hold", "Hold: you and the model differ"];
      case "depends":
        return ["location", "Recorded with your condition"];
      case "agreed":
        return ["location", "Recorded"];
      case "finding":
        return ["hold", "Hold: that is a finding"];
      case "caught":
        return ["location", "You caught a check card"];
      case "missed":
        return ["hold", "This was a check card"];
      case "routed":
        return ["location", record.choice === "rules" ? "Goes to the code's owners" : "Goes to the modeller"];
      default:
        return ["location", "Recorded for the area's owner"];
    }
  }

  function ruleBlock(rule) {
    return `<blockquote class="rule">${esc(rule.text)}</blockquote>
      <p class="status">Status in the model: <b>${esc(rule.status)}</b></p>`;
  }

  function dependentsLine(reveal) {
    const dep = reveal.dependents;
    if (!dep || !dep.count) return "";
    const areas = dep.areas.length === 1 ? "1 area" : `${dep.areas.length} areas`;
    const top = reveal.topRanked ? " No question in the model has more." : "";
    return `<p class="reach"><b>${dep.count}</b> cards depend on this, in ${areas}.${top}</p>`;
  }

  function revealBody(card, record) {
    const r = card.reveal;
    const chosen = card.choices.find((c) => c.id === record.choice);
    const parts = [];
    switch (card.kind) {
      case "predict":
        parts.push(`<p><b>The model says:</b> ${esc(r.then)}</p>`);
        if (r.rule) parts.push(ruleBlock(r.rule));
        if (record.outcome === "mismatch") parts.push("<p>Your answer is a finding. A modeller looks at this case with you.</p>");
        if (record.outcome === "depends") parts.push("<p>Your condition goes to a modeller, who checks whether the rule needs it.</p>");
        break;
      case "confirm":
        if (r.rule) parts.push(ruleBlock(r.rule));
        if (record.outcome === "agreed") parts.push(`<p>${esc(r.onYes)}</p>`);
        if (record.outcome === "finding") parts.push(`<p>${esc(r.onNo)}</p>`);
        if (record.outcome === "depends") parts.push("<p>Your condition goes to a modeller, who checks whether the rule needs it.</p>");
        break;
      case "seeded":
        parts.push("<p>We changed a proven rule to make it wrong. The rule in the model:</p>");
        if (r.rule) parts.push(ruleBlock(r.rule));
        parts.push("<p>One card in ten is a check like this. It measures what a yes is worth across the group, and nobody gets a score.</p>");
        break;
      case "followup":
        if (record.outcome === "agreed") parts.push(`<p>${esc(r.onYes)}</p>`);
        if (record.outcome === "finding") parts.push(`<p>${esc(r.onNo)}</p>`);
        if (record.outcome === "depends") parts.push("<p>Your condition goes to a modeller, who checks whether the rule needs it.</p>");
        parts.push("<p>The result on this card comes from the model's computed example, so it changed with your answer.</p>");
        break;
      case "reconcile": {
        if (chosen) parts.push(`<p>${esc(chosen.consequence)}</p>`);
        const earlier = r.echoes && game.answers[r.echoes];
        if (earlier && earlier.outcome !== "passed") {
          const source = deck.cards.find((c) => c.id === r.echoes);
          const said = earlier.choice === G.DEPENDS ? "It depends" : G.labelOf(source, earlier.choice);
          parts.push(`<p class="echo">On the first card you said: ${esc(said)}.</p>`);
        }
        break;
      }
      default:
        if (r.today) parts.push(`<p>${esc(r.today)}</p>`);
        if (chosen && chosen.consequence) parts.push(`<p>${esc(chosen.consequence)}</p>`);
        if (chosen && chosen.proven) {
          parts.push(`<div class="if-decided"><h3>If we decide this</h3><p>${esc(chosen.proven.text)}</p>
            <p class="status">Status in the model: <b>proven</b></p></div>`);
        }
        if (record.outcome === "depends") parts.push("<p>Your condition goes to the area's owner with this question.</p>");
    }
    const reach = dependentsLine(r);
    if (reach) parts.push(reach);
    return parts.join("");
  }

  function behind(card) {
    const b = card.behind;
    const names = b.lean.length ? `<ul class="names">${b.lean.map((n) => `<li><code>${esc(n)}</code></li>`).join("")}</ul>` : "";
    const blueprint = b.blueprint ? `<p>Blueprint card: ${esc(b.blueprint)}. It has no Lean yet.</p>` : "";
    const value = b.value ? `<p>What Lean computed:</p><pre>${esc(b.value)}</pre>` : "";
    const note = b.note ? `<p>${esc(b.note)}</p>` : "";
    return `<details class="behind"><summary>Behind this card</summary>
      ${note}${blueprint}${names}${value}
      <p><a href="${esc(b.link)}" target="_blank" rel="noopener">See it on the review site</a></p>
    </details>`;
  }

  function renderReveal(card, record) {
    const [tone, text] = plateFor(card, record);
    const said = record.choice === G.DEPENDS ? "It depends" : G.labelOf(card, record.choice);
    const noted = record.note && !record.exception ? ` (${record.note})` : "";
    const offersException = card.kind === "predict" && record.choice !== G.DEPENDS;
    app.innerHTML = `<div class="screen screen-reveal">
      ${topline(card.area)}
      <article class="card card-settled">
        <p class="case">${esc(card.case)}</p>
        <p class="said">You said: <b>${esc(said + noted)}</b></p>
      </article>
      <p class="plate plate-${tone} plate-verdict">${esc(text)}</p>
      <section class="result">${revealBody(card, record)}${behind(card)}</section>
      <div class="next-row">
        ${offersException ? `<button type="button" class="quiet" data-sheet="exception" ${record.exception ? "disabled" : ""}>${record.exception ? "Exception recorded" : "There are exceptions"}</button>` : ""}
        <button type="button" class="next" data-next>${G.cardsLeft(game, deck) ? "Next card" : "Finish the batch"}</button>
      </div>
    </div>`;
    live.textContent = text;
    if (usingKeyboard) app.querySelector("[data-next]").focus({ preventScroll: true });
  }

  function listSection(title, items) {
    if (!items.length) return "";
    return `<h2>${esc(title)}</h2><ul class="tally">${items.join("")}</ul>`;
  }

  function renderEnd() {
    const s = G.summary(game, deck);
    const findings = s.findings.map((f) => `<li><b>${esc(f.label)}.</b> ${esc(f.text)}</li>`);
    const decisions = s.decisions.map((d) => {
      const reach = d.dependents ? ` ${d.dependents} cards depend on it.` : "";
      return `<li><b>${esc(d.label)}.</b> ${esc(d.answer)}${reach}</li>`;
    });
    const routed = s.routed.map((r) => `<li><b>${esc(r.label)}.</b> You chose: ${esc(r.said)}.</li>`);
    const passed = s.passed.map((p) => `<li><b>${esc(p.label)}.</b> ${p.who ? `Ask ${esc(p.who)}.` : "Someone else answers this."}</li>`);
    const check =
      s.check === "caught" ? "<p>You caught the check card.</p>" : s.check === "missed" ? "<p>You agreed with the check card. That counts toward the group's figure, and nobody gets a score.</p>" : "";
    const pace = s.medianSeconds < 1 ? "under 1 second" : `${Math.round(s.medianSeconds)} seconds`;
    app.innerHTML = `<div class="screen screen-end">
      <p class="plate plate-location plate-goal">No goals left in this batch</p>
      <section class="result">
        <p class="pace">${s.answered} cards, with a median of ${pace} a card.</p>
        ${check}
        ${listSection("For the modeller", findings)}
        ${listSection("For the area's owners", decisions)}
        ${listSection("Where the rules and the code differ", routed)}
        ${listSection("For someone else", passed)}
        <h2>What happens to these answers</h2>
        <p>Fact cards take three independent answers. Decisions go to the area's owner, who sees everyone's input.</p>
        <p>An answer changes no status on the site. Someone edits the Lean, and the build computes the status.</p>
        <p class="fineprint">Cases and results come from the Verified Air build at commit ${esc(deck.source.commit)}, built ${esc(deck.source.built)}. Card wording is written by hand and checked against that build.</p>
      </section>
      <div class="next-row">
        <button type="button" class="quiet" data-copy>Copy answers</button>
        <button type="button" class="next" data-restart>Start again</button>
      </div>
      <textarea class="copy-fallback" readonly hidden aria-label="Your answers as JSON"></textarea>
    </div>`;
    live.textContent = "No goals left in this batch";
  }

  function render() {
    app.dataset.at = game.at;
    delete app.dataset.lean;
    window.scrollTo(0, 0);
    if (game.at === "intro") return renderIntro();
    if (game.at === "end") return renderEnd();
    const card = G.current(game, deck);
    if (!card) {
      game = G.newGame(deck, freshSeed());
      return render();
    }
    app.dataset.card = card.id;
    if (game.at === "card") return renderCard(card);
    return renderReveal(card, game.answers[card.id]);
  }

  // ----------------------------------------------------------- answers

  function choose(choice, side, note) {
    update(G.answer(game, deck, { choice, side, note, now: Date.now() }));
  }

  // ------------------------------------------------------------- swipe

  function attachSwipe(el, onCommit) {
    let pointer = null;
    let startX = 0;
    let dx = 0;
    let startedAt = 0;

    function lean(amount) {
      const direction = amount < 0 ? "left" : "right";
      const strength = Math.min(1, Math.abs(amount) / (el.offsetWidth * 0.34));
      if (Math.abs(amount) < 4) delete app.dataset.lean;
      else app.dataset.lean = direction;
      app.style.setProperty("--amt", strength.toFixed(3));
    }

    function settle() {
      el.classList.remove("dragging");
      el.style.transform = "";
      delete app.dataset.lean;
      app.style.setProperty("--amt", "0");
    }

    function commit(side) {
      if (el.dataset.gone) return;
      el.dataset.gone = "true";
      if (!motion) return onCommit(side);
      el.classList.remove("dragging");
      el.classList.add("leaving");
      const sign = side === "left" ? -1 : 1;
      el.style.transform = `translateX(${sign * (el.offsetWidth + 80)}px) rotate(${sign * 7}deg)`;
      setTimeout(() => onCommit(side), 170);
    }

    el.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      pointer = e.pointerId;
      startX = e.clientX;
      dx = 0;
      startedAt = e.timeStamp;
      el.setPointerCapture(pointer);
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointer) return;
      dx = e.clientX - startX;
      el.style.transform = `translateX(${dx}px) rotate(${dx * 0.025}deg)`;
      lean(dx);
    });
    el.addEventListener("pointerup", (e) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      const speed = Math.abs(dx) / Math.max(1, e.timeStamp - startedAt);
      const far = Math.abs(dx) > el.offsetWidth * 0.3;
      const flicked = Math.abs(dx) > 48 && speed > 0.55;
      if (far || flicked) commit(dx < 0 ? "left" : "right");
      else settle();
    });
    el.addEventListener("pointercancel", () => {
      pointer = null;
      settle();
    });
    el.commitSide = commit;
  }

  // ------------------------------------------------------------ sheets

  const SHEETS = {
    [G.DEPENDS]: {
      title: "What does it depend on?",
      chips: ["Market", "Fare", "Channel"],
      placeholder: "One line, if you like",
      cancel: "Cancel",
      confirm: "Record it",
    },
    [G.NOT_MINE]: {
      title: "Who should answer this?",
      chips: [],
      placeholder: "A name or a team, if you know one",
      cancel: "Cancel",
      confirm: "Pass it on",
    },
    exception: {
      title: "What is the exception?",
      chips: ["Market", "Fare", "Channel"],
      placeholder: "One line, if you like",
      cancel: "Cancel",
      confirm: "Record it",
    },
  };

  function openSheet(kind) {
    const s = SHEETS[kind];
    sheet.innerHTML = `<div class="sheet-body"><h2>${esc(s.title)}</h2>
      ${s.chips.length ? `<div class="chips">${s.chips.map((c) => `<button type="button" class="chip" aria-pressed="false">${esc(c)}</button>`).join("")}</div>` : ""}
      <input type="text" maxlength="120" placeholder="${esc(s.placeholder)}" aria-label="${esc(s.title)}">
      <div class="sheet-actions">
        <button type="button" class="quiet" data-sheet-cancel>${esc(s.cancel)}</button>
        <button type="button" class="next" data-sheet-ok="${esc(kind)}">${esc(s.confirm)}</button>
      </div></div>`;
    sheet.showModal();
  }

  function sheetNote() {
    const chips = [...sheet.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.textContent);
    const text = sheet.querySelector("input").value.trim();
    return [...chips, text].filter(Boolean).join(", ");
  }

  sheet.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) {
      chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
      return;
    }
    if (e.target.closest("[data-sheet-cancel]") || e.target === sheet) {
      sheet.close();
      return;
    }
    const ok = e.target.closest("[data-sheet-ok]");
    if (!ok) return;
    const note = sheetNote();
    const kind = ok.dataset.sheetOk;
    sheet.close();
    if (kind === "exception") {
      update(G.addException(game, G.current(game, deck).id, note));
    } else {
      const moved = kind === G.NOT_MINE;
      update(G.answer(game, deck, { choice: kind, note, now: Date.now() }), { rolled: moved });
    }
  });

  // ------------------------------------------------------------ clicks

  async function copyAnswers(button) {
    const text = JSON.stringify(G.exportAnswers(game, deck), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Answers copied";
    } catch {
      const area = app.querySelector(".copy-fallback");
      area.hidden = false;
      area.value = text;
      area.focus();
      area.select();
      button.textContent = "Select and copy the text below";
    }
  }

  // A tap on a sign takes the same path as a swipe, so the card leaves the same way.
  function tapSign(button) {
    const swipeable = app.querySelector("[data-swipe]");
    const side = button.dataset.side;
    if (swipeable && side) swipeable.commitSide(side);
    else choose(button.dataset.choice, null);
  }

  app.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button || button.disabled) return;
    if (button.dataset.choice || button.dataset.start !== undefined) return tapSign(button);
    if (button.dataset.sheet) return openSheet(button.dataset.sheet);
    if (button.dataset.next !== undefined) return update(G.advance(game, deck, Date.now()), { rolled: true });
    if (button.dataset.copy !== undefined) return copyAnswers(button);
    if (button.dataset.restart !== undefined) return update(G.newGame(deck, freshSeed()));
  });

  document.addEventListener("pointerdown", () => {
    usingKeyboard = false;
  });

  document.addEventListener("keydown", (e) => {
    usingKeyboard = true;
    if (sheet.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.matches?.("input, textarea")) return;
    if (game.at !== "card" && game.at !== "intro") return;
    const key = e.key.toLowerCase();
    if (key === "arrowleft" || key === "arrowright") {
      const swipeable = app.querySelector("[data-swipe]");
      if (swipeable) swipeable.commitSide(key === "arrowleft" ? "left" : "right");
      return;
    }
    if (game.at !== "card") return;
    if (key === "d") return openSheet(G.DEPENDS);
    if (key === "n") return openSheet(G.NOT_MINE);
    const exit = app.querySelectorAll(".exit")[Number(key) - 1];
    if (exit) tapSign(exit);
  });

  render();
})();
