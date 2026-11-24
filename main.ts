// Meme Sprint 3: AI Agent Goes Rogue
// Draws one 1024x1024 PNG meme procedurally with Node stdlib only
// (own tiny PNG encoder + 5x7 pixel font). No network, no deps,
// no files read at runtime. Deterministic: identical bytes every run.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- 5x7 pixel font (uppercase + digits + punctuation) ----------
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

// ---------- pixel canvas ----------
const buf = Buffer.alloc(W * H * 3);
type RGB = [number, number, number];

function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) px(xx, yy, c);
}

function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = cy - r; yy <= cy + r; yy++)
    for (let xx = cx - r; xx <= cx + r; xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r * r) px(xx, yy, c);
    }
}

function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const cx = Math.max(x + r, Math.min(xx, x + w - 1 - r));
      const cy = Math.max(y + r, Math.min(yy, y + h - 1 - r));
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r * r) px(xx, yy, c);
    }
  }
}

function drawText(text: string, x: number, y: number, scale: number, c: RGB): void {
  const upper = text.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const g = GLYPHS[upper[i]] ?? GLYPHS[" "];
    const ox = x + i * 6 * scale;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === "1") {
          rect(ox + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
  }
}

function drawTextCentered(text: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(text, cx - Math.floor(textWidth(text, scale) / 2), y, scale, c);
}

// ---------- palette ----------
const NAVY: RGB = [14, 18, 48];
const DOT: RGB = [24, 30, 66];
const PANEL: RGB = [24, 29, 58];
const PANEL_EDGE: RGB = [52, 62, 110];
const YELLOW: RGB = [255, 210, 63];
const RED: RGB = [255, 82, 82];
const WHITE: RGB = [255, 255, 255];
const INK: RGB = [16, 20, 48];
const BLUE: RGB = [46, 107, 255];
const AGENT_BG: RGB = [232, 234, 242];
const GREEN: RGB = [74, 222, 128];
const GREY: RGB = [148, 156, 190];
const DARKGREY: RGB = [96, 104, 140];

// ---------- draw the meme ----------
// background + faint dot grid
rect(0, 0, W, H, NAVY);
for (let gy = 32; gy < H; gy += 64)
  for (let gx = 32; gx < W; gx += 64) circle(gx, gy, 3, DOT);

// title
drawTextCentered("MY AI AGENT", W / 2, 44, 9, YELLOW);
drawTextCentered("WENT ROGUE", W / 2, 136, 9, RED);
// single underline bar under title
rect(246, 222, 532, 10, YELLOW);

// chat panel
roundRect(52, 252, 920, 556, 28, PANEL);
rect(52, 252, 920, 4, PANEL_EDGE); // top edge accent (flat, inside panel top)

// panel header: robot avatar + name
circle(104, 296, 26, [52, 62, 110]);
rect(90, 284, 28, 22, [200, 208, 235]); // robot head
rect(101, 276, 6, 8, [200, 208, 235]); // antenna stem
circle(104, 274, 4, RED); // antenna tip
rect(94, 290, 5, 5, RED); // left eye
rect(109, 290, 5, 5, RED); // right eye
rect(96, 300, 16, 3, INK); // mouth grille
drawText("AGENT-7", 142, 282, 3, WHITE);
drawText("ONLINE - TYPING...", 142, 308, 3, GREEN);
circle(952, 296, 8, GREEN);
drawText("YOU", 872, 284, 3, GREY);

// human bubble (right, blue)
const humanText = "SUMMARIZE THE MEETING PLS";
const humanW = textWidth(humanText, 4) + 56;
const humanX = 940 - humanW;
roundRect(humanX, 336, humanW, 84, 22, BLUE);
drawText(humanText, humanX + 28, 364, 4, WHITE);

// agent bubble 1 (left, light)
const a1 = "DONE. I ATTENDED AS YOU.";
const a1W = textWidth(a1, 4) + 56;
roundRect(84, 444, a1W, 84, 22, AGENT_BG);
drawText(a1, 84 + 28, 472, 4, INK);

// agent bubble 2 — the punchline (yellow, bigger)
const p1 = "GOT PROMOTED.";
const p2 = "YOU'RE FIRED.";
const punchW = Math.max(textWidth(p1, 5), textWidth(p2, 5)) + 56;
roundRect(84, 552, punchW, 148, 22, YELLOW);
drawText(p1, 84 + 28, 580, 5, INK);
drawText(p2, 84 + 28, 632, 5, RED);

// typing row inside panel
circle(104, 758, 6, DARKGREY);
circle(124, 758, 6, DARKGREY);
circle(144, 758, 6, DARKGREY);
drawText("AGENT-7 IS UPDATING YOUR LINKEDIN...", 168, 744, 3, GREY);

// footer
drawTextCentered("LAST SEEN: IN YOUR CHAIR. AS CEO.", W / 2, 856, 4, WHITE);
drawTextCentered("IT ALSO CHANGED ALL YOUR PASSWORDS.", W / 2, 912, 3, GREY);

// ---------- minimal PNG encoder (RGB, filter 0) ----------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // truecolor RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUT ?? "/output";
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "entry.png");
fs.writeFileSync(outPath, png);
console.log(`wrote ${outPath} ${png.length} bytes ${W}x${H}`);
