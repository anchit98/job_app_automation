/**
 * Remove outer black background from the JobApp OS logo (keep internal etch lines).
 * Run: node scripts/make-logo-transparent.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "public/brand/logo-source.png");

const src = fs.readFileSync(sourcePath);
const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const w = info.width;
const h = info.height;
const rgba = Buffer.from(data);

function isBg(byteIndex) {
  const r = rgba[byteIndex];
  const g = rgba[byteIndex + 1];
  const b = rgba[byteIndex + 2];
  return Math.max(r, g, b) < 38;
}

const seen = new Uint8Array(w * h);
const q = [];

function push(x, y) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const idx = y * w + x;
  if (seen[idx]) return;
  if (!isBg(idx * 4)) return;
  seen[idx] = 1;
  q.push(idx);
}

for (let x = 0; x < w; x++) {
  push(x, 0);
  push(x, h - 1);
}
for (let y = 0; y < h; y++) {
  push(0, y);
  push(w - 1, y);
}

while (q.length) {
  const idx = q.pop();
  const x = idx % w;
  const y = ((idx - x) / w) | 0;
  rgba[idx * 4 + 3] = 0;
  push(x + 1, y);
  push(x - 1, y);
  push(x, y + 1);
  push(x, y - 1);
}

const out = Buffer.from(rgba);
for (let y = 1; y < h - 1; y++) {
  for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    if (out[i + 3] === 0) continue;
    let near = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (out[((y + dy) * w + (x + dx)) * 4 + 3] === 0) near++;
    }
    if (near >= 3 && Math.max(out[i], out[i + 1], out[i + 2]) < 55) {
      out[i + 3] = 0;
    }
  }
}

const trimmed = await sharp(out, {
  raw: { width: w, height: h, channels: 4 },
})
  .trim({ threshold: 1 })
  .png()
  .toBuffer();

const meta = await sharp(trimmed).metadata();
// Keep a tiny pad only — larger mark in the square frame.
const pad = 8;

const square = await sharp(trimmed)
  .extend({
    top: pad,
    bottom: pad,
    left: pad,
    right: pad,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .resize(512, 512, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

const targets = [
  ["public/brand/logo.png", 512],
  ["public/brand/jobapp-os-logo.png", 512],
  ["public/brand/logo-64.png", 128],
  ["public/favicon-32.png", 64],
  ["public/favicon-16.png", 32],
  ["public/apple-touch-icon.png", 180],
  ["src/app/icon.png", 64],
  ["src/app/apple-icon.png", 180],
];

for (const [rel, dim] of targets) {
  await sharp(square)
    .resize(dim, dim, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(root, rel));
}

const check = await sharp(square)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let transparent = 0;
let opaque = 0;
let darkOpaque = 0;
for (let i = 0; i < check.data.length; i += 4) {
  if (check.data[i + 3] < 16) transparent++;
  else {
    opaque++;
    if (check.data[i] < 20 && check.data[i + 1] < 20 && check.data[i + 2] < 20) {
      darkOpaque++;
    }
  }
}

console.log({
  trimmed: { width: meta.width, height: meta.height },
  transparent,
  opaque,
  darkOpaque,
});
