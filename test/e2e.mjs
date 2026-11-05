// Plays a whole batch in headless Chrome on a phone-sized screen, with real
// touch events, and saves a screenshot of each step to test/out. No packages:
// Node's own WebSocket drives Chrome over the DevTools protocol.
//
// Usage: node test/e2e.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB = join(HERE, "..", "web");
const [WIDTH, HEIGHT] = (process.env.SIZE || "390x844").split("x").map(Number);
const OUT = join(HERE, "out", process.env.SIZE || "");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };

function serve() {
  const server = createServer((req, res) => {
    const name = normalize(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const file = join(WEB, name);
    if (!file.startsWith(WEB) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
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

const sideOf = (page, choice) => page.eval(`document.querySelector('[data-choice="${choice}"]').dataset.side`);

async function choose(page, card, choice) {
  await page.at("card", card);
  const side = await sideOf(page, choice);
  const release = await page.swipe(side);
  await release();
  await page.at("reveal", card);
  const said = await page.eval(`document.querySelector(".said b").textContent`);
  assert.ok(said.length > 0);
}

const next = async (page) => {
  await page.tap("[data-next]");
};

async function run() {
  mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const { chrome, port, profile } = await launch();
  try {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
    const page = new Page(ws);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await page.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/index.html` });

    await page.at("intro");
    await page.until(`document.fonts.check('700 17px Overpass')`, "the font");
    assert.equal(await page.eval(`document.fonts.check('700 17px Overpass') && [...document.fonts].some((f) => f.family === "Overpass" && f.status === "loaded")`), true);
    await page.shot("01-intro");

    // A short drag settles back and answers nothing.
    let release = await page.swipe("right", { distance: 40 });
    await release();
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(await page.eval(`document.getElementById("app").dataset.at`), "intro");

    release = await page.swipe("right");
    await release();

    // Card 1: the fork leans while dragging, and a wrong prediction is a hold.
    await page.at("card", "accept-at-expiry");
    await new Promise((r) => setTimeout(r, 320));
    await page.shot("02-predict");
    if (HEIGHT >= 800) {
      assert.equal(await page.eval(`document.documentElement.scrollHeight <= window.innerHeight`), true, "the card screen scrolls");
    }
    const wrongSide = await sideOf(page, "created");
    release = await page.swipe(wrongSide);
    assert.equal(await page.eval(`document.getElementById("app").dataset.lean`), wrongSide);
    await page.shot("03-drag");
    await release();
    await page.at("reveal", "accept-at-expiry");
    assert.ok(await page.eval(`!!document.querySelector(".plate-hold")`));
    await page.shot("04-mismatch");
    await page.tap("[data-sheet='exception']");
    await page.until(`document.getElementById("sheet").open`, "the sheet");
    await page.tap(".chip");
    await page.shot("05-exception-sheet");
    await page.tap("[data-sheet-ok]");
    await page.until(`document.querySelector("[data-sheet='exception']").disabled`, "the exception to be recorded");
    await next(page);

    // Card 2 matches.
    await choose(page, "declined-card", "whole-fails");
    assert.ok(await page.eval(`!document.querySelector(".plate-hold")`));
    await page.shot("06-match");
    await next(page);

    // Card 3: yes is on the right.
    assert.equal(await (async () => { await page.at("card", "refund-rule"); return sideOf(page, "yes"); })(), "right");
    await choose(page, "refund-rule", "yes");
    await page.shot("07-confirm");
    await next(page);

    // Card 4: three choices leave the swipe off.
    await page.at("card", "refund-limit");
    assert.equal(await page.eval(`document.querySelector("[data-swipe]")`), null);
    await new Promise((r) => setTimeout(r, 320));
    await page.shot("08-decide-three");
    await page.tap('[data-choice="per-payment"]');
    await page.at("reveal", "refund-limit");
    assert.match(await page.eval(`document.querySelector(".result").textContent`), /120\.00 USD/);
    assert.match(await page.eval(`document.querySelector(".reach").textContent`), /15 cards depend/);
    await page.shot("09-decide-reveal");
    await next(page);

    // Card 5: the check card.
    await choose(page, "late-payment-check", "no");
    assert.match(await page.eval(`document.querySelector(".plate-verdict").textContent`), /caught/);
    await page.shot("10-check-card");
    await next(page);

    // Cards 6 and 7: the follow-up shows the model's result for this answer.
    await choose(page, "late-capture", "becomes-successful");
    await next(page);
    await page.at("card", "late-capture-result");
    assert.match(await page.eval(`document.querySelector(".case").textContent`), /paid for nothing/);
    await new Promise((r) => setTimeout(r, 320));
    await page.shot("11-followup");
    await choose(page, "late-capture-result", "no");
    await page.shot("12-followup-finding");
    await next(page);

    // Card 8: this choice has a proven version.
    await page.at("card", "removal-status");
    await page.tap('[data-choice="removed"]');
    await page.at("reveal", "removal-status");
    assert.match(await page.eval(`document.querySelector(".if-decided").textContent`), /none of them holds value/);
    await page.shot("13-if-we-decide");
    await next(page);

    // Card 9: drift, marked as a demo case, recalling card 1.
    await page.at("card", "expiry-drift");
    assert.match(await page.eval(`document.querySelector(".flag").textContent`), /Demo case/);
    await new Promise((r) => setTimeout(r, 320));
    await page.shot("14-reconcile");
    await choose(page, "expiry-drift", "rules");
    assert.match(await page.eval(`document.querySelector(".echo").textContent`), /An order is created/);
    await page.shot("15-reconcile-reveal");
    await next(page);

    // Card 10: "It depends" records a condition.
    await page.at("card", "zero-commitment");
    await new Promise((r) => setTimeout(r, 320));
    await page.shot("16-top-question");
    await page.tap("[data-sheet='depends']");
    await page.until(`document.getElementById("sheet").open`, "the sheet");
    await page.tap(".chip:nth-child(3)");
    await page.tap("[data-sheet-ok]");
    await page.at("reveal", "zero-commitment");
    assert.match(await page.eval(`document.querySelector(".reach").textContent`), /51 cards depend/);
    await page.shot("17-depends");
    await next(page);

    await page.at("end");
    const end = await page.eval(`document.querySelector(".screen-end").textContent`);
    assert.match(end, /No goals left/);
    assert.match(end, /You caught the check card/);
    assert.match(end, /It depends: Channel\./);
    assert.match(end, /An answer changes no status/);
    assert.equal(await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`), true, "the page scrolls sideways");
    await page.shot("18-end");

    // Copy either reaches the clipboard or shows the text to copy by hand.
    await page.tap("[data-copy]");
    await page.until(`document.querySelector("[data-copy]").textContent !== "Copy answers"`, "the copy to finish");
    if (await page.eval(`!document.querySelector(".copy-fallback").hidden`)) {
      const exported = JSON.parse(await page.eval(`document.querySelector(".copy-fallback").value`));
      assert.equal(exported.answers.length, 10);
    }

    // A reload keeps the batch, and starting again clears it.
    await page.send("Page.reload");
    await page.at("end");
    await page.tap("[data-restart]");
    await page.at("intro");

    // Keyboard answers work too.
    await page.eval(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))`);
    await page.at("card", "accept-at-expiry");

    assert.deepEqual(page.problems, [], "the page logged errors");
    ws.close();
    console.log(`ok: played the batch with touch. Screenshots are in ${OUT}`);
  } finally {
    chrome.kill();
    server.close();
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 300);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
