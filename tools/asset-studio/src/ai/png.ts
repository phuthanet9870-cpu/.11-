// Minimal PNG decoder (8-bit, non-interlaced; greyscale, RGB, palette, grey+alpha, RGBA)
// so images generated outside the studio can be processed with the same Pixmap tools.
import { inflateSync } from 'node:zlib';
import { Pixmap } from '../pixel';

export function decodePng(buf: Buffer): Pixmap {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  let palette: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), kind = buf.toString('ascii', off + 4, off + 8), body = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG (bit depth ${depth}, interlace ${interlace})`);
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!ch) throw new Error(`unsupported PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0, b = y ? px[dst - stride + x] : 0, c = x >= ch && y ? px[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  const out = new Pixmap(w, h);
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4;
    if (type === 6) { out.data[d] = px[s]; out.data[d + 1] = px[s + 1]; out.data[d + 2] = px[s + 2]; out.data[d + 3] = px[s + 3]; }
    else if (type === 2) { out.data[d] = px[s]; out.data[d + 1] = px[s + 1]; out.data[d + 2] = px[s + 2]; out.data[d + 3] = 255; }
    else if (type === 0) { out.data[d] = out.data[d + 1] = out.data[d + 2] = px[s]; out.data[d + 3] = 255; }
    else if (type === 4) { out.data[d] = out.data[d + 1] = out.data[d + 2] = px[s]; out.data[d + 3] = px[s + 1]; }
    else { const k = px[s]; out.data[d] = palette![k * 3]; out.data[d + 1] = palette![k * 3 + 1]; out.data[d + 2] = palette![k * 3 + 2]; out.data[d + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return out;
}
