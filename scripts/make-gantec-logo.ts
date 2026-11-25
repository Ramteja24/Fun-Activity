// Makes the dashboard's copy of GANTEC's official logo: public/gantec-logo.png, from the untouched original in
// assets/gantec-logo-original.png (the company's own 248 × 70 file, on white).
//
//   npm run logo
//
// What it does — and nothing else: the white background becomes transparent, so the logo sits straight on the app's light theme; the
// two inks of the logo are kept exactly (the orange of the icon and the G, and the dark grey of "ANTEC"); the empty margin around the
// logo is trimmed; and the picture is enlarged 3× with a smooth edge so it stays sharp when it is shown bigger than the
// 248 px file. The shapes, the lettering and the proportions are the original's. Deterministic: the same input always gives the same bytes
// (test/dashboard-upgrade.test.ts checks that the file in public/ is exactly what this makes from the original).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

export type Rgb = readonly [number, number, number];
export type Raster = { width: number; height: number; /** RGBA, 8 bits per channel, straight (not premultiplied) alpha */ data: Uint8Array };

/** How "ANTEC" is printed: the original's own dark grey. */
export const LETTER_COLOUR: Rgb = [66, 66, 66];
/** The empty margin kept around the logo, in pixels of the original file. */
export const MARGIN = 3;
/** How many times bigger the dashboard's copy is than the original. */
export const SCALE = 3;

// ---------------------------------------------------------------------------------------------------------------- PNG in and out
const SIGNATURE = '89504e470d0a1a0a';

export function decodePng(buf: Buffer): Raster {
  if (buf.subarray(0, 8).toString('hex') !== SIGNATURE) throw new Error('not a PNG');
  let at = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (at < buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString('ascii', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('expected a non-interlaced 8-bit RGBA PNG');
    } else if (type === 'IDAT') idat.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= 4 ? data[y * stride + x - 4]! : 0;
      const b = y > 0 ? data[(y - 1) * stride + x]! : 0;
      const c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4]! : 0;
      let out: number;
      if (filter === 0) out = v;
      else if (filter === 1) out = v + a;
      else if (filter === 2) out = v + b;
      else if (filter === 3) out = v + ((a + b) >> 1);
      else {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      data[y * stride + x] = out & 255;
    }
  }
  return { width, height, data };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, body: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
};

export function encodePng(img: Raster): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 6; // RGBA
  const stride = img.width * 4;
  const raw = Buffer.alloc(img.height * (stride + 1));
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    Buffer.from(img.data.buffer, img.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([Buffer.from(SIGNATURE, 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------------------------------------------- separating the inks
/** The two inks of the original, read from its most common solid pixels: a saturated one (the orange) and a dark neutral one (the grey). */
export function findInks(src: Raster): { orange: Rgb; grey: Rgb } {
  const counts = new Map<number, number>();
  for (let i = 0; i < src.data.length; i += 4) {
    if (src.data[i + 3] !== 255) continue;
    const key = (src.data[i]! << 16) | (src.data[i + 1]! << 8) | src.data[i + 2]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let orange: number | null = null;
  let grey: number | null = null;
  for (const [key, n] of counts) {
    const [r, g, b] = [key >> 16, (key >> 8) & 255, key & 255];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread >= 120 && n > (counts.get(orange ?? -1) ?? 0)) orange = key;
    if (spread <= 10 && Math.max(r, g, b) <= 120 && n > (counts.get(grey ?? -1) ?? 0)) grey = key;
  }
  if (orange === null || grey === null) throw new Error('could not find the logo\'s two inks');
  const rgb = (k: number): Rgb => [k >> 16, (k >> 8) & 255, k & 255];
  return { orange: rgb(orange), grey: rgb(grey) };
}

/**
 * Takes the white away: every pixel is white plus some amount of one of the two inks, so for each one we work out which ink it is and how
 * much (its coverage, 0 to 1). Returns one coverage map per ink.
 */
export function separateInks(src: Raster, inks: { orange: Rgb; grey: Rgb }): { orange: Float32Array; grey: Float32Array } {
  const n = src.width * src.height;
  const orange = new Float32Array(n);
  const grey = new Float32Array(n);
  const away = (ink: Rgb) => [255 - ink[0], 255 - ink[1], 255 - ink[2]] as const;
  const dOrange = away(inks.orange);
  const dGrey = away(inks.grey);
  const fit = (u: readonly number[], d: readonly number[]) => {
    const coverage = Math.min(1, Math.max(0, (u[0]! * d[0]! + u[1]! * d[1]! + u[2]! * d[2]!) / (d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!)));
    const residual = Math.hypot(u[0]! - coverage * d[0]!, u[1]! - coverage * d[1]!, u[2]! - coverage * d[2]!);
    return { coverage, residual };
  };
  for (let p = 0; p < n; p++) {
    const alpha = src.data[p * 4 + 3]! / 255;
    const u = [(255 - src.data[p * 4]!) * alpha, (255 - src.data[p * 4 + 1]!) * alpha, (255 - src.data[p * 4 + 2]!) * alpha];
    if (Math.max(u[0]!, u[1]!, u[2]!) < 4) continue; // white (or transparent already)
    const o = fit(u, dOrange);
    const g = fit(u, dGrey);
    if (o.residual <= g.residual) orange[p] = o.coverage;
    else grey[p] = g.coverage;
  }
  return { orange, grey };
}

// ---------------------------------------------------------------------------------------------------------------- crop and enlarge
const cubic = (t: number) => {
  // Catmull-Rom weights for the four neighbours around a sample at fraction t
  const t2 = t * t;
  const t3 = t2 * t;
  return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2];
};

function enlarge(map: Float32Array, w: number, h: number, scale: number): Float32Array {
  const W = w * scale;
  const H = h * scale;
  const out = new Float32Array(W * H);
  const at = (x: number, y: number) => map[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < H; y++) {
    const sy = (y + 0.5) / scale - 0.5;
    const y0 = Math.floor(sy);
    const wy = cubic(sy - y0);
    for (let x = 0; x < W; x++) {
      const sx = (x + 0.5) / scale - 0.5;
      const x0 = Math.floor(sx);
      const wx = cubic(sx - x0);
      let sum = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) sum += wy[j]! * wx[i]! * at(x0 - 1 + i, y0 - 1 + j);
      // keep the edge where the original has it (coverage ½) but make it as crisp as one original pixel allows
      const t = Math.min(1, Math.max(0, (sum - 0.25) / 0.5));
      out[y * W + x] = t * t * (3 - 2 * t);
    }
  }
  return out;
}

/** The official logo → the web copy: transparent, both inks as in the original, margins trimmed, 3× smooth. */
export function makeWebLogo(original: Buffer): Buffer {
  const src = decodePng(original);
  const inks = findInks(src);
  const { orange, grey } = separateInks(src, inks);
  // the box that holds the logo, plus a small margin
  let [x0, y0, x1, y1] = [src.width, src.height, -1, -1];
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (Math.max(orange[y * src.width + x]!, grey[y * src.width + x]!) > 0.03) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  x0 = Math.max(0, x0 - MARGIN);
  y0 = Math.max(0, y0 - MARGIN);
  x1 = Math.min(src.width - 1, x1 + MARGIN);
  y1 = Math.min(src.height - 1, y1 + MARGIN);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const crop = (map: Float32Array) => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = map[(y + y0) * src.width + x + x0]!;
    return out;
  };
  const bigOrange = enlarge(crop(orange), w, h, SCALE);
  const bigGrey = enlarge(crop(grey), w, h, SCALE);
  const data = new Uint8Array(w * SCALE * h * SCALE * 4);
  for (let p = 0; p < bigOrange.length; p++) {
    const ao = bigOrange[p]!;
    const ag = bigGrey[p]!;
    const [r, g, b] = ao >= ag ? inks.orange : LETTER_COLOUR;
    data[p * 4] = r;
    data[p * 4 + 1] = g;
    data[p * 4 + 2] = b;
    data[p * 4 + 3] = Math.round(Math.max(ao, ag) * 255);
  }
  return encodePng({ width: w * SCALE, height: h * SCALE, data });
}

// ---------------------------------------------------------------------------------------------------------------- command line
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ORIGINAL_PATH = join(root, 'assets', 'gantec-logo-original.png');
export const DASHBOARD_PATH = join(root, 'public', 'gantec-logo.png');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(ORIGINAL_PATH)) throw new Error(`put the official logo at ${ORIGINAL_PATH} first`);
  const made = makeWebLogo(readFileSync(ORIGINAL_PATH));
  writeFileSync(DASHBOARD_PATH, made);
  const img = decodePng(made);
  console.log(`wrote ${DASHBOARD_PATH} (${img.width} × ${img.height}, ${made.length} bytes)`);
}
