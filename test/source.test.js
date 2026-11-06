// Checks on the page's own source, in Node.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const read = (name) => readFileSync(join(__dirname, "..", "web", name), "utf8");
global.window = {};
require("../web/deck.js");
require("../web/model.js");
require("../web/rookie.js");
const engine = require("../web/engine.js");
const { DECK, MODEL } = global.window;

test("the page's own code and styles use tokens, and no raw colour", () => {
  for (const name of ["app.js", "style.css", "rookie.js", "rookie.css"]) {
    assert.deepEqual(read(name).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], [], `${name} has a raw colour`);
    assert.deepEqual(read(name).match(/rgba?\(/g) ?? [], [], `${name} has a raw colour`);
  }
});

test("Rookie's eyes stay round and open in every mood", () => {
  for (const mood of ["happy", "proud", "up", "flustered"]) {
    const drawing = global.window.drawRookie(mood, 80);
    assert.equal(drawing.match(/<circle class="eye"/g).length, 2, `${mood} has two round eyes`);
    assert.equal(drawing.match(/<circle class="pupil"/g).length, 2, `${mood} has two pupils`);
  }
});

test("the page keeps no copy of the rules", () => {
  const app = read("app.js");
  assert.doesNotMatch(app, /\bshiftLimit\b.*[<>]/, "the shift limit comes from the engine");
  assert.match(app, /call\("session_step"/);
  assert.match(app, /call\("judge"/);
  assert.match(app, /"sides_swapped"/);
  assert.match(app, /"follow_up_shown"/);
});

test("the tour practises on a case that is in no shift", () => {
  assert.ok(DECK.practice, "the deck names a practice case");
  assert.ok(DECK.cards.some((card) => card.id === DECK.practice), "the practice case is in the deck");
  for (const shift of DECK.shifts) assert.ok(!shift.cards.includes(DECK.practice), `${shift.name} would give it away`);
});

test("every theorem the strategy doc names exists in the model", () => {
  const { readdirSync } = require("node:fs");
  const root = join(__dirname, "..", "model");
  const files = readdirSync(root, { recursive: true }).filter((name) => String(name).endsWith(".lean") && !String(name).includes(".lake"));
  const lean = files.map((name) => readFileSync(join(root, String(name)), "utf8")).join("\n");
  const doc = readFileSync(join(__dirname, "..", "docs", "strategy.md"), "utf8");
  const named = [...doc.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1]);
  assert.ok(named.length > 20, "the doc names its guards");
  for (const name of new Set(named)) assert.match(lean, new RegExp(`theorem ${name}\\b`), `${name} is not a theorem in the model`);
});

test("every card kind has a surface, and every shift fits the model's limit", () => {
  for (const card of DECK.cards) {
    assert.ok(MODEL.askingSurface[card.kindCode], `${card.id} has no surface`);
  }
  assert.equal(MODEL.surfaceOfOutcome.length, 7);
  for (const shift of DECK.shifts) {
    assert.equal(engine.shift_length(shift.cards.length), shift.cards.length, `${shift.name} would be cut`);
  }
});

test("every choice says which response it stands for", () => {
  for (const card of DECK.cards) {
    for (const choice of card.choices) {
      assert.ok(choice.response === 0 || choice.response === 1, `${card.id}: ${choice.id}`);
    }
  }
});

test("every card that follows another has words for each answer that leads to it", () => {
  for (const card of DECK.cards.filter((c) => c.dependsOn)) {
    const parent = DECK.cards.find((c) => c.id === card.dependsOn);
    for (const choice of parent.choices) {
      assert.ok(card.variants[choice.id], `${card.id} has no text for ${choice.id}`);
      assert.ok(card.headlines[choice.id], `${card.id} has no headline for ${choice.id}`);
      assert.ok(card.stamps[choice.id], `${card.id} has no stamps for ${choice.id}`);
    }
  }
});
