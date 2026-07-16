// Regenerates every raster brand asset from app/icon.svg (the single source
// of truth for the unified ReelSpy mark — components/brand/Logo.tsx mirrors
// the same geometry/colors as JSX). Run after changing the logo art:
//
//   node scripts/generate-brand-assets.mjs
//
// Outputs:
//   public/brand/reelspy-logo-1024.png  — big export (Supabase profile, integrations)
//   public/brand/reelspy-logo-512.png   — smaller export
//   app/favicon.ico                     — 16/32/48 ICO with PNG-compressed entries
//
// Uses sharp via `npx sharp-cli` for rasterization (no permanent dependency),
// then assembles the ICO in-process (PNG entries are valid in ICO since Vista).

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SVG = "app/icon.svg";
const sizesPng = [1024, 512];
const sizesIco = [16, 32, 48];

mkdirSync("public/brand", { recursive: true });

for (const s of sizesPng) {
  execSync(`npx --yes sharp-cli --input ${SVG} --output public/brand/reelspy-logo-${s}.png resize ${s} ${s}`, {
    stdio: "inherit",
  });
}

const tmp = mkdtempSync(join(tmpdir(), "reelspy-ico-"));
const entries = sizesIco.map((s) => {
  const file = join(tmp, `icon-${s}.png`);
  execSync(`npx --yes sharp-cli --input ${SVG} --output "${file}" resize ${s} ${s}`, { stdio: "inherit" });
  return { size: s, data: readFileSync(file) };
});
rmSync(tmp, { recursive: true, force: true });

// ICO layout: ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes each) + image data.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(entries.length, 4);

let offset = 6 + 16 * entries.length;
const dirEntries = [];
for (const { size, data } of entries) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
  e.writeUInt8(size === 256 ? 0 : size, 1); // height
  e.writeUInt8(0, 2); // palette colors
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // color planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(data.length, 8); // image data size
  e.writeUInt32LE(offset, 12); // image data offset
  dirEntries.push(e);
  offset += data.length;
}

writeFileSync("app/favicon.ico", Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.data)]));
console.log(`Wrote app/favicon.ico (${offset} bytes) and public/brand PNGs.`);
