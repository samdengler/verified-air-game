// Runs in the Playwright container: the side-by-side page and the design checks in
// Chromium, Firefox and WebKit. Reads the repository and writes only to /out.
import { createServer } from "node:http";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium, firefox, webkit, devices } from "playwright";

const ROOT = process.env.ROOT || "/work";
const OUT = process.env.OUT || "/out";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".jsonl": "text/plain", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  const path = normalize(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  let file = join(ROOT, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browsers = [
  ["chromium", chromium, devices["Pixel 7"]],
  ["firefox", firefox, { viewport: { width: 390, height: 844 } }],
  ["webkit", webkit, devices["iPhone 14"]],
];
const rules = JSON.parse(readFileSync(join(ROOT, "design/checks.json"), "utf8"));
const screens = readdirSync(join(ROOT, "design/mockups")).filter((f) => f.endsWith(".dc.html")).sort();

// Runs inside the page. Finds every colour pair, text size and touch target as drawn.
function audit(rules) {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
  };
  const lin = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  const backdrop = (el) => {
    const chain = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const bg = parse(getComputedStyle(e).backgroundColor);
      if (bg[3] > 0) chain.push(bg);
      if (bg[3] === 1) break;
    }
    let out = [255, 255, 255, 1];
    for (const c of chain.reverse()) out = over(c, out);
    return out;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && !el.closest("[aria-hidden=true]") && !el.closest("[hidden]") && !el.closest("dialog:not([open])"); };
  const found = { text: 0, targets: 0, graphics: 0, contrast: [], small: [], targetsSmall: [], graphicsLow: [], outside: [] };
  const label = (el) => (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40);
  for (const el of document.querySelectorAll("body *")) {
    if (["SCRIPT", "STYLE", "LINK", "HELMET"].includes(el.tagName) || !visible(el) || el.closest("svg")) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) {
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      const large = px >= rules.largeTextPx || (px >= 18.66 && bold);
      const bg = backdrop(el);
      const fgRaw = parse(cs.color);
      const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacityOf(el)], bg);
      const r = ratio(fg, bg);
      found.text++;
      const need = large ? rules.required["large text"] : rules.required.text;
      if (r < need) found.contrast.push({ text: label(el), fg: hex(fg), bg: hex(bg), ratio: +r.toFixed(2), need });
      if (px < rules.minTextPx) found.small.push({ text: label(el), px });
      if (!rules.tokens.includes(hex(fg)) || !rules.tokens.includes(hex(bg))) found.outside.push({ text: label(el), fg: hex(fg), bg: hex(bg) });
    }
    if (el.matches("button, a[href], input, select, textarea")) {
      const r = el.getBoundingClientRect();
      found.targets++;
      if (r.height < rules.minTouchTarget || r.width < rules.minTouchTarget) found.targetsSmall.push({ text: label(el) || el.id, w: Math.round(r.width), h: Math.round(r.height) });
      // A control has to stand out from what is behind it, by its fill or by its border.
      const fill = parse(getComputedStyle(el).backgroundColor);
      if (el.tagName === "BUTTON" && fill[3] > 0 && el.parentElement) {
        const under = backdrop(el.parentElement);
        const border = parse(getComputedStyle(el).borderTopColor);
        const hasBorder = parseFloat(getComputedStyle(el).borderTopWidth) > 0 && border[3] > 0;
        const shows = ratio(over(fill, under), under) >= rules.required.graphics || (hasBorder && ratio(over(border, under), under) >= rules.required.graphics);
        found.graphics++;
        if (!shows) found.graphicsLow.push({ what: `button: ${label(el)}`, fg: hex(over(fill, under)), bg: hex(under), ratio: +ratio(over(fill, under), under).toFixed(2) });
      }
    }
    if (!own && !el.children.length && (el.tagName === "DIV" || el.tagName === "I")) {
      const r = el.getBoundingClientRect();
      const bg = parse(getComputedStyle(el).backgroundColor);
      // Equal-sided shapes up to 26 px are drawn decoration here: bubble tails and ticket notches.
      const decoration = r.width <= 26 && Math.abs(r.width - r.height) <= 1;
      if (bg[3] > 0 && !decoration && r.height <= 80 && el.parentElement) {
        found.graphics++;
        const under = backdrop(el.parentElement);
        const fg = over(bg, under);
        const c = ratio(fg, under);
        if (c < rules.required.graphics) found.graphicsLow.push({ what: r.height <= 26 ? "indicator bar" : "tile", fg: hex(fg), bg: hex(under), ratio: +c.toFixed(2) });
      }
    }
  }
  for (const svg of document.querySelectorAll('svg[role="img"]')) {
    if (!visible(svg)) continue;
    const under = backdrop(svg.parentElement);
    const seen = new Set();
    for (const shape of svg.querySelectorAll("circle, rect, path")) {
      const cs = getComputedStyle(shape);
      const fill = parse(cs.fill);
      const fillShows = fill[3] > 0 && hex(over(fill, under)) !== hex(under);
      const paint = fillShows ? fill : parse(cs.stroke);
      if (paint[3] === 0) continue;
      const fg = over([paint[0], paint[1], paint[2], paint[3] * Number(cs.opacity)], under);
      const key = hex(fg);
      if (seen.has(key)) continue;
      seen.add(key);
      found.graphics++;
      const c = ratio(fg, under);
      if (c < rules.required.graphics) found.graphicsLow.push({ what: svg.getAttribute("aria-label"), fg: key, bg: hex(under), ratio: +c.toFixed(2) });
    }
  }
  return found;
}

// Plays both shifts of the real app, measuring every screen on the way.
async function playApp(page, url, measure) {
  const app = (name) => page.waitForFunction((n) => document.getElementById("app").dataset.at === n, name, { timeout: 15000 });
  const onCard = (id) => page.waitForFunction((c) => document.getElementById("app").dataset.card === c, id, { timeout: 15000 });
  const screen = async (name) => {
    await page.waitForTimeout(40);
    await measure(name);
  };
  const swipe = async (dir) => {
    const box = await page.locator("[data-swipe]").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (dir === "left" ? -170 : 170), y, { steps: 8 });
    await screen("dragging");
    await page.mouse.up();
  };
  const click = (selector) => page.locator(selector).first().click();
  await page.goto(url);
  await page.waitForFunction("window.__game !== undefined", null, { timeout: 30000 });
  await app("home");
  await screen("home");
  await click("[data-start]");
  await onCard("accept-at-expiry");
  await screen("case");
  await swipe("left");
  await app("result");
  await screen("same call");
  await click("[data-next]");
  await onCard("declined-card");
  await swipe("left");
  await app("result");
  await screen("possible catch");
  await click("[data-next]");
  await onCard("refund-limit");
  await screen("decision");
  await click('[data-choice="per-payment"]');
  await app("result");
  await screen("decision result");
  await click("[data-next]");
  await onCard("late-capture");
  await click('[data-choice="becomes-successful"]');
  await app("result");
  await click("[data-next]");
  await onCard("late-capture-result");
  await screen("paid for nothing");
  await click('[data-choice="no"]');
  await app("result");
  await screen("follow-up catch");
  await click("[data-next]");
  await app("report");
  await screen("report");
  await click("[data-done]");
  await app("home");
  await click("[data-start]");
  await onCard("refund-rule");
  await click("[data-depends]");
  await page.waitForFunction(() => document.getElementById("sheet").open);
  await screen("it depends sheet");
  await page.locator("[data-save-depends]").click();
  await app("result");
  await screen("exception");
  await click("[data-next]");
  await onCard("late-payment-check");
  await click('[data-choice="no"]');
  await app("result");
  await screen("check passed");
  await click("[data-behind]");
  await page.waitForFunction(() => document.getElementById("sheet").open);
  await page.locator("[data-run-check]").click();
  await page.waitForFunction(() => /cases passed/.test(document.querySelector("[data-check-result]").textContent), null, { timeout: 30000 });
  await screen("behind this card");
  const check = await page.locator("[data-check-result]").textContent();
  await page.locator("[data-close]").click();
  await click("[data-next]");
  await onCard("removal-status");
  await click("[data-notmine]");
  await onCard("expiry-drift");
  await screen("rules and code");
  await click('[data-choice="rules"]');
  await app("result");
  await click("[data-next]");
  await onCard("zero-commitment");
  await screen("top question");
  await click('[data-choice="ready"]');
  await app("result");
  await click("[data-next]");
  await app("report");
  await screen("second report");
  return { engine: await page.evaluate(() => window.__game.engine), check };
}

const report = { browsers: {}, sideBySide: {}, app: {} };
for (const [name, type, device] of browsers) {
  const browser = await type.launch();
  const version = browser.version();
  // The side-by-side page, on a wide screen.
  const wide = await browser.newContext({ viewport: { width: 1300, height: 1120 } });
  const page = await wide.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(String(e)));
  await page.goto(`${base}/side-by-side/`);
  await page.waitForFunction("window.__ready || window.__error", null, { timeout: 60000 });
  const started = await page.evaluate(() => ({ error: window.__error || null, results: window.__sideBySide && Object.fromEntries(Object.entries(window.__sideBySide.results).map(([k, v]) => [k, { passed: v.passed, total: v.total, ms: +v.ms.toFixed(1) }])) }));
  // Walk every path a shift can take, tapping real buttons on the first phone's engine.
  let walks = 0;
  let disagreements = 0;
  if (!started.error) {
    const tapAll = async (selector) => page.evaluate((sel) => { const b = document.querySelector(`[data-engine="js"] ${sel}`); if (!b) return false; b.click(); return true; }, selector);
    const choices = ['button[data-response="0"]', 'button[data-response="1"]', 'button[data-response="2"]', 'button[data-response="3"]'];
    for (let seed = 0; seed < 60; seed++) {
      await page.reload();
      await page.waitForFunction("window.__ready");
      await tapAll('button[data-event="0"]');
      let r = seed * 7 + 3;
      for (let step = 0; step < 14; step++) {
        const phase = await page.evaluate(() => window.__sideBySide.phases[0]);
        if (phase === 3) break;
        if (phase === 2) { await tapAll('button[data-event="4"]'); continue; }
        r = (r * 31 + 11) % 97;
        if (!(await tapAll(choices[r % 4]))) await tapAll(choices[(r + 1) % 2]);
      }
      const final = await page.evaluate(() => window.__sideBySide);
      walks++;
      if (!final.same) disagreements++;
    }
    await page.reload();
    await page.waitForFunction("window.__ready");
    await page.evaluate(() => document.querySelector('[data-engine="js"] button[data-event="0"]').click());
    await page.evaluate(() => document.querySelector('[data-engine="js"] button[data-response="1"]').click());
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `side-by-side-${name}.png`), fullPage: true });
  }
  report.sideBySide[name] = { version, ...started, walks, disagreements, problems };
  await wide.close();
  // The real app, at phone size, measured against the design rules on every screen.
  const appContext = await browser.newContext({ ...device, isMobile: name === "firefox" ? undefined : device.isMobile, reducedMotion: "reduce" });
  const appPage = await appContext.newPage();
  const appErrors = [];
  appPage.on("pageerror", (e) => appErrors.push(String(e)));
  const findings = [];
  let measured = 0;
  const totals = { text: 0, targets: 0, graphics: 0 };
  const lean = await playApp(appPage, `${base}/web/?seed=2&fresh`, async (screenName) => {
    const found = await appPage.evaluate(audit, rules);
    measured++;
    totals.text += found.text; totals.targets += found.targets; totals.graphics += found.graphics;
    for (const kind of ["contrast", "small", "targetsSmall", "graphicsLow", "outside"]) {
      for (const item of found[kind]) findings.push({ screen: screenName, kind, ...item });
    }
  });
  await appContext.close();
  // With the Lean engine blocked, the same game has to run on the fallback.
  const blocked = await browser.newContext({ ...device, isMobile: name === "firefox" ? undefined : device.isMobile, reducedMotion: "reduce" });
  const blockedPage = await blocked.newPage();
  await blockedPage.route("**/lean/**", (route) => route.abort());
  const fallback = await playApp(blockedPage, `${base}/web/?seed=2&fresh`, async () => {});
  await blocked.close();
  report.app[name] = { lean, fallback, measured, totals, findings, errors: appErrors };

  // The design rules, on every mockup, at phone size.
  const phone = await browser.newContext({ ...device, isMobile: name === "firefox" ? undefined : device.isMobile });
  const check = await phone.newPage();
  const perScreen = {};
  for (const file of screens) {
    await check.goto(`${base}/design/mockups/${file}`);
    await check.waitForTimeout(150);
    perScreen[file.replace(".dc.html", "")] = await check.evaluate(audit, rules);
  }
  report.browsers[name] = { version, screens: perScreen };
  await phone.close();
  await browser.close();
  console.log(name, version, "side by side:", report.sideBySide[name].walks, "walks,", report.sideBySide[name].disagreements, "disagreements");
  console.log(name, "app on", lean.engine, "|", lean.check, "| fallback on", fallback.engine, "| screens", measured, JSON.stringify(totals), "| findings", findings.length, "| errors", appErrors.length);
}
writeFileSync(join(OUT, "cross-browser.json"), JSON.stringify(report, null, 1));
server.close();
const failures = Object.values(report.app).flatMap((a) => [...a.findings, ...a.errors]);
const bad = Object.values(report.sideBySide).some((s) => s.disagreements || s.error || s.problems.length);
const seen = new Set();
for (const f of failures) {
  const key = typeof f === "string" ? f : JSON.stringify({ k: f.kind, t: f.text || f.what, fg: f.fg, bg: f.bg });
  if (!seen.has(key)) console.log("FINDING", typeof f === "string" ? f : JSON.stringify(f));
  seen.add(key);
}
const engines = Object.values(report.app).every((a) => a.lean.engine === "Lean" && a.fallback.engine === "JavaScript");
if (failures.length || bad || !engines) {
  console.log(`FAILED: ${failures.length} findings`);
  process.exit(1);
}
console.log("PASSED: no design findings on the real app, in any browser");
