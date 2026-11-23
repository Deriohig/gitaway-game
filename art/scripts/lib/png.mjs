// png.mjs  --  minimal PNG decode/encode + image ops (Node built-ins ONLY: zlib).
// =============================================================================
// Used by the visual-verification toolkit (metrics.mjs, contact-sheet.mjs,
// concept-crops.mjs, clumping.mjs). NO npm dependencies.
//
// Image object everywhere: { width, height, data: Uint8Array RGBA (4 bytes/px) }.
//
// decodePNG(buf)  : 8/16-bit, colour types 0/2/3/4/6, tRNS, Adam7 interlace.
// encodePNG(img)  : RGBA 8-bit, filter-per-row (Paeth/Sub/Up heuristic), zlib.
// crop / resizeBilinear / blank / blit  : the few ops the toolkit needs.
// =============================================================================
import zlib from 'node:zlib';
import fs from 'node:fs';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---- CRC32 (PNG chunk checksum) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Un-filter one pass of scanlines in place. raw = inflated bytes, returns
// { rows: Uint8Array (unfiltered, no filter bytes), next offset }.
function unfilter(raw, off, w, h, bpp, bitsPerPixel) {
  const stride = Math.ceil((w * bitsPerPixel) / 8);
  const out = new Uint8Array(stride * h);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[off++];
    const line = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const v = raw[off++];
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let r;
      switch (ft) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error('PNG: bad filter type ' + ft);
      }
      line[x] = r & 0xff;
    }
    prev = line;
  }
  return { rows: out, off, stride };
}

// Expand unfiltered rows of one pass into RGBA pixels written via put(x,y,r,g,b,a).
function expandPass(rows, stride, w, h, hdr, palette, trns, put) {
  const { bitDepth: bd, colorType: ct } = hdr;
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const sample = (line, idx) => {           // idx = sample index within the line
    if (bd === 8) return line[idx];
    if (bd === 16) return line[idx * 2];    // keep the high byte
    const perByte = 8 / bd, byte = line[Math.floor(idx / perByte)];
    const shift = 8 - bd * ((idx % perByte) + 1);
    return (byte >> shift) & ((1 << bd) - 1);
  };
  const scale = (v) => (bd >= 8 ? v : Math.round((v * 255) / ((1 << bd) - 1)));
  for (let y = 0; y < h; y++) {
    const line = rows.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < w; x++) {
      const s = x * chans;
      let r, g, b, a = 255;
      if (ct === 0) { const raw = sample(line, s); r = g = b = scale(raw); if (trns && trns.gray === raw) a = 0; }
      else if (ct === 2) { r = sample(line, s); g = sample(line, s + 1); b = sample(line, s + 2);
        if (trns && trns.rgb && trns.rgb[0] === r && trns.rgb[1] === g && trns.rgb[2] === b) a = 0; }
      else if (ct === 3) { const i = sample(line, s); r = palette[i * 3]; g = palette[i * 3 + 1]; b = palette[i * 3 + 2];
        if (trns && trns.alpha && i < trns.alpha.length) a = trns.alpha[i]; }
      else if (ct === 4) { r = g = b = sample(line, s); a = sample(line, s + 1); }
      else { r = sample(line, s); g = sample(line, s + 1); b = sample(line, s + 2); a = sample(line, s + 3); }
      put(x, y, r, g, b, a);
    }
  }
}

export function decodePNG(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.compare(SIG, 0, 8, 0, 8) !== 0) throw new Error('PNG: bad signature');
  let off = 8, hdr = null, palette = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (type === 'IHDR') {
      hdr = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), bitDepth: body[8], colorType: body[9], interlace: body[12] };
    } else if (type === 'PLTE') palette = Uint8Array.from(body);
    else if (type === 'tRNS') {
      if (!hdr) continue;
      if (hdr.colorType === 3) trns = { alpha: Uint8Array.from(body) };
      else if (hdr.colorType === 0) trns = { gray: body.readUInt16BE(0) };
      else if (hdr.colorType === 2) trns = { rgb: [body.readUInt16BE(0), body.readUInt16BE(2), body.readUInt16BE(4)] };
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  if (!hdr) throw new Error('PNG: missing IHDR');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width: W, height: H, bitDepth: bd, colorType: ct } = hdr;
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!chans) throw new Error('PNG: unsupported colour type ' + ct);
  const bitsPP = chans * bd, bpp = Math.max(1, Math.ceil(bitsPP / 8));
  const data = new Uint8Array(W * H * 4);
  if (!hdr.interlace) {
    const { rows, stride } = unfilter(raw, 0, W, H, bpp, bitsPP);
    expandPass(rows, stride, W, H, hdr, palette, trns, (x, y, r, g, b, a) => {
      const i = (y * W + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a; });
  } else {
    // Adam7
    const P = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
    let o = 0;
    for (const [x0, y0, dx, dy] of P) {
      const pw = Math.ceil((W - x0) / dx), ph = Math.ceil((H - y0) / dy);
      if (pw <= 0 || ph <= 0) continue;
      const res = unfilter(raw, o, pw, ph, bpp, bitsPP); o = res.off;
      expandPass(res.rows, res.stride, pw, ph, hdr, palette, trns, (x, y, r, g, b, a) => {
        const X = x0 + x * dx, Y = y0 + y * dy, i = (Y * W + X) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a; });
    }
  }
  return { width: W, height: H, data };
}

function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length, 0);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb), 0);
  return Buffer.concat([len, tb, crc]);
}

// Encode RGBA (colour type 6, 8-bit) or, with { rgb: true }, opaque RGB (colour type 2: ~25% fewer bytes for the
// committed contact sheets). Per-row filter chosen by min sum-of-abs.
export function encodePNG(img, opts = {}) {
  const rgb = !!opts.rgb, bpp = rgb ? 3 : 4, { width: W, height: H } = img;
  let data = img.data;
  if (rgb) { const d = new Uint8Array(W * H * 3); for (let i = 0, j = 0; i < W * H * 4; i += 4, j += 3) { d[j] = data[i]; d[j + 1] = data[i + 1]; d[j + 2] = data[i + 2]; } data = d; }
  const stride = W * bpp;
  const out = Buffer.alloc((stride + 1) * H);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < H; y++) {
    const cur = data.subarray(y * stride, (y + 1) * stride);
    const prev = y ? data.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity;
    for (let ft = 0; ft < 5; ft++) {
      const c = cand[ft]; let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, cc = (prev && x >= bpp) ? prev[x - bpp] : 0;
        let v;
        switch (ft) {
          case 0: v = cur[x]; break;
          case 1: v = cur[x] - a; break;
          case 2: v = cur[x] - b; break;
          case 3: v = cur[x] - ((a + b) >> 1); break;
          default: v = cur[x] - paeth(a, b, cc);
        }
        v &= 0xff; c[x] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = ft; }
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = rgb ? 2 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out, { level: opts.level != null ? opts.level : 6 })), chunk('IEND', Buffer.alloc(0))]);
}

export const readPNG = (p) => decodePNG(fs.readFileSync(p));
export const writePNG = (p, img, opts) => fs.writeFileSync(p, encodePNG(img, opts));

export function blank(w, h, rgba = [0, 0, 0, 255]) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
}

export function crop(img, x, y, w, h) {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.min(img.width - x, Math.round(w)); h = Math.min(img.height - y, Math.round(h));
  const out = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++) out.set(img.data.subarray(((y + r) * img.width + x) * 4, ((y + r) * img.width + x + w) * 4), r * w * 4);
  return { width: w, height: h, data: out };
}

// Bilinear resample to (w,h). Pixel-centre aligned. For strong DOWN-scales a box
// pre-filter (integer factor) runs first so the result is not aliased.
export function resizeBilinear(img, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  let src = img;
  const fx = Math.floor(img.width / w), fy = Math.floor(img.height / h), f = Math.min(fx, fy);
  if (f >= 2) src = boxDown(img, f);
  const { width: SW, height: SH, data: S } = src, out = new Uint8Array(w * h * 4);
  const sx = SW / w, sy = SH / h;
  for (let y = 0; y < h; y++) {
    const yf = Math.min(SH - 1, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = Math.floor(yf), y1 = Math.min(SH - 1, y0 + 1), ty = yf - y0;
    for (let x = 0; x < w; x++) {
      const xf = Math.min(SW - 1, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = Math.floor(xf), x1 = Math.min(SW - 1, x0 + 1), tx = xf - x0;
      const i00 = (y0 * SW + x0) * 4, i10 = (y0 * SW + x1) * 4, i01 = (y1 * SW + x0) * 4, i11 = (y1 * SW + x1) * 4, o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = S[i00 + c] * (1 - tx) + S[i10 + c] * tx, bot = S[i01 + c] * (1 - tx) + S[i11 + c] * tx;
        out[o + c] = Math.round(top * (1 - ty) + bot * ty);
      }
    }
  }
  return { width: w, height: h, data: out };
}
function boxDown(img, f) {
  const W = Math.floor(img.width / f), H = Math.floor(img.height / f), out = new Uint8Array(W * H * 4), n = f * f;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const acc = [0, 0, 0, 0];
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const i = ((y * f + dy) * img.width + (x * f + dx)) * 4;
      acc[0] += img.data[i]; acc[1] += img.data[i + 1]; acc[2] += img.data[i + 2]; acc[3] += img.data[i + 3];
    }
    const o = (y * W + x) * 4; for (let c = 0; c < 4; c++) out[o + c] = Math.round(acc[c] / n);
  }
  return { width: W, height: H, data: out };
}

export function blit(dst, src, x, y) {
  for (let r = 0; r < src.height; r++) {
    const Y = y + r; if (Y < 0 || Y >= dst.height) continue;
    for (let c = 0; c < src.width; c++) {
      const X = x + c; if (X < 0 || X >= dst.width) continue;
      const si = (r * src.width + c) * 4, di = (Y * dst.width + X) * 4;
      dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1]; dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = 255;
    }
  }
  return dst;
}

export default { decodePNG, encodePNG, readPNG, writePNG, blank, crop, resizeBilinear, blit };
