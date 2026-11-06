// Runs the model's vectors against each engine that has been built, in Node.
//   npm run test:engines
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vectors = readFileSync(new URL("../vectors/engine.jsonl", import.meta.url), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));

function check(name, call) {
  const failures = [];
  const t0 = performance.now();
  for (const v of vectors) {
    const got = call(v.f, v.a);
    if (got !== v.r) failures.push({ ...v, got });
  }
  const ms = performance.now() - t0;
  console.log(`${failures.length ? "FAIL" : "PASS"} ${name}: ${vectors.length - failures.length} of ${vectors.length} vectors, ${ms.toFixed(1)} ms`);
  for (const f of failures.slice(0, 5)) console.log("  ", JSON.stringify(f));
  return failures.length === 0;
}

let ok = true;
const js = require("../engines/js/engine.js");
ok = check("JavaScript", (f, a) => js[f](...a)) && ok;

const wasmPath = new URL("../engines/rust/game.wasm", import.meta.url);
if (existsSync(wasmPath)) {
  const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath));
  const e = instance.exports;
  const map = { judge: "judge_code", loudness: "loudness_code", title: "title_code", shift_length: "shift_length_code", follow_up_shown: "follow_up_shown_code", sides_swapped: "sides_swapped_code" };
  ok = check("Rust to WebAssembly", (f, a) => e[map[f] || f](...a)) && ok;
} else {
  console.log("SKIP Rust to WebAssembly: run scripts/build-rust.sh");
}
process.exit(ok ? 0 : 1);
