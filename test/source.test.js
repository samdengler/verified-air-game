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
