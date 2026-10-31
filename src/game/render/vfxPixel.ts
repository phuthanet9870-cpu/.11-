// Pixel-art finishing for effect sheets: the sheet is drawn at 2x, then reduced to one texel per
// game pixel with a limited palette. Soft glows turn into ordered-dither speckle, every colour is
// posterised with Bayer dithering plus a fixed grain (so flat areas get texture), alpha is made
// hard, and solid shapes get a dark outline in their own colour.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
const grain = (x: number, y: number, seed: number) => { let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) & 1023) / 1023 - 0.5; };

/** Brightness steps of the palette (fraction of the colour's full value). */
const STEPS = [0.3, 0.48, 0.66, 0.84, 1];

/** Reduces one frame (already at 1x) to pixel art in place. */
export function pixelizeFrame(img: ImageData, seed: number) {
  const { width: w, height: h, data: d } = img;
  const solid = new Uint8Array(w * h);
  // Dominant hue of the frame: whitish glow is pulled toward it so only true cores stay white.
  let hr = 0, hg = 0, hb = 0, hn = 0;
  for (let i = 0; i < d.length; i += 16) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (d[i + 3] > 100 && mx > 60 && mn / mx < 0.75) { hr += d[i] / mx; hg += d[i + 1] / mx; hb += d[i + 2] / mx; hn++; }
  }
  const dom = hn ? [hr / hn, hg / hn, hb / hn] : [1, 1, 1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a = d[i + 3] / 255;
    if (a < 0.1) { d[i + 3] = 0; continue; }
    const th = bayer(x, y), n = grain(x, y, seed);
    // Soft alpha becomes a dithered speckle; strong alpha stays solid.
    if (a < 0.8 && a * 1.1 + n * 0.12 < th * 0.95 + 0.08) { d[i + 3] = 0; continue; }
    const isSolid = a >= 0.8;
    if (isSolid) solid[y * w + x] = 1;
    const mx = Math.max(d[i], d[i + 1], d[i + 2], 1) / 255;
    let r = d[i] / 255 / mx, g = d[i + 1] / 255 / mx, b = d[i + 2] / 255 / mx;
    const whiteness = Math.min(r, g, b);
    // Brightness: dimmer for glow, textured by grain, stepped with ordered dither.
    let v = mx * (isSolid ? 1 : 0.5 + a * 0.4) + n * 0.14 + (th - 0.5) * 0.18;
    let k = 0;
    while (k < STEPS.length - 1 && v > (STEPS[k] + STEPS[k + 1]) / 2) k++;
    // Near-white that is not a hot core takes the frame's colour; colours get a little more saturated.
    const core = isSolid && k === STEPS.length - 1 && whiteness > 0.85;
    if (whiteness > 0.8 && !core) { const t2 = 0.65; r = r * (1 - t2) + dom[0] * t2; g = g * (1 - t2) + dom[1] * t2; b = b * (1 - t2) + dom[2] * t2; if (k === STEPS.length - 1) k--; }
    else if (!core) { const sat = 1.2; r = 1 - (1 - r) * sat; g = 1 - (1 - g) * sat; b = 1 - (1 - b) * sat; }
    const L = STEPS[k], m = Math.max(r, g, b, 0.01);
    d[i] = Math.round(Math.max(0, r / m) * L * 255); d[i + 1] = Math.round(Math.max(0, g / m) * L * 255); d[i + 2] = Math.round(Math.max(0, b / m) * L * 255);
    if (core) { d[i] = d[i + 1] = d[i + 2] = 255; }
    d[i + 3] = 255;
  }
  // Dark outline around solid shapes, tinted by the shape's own colour.
  const src = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (src[p * 4 + 3]) continue;
    let nb = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (solid[yy * w + xx]) { nb = yy * w + xx; break; }
    }
    if (nb < 0) continue;
    d[p * 4] = src[nb * 4] * 0.22; d[p * 4 + 1] = src[nb * 4 + 1] * 0.22; d[p * 4 + 2] = src[nb * 4 + 2] * 0.26 + 8; d[p * 4 + 3] = 235;
  }
  // Inner shading: solid pixels on the lower-right edge of a shape get a darker step (form).
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const p = y * w + x;
    if (!solid[p] || solid[p + 1] && solid[p + w]) continue;
    for (let k = 0; k < 3; k++) d[p * 4 + k] = Math.round(src[p * 4 + k] * 0.72);
  }
}

/**
 * Turns a sheet drawn at `res`x into a pixel-art sheet at 1x (frames of fw x fh side by side).
 */
export function pixelSheet(src: HTMLCanvasElement, fw: number, fh: number, frames: number, res: number, seed: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = fw * frames; out.height = fh;
  const c = out.getContext('2d', { willReadFrequently: true })!;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(src, 0, 0, src.width, src.height, 0, 0, out.width, out.height);
  void res;
  for (let f = 0; f < frames; f++) {
    const img = c.getImageData(f * fw, 0, fw, fh);
    pixelizeFrame(img, seed + f * 7);
    c.putImageData(img, f * fw, 0);
  }
  return out;
}
