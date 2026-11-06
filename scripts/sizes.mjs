// Measures what each engine costs to download, compressed with brotli.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { brotliCompressSync } from "node:zlib";
const br = (p) => brotliCompressSync(readFileSync(p)).length;
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`) + " with brotli";
const manifest = JSON.parse(readFileSync("engines/lasm/dist/lasm-manifest.json", "utf8"));
const sizes = {
  js: kb(br("engines/js/engine.js")),
  rust: kb(br("engines/rust/game.wasm")),
  lean: kb(manifest.transfer.brotli),
};
writeFileSync("side-by-side/sizes.json", JSON.stringify(sizes, null, 1) + "\n");
console.log(sizes);
