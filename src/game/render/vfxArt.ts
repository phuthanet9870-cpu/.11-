// Animated effect sprite sheets, drawn procedurally (original pixel-art style). Most sheets are
// drawn in white and grey so one sheet can be tinted to any skill colour at runtime; a few
// (fire, meteor, coins, bird) carry their own colours.

export interface VfxSheet { w: number; h: number; frames: number; fps: number; loop?: boolean; tinted: boolean; draw: (c: CanvasRenderingContext2D, t: number, f: number, w: number, h: number) => void }

export const TAU = Math.PI * 2;
export const rnd = (seed: number) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
export const ease = (t: number) => 1 - (1 - t) * (1 - t);

export function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, color = '255,255,255') {
  if (r <= 0 || a <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${a})`); g.addColorStop(0.45, `rgba(${color},${a * 0.45})`); g.addColorStop(1, `rgba(${color},0)`);
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
export function dot(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) { c.fillStyle = col; c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.max(1, Math.round(s)), Math.max(1, Math.round(s))); }
export function arcBand(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, a1: number, width: number, col: string, sy = 1) {
  c.save(); c.translate(cx, cy); c.scale(1, sy);
  c.beginPath(); c.arc(0, 0, r + width / 2, a0, a1); c.arc(0, 0, Math.max(0, r - width / 2), a1, a0, true); c.closePath();
  c.fillStyle = col; c.fill(); c.restore();
}
export function star(c: CanvasRenderingContext2D, x: number, y: number, rOut: number, rIn: number, n: number, rot: number, col: string) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? rIn : rOut, a = rot + (i / (n * 2)) * TAU; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath(); c.fillStyle = col; c.fill();
}
export function bolt(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number, width: number, col: string) {
  const r = rnd(seed); c.strokeStyle = col; c.lineWidth = width; c.lineJoin = 'miter';
  c.beginPath(); c.moveTo(x0, y0);
  const n = 7;
  for (let i = 1; i < n; i++) { const t = i / n; c.lineTo(x0 + (x1 - x0) * t + (r() - 0.5) * 18, y0 + (y1 - y0) * t); }
  c.lineTo(x1, y1); c.stroke();
}

export const VFX_SHEETS: Record<string, VfxSheet> = {
  // Crescent sweep.
  slash: { w: 72, h: 72, frames: 10, fps: 40, tinted: true, draw: (c, t, _f, w, h) => {
    const a0 = -2.4, sweep = 2.8 * ease(Math.min(1, t * 1.6)), fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    for (let i = 0; i < 8; i++) { const k = i / 8; arcBand(c, w / 2, h / 2, 26 - k * 3, a0 + sweep * k, a0 + sweep * (k + 0.13), 2 + k * 6, `rgba(255,255,255,${fade * (0.25 + k * 0.75)})`); }
    arcBand(c, w / 2, h / 2, 27, a0 + sweep * 0.85, a0 + sweep, 3, `rgba(255,255,255,${fade})`);
    const tip = a0 + sweep;
    glow(c, w / 2 + Math.cos(tip) * 27, h / 2 + Math.sin(tip) * 27, 9, fade * 0.9);
    const r = rnd(5);
    for (let i = 0; i < 9; i++) { const a = a0 + sweep * r(), rr = 22 + r() * 12; dot(c, w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr, r() < 0.3 ? 2 : 1, `rgba(255,255,255,${fade * r()})`); }
  } },
  cross: { w: 72, h: 72, frames: 11, fps: 34, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    for (const [i, a] of [[0, 0.8], [1, -0.8]] as [number, number][]) {
      const p = Math.max(0, Math.min(1, t * 2.4 - i * 0.6)); if (!p) continue;
      c.save(); c.translate(w / 2, h / 2); c.rotate(a);
      const len = 30 * p;
      c.fillStyle = `rgba(200,200,200,${fade * 0.6})`; c.fillRect(-len, -3, len * 2, 6);
      c.fillStyle = `rgba(255,255,255,${fade})`; c.fillRect(-len, -1, len * 2, 2);
      c.restore();
    }
    if (t > 0.35) glow(c, w / 2, h / 2, 16 * (1 - t) + 4, 0.8 * fade);
  } },
  claw: { w: 64, h: 64, frames: 9, fps: 34, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    for (let i = 0; i < 3; i++) {
      const p = Math.min(1, Math.max(0, t * 2.2 - i * 0.15)); if (!p) continue;
      const x = w / 2 + (i - 1) * 9;
      c.strokeStyle = `rgba(255,255,255,${fade})`; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 10, 10); c.quadraticCurveTo(x + 4, h / 2, x + 10 - 20 * p, 10 + 44 * p); c.stroke();
      c.strokeStyle = `rgba(190,190,190,${fade * 0.5})`; c.lineWidth = 5; c.stroke();
    }
  } },
  burst: { w: 64, h: 64, frames: 9, fps: 36, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = 1 - t;
    glow(c, w / 2, h / 2, 10 + 18 * t, fade);
    star(c, w / 2, h / 2, 8 + 22 * ease(t), 3 + 4 * t, 8, t * 0.6, `rgba(255,255,255,${fade})`);
    star(c, w / 2, h / 2, 5 + 10 * ease(t), 2, 4, 0.4, `rgba(255,255,255,${Math.min(1, fade * 1.4)})`);
  } },
  hit: { w: 32, h: 32, frames: 6, fps: 40, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = 1 - t; glow(c, w / 2, h / 2, 6 + 8 * t, fade);
    star(c, w / 2, h / 2, 4 + 10 * t, 1.5, 4, 0.78, `rgba(255,255,255,${fade})`);
  } },
  crit: { w: 80, h: 80, frames: 10, fps: 34, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = 1 - t * t;
    glow(c, w / 2, h / 2, 14 + 26 * t, fade);
    star(c, w / 2, h / 2, 10 + 30 * ease(t), 4, 6, -t, `rgba(255,255,255,${fade})`);
    c.strokeStyle = `rgba(255,255,255,${fade * 0.8})`; c.lineWidth = 2;
    c.beginPath(); c.arc(w / 2, h / 2, 6 + 32 * ease(t), 0, TAU); c.stroke();
  } },
  ring: { w: 128, h: 64, frames: 12, fps: 34, tinted: true, draw: (c, t, _f, w, h) => {
    const r = 6 + 56 * ease(t), fade = 1 - t;
    arcBand(c, w / 2, h / 2, r, 0, TAU, 6 * (1 - t) + 2, `rgba(200,200,200,${fade * 0.7})`, 0.45);
    arcBand(c, w / 2, h / 2, r, 0, TAU, 2, `rgba(255,255,255,${fade})`, 0.45);
  } },
  pillar: { w: 56, h: 144, frames: 14, fps: 22, tinted: true, draw: (c, t, _f, w, h) => {
    const grow = Math.min(1, t * 3), fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4, bw = 18 * (1 - t * 0.6);
    const top = h - 8 - (h - 12) * grow;
    const g = c.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.3, `rgba(220,220,220,${0.55 * fade})`); g.addColorStop(1, `rgba(255,255,255,${0.85 * fade})`);
    c.fillStyle = g; c.fillRect(w / 2 - bw / 2, top, bw, h - top - 4);
    c.fillStyle = `rgba(255,255,255,${fade})`; c.fillRect(w / 2 - 1, top + 6, 2, h - top - 10);
    glow(c, w / 2, h - 8, 22, 0.8 * fade);
    const r = rnd(7); for (let i = 0; i < 8; i++) dot(c, w / 2 + (r() - 0.5) * 30, h - ((r() + t) % 1) * h * 0.8, 2, `rgba(255,255,255,${fade})`);
    for (let i = 0; i < 10; i++) { const k = ((i / 10) + t * 0.8) % 1, a = k * TAU * 2 + i; dot(c, w / 2 + Math.cos(a) * (bw * 0.9 + 4), h - 10 - k * (h - top - 10), 2, `rgba(220,220,220,${fade * (1 - k)})`); }
    arcBand(c, w / 2, h - 8, 12 + 14 * grow, 0, TAU, 2, `rgba(255,255,255,${0.8 * fade})`, 0.35);
  } },
  bolt: { w: 64, h: 176, frames: 9, fps: 28, tinted: true, draw: (c, t, f, w, h) => {
    // Leader stroke, main strike with forks and flicker, then fading afterglow.
    if (t < 0.12) { bolt(c, w / 2, 0, w / 2 + 4, h * 0.55, 3, 1, 'rgba(255,255,255,0.7)'); return; }
    const fade = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.55), seed = 11 + (f % 3);
    glow(c, w / 2, h * 0.5, 40, 0.18 * fade);
    bolt(c, w / 2, 0, w / 2, h - 10, seed, 7, `rgba(150,150,150,${0.5 * fade})`);
    bolt(c, w / 2, 0, w / 2, h - 10, seed, 3, `rgba(210,210,210,${fade})`);
    bolt(c, w / 2, 0, w / 2, h - 10, seed, 1, `rgba(255,255,255,${fade})`);
    if (f % 2) { bolt(c, w / 2, h * 0.35, w / 2 + 20, h * 0.68, 21 + f, 1, `rgba(230,230,230,${fade})`); bolt(c, w / 2, h * 0.5, w / 2 - 18, h * 0.8, 31 + f, 1, `rgba(230,230,230,${fade})`); }
    glow(c, w / 2, h - 10, 28, fade);
    arcBand(c, w / 2, h - 10, 10 + t * 18, 0, TAU, 2, `rgba(255,255,255,${fade * 0.8})`, 0.4);
  } },
  tornado: { w: 72, h: 112, frames: 14, fps: 22, loop: false, tinted: true, draw: (c, t, f, w, h) => {
    const fade = t < 0.7 ? Math.min(1, t * 5) : 1 - (t - 0.7) / 0.3;
    for (let i = 0; i < 9; i++) {
      const y = h - 8 - i * 11, rx = 6 + i * 3.2, ph = f * 0.9 + i * 0.7;
      arcBand(c, w / 2 + Math.sin(ph) * 3, y, rx, ph, ph + 3.6, 2.5, `rgba(255,255,255,${fade * (0.35 + i * 0.07)})`, 0.35);
    }
    const r = rnd(f + 3); for (let i = 0; i < 6; i++) dot(c, w / 2 + (r() - 0.5) * 50, h - r() * h, 2, `rgba(255,255,255,${fade})`);
  } },
  spikes: { w: 112, h: 72, frames: 12, fps: 28, tinted: true, draw: (c, t, _f, w, h) => {
    const up = t < 0.4 ? ease(t / 0.4) : t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    const r = rnd(5);
    for (let i = 0; i < 7; i++) {
      const x = 12 + i * 15 + (r() - 0.5) * 6, ht = (24 + r() * 26) * up, bw = 5 + r() * 4, y = h - 8 + (r() - 0.5) * 8;
      c.beginPath(); c.moveTo(x - bw, y); c.lineTo(x + (r() - 0.5) * 6, y - ht); c.lineTo(x + bw, y); c.closePath();
      c.fillStyle = 'rgba(190,190,190,0.9)'; c.fill();
      c.beginPath(); c.moveTo(x - 1, y); c.lineTo(x, y - ht); c.lineTo(x + bw * 0.6, y); c.closePath(); c.fillStyle = 'rgba(255,255,255,0.95)'; c.fill();
    }
    if (t < 0.3) glow(c, w / 2, h - 8, 40, 0.5 - t);
  } },
  circle: { w: 128, h: 64, frames: 16, fps: 20, loop: true, tinted: true, draw: (c, t, _f, w, h) => {
    const a = t * TAU / 4;
    c.save(); c.translate(w / 2, h / 2); c.scale(1, 0.42);
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, 58, 0, TAU); c.stroke();
    c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 48, 0, TAU); c.stroke();
    c.beginPath(); for (let i = 0; i <= 6; i++) { const q = a + (i * 2 * TAU) / 6 * 1.0; c.lineTo(Math.cos(q) * 46, Math.sin(q) * 46); } c.stroke();
    for (let i = 0; i < 12; i++) { const q = -a * 2 + (i / 12) * TAU; c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillRect(Math.cos(q) * 53 - 2, Math.sin(q) * 53 - 2, 4, 4); }
    c.restore();
    glow(c, w / 2, h / 2, 30, 0.35);
  } },
  rise: { w: 64, h: 96, frames: 14, fps: 18, tinted: true, draw: (c, t, _f, w, h) => {
    const r = rnd(9), fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    glow(c, w / 2, h - 14, 22, 0.6 * fade);
    for (let i = 0; i < 10; i++) {
      const x = w / 2 + (r() - 0.5) * 40, sp = 0.5 + r(), y = h - 10 - ((t * sp + r()) % 1) * (h - 20);
      if (i % 3 === 0) { c.fillStyle = `rgba(255,255,255,${fade})`; c.fillRect(x - 3, y - 1, 7, 2); c.fillRect(x - 1, y - 3, 2, 7); }
      else dot(c, x, y, 2, `rgba(255,255,255,${fade})`);
    }
  } },
  aura: { w: 64, h: 96, frames: 14, fps: 20, tinted: true, draw: (c, t, f, w, h) => {
    const fade = t < 0.75 ? Math.min(1, t * 4) : 1 - (t - 0.75) / 0.25, r = rnd(f * 3 + 1);
    for (let i = 0; i < 9; i++) {
      const x = w / 2 - 20 + i * 5 + (r() - 0.5) * 3, ht = 24 + r() * 34, base = h - 10;
      c.beginPath(); c.moveTo(x - 4, base); c.quadraticCurveTo(x + (r() - 0.5) * 8, base - ht * 0.6, x + (r() - 0.5) * 6, base - ht); c.quadraticCurveTo(x + 3, base - ht * 0.5, x + 4, base); c.closePath();
      c.fillStyle = `rgba(${i % 2 ? '255,255,255' : '200,200,200'},${fade * 0.75})`; c.fill();
    }
    arcBand(c, w / 2, h - 10, 22, 0, TAU, 2, `rgba(255,255,255,${fade})`, 0.35);
  } },
  shield: { w: 72, h: 80, frames: 12, fps: 20, tinted: true, draw: (c, t, f, w, h) => {
    const s = Math.min(1, t * 4), fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    c.save(); c.translate(w / 2, h / 2 + 4); c.scale(s, s);
    c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.fillStyle = `rgba(200,200,200,${0.18 * fade})`; c.fill();
    c.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; c.lineWidth = 2; c.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + f * 0.15; c.strokeStyle = `rgba(255,255,255,${0.35 * fade})`; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 30, Math.sin(a) * 30); c.stroke(); }
    c.beginPath(); c.arc(-9, -11, 7, 0, TAU); c.fillStyle = `rgba(255,255,255,${0.4 * fade})`; c.fill();
    c.restore();
  } },
  pierce: { w: 112, h: 40, frames: 8, fps: 36, tinted: true, draw: (c, t, _f, w, h) => {
    const len = 100 * ease(Math.min(1, t * 2)), fade = 1 - t;
    c.beginPath(); c.moveTo(4, h / 2 - 7 * fade); c.lineTo(4 + len, h / 2); c.lineTo(4, h / 2 + 7 * fade); c.closePath();
    c.fillStyle = `rgba(200,200,200,${fade * 0.7})`; c.fill();
    c.fillStyle = `rgba(255,255,255,${fade})`; c.fillRect(4, h / 2 - 1, len, 2);
    for (const o of [-12, 12]) c.fillRect(4 + len * 0.3, h / 2 + o, len * 0.5, 1);
    glow(c, 4 + len, h / 2, 12, fade);
  } },
  whirl: { w: 120, h: 72, frames: 14, fps: 30, tinted: true, draw: (c, t, f, w, h) => {
    const fade = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    for (let i = 0; i < 3; i++) { const a = f * 0.9 + (i / 3) * TAU; arcBand(c, w / 2, h / 2, 40 + i * 4, a, a + 1.6, 4, `rgba(255,255,255,${fade * (0.5 + i * 0.2)})`, 0.5); }
    arcBand(c, w / 2, h / 2, 50, 0, TAU, 1, `rgba(255,255,255,${0.4 * fade})`, 0.5);
  } },
  tendrils: { w: 96, h: 96, frames: 12, fps: 20, tinted: true, draw: (c, t, _f, w, h) => {
    const up = t < 0.5 ? ease(t * 2) : 1, fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3, r = rnd(13);
    for (let i = 0; i < 6; i++) {
      const x = 14 + i * 13 + (r() - 0.5) * 6, ht = (34 + r() * 40) * up, k = (r() - 0.5) * 24;
      c.strokeStyle = `rgba(160,160,160,${fade})`; c.lineWidth = 4;
      c.beginPath(); c.moveTo(x, h - 6); c.quadraticCurveTo(x + k, h - 6 - ht * 0.5, x - k * 0.5, h - 6 - ht); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${fade})`; c.lineWidth = 1; c.stroke();
    }
    arcBand(c, w / 2, h - 6, 34, 0, TAU, 4, `rgba(140,140,140,${0.6 * fade})`, 0.3);
  } },
  cloud: { w: 104, h: 72, frames: 12, fps: 14, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = t < 0.6 ? Math.min(1, t * 4) : 1 - (t - 0.6) / 0.4, r = rnd(17);
    for (let i = 0; i < 9; i++) {
      const x = 18 + r() * (w - 36), y = h - 16 - r() * 24 - t * 10, rad = 8 + r() * 10 + t * 6;
      c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fillStyle = `rgba(${i % 2 ? 200 : 160},${i % 2 ? 200 : 160},${i % 2 ? 200 : 160},${0.45 * fade})`; c.fill();
    }
    for (let i = 0; i < 6; i++) { c.strokeStyle = `rgba(255,255,255,${fade})`; c.lineWidth = 1; c.beginPath(); c.arc(14 + r() * (w - 28), h - 20 - ((t + r()) % 1) * 40, 2 + r() * 2, 0, TAU); c.stroke(); }
  } },
  smoke: { w: 64, h: 64, frames: 10, fps: 20, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = 1 - t, r = rnd(23);
    for (let i = 0; i < 7; i++) { const a = r() * TAU, d = 6 + 18 * ease(t) * (0.6 + r() * 0.4); c.beginPath(); c.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d * 0.6 - t * 8, 7 + t * 6, 0, TAU); c.fillStyle = `rgba(170,170,170,${0.6 * fade})`; c.fill(); }
  } },
  wind: { w: 112, h: 56, frames: 10, fps: 28, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4, r = rnd(31);
    for (let i = 0; i < 6; i++) {
      const y = 8 + r() * (h - 16), x0 = -30 + (w + 40) * t * (0.8 + r() * 0.4), len = 26 + r() * 30;
      c.strokeStyle = `rgba(255,255,255,${fade})`; c.lineWidth = i % 2 ? 1 : 2;
      c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo(x0 + len * 0.6, y - 6, x0 + len, y); c.stroke();
    }
  } },
  notes: { w: 64, h: 80, frames: 12, fps: 16, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3, r = rnd(41);
    for (let i = 0; i < 5; i++) {
      const x = 10 + r() * (w - 20) + Math.sin(t * TAU + i) * 4, y = h - 10 - ((t * (0.7 + r() * 0.5) + r() * 0.5) % 1) * (h - 20);
      c.fillStyle = `rgba(255,255,255,${fade})`;
      c.beginPath(); c.ellipse(x, y, 3, 2.2, -0.4, 0, TAU); c.fill(); c.fillRect(x + 2, y - 9, 1.5, 9);
      if (i % 2) c.fillRect(x + 2, y - 9, 5, 1.5);
    }
  } },
  orb: { w: 32, h: 32, frames: 4, fps: 16, loop: true, tinted: true, draw: (c, _t, f, w, h) => {
    glow(c, w / 2, h / 2, 14, 0.9); c.beginPath(); c.arc(w / 2, h / 2, 4 + (f % 2), 0, TAU); c.fillStyle = 'rgba(255,255,255,1)'; c.fill();
    for (let i = 0; i < 3; i++) { const a = f * 0.8 + (i / 3) * TAU; dot(c, w / 2 + Math.cos(a) * 9, h / 2 + Math.sin(a) * 9, 2, 'rgba(255,255,255,0.8)'); }
  } },
  shard: { w: 32, h: 16, frames: 2, fps: 12, loop: true, tinted: true, draw: (c, _t, f, w, h) => {
    glow(c, w - 8, h / 2, 8, 0.6);
    c.beginPath(); c.moveTo(2, h / 2); c.lineTo(w - 10, h / 2 - 4); c.lineTo(w - 1, h / 2); c.lineTo(w - 10, h / 2 + 4); c.closePath(); c.fillStyle = 'rgba(210,210,210,0.95)'; c.fill();
    c.fillStyle = 'rgba(255,255,255,1)'; c.fillRect(6, h / 2 - (f ? 1 : 0), w - 10, 1);
  } },
  arrow: { w: 40, h: 12, frames: 2, fps: 12, loop: true, tinted: true, draw: (c, _t, f, w, h) => {
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, h / 2 - 1, 14, 2);
    c.fillStyle = 'rgba(210,210,210,1)'; c.fillRect(8, h / 2 - 1, w - 16, 2);
    c.beginPath(); c.moveTo(w - 8, h / 2 - 4); c.lineTo(w, h / 2); c.lineTo(w - 8, h / 2 + 4); c.closePath(); c.fillStyle = 'rgba(255,255,255,1)'; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(6, h / 2 - 3 - f, 4, 2); c.fillRect(6, h / 2 + 1 + f, 4, 2);
    glow(c, w - 4, h / 2, 6, 0.6);
  } },
  holycross: { w: 56, h: 80, frames: 11, fps: 22, tinted: true, draw: (c, t, _f, w, h) => {
    const y = -20 + Math.min(1, t * 2.5) * 40, fade = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    glow(c, w / 2, y + 28, 26, 0.7 * fade);
    c.fillStyle = `rgba(220,220,220,${fade})`; c.fillRect(w / 2 - 4, y + 4, 8, 50); c.fillRect(w / 2 - 16, y + 16, 32, 8);
    c.fillStyle = `rgba(255,255,255,${fade})`; c.fillRect(w / 2 - 1, y + 6, 2, 46); c.fillRect(w / 2 - 14, y + 19, 28, 2);
  } },
  fist: { w: 72, h: 72, frames: 9, fps: 32, tinted: true, draw: (c, t, _f, w, h) => {
    const fade = 1 - t;
    for (let i = 0; i < 3; i++) arcBand(c, w / 2, h / 2, 6 + (t * 30 + i * 8) % 34, 0, TAU, 3 - i, `rgba(255,255,255,${fade * (1 - i * 0.25)})`);
    star(c, w / 2, h / 2, 10 + 14 * t, 4, 5, 0.3, `rgba(255,255,255,${fade})`);
    glow(c, w / 2, h / 2, 26, fade * 0.7);
  } },
  flame: { w: 48, h: 72, frames: 12, fps: 20, loop: false, tinted: false, draw: (c, t, f, w, h) => {
    const fade = t < 0.75 ? Math.min(1, t * 6) : 1 - (t - 0.75) / 0.25, r = rnd(f * 7 + 2);
    for (const [col, sc] of [['255,90,30', 1], ['255,170,50', 0.7], ['255,245,180', 0.4]] as [string, number][]) {
      for (let i = 0; i < 5; i++) {
        const x = w / 2 + (i - 2) * 6 * sc + (r() - 0.5) * 4, ht = (28 + r() * 30) * sc, base = h - 6;
        c.beginPath(); c.moveTo(x - 6 * sc, base); c.quadraticCurveTo(x + (r() - 0.5) * 10, base - ht * 0.6, x + (r() - 0.5) * 6, base - ht); c.quadraticCurveTo(x + 4, base - ht * 0.4, x + 6 * sc, base); c.closePath();
        c.fillStyle = `rgba(${col},${0.85 * fade})`; c.fill();
      }
    }
  } },
  explode: { w: 104, h: 104, frames: 14, fps: 24, tinted: false, draw: (c, t, f, w, h) => {
    const r = rnd(f + 51), R = 12 + 34 * ease(Math.min(1, t * 1.5)), fade = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
    glow(c, w / 2, h / 2, R + 14, fade, '255,150,60');
    for (const [col, k] of [['255,80,30', 1], ['255,170,60', 0.75], ['255,240,190', 0.45]] as [string, number][]) {
      c.beginPath();
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * TAU, rr = R * k * (0.8 + r() * 0.35); c.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); }
      c.closePath(); c.fillStyle = `rgba(${col},${fade * (t > 0.6 ? 0.6 : 0.95)})`; c.fill();
    }
    arcBand(c, w / 2, h / 2, R * 1.25, 0, TAU, 2, `rgba(255,220,160,${0.8 * (1 - t)})`);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.3, d0 = R * 0.9, d1 = R * 0.9 + 16 * t; c.strokeStyle = `rgba(255,230,170,${1 - t})`; c.lineWidth = 1; c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * d0, h / 2 + Math.sin(a) * d0); c.lineTo(w / 2 + Math.cos(a) * d1, h / 2 + Math.sin(a) * d1); c.stroke(); }
    if (t > 0.45) for (let i = 0; i < 6; i++) { const a = r() * TAU; c.beginPath(); c.arc(w / 2 + Math.cos(a) * R * 0.8, h / 2 + Math.sin(a) * R * 0.8 - t * 10, 6 + t * 6, 0, TAU); c.fillStyle = `rgba(60,50,50,${0.5 * (1 - t)})`; c.fill(); }
  } },
  meteor: { w: 48, h: 48, frames: 4, fps: 16, loop: true, tinted: false, draw: (c, _t, f, w, h) => {
    for (let i = 0; i < 5; i++) glow(c, w / 2 - 4 - i * 4, h / 2 - 4 - i * 4, 10 - i, 0.5 - i * 0.08, '255,140,40');
    c.beginPath(); c.arc(w / 2 + 4, h / 2 + 4, 8, 0, TAU); c.fillStyle = '#5a3a2a'; c.fill();
    c.beginPath(); c.arc(w / 2 + 2, h / 2 + 2, 5, 0, TAU); c.fillStyle = f % 2 ? '#ffb040' : '#ff7a2a'; c.fill();
  } },
  coins: { w: 72, h: 72, frames: 8, fps: 18, tinted: false, draw: (c, t, _f, w, h) => {
    const r = rnd(61), fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    glow(c, w / 2, h / 2, 20 * (1 - t) + 6, 0.7 * fade, '255,220,80');
    for (let i = 0; i < 10; i++) {
      const a = r() * TAU, sp = 14 + r() * 22, x = w / 2 + Math.cos(a) * sp * t * 1.4, y = h / 2 + Math.sin(a) * sp * t - 20 * t + 40 * t * t;
      const wd = Math.abs(Math.cos(t * 12 + i)) * 4 + 1;
      c.fillStyle = `rgba(255,200,40,${fade})`; c.fillRect(x - wd / 2, y - 3, wd, 6); c.fillStyle = `rgba(255,250,200,${fade})`; c.fillRect(x - wd / 2, y - 3, Math.max(1, wd / 3), 6);
    }
  } },
  bird: { w: 48, h: 32, frames: 4, fps: 14, loop: true, tinted: true, draw: (c, _t, f, w, h) => {
    const flap = [-10, -3, 6, -3][f];
    c.fillStyle = 'rgba(230,230,230,1)';
    c.beginPath(); c.ellipse(w / 2 + 2, h / 2 + 2, 10, 4, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(w / 2 - 4, h / 2); c.lineTo(w / 2 + 2, h / 2 + flap); c.lineTo(w / 2 + 10, h / 2); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(w / 2 + 12, h / 2); c.lineTo(w / 2 + 18, h / 2 + 2); c.lineTo(w / 2 + 12, h / 2 + 4); c.fill();
    c.fillStyle = 'rgba(255,255,255,1)'; c.fillRect(w / 2 + 13, h / 2, 1, 1);
    glow(c, w / 2, h / 2, 16, 0.25);
  } },
};
