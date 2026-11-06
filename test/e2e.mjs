// Plays a whole batch in headless Chrome on a phone-sized screen, with real
// touch events, and saves a screenshot of each step to test/out. No packages:
// Node's own WebSocket drives Chrome over the DevTools protocol.
//
// Usage: node test/e2e.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB = join(HERE, "..", "web");
const [WIDTH, HEIGHT] = (process.env.SIZE || "390x844").split("x").map(Number);
const OUT = join(HERE, "out", process.env.SIZE || "");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".jsonl": "text/plain" };

// The game is served under the same content security policy as the live site.
const POLICY = readFileSync(join(HERE, "..", "infra", "csp.txt"), "utf8").trim();

function serve() {
  const server = createServer((req, res) => {
    const name = normalize(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const file = join(WEB, name);
    if (!file.startsWith(WEB) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "content-security-policy": POLICY });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "cards-e2e-"));
  const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const port = await new Promise((resolve, reject) => {
    let text = "";
    chrome.stderr.on("data", (chunk) => {
      text += chunk;
      const match = text.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) resolve(match[1]);
    });
    chrome.on("exit", () => reject(new Error(`Chrome exited: ${text}`)));
  });
  return { chrome, port, profile };
}

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.problems = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
      if (msg.method === "Runtime.exceptionThrown") this.problems.push(msg.params.exceptionDetails.text + " " + (msg.params.exceptionDetails.exception?.description ?? ""));
      if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") this.problems.push(`${msg.params.entry.text} ${msg.params.entry.url ?? ""}`);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async eval(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  async shot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  }

  async until(expression, what, ms = 3000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await this.eval(expression)) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timed out waiting for ${what}: ${expression}`);
  }

  async swipe(direction, { distance = 170 } = {}) {
    const box = await this.eval(`(() => { const r = document.querySelector("[data-swipe]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const sign = direction === "left" ? -1 : 1;
    const point = (dx) => [{ x: box.x + dx, y: box.y }];
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(0) });
    for (let step = 1; step <= 8; step++) {
      await this.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point((sign * distance * step) / 8) });
      await new Promise((r) => setTimeout(r, 16));
    }
    return async () => this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  async tap(selector) {
    const box = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: "nearest" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [box] });
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  at(where, card) {
    return this.until(`document.getElementById("app").dataset.at === ${JSON.stringify(where)}${card ? ` && document.getElementById("app").dataset.card === ${JSON.stringify(card)}` : ""}`, `${where} ${card ?? ""}`);
  }
}

const MOTION_SETTLE = 600;
const settle = () => new Promise((r) => setTimeout(r, MOTION_SETTLE));

async function open(ws, url) {
  const page = new Page(ws);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: WIDTH < 700 });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await page.send("Page.navigate", { url });
  await page.until(`window.__game !== undefined`, "the game to start", 15000);
  return page;
}

const at = (page, where, card) => page.at(where, card);
const go = async (page, url) => {
  await page.send("Page.navigate", { url });
  await page.until(`window.__game !== undefined`, "the game to start", 15000);
};
const fits = async (page, name) => {
  const over = await page.eval(`Math.max(0, document.scrollingElement.scrollHeight - innerHeight)`);
  assert.equal(over, 0, `${name}: the page scrolls by ${over}px`);
  const app = await page.eval(`(() => { const a = document.getElementById("app"); return a.scrollWidth - a.clientWidth; })()`);
  assert.ok(app <= 1, `${name}: the screen scrolls sideways by ${app}px`);
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const { chrome, port, profile } = await launch();
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve) => ws.addEventListener("open", resolve));
    // An expert's first visit starts with the tour, once.
    const page = await open(ws, base);
    await at(page, "tour");
    assert.equal(await page.eval(`document.getElementById("app").dataset.tour`), "hello");
    await page.tap("[data-tour-leave]");
    await at(page, "home");
    await go(page, base);
    await at(page, "home");
    await go(page, `${base}?seed=2&fresh`);
    await at(page, "home");

    assert.equal(await page.eval(`window.__game.engine`), "Lean", "the Lean engine should load");
    const check = await page.eval(`window.__game.selfCheck()`);
    assert.equal(check.passed, check.total, "the engine should pass every case on this device");
    await at(page, "home");
    await settle();
    await page.shot("01-home");
    await fits(page, "home");

    // The tour: a real swipe on a practice case that nothing records.
    const tourAt = (step) => page.until(`document.getElementById("app").dataset.tour === ${JSON.stringify(step)}`, `the tour's ${step} step`);
    const tourShot = async (step, name) => {
      await tourAt(step);
      await settle();
      await page.shot(name);
      await fits(page, `tour ${step}`);
      const seen = await page.eval(`(() => { const a = document.getElementById("app"); return a.scrollHeight - a.clientHeight; })()`);
      assert.ok(seen <= 1, `tour ${step}: the screen needs ${seen}px of scrolling`);
    };
    await page.tap("[data-tour]");
    await tourShot("hello", "t1-hello");
    await page.tap("[data-tour-next]");
    await tourShot("case", "t2-case");
    let practice = await page.swipe("left", { distance: 150 });
    await practice();
    await tourAt("result");
    const practised = await page.eval(`document.getElementById("app").dataset.outcome`);
    assert.ok(practised === "0" || practised === "1", "the engine judged the practice answer");
    await tourShot("result", practised === "0" ? "t3-same-call" : "t3-possible-catch");
    await page.tap("[data-tour-back]");
    await tourAt("case");
    practice = await page.swipe("right", { distance: 150 });
    await practice();
    await tourAt("result");
    assert.notEqual(await page.eval(`document.getElementById("app").dataset.outcome`), practised, "the other sign gives the other result");
    await tourShot("result", practised === "0" ? "t3-possible-catch" : "t3-same-call");
    await page.tap("[data-tour-next]");
    await tourShot("ways-out", "t4-ways-out");
    await page.tap("[data-tour-next]");
    await tourShot("path", "t5-path");
    await page.tap("[data-tour-next]");
    await tourShot("counts", "t6-counts");
    await page.tap("[data-tour-next]");
    await tourShot("ready", "t7-ready");
    await page.tap("[data-tour-leave]");
    await at(page, "home");
    assert.equal(await page.eval(`Object.keys(window.__game.state.answers).length`), 0, "the tour records no answer");
    assert.equal(await page.eval(`window.__game.state.streak.answered`), false, "the tour keeps no streak");
    assert.equal(await page.eval(`window.__game.state.checksPassed`), 0, "the tour earns nothing");

    // Start the first shift.
    await page.tap("[data-start]");
    await at(page, "case", "accept-at-expiry");
    await settle();
    await page.shot("02-case");
    await fits(page, "case");
    assert.equal(await page.eval(`document.querySelector(".upper").scrollHeight <= document.querySelector(".upper").clientHeight + 1 || ${HEIGHT} < 700`), true, "the ticket's text should fit");

    // A short drag settles back.
    let release = await page.swipe("right", { distance: 40 });
    await release();
    await settle();
    await at(page, "case", "accept-at-expiry");
    assert.equal(await page.eval(`document.querySelector("[data-swipe]").style.transform`), "");

    // A long drag leans, then stamps. Seed 2 and the first case keep the choices in deck order.
    release = await page.swipe("left", { distance: 150 });
    assert.equal(await page.eval(`document.getElementById("app").dataset.lean`), "left");
    await page.shot("03-drag");
    await release();
    await at(page, "result", "accept-at-expiry");
    assert.equal(await page.eval(`document.getElementById("app").dataset.outcome`), "0");
    await settle();
    await page.shot("04-same-call");
    await fits(page, "same call");

    // Home leaves the shift at any point, and nothing is lost.
    await page.tap("[data-home]");
    await at(page, "home");
    await settle();
    await page.shot("04a-home-during-shift");
    await fits(page, "home during a shift");
    assert.match(await page.eval(`document.querySelector("[data-start]").textContent`), /^Continue first shift$/);
    assert.match(await page.eval(`document.querySelector(".sub").textContent`), /^Case 1 of 5\./);
    assert.equal(await page.eval(`Object.keys(window.__game.state.answers).length`), 1, "going home keeps the answer");
    await page.tap("[data-start]");
    await at(page, "result", "accept-at-expiry");

    // Starting over asks first, and keeping your answers keeps them.
    await page.tap("[data-home]");
    await at(page, "home");
    await page.tap("[data-reset]");
    await page.until(`document.getElementById("sheet").open`, "the start over sheet");
    await settle();
    await page.shot("04b-start-over");
    await page.tap("[data-close]");
    await page.until(`!document.getElementById("sheet").open`, "the sheet to close");
    assert.equal(await page.eval(`Object.keys(window.__game.state.answers).length`), 1, "keeping your answers keeps them");
    await page.tap("[data-start]");
    await at(page, "result", "accept-at-expiry");

    // Sides swap on the next case, so swiping left now picks the other kind of answer.
    await page.tap("[data-next]");
    await at(page, "case", "declined-card");
    assert.equal(await page.eval(`document.querySelector('[data-side="left"]').dataset.choice`), "trip-paid");
    release = await page.swipe("left", { distance: 150 });
    await release();
    await at(page, "result", "declined-card");
    assert.equal(await page.eval(`document.getElementById("app").dataset.surface`), "possible-catch");
    await settle();
    await page.shot("05-possible-catch");
    await fits(page, "possible catch");

    // Three choices use taps, and the decision shows its reach.
    await page.tap("[data-next]");
    await at(page, "case", "refund-limit");
    assert.equal(await page.eval(`document.querySelectorAll(".option").length`), 3);
    assert.equal(await page.eval(`document.querySelectorAll(".dots i").length`), 15);
    await settle();
    await page.shot("06-decision");
    await fits(page, "decision");
    await page.tap('[data-choice="per-payment"]');
    await at(page, "result", "refund-limit");
    await settle();
    await page.shot("07-decision-result");

    // The follow-up is computed from the answer before it.
    await page.tap("[data-next]");
    await at(page, "case", "late-capture");
    await page.tap('[data-choice="becomes-successful"]');
    await at(page, "result", "late-capture");
    await page.tap("[data-next]");
    await at(page, "case", "late-capture-result");
    assert.match(await page.eval(`document.querySelector("h1").textContent`), /paid for nothing/);
    assert.equal(await page.eval(`document.getElementById("app").dataset.surface`), "consequence");
    await settle();
    await page.shot("08-paid-for-nothing");
    await fits(page, "follow-up");
    await page.tap('[data-side="right"]');
    await at(page, "result", "late-capture-result");
    await page.tap("[data-next]");
    await at(page, "report");
    assert.equal(await page.eval(`document.querySelector("[data-home]")`), null, "the report has its own way home");
    await settle();
    await page.shot("09-report");
    assert.equal(await page.eval(`document.querySelectorAll(".tile").length`), 5);

    // Answers survive a reload.
    await go(page, `${base}?seed=2`);
    await at(page, "report");
    assert.equal(JSON.parse(await page.eval(`window.__game.answersJson()`)).answers.length, 5);

    // The second shift: It depends, a check card, Not my area.
    await page.tap("[data-done]");
    await at(page, "home");
    await page.tap("[data-start]");
    await at(page, "case", "refund-rule");
    await page.tap("[data-depends]");
    await page.until(`document.getElementById("sheet").open`, "the sheet");
    await settle();
    await page.shot("10-it-depends");
    await page.eval(`document.getElementById("note").value = "Depends on the market"; document.querySelector("[data-save-depends]").click()`);
    await at(page, "result", "refund-rule");
    assert.equal(await page.eval(`document.getElementById("app").dataset.outcome`), "2");
    await page.tap("[data-next]");
    await at(page, "case", "late-payment-check");
    assert.equal(await page.eval(`document.querySelector('[data-side="right"]').dataset.choice`), "yes", "yes stays on the right");
    await page.tap('[data-choice="no"]');
    await at(page, "result", "late-payment-check");
    assert.equal(await page.eval(`document.getElementById("app").dataset.outcome`), "4");
    await settle();
    await page.shot("11-check-passed");
    await page.tap("[data-behind]");
    await page.until(`document.getElementById("sheet").open`, "the sheet");
    await page.eval(`document.querySelector("[data-run-check]").click()`);
    await page.until(`/of .* cases passed/.test(document.querySelector("[data-check-result]").textContent)`, "the check");
    await settle();
    await page.shot("12-behind");
    await page.eval(`document.querySelector("[data-close]").click()`);
    await page.tap("[data-next]");
    await at(page, "case", "removal-status");
    await page.tap("[data-notmine]");
    await at(page, "case", "expiry-drift");
    assert.match(await page.eval(`document.querySelector(".demo-flag").textContent`), /Demo case/);
    await page.tap('[data-choice="rules"]');
    await at(page, "result", "expiry-drift");
    await page.tap("[data-next]");
    await at(page, "case", "zero-commitment");
    assert.equal(await page.eval(`document.querySelectorAll(".dots i").length`), 51);
    await settle();
    await page.shot("13-top-question");
    await fits(page, "top question");
    await page.tap('[data-choice="ready"]');
    await at(page, "result", "zero-commitment");
    await page.tap("[data-next]");
    await at(page, "report");

    // No follow-up after It depends: the shift goes straight to the report.
    await go(page, `${base}?seed=2&fresh`);
    await at(page, "home");
    await page.eval(`(() => { for (const [a, b] of [["[data-start]"]]) document.querySelector(a).click(); })()`);
    await at(page, "case", "accept-at-expiry");
    for (const id of ["accept-at-expiry", "declined-card", "refund-limit"]) {
      await at(page, "case", id);
      await page.tap("[data-notmine]");
    }
    await at(page, "case", "late-capture");
    await page.tap("[data-depends]");
    await page.until(`document.getElementById("sheet").open`, "the sheet");
    await page.eval(`document.querySelector("[data-save-depends]").click()`);
    await at(page, "result", "late-capture");
    await page.tap("[data-next]");
    await at(page, "report");

    // The keyboard works, and the JavaScript fallback plays the same game.
    await go(page, `${base}?seed=2&fresh&engine=js`);
    assert.equal(await page.eval(`window.__game.engine`), "JavaScript");
    await at(page, "home");
    await page.eval(`document.querySelector("[data-start]").click()`);
    await at(page, "case", "accept-at-expiry");
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft" });
    await at(page, "result", "accept-at-expiry");

    // Keys do nothing to the shift while the home screen shows, and starting over clears everything.
    await page.tap("[data-next]");
    await at(page, "case", "declined-card");
    await page.tap("[data-home]");
    await at(page, "home");
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft" });
    await settle();
    await at(page, "home");
    assert.equal(await page.eval(`Object.keys(window.__game.state.answers).length`), 1, "a key press at home answers nothing");
    await page.tap("[data-reset]");
    await page.until(`document.getElementById("sheet").open`, "the start over sheet");
    await page.tap("[data-confirm-reset]");
    await at(page, "home");
    assert.equal(await page.eval(`Object.keys(window.__game.state.answers).length`), 0, "starting over clears the answers");
    assert.equal(await page.eval(`window.__game.state.session.phase`), 0, "starting over ends the shift");
    assert.match(await page.eval(`document.querySelector("[data-start]").textContent`), /^Start first shift$/);

    assert.deepEqual(page.problems.filter((p) => !/fonts\.g|navigator\.vibrate/.test(p)), []);
    console.log(`ok: played both shifts with touch at ${WIDTH}x${HEIGHT}. Screenshots are in ${OUT}`);
    ws.close();
  } finally {
    chrome.kill();
    server.close();
    await new Promise((r) => setTimeout(r, 300));
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch { /* Chrome is still closing. The folder is temporary. */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
