// Keys the owner's explosion sheet (art/explosion-sheet.png, drawn on flat chroma blue) into a picture with
// transparency for the page (src/assets/explosion-keyed.png), and writes what it measured beside it
// (src/assets/explosion-keyed.json). Run with: node tools/key-sheet.mjs [cols] [rows]   (the grid defaults to 4 x 4;
// the cell size comes from the picture's size, so a bigger sheet drops in). No dependencies beyond Node itself.
//
// How the key works: the background is one saturated blue (its colour is measured on the flat background), so every
// pixel is read as a mix of a drawn colour and that blue, and given the least cover (alpha) that explains it with a
// drawn colour inside the valid range; the drawn colour is then taken out of the mix. Cover below the noise floor
// becomes clear (the flat background stays below about 0.03; the faint halo a few pixels round the strokes reaches
// about 0.2). The drawn colours are spread a pixel into the clear area (the page also multiplies the cover into the
// colours when it loads the picture, so smoothing never pulls a clear pixel's colour into an edge).
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const SRC = 'art/explosion-sheet.png';
const OUT = 'src/assets/explosion-keyed.png';
const META = 'src/assets/explosion-keyed.json';
const COLS = Number(process.argv[2] || 4);
const ROWS = Number(process.argv[3] || 4);
/** Cover below this is taken as background noise. */
const NOISE_FLOOR = 0.2;
/** How far (pixels) the drawn colours are spread into the clear area. */
const BLEED_PX = 1;
/** The ground line is looked for in the lowest part of each frame (this share of its height). */
const GROUND_SEARCH = 0.3;

// ---- PNG reading (8-bit grey, RGB, grey+alpha or RGBA; not interlaced) ----
function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let i = 8;
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (i < buf.length) {
    const n = buf.readUInt32BE(i);
    const t = buf.toString('latin1', i + 4, i + 8);
    const d = buf.subarray(i + 8, i + 8 + n);
    if (t === 'IHDR') {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      depth = d[8];
      type = d[9];
      interlace = d[12];
    } else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    i += 12 + n;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 8 || !ch || interlace) throw new Error(`unsupported PNG: depth ${depth}, type ${type}, interlace ${interlace}`);
  if (ch === 2 || ch === 4) throw new Error('the sheet already has transparency: this script keys an opaque sheet drawn on chroma blue');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0;
      const b = up ? up[x] : 0;
      const c = up && x >= ch ? up[x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`bad filter ${f}`);
      row[x] = v & 255;
    }
  }
  // To RGB floats.
  const rgb = new Float32Array(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const o = p * ch;
    if (ch === 1) rgb.set([px[o], px[o], px[o]], p * 3);
    else rgb.set([px[o], px[o + 1], px[o + 2]], p * 3);
  }
  return { w, h, rgb };
}

// ---- PNG writing (8-bit RGBA; each row takes the filter that leaves the smallest sum, the usual heuristic) ----
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function writePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const cand = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const row = src.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? src.subarray((y - 1) * stride, y * stride) : null;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? row[x - 4] : 0;
        const b = up ? up[x] : 0;
        const c = up && x >= 4 ? up[x - 4] : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (row[x] - pred) & 255;
        cand[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        raw[y * (stride + 1)] = f;
        cand.copy(raw, y * (stride + 1) + 1);
      }
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- The key ----
const { w, h, rgb } = readPng(readFileSync(SRC));
const cellW = w / COLS;
const cellH = h / ROWS;
// The background colour: the mean of the flat blue (not the darker blue halo round the strokes).
let kr = 0, kg = 0, kb = 0, kn = 0;
for (let p = 0; p < w * h; p++) {
  const r = rgb[p * 3], g = rgb[p * 3 + 1], b = rgb[p * 3 + 2];
  if (b > 240 && r < 30 && g < 30) {
    kr += r;
    kg += g;
    kb += b;
    kn++;
  }
}
const K = [kr / kn, kg / kn, kb / kn];
const alpha = new Float32Array(w * h);
const out = new Uint8ClampedArray(w * h * 4);
for (let p = 0; p < w * h; p++) {
  const c = [rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]];
  // The least cover that keeps the drawn colour inside 0..255, read in each channel only in the direction that has
  // room: up from a dark key channel (red, green), down from a bright one (blue). (The other directions hold no
  // information against a saturated key, only its noise: red 0 against a key red of 1.6 is not "fully covered".)
  let a = 0;
  for (let k = 0; k < 3; k++) {
    if (K[k] < 128) a = Math.max(a, (c[k] - K[k]) / (255 - K[k]));
    else a = Math.max(a, 1 - c[k] / K[k]);
  }
  a = Math.min(1, a);
  const shown = Math.max(0, Math.min(1, (a - NOISE_FLOOR) / (1 - NOISE_FLOOR)));
  alpha[p] = shown;
  if (shown > 0) {
    for (let k = 0; k < 3; k++) out[p * 4 + k] = (c[k] - (1 - a) * K[k]) / a;
  }
  out[p * 4 + 3] = Math.round(shown * 255);
}
// Spread the drawn colours into the clear pixels nearby.
let filled = new Uint8Array(w * h);
for (let p = 0; p < w * h; p++) filled[p] = out[p * 4 + 3] > 0 ? 1 : 0;
for (let pass = 0; pass < BLEED_PX; pass++) {
  const next = filled.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (filled[p]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (!filled[q]) continue;
          r += out[q * 4];
          g += out[q * 4 + 1];
          b += out[q * 4 + 2];
          n++;
        }
      }
      if (n) {
        out[p * 4] = r / n;
        out[p * 4 + 1] = g / n;
        out[p * 4 + 2] = b / n;
        next[p] = 1;
      }
    }
  }
  filled = next;
}
writeFileSync(OUT, writePng(w, h, out));

// ---- What was measured: per frame, its solid share; the anchor (ground line and middle) ----
const frames = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const x0 = Math.round(col * cellW), x1 = Math.round((col + 1) * cellW);
    const y0 = Math.round(row * cellH), y1 = Math.round((row + 1) * cellH);
    let solid = 0, sx = 0, widest = 0, widestY = 0;
    const low = y1 - Math.round((y1 - y0) * GROUND_SEARCH);
    for (let y = y0; y < y1; y++) {
      let n = 0;
      for (let x = x0; x < x1; x++) {
        if (alpha[y * w + x] > 0.5) {
          n++;
          sx += x - x0;
        }
      }
      solid += n;
      if (y >= low && n > widest) {
        widest = n;
        widestY = y - y0;
      }
    }
    frames.push({ solid_share: solid / ((x1 - x0) * (y1 - y0)), middle_x: solid ? sx / solid / (x1 - x0) : 0.5, widest_row: widestY / (y1 - y0), widest_px: widest });
  }
}
// The ground line: the ground rays are the widest thing low in a frame, so it is the middle one of the widest rows
// (looked for in the lowest 30 % of each frame) of the three frames where that row is widest; the middle: the
// solid-weighted middle of all frames with any.
const byWidth = frames.map((f, i) => [f.widest_px, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => frames[i].widest_row).sort();
const groundLine = byWidth[1];
const withSolid = frames.filter((f) => f.solid_share > 0.001);
const middle = withSolid.reduce((s, f) => s + f.middle_x * f.solid_share, 0) / withSolid.reduce((s, f) => s + f.solid_share, 0);
const clear = alpha.reduce((s, a) => s + (a === 0 ? 1 : 0), 0) / alpha.length;
const meta = {
  source: SRC,
  picture_px: [w, h],
  grid: [COLS, ROWS],
  cell_px: [cellW, cellH],
  frames: COLS * ROWS,
  key_colour_rgb: K.map((v) => Math.round(v * 10) / 10),
  noise_floor: NOISE_FLOOR,
  colour_bleed_px: BLEED_PX,
  ground_line_search_share: GROUND_SEARCH,
  clear_share: Math.round(clear * 1000) / 1000,
  anchor_ground_line_from_top: Math.round(groundLine * 1000) / 1000,
  anchor_middle_from_left: Math.round(middle * 1000) / 1000,
  frame_solid_share: frames.map((f) => Math.round(f.solid_share * 1000) / 1000),
};
writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify(meta));
