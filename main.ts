// AURELIA — The Floating Terraces
// A travel poster for a place that does not exist.
// Deterministic: fixed strings, fixed geometry, no clock, no randomness,
// no network. Writes a 1024x1024 RGB PNG to /output/entry.png
// (or $MAKEFUN_OUTPUT_DIR/entry.png when set).
// Node 22, standard library only.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- canvas
const buf = new Uint8Array(W * H * 3);

type RGB = [number, number, number];

function setPx(x: number, y: number, c: RGB): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const o = (iy * W + ix) * 3;
  buf[o] = c[0];
  buf[o + 1] = c[1];
  buf[o + 2] = c[2];
}

function blendPx(x: number, y: number, c: RGB, a: number): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const o = (iy * W + ix) * 3;
  buf[o] = Math.round(buf[o] * (1 - a) + c[0] * a);
  buf[o + 1] = Math.round(buf[o + 1] * (1 - a) + c[1] * a);
  buf[o + 2] = Math.round(buf[o + 2] * (1 - a) + c[2] * a);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      setPx(x, y, c);
    }
  }
}

// Vertical gradient over [y0, y1] through colour stops [[t, colour], ...].
function vgrad(y0: number, y1: number, stops: Array<[number, RGB]>): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
    const t = (y - y0) / (y1 - y0);
    let c: RGB = stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, c0] = stops[i];
      const [t1, c1] = stops[i + 1];
      if (t >= t0 && t <= t1) {
        c = mix(c0, c1, (t - t0) / (t1 - t0));
        break;
      }
    }
    for (let x = 0; x < W; x++) setPx(x, y, c);
  }
}

function circle(cx: number, cy: number, r: number, c: RGB, alpha = 1): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        if (alpha >= 1) setPx(x, y, c);
        else blendPx(x, y, c, alpha);
      }
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, alpha = 1): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        if (alpha >= 1) setPx(x, y, c);
        else blendPx(x, y, c, alpha);
      }
    }
  }
}

// Scanline polygon fill. pts: [x, y] pairs, closed implicitly.
function polygon(pts: Array<[number, number]>, c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (const [, y] of pts) {
    minY = Math.min(minY, Math.floor(y));
    maxY = Math.max(maxY, Math.ceil(y));
  }
  for (let y = Math.max(0, minY); y < Math.min(H, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.max(0, Math.ceil(xs[i])); x < Math.min(W, xs[i + 1]); x++) {
        setPx(x, y, c);
      }
    }
  }
}

// Thick line segment, square caps.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const steps = Math.ceil(len);
  const r = w / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    circle(lerp(x0, x1, t), lerp(y0, y1, t), r, c);
  }
}

// ------------------------------------------------------------------- font
// Hand-drawn 7x9 bitmap glyphs, one per letter of AURELIA.
const GLYPHS: Record<string, string[]> = {
  A: [
    "0111110",
    "1100011",
    "1100011",
    "1100011",
    "1111111",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
  ],
  U: [
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "0111110",
  ],
  R: [
    "1111110",
    "1100011",
    "1100011",
    "1100011",
    "1111110",
    "1101100",
    "1100110",
    "1100011",
    "1100011",
  ],
  E: [
    "1111111",
    "1100000",
    "1100000",
    "1100000",
    "1111110",
    "1100000",
    "1100000",
    "1100000",
    "1111111",
  ],
  L: [
    "1100000",
    "1100000",
    "1100000",
    "1100000",
    "1100000",
    "1100000",
    "1100000",
    "1100000",
    "1111111",
  ],
  I: [
    "1111111",
    "0001100",
    "0001100",
    "0001100",
    "0001100",
    "0001100",
    "0001100",
    "0001100",
    "1111111",
  ],
};

function drawText(text: string, x0: number, y0: number, scale: number, c: RGB): void {
  const adv = 7 * scale + 2 * scale; // glyph width + letter gap
  let x = x0;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) {
      x += adv;
      continue;
    }
    for (let r = 0; r < 9; r++) {
      for (let col = 0; col < 7; col++) {
        if (g[r][col] === "1") {
          fillRect(x + col * scale, y0 + r * scale, x + (col + 1) * scale, y0 + (r + 1) * scale, c);
        }
      }
    }
    x += adv;
  }
}

function textWidth(text: string, scale: number): number {
  const adv = 7 * scale + 2 * scale;
  return text.length * adv - 2 * scale;
}

// ------------------------------------------------------------- PNG writer
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 (RGB)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows: Buffer[] = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.alloc(1 + W * 3);
    row[0] = 0; // filter none
    row.set(buf.subarray(y * W * 3, (y + 1) * W * 3), 1);
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows), { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ scene
const SKY: Array<[number, RGB]> = [
  [0.0, [35, 42, 77]],
  [0.3, [90, 74, 114]],
  [0.52, [201, 111, 74]],
  [0.68, [242, 166, 90]],
  [0.74, [247, 200, 115]],
  [1.0, [247, 200, 115]],
];

const CREAM: RGB = [255, 243, 214];
const SHADOW: RGB = [29, 36, 64];
const CLOUD_A: RGB = [253, 246, 232];
const CLOUD_B: RGB = [247, 232, 207];
const CLOUD_C: RGB = [227, 195, 184];
const SUN_CORE: RGB = [255, 237, 176];
const SUN_GLOW: RGB = [247, 185, 92];
const DARK: RGB = [44, 37, 64];

function drawCloudPuff(cx: number, cy: number, s: number): void {
  // A puff: several overlapping circles, light on top, shaded below.
  ellipse(cx, cy + 8 * s, 52 * s, 20 * s, CLOUD_C);
  circle(cx - 34 * s, cy + 2 * s, 26 * s, CLOUD_B);
  circle(cx + 6 * s, cy - 10 * s, 34 * s, CLOUD_A);
  circle(cx + 38 * s, cy + 4 * s, 24 * s, CLOUD_B);
  circle(cx - 8 * s, cy + 8 * s, 30 * s, CLOUD_A);
}

function drawTerrace(x0: number, x1: number, yTop: number, yBot: number): void {
  // Floating island: tapered underside, grassy top.
  const inset = (x1 - x0) * 0.12;
  polygon(
    [
      [x0, yTop],
      [x1, yTop],
      [x1 - inset, yBot],
      [x0 + inset, yBot],
    ],
    [74, 122, 68],
  );
  // Grassy top slab.
  polygon(
    [
      [x0 - 6, yTop],
      [x1 + 6, yTop],
      [x1 - 2, yTop + 14],
      [x0 + 2, yTop + 14],
    ],
    [168, 196, 106],
  );
  // Underside shading.
  polygon(
    [
      [x0 + inset, yBot],
      [x1 - inset, yBot],
      [x1 - inset - 10, yBot - 18],
      [x0 + inset + 10, yBot - 18],
    ],
    [51, 88, 47],
  );
}

function drawTree(x: number, y: number, s: number): void {
  // Tiny cypress: trunk + two stacked triangles.
  fillRect(x - 1 * s, y, x + 1 * s, y + 8 * s, [90, 66, 44]);
  polygon(
    [
      [x, y - 12 * s],
      [x - 6 * s, y + 2 * s],
      [x + 6 * s, y + 2 * s],
    ],
    [46, 96, 58],
  );
  polygon(
    [
      [x, y - 20 * s],
      [x - 4 * s, y - 8 * s],
      [x + 4 * s, y - 8 * s],
    ],
    [58, 116, 70],
  );
}

function drawHouse(x: number, y: number, s: number): void {
  fillRect(x - 7 * s, y - 6 * s, x + 7 * s, y + 6 * s, [250, 238, 214]);
  polygon(
    [
      [x - 9 * s, y - 6 * s],
      [x, y - 14 * s],
      [x + 9 * s, y - 6 * s],
    ],
    [176, 96, 62],
  );
  fillRect(x - 2 * s, y - 1 * s, x + 2 * s, y + 6 * s, [60, 48, 70]);
}

function drawBird(x: number, y: number, s: number): void {
  thickLine(x - 9 * s, y - 4 * s, x, y, 2, DARK);
  thickLine(x, y, x + 9 * s, y - 4 * s, 2, DARK);
}

function draw(): void {
  // Sky.
  vgrad(0, 760, SKY);

  // Sun glow, then sun.
  circle(715, 470, 190, SUN_GLOW, 0.18);
  circle(715, 470, 150, SUN_GLOW, 0.25);
  circle(715, 470, 118, SUN_GLOW, 0.35);
  circle(715, 470, 92, SUN_CORE);

  // Airship drifting upper right: bronze envelope, lit top, gondola below.
  ellipse(838, 268, 48, 15, [96, 72, 92]);
  ellipse(838, 261, 46, 8, [150, 118, 132]);
  fillRect(824, 282, 852, 293, [44, 37, 64]);
  thickLine(838, 293, 838, 301, 2, DARK);
  polygon(
    [
      [796, 268],
      [780, 252],
      [796, 258],
    ],
    [96, 72, 92],
  );
  circle(828, 266, 3, [255, 243, 214]);

  // Birds near the sun.
  drawBird(560, 330, 1);
  drawBird(610, 300, 0.8);
  drawBird(520, 372, 0.7);
  drawBird(880, 380, 0.9);
  drawBird(920, 340, 0.7);

  // Floating terraces: a stair of garden islands, top to bottom.
  drawTerrace(430, 620, 330, 402);
  drawTerrace(360, 680, 420, 496);
  drawTerrace(300, 700, 515, 596);
  drawTerrace(330, 690, 640, 726);

  // Trees and houses on the terraces.
  drawTree(470, 330, 1);
  drawTree(560, 330, 0.9);
  drawTree(400, 420, 1);
  drawTree(620, 420, 1);
  drawHouse(500, 420, 1);
  drawTree(340, 515, 1);
  drawTree(640, 515, 0.9);
  drawHouse(430, 515, 1);
  drawHouse(580, 515, 0.9);
  drawTree(380, 640, 1);
  drawTree(620, 640, 1);
  drawHouse(500, 640, 1.1);

  // Waterfall ribbons between terraces, falling toward the clouds.
  thickLine(600, 402, 600, 420, 6, [214, 236, 247]);
  thickLine(340, 496, 340, 515, 6, [214, 236, 247]);
  thickLine(660, 596, 660, 640, 6, [214, 236, 247]);
  thickLine(520, 726, 520, 800, 6, [214, 236, 247]);

  // Sea of clouds, bottom third.
  vgrad(700, H, [
    [0.0, [243, 217, 168]],
    [0.5, [238, 205, 180]],
    [1.0, [222, 186, 190]],
  ]);
  drawCloudPuff(180, 800, 1.1);
  drawCloudPuff(830, 780, 1.0);
  drawCloudPuff(120, 930, 1.3);
  drawCloudPuff(880, 920, 1.2);
  drawCloudPuff(430, 880, 1.4);
  drawCloudPuff(700, 950, 1.1);
  drawCloudPuff(60, 830, 0.9);
  drawCloudPuff(970, 850, 0.9);
  drawCloudPuff(560, 850, 0.9);

  // Place name: big, centred, top of the poster, over the smooth sky.
  const name = "AURELIA";
  const scale = 14;
  const w = textWidth(name, scale);
  const x0 = Math.round((W - w) / 2);
  const y0 = 92;
  drawText(name, x0 + 6, y0 + 6, scale, SHADOW);
  drawText(name, x0, y0, scale, CREAM);
  // Thin rule under the name.
  fillRect(x0, y0 + 9 * scale + 22, x0 + w, y0 + 9 * scale + 26, CREAM);

  // Vintage double frame.
  fillRect(18, 18, W - 18, 24, CREAM);
  fillRect(18, H - 24, W - 18, H - 18, CREAM);
  fillRect(18, 18, 24, H - 18, CREAM);
  fillRect(W - 24, 18, W - 18, H - 18, CREAM);
  fillRect(30, 30, W - 30, 32, CREAM);
  fillRect(30, H - 32, W - 30, H - 30, CREAM);
  fillRect(30, 30, 32, H - 30, CREAM);
  fillRect(W - 32, 30, W - 30, H - 30, CREAM);
}

// -------------------------------------------------------------------- main
draw();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), encodePng());
