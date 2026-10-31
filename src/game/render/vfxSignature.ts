// Signature effects: one animated sheet designed for each active skill. A sheet is a motif
// (sigil, blades, petals, beast head, chains, wings…) drawn with that skill's own parameters —
// count, variant, two colours and its icon glyph — so no two skills share the same animation.
import { arcBand, bolt, dot, ease, glow, rnd, star, TAU } from './vfxArt';

export type Motif =
  | 'sigil' | 'blades' | 'petals' | 'starfall' | 'spiral' | 'shards' | 'chains' | 'wings' | 'beast' | 'runes' | 'vortex' | 'lattice'
  | 'waves' | 'fang' | 'swords' | 'eye' | 'flasks' | 'wheel' | 'crown' | 'fireworks' | 'roots' | 'skull' | 'hand' | 'feathers'
  | 'serpent' | 'banner' | 'coin' | 'cage' | 'sun' | 'moon' | 'cross' | 'shield' | 'hourglass' | 'heart' | 'arrowfan' | 'seal'
  | 'clock' | 'drops';

export interface Signature { m: Motif; n: number; v: number; c2: string }

/** Motifs that stand on the ground (anchored at the bottom of the sheet). */
export const GROUND_MOTIFS = new Set<Motif>(['starfall', 'swords', 'roots', 'cage', 'banner', 'fireworks', 'drops', 'arrowfan']);

const S = (spec: string): Signature => { const [m, n, v, c2] = spec.split(' '); return { m: m as Motif, n: Number(n), v: Number(v), c2 }; };

/** The signature of every active skill: motif, count, variant, second colour. */
export const SIGNATURES: Record<string, Signature> = Object.fromEntries(Object.entries({
  first_aid: 'heart 1 0 #ffffff',
  bash: 'seal 1 0 #ffd34d', provoke: 'fang 1 0 #ff3b30', shield_guard: 'shield 1 0 #ffffff', spiral_pierce: 'spiral 3 0 #ffd34d',
  war_cry: 'waves 4 0 #ffd34d', counter_attack: 'blades 2 1 #ffffff', blade_storm: 'blades 8 0 #fff6c0',
  double_shot: 'arrowfan 2 0 #ffffff', arrow_rain: 'arrowfan 9 1 #e0f6ff', falcon_strike: 'beast 1 3 #fff6c0', wind_trap: 'vortex 5 1 #ffffff',
  rapid_fire: 'hourglass 1 0 #ffd34d', camouflage: 'moon 1 0 #9fe07a', piercing_arrow: 'arrowfan 1 2 #ffffff',
  fire_bolt: 'shards 5 1 #ffd34d', ice_bolt: 'shards 6 0 #ffffff', lightning_bolt: 'cage 3 0 #ffffff', fire_wall: 'roots 5 1 #ffd34d',
  frost_nova: 'petals 8 1 #ffffff', thunderstorm: 'cage 6 1 #fff6c0', meteor: 'sun 12 1 #ffe27a', mana_shield: 'lattice 6 0 #c9a6ff',
  holy_light: 'cross 8 0 #ffffff', heal: 'heart 1 1 #ffffff', benediction: 'crown 1 1 #ffffff', swift_grace: 'feathers 6 0 #ffffff',
  aegis_hymn: 'shield 1 1 #ffe27a', purify: 'drops 8 0 #ffffff', sanctum_nova: 'sigil 6 0 #ffffff',
  pilfer: 'hand 1 0 #ffd75a', shadow_veil: 'moon 1 1 #8a4fbf', venom_edge: 'fang 1 1 #a0e060', grit_toss: 'drops 6 1 #8b6b3e',
  knife_throw: 'blades 3 2 #ffffff', antidote: 'flasks 1 0 #ffffff', hundred_cuts: 'blades 12 1 #ff3b30',
  coin_strike: 'coin 1 0 #fff6c0', cart_sweep: 'wheel 6 0 #ffd34d', market_shout: 'banner 1 0 #ffd34d', golden_ruin: 'coin 5 1 #ffffff',
  impale: 'swords 1 0 #ffffff', drake_sweep: 'serpent 1 0 #ffd34d', war_banner: 'banner 2 1 #ffffff', iron_hide: 'lattice 6 1 #a0a8b8',
  skewer_line: 'swords 3 1 #ffffff', sky_dive: 'wings 1 1 #ffd34d',
  holy_bulwark: 'shield 2 0 #ffffff', shield_bash: 'seal 2 0 #ffffff', sacred_strike: 'cross 4 1 #ffffff', devotion_aura: 'sun 8 0 #ffffff',
  judgement_cross: 'cross 12 2 #fff6c0', provoking_vow: 'fang 2 0 #ffd34d', heavens_shield: 'wings 2 0 #ffffff',
  blitz_falcon: 'beast 2 3 #ffffff', snare_trap: 'chains 6 0 #a0e060', blast_trap: 'fireworks 4 0 #ffd34d', keen_senses: 'eye 1 0 #9fe07a',
  tri_shot: 'arrowfan 3 0 #ffffff', falcon_storm: 'feathers 10 1 #fff3a0',
  song_of_haste: 'clock 1 0 #ffffff', song_of_vigor: 'heart 2 2 #ffffff', song_of_fortune: 'starfall 6 1 #ffe27a', discord: 'waves 5 1 #ff3b30',
  melody_strike: 'waves 2 2 #ffffff', lullaby_zone: 'moon 2 2 #ffffff', grand_finale: 'fireworks 7 1 #ffffff',
  storm_gust: 'vortex 8 0 #ffffff', lord_of_vermilion: 'cage 8 2 #ffe27a', heavens_drive: 'roots 6 0 #8b6b3e', ice_wall: 'lattice 4 2 #ffffff',
  sightrasher: 'sun 16 2 #ffd34d', mana_well: 'vortex 4 1 #ffffff', meteor_storm: 'starfall 12 2 #ffd34d',
  endow_fire: 'sigil 3 1 #ffd34d', endow_water: 'sigil 4 1 #ffffff', endow_wind: 'sigil 5 1 #ffffff', endow_earth: 'sigil 4 2 #c8a060',
  double_cast: 'runes 2 0 #ffffff', earth_spike_volley: 'roots 8 2 #c8a060', elemental_cataclysm: 'sigil 8 2 #ffffff',
  greater_heal: 'heart 3 1 #ffffff', kyrie: 'shield 3 1 #ffffff', magnificat: 'sun 10 1 #ffffff', lex_divina: 'seal 3 1 #ffffff',
  turn_undead: 'cross 6 3 #ffffff', sanctuary: 'lattice 8 0 #ffffff', magnus_judgement: 'cross 16 4 #fff6c0',
  spirit_spheres: 'runes 5 1 #ffffff', triple_blow: 'hand 3 1 #ffffff', chain_combo: 'hand 4 1 #ffd34d', steel_body: 'lattice 6 3 #ffffff',
  ki_explosion: 'sun 6 3 #fff3a0', body_relocation: 'hourglass 1 1 #ffffff', asura_strike: 'hand 1 2 #ffffff',
  cloak_of_shadows: 'moon 3 0 #3a3a5a', sonic_blade: 'blades 4 3 #ffffff', venom_spray: 'drops 10 2 #a0e060', enchant_poison: 'flasks 2 1 #a0e060',
  grimtooth: 'fang 3 2 #ffffff', assassin_edge: 'blades 6 2 #ff3b30', soul_reap: 'skull 1 0 #c06aff',
  snatch: 'hand 2 0 #ffffff', rob_luma: 'coin 3 2 #ffffff', strip_armor: 'shards 4 2 #ffffff', backstab: 'blades 1 3 #ff3b30',
  tunnel_drive: 'vortex 3 2 #5a5a7a', arrow_storm_rogue: 'arrowfan 12 1 #ffffff', plagiarism: 'runes 4 2 #ffffff',
  adrenaline_rush: 'hourglass 2 0 #ff3b30', power_thrust: 'seal 4 0 #ff3b30', weapon_perfection: 'sun 4 4 #ffffff', hammerfall: 'seal 5 2 #ffd34d',
  cart_crash: 'wheel 8 1 #ffffff', meltdown: 'roots 7 1 #ffe27a',
  acid_terror: 'flasks 1 2 #ffffff', demonstration: 'flasks 3 1 #ff6a2e', chemical_shield: 'lattice 5 1 #ffffff', aid_potion: 'flasks 1 1 #ffffff',
  acid_rain: 'drops 14 1 #c0ff60', acid_demonstration: 'flasks 4 2 #ffef8a',
  dragon_fury: 'beast 1 1 #ff3b30', wyrm_spiral: 'serpent 2 1 #ffffff', martyrs_grace: 'crown 2 1 #ffd34d', divine_lance: 'swords 1 2 #fffbd0',
  wolf_pack: 'beast 3 0 #ffffff', true_sight: 'eye 1 1 #ffffff', symphony: 'starfall 8 3 #ffffff', sonic_wave: 'waves 6 3 #ffffff',
  mystic_amplify: 'runes 6 3 #ffffff', napalm_vulcan: 'skull 3 1 #ffffff', endow_holy: 'sigil 7 1 #ffffff', foresight: 'eye 2 2 #ffffff',
  assumptio: 'wings 3 0 #ffffff', tiger_cannon: 'beast 1 2 #ffffff', root_of_mountain: 'roots 4 3 #c8a060',
  meteor_assault: 'shards 8 3 #ff3b30', enchant_deadly_poison: 'skull 1 2 #4aff4a', full_strip: 'chains 4 1 #ffffff', shadow_bounce: 'moon 4 3 #ffffff',
  maximum_power: 'crown 3 0 #ffd34d', cart_termination: 'wheel 10 2 #ffd34d', full_chemical_protection: 'shield 4 2 #9fe8ff', elixir_rain: 'drops 12 3 #7aff9a',
}).map(([k, v]) => [k, S(v)]));

// ------------------------------------------------------------------ drawing
type Col = (a: number) => string;
const rgb = (hex: string) => { const n = parseInt(hex.replace('#', '').slice(0, 6), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
const colour = (hex: string): Col => { const v = rgb(hex); return (a) => `rgba(${v},${Math.max(0, Math.min(1, a))})`; };
const W = (a: number) => `rgba(255,255,255,${Math.max(0, Math.min(1, a))})`;

function poly(c: CanvasRenderingContext2D, pts: [number, number][], fill: string, stroke?: string, lw = 1) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
  c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
/** Closed curve through the points (rounded corners via midpoint quadratics). */
function smoothPath(c: CanvasRenderingContext2D, pts: [number, number][]) {
  const m = (i: number): [number, number] => { const a = pts[i % pts.length], b = pts[(i + 1) % pts.length]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  c.beginPath(); const s0 = m(pts.length - 1); c.moveTo(s0[0], s0[1]);
  for (let i = 0; i < pts.length; i++) { const e = m(i); c.quadraticCurveTo(pts[i][0], pts[i][1], e[0], e[1]); }
  c.closePath();
}
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
/** Radial fill: white-hot centre fading into the colour. */
function hotFill(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: Col, a: number) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r * 1.2);
  g.addColorStop(0, W(a)); g.addColorStop(0.35, col(a)); g.addColorStop(1, col(a * 0.55)); c.fillStyle = g; c.fill();
}
/** Tapered curved streak (motion line). */
function streak(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, bend: number, wd: number, col: string) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + bend;
  for (let i = 0; i < 3; i++) { c.strokeStyle = col; c.globalAlpha *= 0.6; c.lineWidth = wd * (1 - i * 0.3); c.beginPath(); c.moveTo(x0 + (x1 - x0) * i * 0.2, y0 + (y1 - y0) * i * 0.2); c.quadraticCurveTo(mx, my, x1, y1); c.stroke(); c.globalAlpha /= 0.6; }
}

const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const tr = (cx: number, cy: number, a: number, pts: [number, number][]) => pts.map(([x, y]) => { const [rx, ry] = rot(x, y, a); return [cx + rx, cy + ry] as [number, number]; });

/** Simple stroked rune made from the glyph seed (original marks, not a real script). */
function rune(c: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number, col: string) {
  const r = rnd(seed * 97 + 13); c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath();
  c.moveTo(x, y - s); c.lineTo(x, y + s);
  for (let i = 0; i < 2; i++) { const y0 = y - s + r() * s * 2, dx = (r() < 0.5 ? -1 : 1) * s * 0.8; c.moveTo(x, y0); c.lineTo(x + dx, y0 + (r() - 0.5) * s); }
  c.stroke();
}

type Draw = (c: CanvasRenderingContext2D, t: number, f: number, w: number, h: number, n: number, v: number, A: Col, B: Col, glyph: string, seed: number) => void;

const fadeOf = (t: number, inT = 0.15, outT = 0.7) => Math.min(1, t / inT) * (t > outT ? 1 - (t - outT) / (1 - outT) : 1);

const MOTIFS: Record<Motif, Draw> = {
  sigil: (c, t, _f, w, h, n, v, A, B, glyph, seed) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t), sc = ease(Math.min(1, t * 3)), spin = t * 1.6 * (v % 2 ? -1 : 1);
    glow(c, cx, cy, 46 * sc, 0.3 * a);
    c.save(); c.translate(cx, cy); c.scale(sc, sc * 0.92);
    c.strokeStyle = A(a); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 44, 0, TAU); c.stroke();
    c.strokeStyle = B(a * 0.8); c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 38, 0, TAU); c.stroke();
    if (v >= 1) { c.beginPath(); c.arc(0, 0, 24, 0, TAU); c.stroke(); }
    const k = Math.max(3, n);
    c.strokeStyle = A(a); c.lineWidth = 1.5; c.beginPath();
    for (let i = 0; i <= k; i++) { const q = spin + (i * (k % 2 ? 2 : 1) * TAU) / k; i ? c.lineTo(Math.cos(q) * 38, Math.sin(q) * 38) : c.moveTo(Math.cos(q) * 38, Math.sin(q) * 38); }
    c.stroke();
    for (let i = 0; i < k * 2; i++) rune(c, Math.cos(-spin + (i / (k * 2)) * TAU) * 41, Math.sin(-spin + (i / (k * 2)) * TAU) * 41, 2.5, seed + i, B(a));
    c.restore();
    c.fillStyle = W(a); c.font = 'bold 16px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(glyph, cx, cy + 1);
    if (t > 0.55) glow(c, cx, cy, 30 + (t - 0.55) * 60, (1 - t) * 1.2);
  },
  blades: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t, 0.1, 0.75);
    const conv = v === 2 ? t : ease(Math.min(1, t * 1.8));
    for (let i = 0; i < n; i++) {
      const q = (i / n) * TAU + (v === 1 ? t * 3 : v === 2 ? t * 8 : 0.4) + (v === 3 ? (i % 2) * 0.3 : 0);
      const r = v === 2 ? 10 + 30 * t : 48 - 36 * conv, len = v === 3 ? 26 : 18;
      const pts = tr(cx + Math.cos(q) * r, cy + Math.sin(q) * r * 0.8, q + Math.PI / 2 + (v === 1 ? 0.6 : 0), [[0, -len / 2], [3, 0], [0, len / 2], [-3, 0]]);
      poly(c, pts, B(a * 0.9), A(a), 1);
    }
    if (conv > 0.95 || (v === 2 && t > 0.3)) { star(c, cx, cy, 30 * (1 - t) + 8, 4, Math.max(4, n), t, W(a)); glow(c, cx, cy, 34, a); }
  },
  petals: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, open = ease(Math.min(1, t * 2)), a = fadeOf(t);
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < n; i++) {
      const q = (i / n) * TAU + layer * (Math.PI / n) + t * 0.6, L = (layer ? 22 : 34) * open;
      c.save(); c.translate(cx, cy); c.rotate(q);
      c.beginPath(); c.ellipse(L / 2 + (t > 0.6 ? (t - 0.6) * 40 : 0), 0, L / 2, v ? 5 : 8, 0, 0, TAU);
      c.fillStyle = (layer ? B : A)(a * 0.85); c.fill(); c.strokeStyle = W(a * 0.6); c.lineWidth = 1; c.stroke(); c.restore();
    }
    glow(c, cx, cy, 14, a); if (v) star(c, cx, cy, 10, 3, 6, t, W(a));
  },
  starfall: (c, t, _f, w, h, n, v, A, B, _g, seed) => {
    const r = rnd(seed + 5), ground = h - 10;
    for (let i = 0; i < n; i++) {
      const x = 10 + r() * (w - 20), t0 = r() * 0.4, k = Math.max(0, Math.min(1, (t - t0) / 0.35));
      if (!k) continue;
      const y = -10 + (ground + 10) * ease(k), a = t > 0.8 ? (1 - t) / 0.2 : 1;
      if (k < 1) { c.strokeStyle = B(0.6 * a); c.lineWidth = 2; c.beginPath(); c.moveTo(x - (v === 2 ? 12 : 0), y - 18); c.lineTo(x, y); c.stroke(); star(c, x, y, v === 3 ? 4 : 6, 2, v === 1 ? 5 : 4, i, A(a)); }
      else { glow(c, x, ground, 14, a); arcBand(c, x, ground, 4 + (t - t0 - 0.35) * 30, 0, TAU, 1.5, A(a), 0.35); }
    }
  },
  spiral: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t);
    for (let k = 0; k < n; k++) for (let i = 0; i < 26; i++) {
      const p = i / 26, q = p * TAU * 1.3 + (k / n) * TAU + t * 5 * (v ? -1 : 1), r = p * 48 * ease(Math.min(1, t * 1.5));
      dot(c, cx + Math.cos(q) * r, cy + Math.sin(q) * r * 0.8, 3 - p * 2, (i % 3 ? A : B)(a * (1 - p * 0.6)));
    }
    glow(c, cx, cy, 16, a);
  },
  shards: (c, t, _f, w, h, n, v, A, B, _g, seed) => {
    const cx = w / 2, cy = h / 2, r = rnd(seed + 3), a = fadeOf(t, 0.08, 0.6), out = ease(Math.min(1, t * 1.6));
    for (let i = 0; i < n; i++) {
      const q = (i / n) * TAU + r() * 0.4, d = 6 + 40 * out, s = 7 + r() * 6, spinA = q + t * (3 + r() * 4);
      const pts = tr(cx + Math.cos(q) * d, cy + Math.sin(q) * d * 0.8, spinA, v === 2 ? [[-s, -s * 0.5], [s, -s * 0.5], [s * 0.7, s * 0.6], [-s * 0.7, s * 0.6]] : [[0, -s], [s * 0.45, 0], [0, s * 0.7], [-s * 0.45, 0]]);
      poly(c, pts, (v === 1 ? B : A)(a * 0.85), W(a * 0.9), 1);
      c.fillStyle = W(a * 0.45); c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]); c.lineTo((pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2); c.closePath(); c.fill();
      if (v === 1 || v === 3) glow(c, cx + Math.cos(q) * (d - 6), cy + Math.sin(q) * (d - 6) * 0.8, 6, a * 0.6);
    }
    if (t < 0.35) { glow(c, cx, cy, 30, 1 - t * 2); star(c, cx, cy, 18, 5, n, 0, W(1 - t * 2.5)); }
  },
  chains: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t), r = 46 - 22 * ease(Math.min(1, t * 2));
    for (let k = 0; k < (v ? 2 : 1); k++) for (let i = 0; i < n * 4; i++) {
      const q = (i / (n * 4)) * TAU + t * (k ? -2 : 2);
      c.save(); c.translate(cx + Math.cos(q) * (r + k * 6), cy + Math.sin(q) * (r + k * 6) * 0.7); c.rotate(q + Math.PI / 2 + (i % 2) * 0.0);
      c.strokeStyle = (i % 2 ? A : B)(a); c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, i % 2 ? 2 : 4, i % 2 ? 4 : 2, 0, 0, TAU); c.stroke(); c.restore();
    }
    if (t > 0.5) { poly(c, [[cx - 6, cy - 2], [cx + 6, cy - 2], [cx + 6, cy + 8], [cx - 6, cy + 8]], A(a), W(a)); c.strokeStyle = W(a); c.lineWidth = 2; c.beginPath(); c.arc(cx, cy - 2, 4, Math.PI, 0); c.stroke(); glow(c, cx, cy + 2, 16, a); }
  },
  wings: (c, t, _f, w, h, _n, v, A, B) => {
    const cx = w / 2, cy = h / 2 + 6, open = ease(Math.min(1, t * 2)), a = fadeOf(t);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const q = -Math.PI / 2 + s * (0.25 + i * 0.2) * open * 1.8, L = 46 - i * 4;
        if (v === 1) { smoothPath(c, [[cx, cy], [cx + Math.cos(q) * L * 0.55, cy + Math.sin(q) * L * 0.55 - 3], [cx + Math.cos(q) * L, cy + Math.sin(q) * L], [cx + Math.cos(q + s * 0.18) * L * 0.75, cy + Math.sin(q + s * 0.18) * L * 0.75]]); c.fillStyle = (i % 2 ? A : B)(a * 0.7); c.fill(); c.strokeStyle = W(a * 0.6); c.lineWidth = 1; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(q) * L, cy + Math.sin(q) * L); c.stroke(); }
        else { c.save(); c.translate(cx + Math.cos(q) * L * 0.5, cy + Math.sin(q) * L * 0.5); c.rotate(q); c.beginPath(); c.ellipse(0, 0, L / 2, 4, 0, 0, TAU); c.fillStyle = (i % 2 ? A : B)(a * 0.85); c.fill(); c.strokeStyle = W(a * 0.7); c.lineWidth = 1; c.stroke(); c.restore(); }
      }
    }
    glow(c, cx, cy, 22, a); if (v === 3 || v === 0) { c.strokeStyle = W(a); c.lineWidth = 2; c.beginPath(); c.ellipse(cx, cy - 34, 10, 3, 0, 0, TAU); c.stroke(); }
  },
  beast: (c, t, _f, w, h, n, v, A, B) => {
    // Wolf (0), dragon (1), tiger (2) or falcon (3): smooth spirit head lunging forward.
    const a = fadeOf(t, 0.1, 0.7);
    for (let k = 0; k < n; k++) {
      const p = Math.max(0, Math.min(1, t * 1.6 - k * 0.15)), x = w * 0.18 + w * 0.5 * ease(p), y = h / 2 + (k - (n - 1) / 2) * 24, s = (n > 1 ? 0.7 : 0.95) + 0.3 * ease(p);
      const at = (pts: [number, number][]) => pts.map(([px, py]) => [x + px * s, y + py * s] as [number, number]);
      // Spirit trail: flowing wisps behind the head.
      for (let i = 0; i < 5; i++) streak(c, x - 14 * s, y - 8 + i * 4, x - (36 + i * 6) * s, y - 10 + i * 5 + Math.sin(t * 12 + i) * 4, (i - 2) * 3, 3 - i * 0.4, (i % 2 ? A : B)(a * 0.7));
      const head: [number, number][] = v === 3 ? [[-14, -7], [-2, -11], [12, -7], [24, 0], [14, 3], [6, 9], [-12, 8]]
        : v === 1 ? [[-18, -10], [-4, -13], [10, -9], [26, -3], [28, 3], [14, 6], [24, 11], [4, 13], [-16, 10]]
        : v === 2 ? [[-16, -12], [-6, -15], [8, -11], [22, -3], [22, 6], [8, 12], [-14, 12]]
        : [[-16, -8], [-6, -10], [10, -8], [26, -1], [12, 5], [18, 10], [0, 11], [-16, 9]];
      smoothPath(c, at(head)); hotFill(c, x + 4 * s, y - 2 * s, 22 * s, A, a); c.strokeStyle = W(a * 0.8); c.lineWidth = 1.2; c.stroke();
      // Ears / horns / crest.
      const ear = (pts: [number, number][]) => { smoothPath(c, at(pts)); hotFill(c, x - 4 * s, y - 14 * s, 8 * s, B, a); };
      if (v === 0) { ear([[-10, -8], [-6, -22], [0, -9]]); ear([[-2, -9], [3, -20], [6, -8]]); }
      if (v === 1) { for (const o of [0, 6]) { c.strokeStyle = B(a); c.lineWidth = 2.5; c.beginPath(); c.moveTo(x + (-8 + o) * s, y - 11 * s); c.quadraticCurveTo(x + (-16 + o) * s, y - 22 * s, x + (-28 + o) * s, y - 20 * s); c.stroke(); } }
      if (v === 2) { ear([[-12, -11], [-9, -19], [-4, -12]]); for (let i = 0; i < 3; i++) { c.strokeStyle = 'rgba(20,14,24,0.55)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + (-8 + i * 7) * s, y - 12 * s); c.quadraticCurveTo(x + (-5 + i * 7) * s, y - 4 * s, x + (-9 + i * 7) * s, y + 2 * s); c.stroke(); } }
      if (v === 3) { c.strokeStyle = B(a); c.lineWidth = 2; c.beginPath(); c.moveTo(x - 10 * s, y - 8 * s); c.quadraticCurveTo(x - 20 * s, y - 16 * s, x - 26 * s, y - 12 * s); c.stroke(); }
      // Teeth (beak for the falcon).
      if (v !== 3) for (let i = 0; i < 3; i++) { const tx = x + (12 + i * 4) * s, ty = y + (v === 1 ? 5 : 4) * s; c.fillStyle = W(a); c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + 1.5 * s, ty + 3.5 * s); c.lineTo(tx + 3 * s, ty); c.fill(); }
      // Glowing eye with a slit pupil.
      const ex = x + (v === 3 ? 6 : 7) * s, ey = y - 5 * s;
      glow(c, ex, ey, 7 * s, a); c.fillStyle = W(a); c.beginPath(); c.ellipse(ex, ey, 2.6 * s, 1.6 * s, -0.3, 0, TAU); c.fill();
      c.fillStyle = 'rgba(20,10,20,0.9)'; c.beginPath(); c.ellipse(ex + 0.4, ey, 0.6 * s, 1.4 * s, 0, 0, TAU); c.fill();
      if (p >= 1) { glow(c, x + 26 * s, y, 16, a); star(c, x + 28 * s, y, 10, 2.5, 6, t * 4, W(a)); }
    }
  },
  runes: (c, t, _f, w, h, n, v, A, B, glyph, seed) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t);
    for (let i = 0; i < n * 2; i++) {
      const q = (i / (n * 2)) * TAU + t * (v % 2 ? -3 : 3), r = 30 + (v === 3 ? Math.sin(t * 8 + i) * 6 : 0), y = cy + Math.sin(q) * r * 0.5 - (v === 2 ? t * 20 : 0);
      glow(c, cx + Math.cos(q) * r, y, 7, a * 0.6); rune(c, cx + Math.cos(q) * r, y, 5, seed + i, (i % 2 ? A : B)(a));
    }
    c.fillStyle = A(a); c.font = 'bold 14px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(glyph, cx, cy);
  },
  vortex: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t);
    for (let k = 0; k < n; k++) for (let i = 0; i < 18; i++) {
      const p = ((i / 18) + t * 1.5) % 1, q = (k / n) * TAU + p * TAU * 1.2 * (v === 2 ? -1 : 1) - t * 6, r = 50 * (1 - p);
      dot(c, cx + Math.cos(q) * r, cy + Math.sin(q) * r * 0.6, 1 + p * 2, (k % 2 ? A : B)(a * p));
    }
    c.beginPath(); c.arc(cx, cy, 6 + 4 * Math.sin(t * 12), 0, TAU); c.fillStyle = v === 2 ? 'rgba(10,8,20,0.8)' : W(a); c.fill(); glow(c, cx, cy, 18, a * 0.8);
  },
  lattice: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2 + 4, a = fadeOf(t, 0.1, 0.75), R = 42;
    const cells = n * 4;
    for (let i = 0; i < cells; i++) {
      const appear = Math.max(0, Math.min(1, t * 3 - (i / cells) * 1.5)); if (!appear) continue;
      const q = (i / cells) * TAU * (v === 2 ? 1 : 2), rr = v === 2 ? R * 0.9 : R * (0.35 + (i % 3) * 0.25);
      const hx = cx + Math.cos(q) * rr, hy = cy + Math.sin(q) * rr * (v === 1 ? 0.5 : 0.75);
      const hex: [number, number][] = Array.from({ length: 6 }, (_, k) => [hx + Math.cos(k * TAU / 6) * 7, hy + Math.sin(k * TAU / 6) * 7]);
      poly(c, hex, (i % 2 ? A : B)(a * appear * 0.35), A(a * appear), 1);
    }
    c.strokeStyle = W(a * 0.8); c.lineWidth = 1.5; c.beginPath(); c.ellipse(cx, cy, R + 6, (R + 6) * (v === 1 ? 0.5 : 0.75), 0, 0, TAU); c.stroke();
    if (v === 3) { c.beginPath(); c.ellipse(cx, cy, R - 10, (R - 10) * 0.75, 0, 0, TAU); c.stroke(); }
  },
  waves: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < n; i++) {
      const p = (t * 1.3 - i * 0.12); if (p <= 0 || p > 1) continue;
      const r = 6 + 46 * p, a = 1 - p;
      c.strokeStyle = (i % 2 ? A : B)(a); c.lineWidth = v === 1 ? 3 : 2; c.beginPath();
      for (let k = 0; k <= 48; k++) { const q = (k / 48) * TAU, rr = r + Math.sin(q * (v === 2 ? 8 : v === 3 ? 12 : 6) + t * 10) * (v === 1 ? 4 : 2); k ? c.lineTo(cx + Math.cos(q) * rr, cy + Math.sin(q) * rr * 0.7) : c.moveTo(cx + Math.cos(q) * rr, cy + Math.sin(q) * rr * 0.7); }
      c.stroke();
    }
    glow(c, cx, cy, 14, 1 - t);
  },
  fang: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, close = t < 0.5 ? ease(t * 2) : 1, gap = 34 * (1 - close) + 2, a = fadeOf(t, 0.1, 0.7);
    for (const s of [-1, 1]) {
      const teeth = 4 + n;
      for (let i = 0; i < teeth; i++) {
        const x = cx - 34 + (i + 0.5) * (68 / teeth), y = cy + s * gap, L = (v === 1 && (i === 1 || i === teeth - 2) ? 18 : 10);
        poly(c, [[x - 4, y + s * 0], [x + 4, y], [x, y - s * L]], (i % 2 ? A : B)(a), W(a * 0.7));
      }
      c.strokeStyle = A(a); c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 36, cy + s * gap); c.quadraticCurveTo(cx, cy + s * (gap + 10), cx + 36, cy + s * gap); c.stroke();
    }
    if (close >= 1) { glow(c, cx, cy, 26, a); star(c, cx, cy, 22, 4, v === 2 ? 8 : 6, 0, W(a)); }
  },
  swords: (c, t, _f, w, h, n, v, A, B) => {
    const ground = h - 8;
    for (let i = 0; i < n; i++) {
      const x = w / 2 + (i - (n - 1) / 2) * 22, t0 = i * 0.08, k = Math.max(0, Math.min(1, (t - t0) / 0.3)), a = t > 0.75 ? (1 - t) / 0.25 : 1;
      if (!k) continue;
      const y = ground - (1 - ease(k)) * 90, L = v === 2 ? 70 : 46;
      poly(c, [[x - 4, y - L], [x + 4, y - L], [x + 3, y - 6], [x, y + 4], [x - 3, y - 6]], B(a * 0.85), A(a), 1);
      poly(c, [[x - 10, y - L], [x + 10, y - L], [x + 10, y - L - 3], [x - 10, y - L - 3]], A(a));
      c.fillStyle = W(a); c.fillRect(x - 0.5, y - L + 4, 1, L - 10);
      if (k >= 1) { glow(c, x, ground, 16, a); for (const s of [-1, 1]) { c.strokeStyle = A(a); c.lineWidth = 1; c.beginPath(); c.moveTo(x, ground); c.lineTo(x + s * 14, ground + 2); c.lineTo(x + s * 20, ground - 1); c.stroke(); } }
    }
  },
  eye: (c, t, _f, w, h, _n, v, A, B) => {
    const cx = w / 2, cy = h / 2, open = Math.sin(Math.min(1, t * 1.6) * Math.PI / 2), a = fadeOf(t, 0.1, 0.75), H = 22 * open;
    c.beginPath(); c.moveTo(cx - 40, cy); c.quadraticCurveTo(cx, cy - H * 2, cx + 40, cy); c.quadraticCurveTo(cx, cy + H * 2, cx - 40, cy); c.closePath();
    c.fillStyle = B(a * 0.25); c.fill(); c.strokeStyle = A(a); c.lineWidth = 2; c.stroke();
    if (open > 0.3) { c.beginPath(); c.arc(cx, cy, 12 * open, 0, TAU); c.fillStyle = A(a); c.fill(); c.beginPath(); c.arc(cx, cy, v === 1 ? 2 : 5, 0, TAU); c.fillStyle = 'rgba(10,8,20,0.9)'; c.fill(); dot(c, cx + 4, cy - 4, 2, W(a)); }
    for (let i = 0; i < (v === 2 ? 16 : 10); i++) { const q = (i / (v === 2 ? 16 : 10)) * TAU + t; c.strokeStyle = A(a * 0.6); c.lineWidth = 1; c.beginPath(); c.moveTo(cx + Math.cos(q) * 44, cy + Math.sin(q) * 34); c.lineTo(cx + Math.cos(q) * 52, cy + Math.sin(q) * 40); c.stroke(); }
  },
  flasks: (c, t, _f, w, h, n, v, A, B, _g, seed) => {
    const r = rnd(seed + 9);
    for (let i = 0; i < n; i++) {
      const sx = w / 2 + (i - (n - 1) / 2) * 18, k = Math.min(1, t * 2), x = sx + (r() - 0.5) * 10, y = h * 0.7 - Math.sin(k * Math.PI) * 30 - (k >= 1 ? 0 : 0), a = t > 0.8 ? (1 - t) / 0.2 : 1;
      if (t < 0.5) {
        c.save(); c.translate(x, y); c.rotate(t * 10 + i);
        poly(c, [[-5, -2], [5, -2], [7, 8], [-7, 8]], B(a * 0.9), W(a)); c.fillStyle = W(a); c.fillRect(-2, -8, 4, 6); c.fillStyle = A(a); c.fillRect(-6, 3, 12, 5); c.restore();
      } else {
        const p = (t - 0.5) * 2;
        // Glass shards fly out, liquid splashes up in drops and pools on the ground.
        for (let d = 0; d < 10; d++) { const q = (d / 10) * TAU, dd = p * (16 + v * 6); poly(c, tr(sx + Math.cos(q) * dd, h * 0.7 + Math.sin(q) * dd * 0.6 - p * 6, q + p * 6, [[0, -3], [2, 0], [0, 3], [-2, 0]]), W(a)); }
        for (let d = 0; d < 7; d++) { const q = Math.PI + (d / 6) * Math.PI, dd = 6 + p * 18; c.beginPath(); c.arc(sx + Math.cos(q) * dd, h * 0.7 + Math.sin(q) * dd - Math.sin(p * Math.PI) * 10 + p * p * 14, 2.5 + (d % 2), 0, TAU); c.fillStyle = (d % 2 ? A : B)(a); c.fill(); }
        c.beginPath(); c.ellipse(sx, h * 0.7 + 8, 6 + p * 14, 2 + p * 4, 0, 0, TAU); c.fillStyle = A(a * 0.6); c.fill();
        glow(c, sx, h * 0.7, 18 * (1 - p) + 6, a); arcBand(c, sx, h * 0.7 + 6, 6 + p * (v === 2 ? 26 : 16), 0, TAU, 2, A(a), 0.4);
      }
    }
  },
  wheel: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w * 0.2 + w * 0.6 * t, cy = h / 2 + 6, a = fadeOf(t), R = v === 2 ? 26 : 20, q = t * 14;
    c.strokeStyle = A(a); c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    c.strokeStyle = B(a); c.lineWidth = 1.5; for (let i = 0; i < n; i++) { const k = q + (i / n) * TAU; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(k) * R, cy + Math.sin(k) * R); c.stroke(); }
    for (let i = 0; i < 8; i++) dot(c, cx - R - i * 5, cy + R - 2 - (i % 3) * 3, 2, A(a * (1 - i / 8)));
    glow(c, cx, cy, R, a * 0.5); if (v === 1) for (let i = 0; i < 6; i++) dot(c, cx - R * 0.6 - i * 3, cy + R - i * 4, 1.5, W(a));
  },
  crown: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, y = 10 + 30 * ease(Math.min(1, t * 2)), a = fadeOf(t);
    for (let i = 0; i < 12; i++) { const q = (i / 12) * TAU + t; c.strokeStyle = B(a * 0.5); c.lineWidth = 2; c.beginPath(); c.moveTo(cx, y + 6); c.lineTo(cx + Math.cos(q) * 54, y + 6 + Math.sin(q) * 40); c.stroke(); }
    if (v === 1) { c.strokeStyle = A(a); c.lineWidth = 3; c.beginPath(); c.ellipse(cx, y, 20, 6, 0, 0, TAU); c.stroke(); glow(c, cx, y, 24, a * 0.7); }
    else { const spikes = 3 + n; const pts: [number, number][] = [[cx - 20, y + 10]]; for (let i = 0; i <= spikes * 2; i++) pts.push([cx - 20 + (i * 40) / (spikes * 2), y + (i % 2 ? -2 : -14)]); pts.push([cx + 20, y + 10]); poly(c, pts, A(a * 0.9), W(a)); for (let i = 0; i < spikes; i++) dot(c, cx - 20 + ((i * 2 + 1) * 40) / (spikes * 2) + 3, y - 12, 3, B(a)); }
    if (n >= 2) for (let i = 0; i < n * 3; i++) dot(c, cx + Math.cos(i + t * 4) * 30, y + 24 + Math.sin(i * 2 + t * 4) * 10 + t * 20, 2, W(a));
  },
  fireworks: (c, t, _f, w, h, n, v, A, B, _g, seed) => {
    const r = rnd(seed + 21);
    for (let i = 0; i < n; i++) {
      const x = 14 + r() * (w - 28), top = 14 + r() * 30, t0 = r() * 0.3, k = (t - t0) / 0.3;
      if (k <= 0) continue;
      if (k < 1) { const y = h - 6 - (h - 6 - top) * ease(k); c.strokeStyle = B(0.8); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y + 10); c.lineTo(x, y); c.stroke(); dot(c, x, y, 3, W(1)); }
      else { const p = Math.min(1, (k - 1) / 1.6), a = 1 - p; for (let s = 0; s < (v ? 14 : 10); s++) { const q = (s / (v ? 14 : 10)) * TAU, d = p * 22; dot(c, x + Math.cos(q) * d, top + Math.sin(q) * d + p * p * 8, 2, (s % 2 ? A : B)(a)); } glow(c, x, top, 12 * (1 - p) + 2, a); }
    }
  },
  roots: (c, t, _f, w, h, n, v, A, B, _g, seed) => {
    // Earth pillars (0), flame tongues (1), stone spears (2), mountain (3).
    const r = rnd(seed + 7), ground = h - 6, grow = t < 0.45 ? ease(t / 0.45) : t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
    if (v === 3) { poly(c, [[10, ground], [w / 2 - 10, ground - 70 * grow], [w / 2 + 4, ground - 56 * grow], [w / 2 + 14, ground - 80 * grow], [w - 10, ground]], B(0.85), A(1), 2); return; }
    for (let i = 0; i < n; i++) {
      const x = 10 + (i + 0.5) * ((w - 20) / n) + (r() - 0.5) * 6, H = (30 + r() * 46) * grow, bw = 4 + r() * 4, sway = v === 1 ? Math.sin(t * 20 + i) * 6 : 0;
      if (v === 1) { c.beginPath(); c.moveTo(x - bw, ground); c.quadraticCurveTo(x - bw + sway * 0.3, ground - H * 0.6, x + sway, ground - H); c.quadraticCurveTo(x + bw + sway * 0.3, ground - H * 0.5, x + bw, ground); c.closePath(); hotFill(c, x, ground - H * 0.3, H * 0.6 + 4, i % 2 ? A : B, 0.9); glow(c, x, ground - H * 0.3, 10, 0.5); }
      else poly(c, [[x - bw, ground], [x - bw * 0.6, ground - H * 0.7], [x, ground - H], [x + bw * 0.6, ground - H * 0.7], [x + bw, ground]], (i % 2 ? A : B)(0.9), W(0.7), 1);
      if (v === 2 && grow > 0.9) dot(c, x, ground - H, 3, W(1));
    }
  },
  skull: (c, t, _f, w, h, n, v, A, B) => {
    const a = fadeOf(t, 0.2, 0.7);
    for (let k = 0; k < n; k++) {
      const cx = w / 2 + (k - (n - 1) / 2) * 26 + (v === 1 ? Math.sin(t * 8 + k) * 6 : 0), cy = h / 2 - (v === 1 ? t * 20 : 0), s = n > 1 ? 0.6 : 1, jaw = Math.sin(t * 14) * 3 * (v === 0 ? 1 : 0.5);
      glow(c, cx, cy, 30 * s, a * 0.5);
      c.beginPath(); c.arc(cx, cy - 4 * s, 16 * s, Math.PI, 0); c.lineTo(cx + 12 * s, cy + 8 * s); c.lineTo(cx - 12 * s, cy + 8 * s); c.closePath(); c.fillStyle = B(a * 0.45); c.fill(); c.strokeStyle = A(a); c.lineWidth = 2; c.stroke();
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(cx + sx * 6 * s, cy - 2 * s, 4 * s, 0, TAU); c.fillStyle = 'rgba(8,6,14,0.9)'; c.fill(); dot(c, cx + sx * 6 * s, cy - 2 * s, 2, A(a)); }
      for (let i = -2; i <= 2; i++) c.fillRect(cx + i * 4 * s - 1, cy + (10 + jaw) * s, 2, 4 * s);
      c.fillStyle = A(a); c.fillRect(cx - 10 * s, cy + (9 + jaw) * s, 20 * s, 1);
    }
  },
  hand: (c, t, _f, w, h, n, v, A, B) => {
    // Open palm grabbing (0), fists (1) or one giant fist (2), drawn as rounded spirit hands.
    const a = fadeOf(t, 0.08, 0.7);
    for (let k = 0; k < n; k++) {
      const p = Math.max(0, Math.min(1, t * 2.2 - k * 0.25)); if (!p) continue;
      const cx = w * 0.22 + w * 0.5 * ease(p) + (k % 2 ? 4 : -4), cy = h / 2 + (k - (n - 1) / 2) * (n > 3 ? 11 : 14), s = v === 2 ? 1.5 : n > 2 ? 0.75 : 1;
      for (let i = 0; i < 4; i++) streak(c, cx - 10 * s, cy - 6 * s + i * 4 * s, cx - (30 + i * 4) * s, cy - 6 * s + i * 4 * s + (i - 1.5) * 2, (i - 1.5) * 2, 2.4 - i * 0.3, A(a * 0.6));
      if (v === 0) {
        c.save(); c.translate(cx, cy);
        const curl = p;
        for (let f = 0; f < 4; f++) { c.save(); c.translate(8 * s, (-8 + f * 5.2) * s); c.rotate(-0.2 + f * 0.13 + curl * 0.9); roundRect(c, 0, -2 * s, 13 * s, 4.2 * s, 2.1 * s); hotFill(c, 6 * s, 0, 8 * s, B, a); c.strokeStyle = W(a * 0.6); c.lineWidth = 0.8; c.stroke(); c.restore(); }
        c.save(); c.rotate(-0.9 + curl * 0.6); roundRect(c, 0, -2 * s, 10 * s, 4.4 * s, 2.2 * s); hotFill(c, 5 * s, 0, 6 * s, B, a); c.restore();
        c.beginPath(); c.ellipse(0, 0, 10 * s, 11 * s, 0, 0, TAU); hotFill(c, 0, 0, 11 * s, A, a); c.strokeStyle = W(a * 0.8); c.lineWidth = 1; c.stroke();
        c.restore();
      } else {
        c.save(); c.translate(cx, cy);
        roundRect(c, -9 * s, -9 * s, 19 * s, 18 * s, 6 * s); hotFill(c, 0, 0, 13 * s, A, a); c.strokeStyle = W(a * 0.85); c.lineWidth = 1.1; c.stroke();
        for (let f = 0; f < 4; f++) { c.beginPath(); c.arc(9 * s, (-6.5 + f * 4.3) * s, 2.3 * s, -Math.PI / 2, Math.PI / 2); c.fillStyle = B(a); c.fill(); c.strokeStyle = W(a * 0.5); c.lineWidth = 0.7; c.stroke(); }
        c.strokeStyle = W(a * 0.7); c.lineWidth = 1.2; c.beginPath(); c.moveTo(-4 * s, 6 * s); c.quadraticCurveTo(4 * s, 9 * s, 7 * s, 3 * s); c.stroke();
        roundRect(c, -15 * s, -6 * s, 6 * s, 12 * s, 2.5 * s); c.fillStyle = B(a * 0.8); c.fill();
        c.restore();
      }
      if (p >= 1) { glow(c, cx + 16 * s, cy, 20 * s, a); star(c, cx + 17 * s, cy, 14 * s, 3, 8, k + t * 3, W(a)); arcBand(c, cx + 16 * s, cy, 6 + (t * 40) % 20, 0, TAU, 1.5, A(a * 0.7)); }
    }
    if (v === 2 && t > 0.45) { const q = fadeOf(t); for (let i = 0; i < 3; i++) arcBand(c, w * 0.72, h / 2, 10 + i * 9 + (t - 0.45) * 50, 0, TAU, 2.5 - i * 0.6, W(q * (0.8 - i * 0.2)), 0.85); }
  },
  feathers: (c, t, _f, w, h, n, v, A, B, _g, seed) => {
    const r = rnd(seed + 15), a = fadeOf(t);
    for (let i = 0; i < n; i++) {
      const x = 10 + r() * (w - 20) + Math.sin(t * 6 + i) * 8, y = -10 + ((t * (0.8 + r() * 0.6) + r() * 0.5) % 1.1) * (h + 10), q = Math.sin(t * 5 + i) * 0.8;
      c.save(); c.translate(x, y); c.rotate(q + (v ? 0.8 : 0));
      c.beginPath(); c.ellipse(0, 0, 3, 9, 0, 0, TAU); c.fillStyle = (i % 2 ? A : B)(a * 0.85); c.fill(); c.strokeStyle = W(a); c.lineWidth = 1; c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 10); c.stroke(); c.restore();
    }
  },
  serpent: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t);
    for (let k = 0; k < n; k++) {
      const pts: [number, number][] = [];
      for (let i = 0; i < 30; i++) { const p = i / 30, q = t * 7 + p * TAU * 1.2 + k * Math.PI, r = 14 + p * 30; pts.push([cx + Math.cos(q) * r, cy + Math.sin(q) * r * 0.6 - (v ? p * 10 : 0)]); }
      for (let i = pts.length - 1; i > 0; i--) { const s = 1 + (i / pts.length) * 5; c.strokeStyle = (i % 3 ? A : B)(a * (0.4 + i / pts.length * 0.6)); c.lineWidth = s; c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke(); }
      const [hx, hy] = pts[pts.length - 1]; glow(c, hx, hy, 10, a); dot(c, hx, hy - 2, 2, W(a));
    }
  },
  banner: (c, t, _f, w, h, n, v, A, B, glyph) => {
    const x = w / 2 - 14, ground = h - 6, up = ease(Math.min(1, t * 2.4)), top = ground - 80 * up, a = fadeOf(t, 0.05, 0.8);
    c.fillStyle = W(a); c.fillRect(x - 1, top, 3, ground - top);
    const flagH = 26, flagW = 34;
    c.beginPath(); c.moveTo(x + 2, top + 2);
    for (let i = 0; i <= 10; i++) { const p = i / 10; c.lineTo(x + 2 + p * flagW, top + 2 + Math.sin(p * 6 + t * 14) * 3 * p); }
    for (let i = 10; i >= 0; i--) { const p = i / 10; c.lineTo(x + 2 + p * flagW, top + 2 + flagH + Math.sin(p * 6 + t * 14) * 3 * p - (v && i === 10 ? 6 : 0)); }
    c.closePath(); c.fillStyle = A(a * 0.9); c.fill(); c.strokeStyle = B(a); c.lineWidth = 1.5; c.stroke();
    c.fillStyle = B(a); c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(glyph, x + 2 + flagW / 2, top + 2 + flagH / 2);
    for (let i = 0; i < n * 4; i++) dot(c, x + Math.cos(i * 1.7) * 26, ground - ((t * 60 + i * 13) % 70), 2, A(a * 0.7));
  },
  coin: (c, t, _f, w, h, n, v, A, B, glyph, seed) => {
    const r = rnd(seed + 2), a = fadeOf(t, 0.1, 0.75);
    for (let i = 0; i < n; i++) {
      const big = n === 1, x = big ? w / 2 : 12 + r() * (w - 24), y = big ? h / 2 - Math.sin(t * Math.PI) * 10 : -8 + t * (h + 10) * (0.8 + r() * 0.5), R = big ? 20 : 8, sx = Math.abs(Math.cos(t * (big ? 10 : 14) + i));
      c.beginPath(); c.ellipse(x, y, R * Math.max(0.12, sx), R, 0, 0, TAU); c.fillStyle = A(a); c.fill(); c.strokeStyle = B(a); c.lineWidth = 2; c.stroke();
      if (big && sx > 0.5) { c.fillStyle = B(a); c.font = 'bold 16px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(v === 2 ? '$' : glyph.slice(0, 1), x, y + 1); }
      glow(c, x, y, R + 6, a * 0.4);
    }
    if (t > 0.6 && n === 1) star(c, w / 2, h / 2, 34 * (t - 0.6) * 3, 4, 8, t, W(1 - t));
  },
  cage: (c, t, f, w, h, n, v, A, B) => {
    const ground = h - 6, a = t < 0.7 ? 1 : (1 - t) / 0.3;
    for (let i = 0; i < n; i++) {
      const x = w / 2 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * (w - 24)), on = (f + i) % 3 !== 0 || v === 2;
      if (!on || t < i * 0.05) continue;
      bolt(c, x + (v === 1 ? Math.sin(i) * 10 : 0), 0, x, ground, 3 + i * 7 + (f % 2), 3, B(a * 0.6));
      bolt(c, x + (v === 1 ? Math.sin(i) * 10 : 0), 0, x, ground, 3 + i * 7 + (f % 2), 1, A(a));
      glow(c, x, ground, 12, a);
    }
    if (v >= 1) { c.strokeStyle = A(a * 0.6); c.lineWidth = 1; c.beginPath(); c.ellipse(w / 2, ground, w / 2 - 8, 8, 0, 0, TAU); c.stroke(); }
  },
  sun: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t), R = 12 + 10 * ease(Math.min(1, t * 2)), spin = t * (v % 2 ? 2 : -2);
    for (let i = 0; i < n; i++) {
      const q = spin + (i / n) * TAU, L = R + (v === 2 ? 30 * Math.min(1, t * 2) : 16 + (i % 2) * 8);
      poly(c, [[cx + Math.cos(q - 0.12) * R, cy + Math.sin(q - 0.12) * R], [cx + Math.cos(q) * L, cy + Math.sin(q) * L], [cx + Math.cos(q + 0.12) * R, cy + Math.sin(q + 0.12) * R]], (i % 2 ? A : B)(a * 0.85));
    }
    glow(c, cx, cy, R * 2.2, a); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fillStyle = A(a); c.fill(); c.beginPath(); c.arc(cx, cy, R * 0.6, 0, TAU); c.fillStyle = W(a); c.fill();
    if (v === 3) arcBand(c, cx, cy, R + 20 * t, 0, TAU, 2, A(1 - t));
    if (v === 4) for (let i = 0; i < 4; i++) star(c, cx + Math.cos(i * 1.57 + t * 3) * 36, cy + Math.sin(i * 1.57 + t * 3) * 36, 6, 2, 4, 0, W(a));
  },
  moon: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t, 0.2, 0.7), R = 22;
    glow(c, cx, cy, 40, a * 0.4);
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fillStyle = A(a); c.fill();
    c.beginPath(); c.arc(cx + 9 + (v === 2 ? Math.sin(t * 6) * 4 : 0), cy - 5, R - 2, 0, TAU); c.fillStyle = 'rgba(8,6,16,0.95)'; c.fill();
    for (let i = 0; i < n * 3; i++) { const q = i * 2.1 + t * (v === 3 ? 4 : 1); star(c, cx + Math.cos(q) * (34 + (i % 3) * 6), cy + Math.sin(q) * (24 + (i % 2) * 6), 3, 1, 4, 0, (i % 2 ? B : W)(a * (0.5 + 0.5 * Math.sin(t * 10 + i)))); }
    if (v === 1) for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(cx - 20 + i * 8, cy + 26 - t * 20, 5, 0, TAU); c.fillStyle = B(a * 0.3); c.fill(); }
  },
  cross: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t), s = 0.6 + 0.4 * ease(Math.min(1, t * 2)) + v * 0.06;
    for (let i = 0; i < n; i++) { const q = (i / n) * TAU + t * (v % 2 ? 1 : -1); c.strokeStyle = B(a * 0.5); c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(q) * 54, cy + Math.sin(q) * 54); c.stroke(); }
    glow(c, cx, cy, 34 * s, a);
    const arm = 30 * s, th = 6 * s;
    poly(c, [[cx - th, cy - arm], [cx + th, cy - arm], [cx + th, cy - th], [cx + arm * 0.7, cy - th], [cx + arm * 0.7, cy + th], [cx + th, cy + th], [cx + th, cy + arm], [cx - th, cy + arm], [cx - th, cy + th], [cx - arm * 0.7, cy + th], [cx - arm * 0.7, cy - th], [cx - th, cy - th]], A(a), W(a), 1.5);
    if (v >= 2) { c.strokeStyle = W(a); c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy - th / 2, arm * 0.45, 0, TAU); c.stroke(); }
    if (v === 4) for (let i = 0; i < 4; i++) { const q = i * 1.57 + t * 2; poly(c, tr(cx + Math.cos(q) * 40, cy + Math.sin(q) * 40, 0, [[-2, -6], [2, -6], [2, 6], [-2, 6]]), W(a)); }
  },
  shield: (c, t, _f, w, h, n, v, A, B, glyph) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t, 0.1, 0.75), s = 0.5 + 0.5 * ease(Math.min(1, t * 2.5));
    const pts: [number, number][] = [[-24, -26], [24, -26], [24, 2], [0, 28], [-24, 2]].map(([x, y]) => [cx + x * s, cy + y * s]);
    glow(c, cx, cy, 40 * s, a * 0.6); poly(c, pts, B(a * 0.35), A(a), 2.5);
    if (v === 1) { c.strokeStyle = A(a); c.beginPath(); c.moveTo(cx, cy - 26 * s); c.lineTo(cx, cy + 28 * s); c.moveTo(cx - 24 * s, cy - 6 * s); c.lineTo(cx + 24 * s, cy - 6 * s); c.stroke(); }
    if (v === 2) for (let i = 0; i < n * 3; i++) dot(c, cx + Math.cos(i * 2 + t * 6) * 34 * s, cy + Math.sin(i * 2 + t * 6) * 30 * s, 2, A(a));
    c.fillStyle = W(a); c.font = 'bold 14px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(glyph, cx, cy - 4 * s);
    for (let i = 0; i < n; i++) arcBand(c, cx, cy, (30 + i * 6) * s + t * 10, 0, TAU, 1, A(a * 0.5));
  },
  hourglass: (c, t, _f, w, h, n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t), q = v ? t * Math.PI : 0;
    c.save(); c.translate(cx, cy); c.rotate(q);
    poly(c, [[-14, -22], [14, -22], [2, 0], [14, 22], [-14, 22], [-2, 0]], B(a * 0.25), A(a), 2);
    const sand = t; poly(c, [[-12 * (1 - sand), -20 + 20 * sand], [12 * (1 - sand), -20 + 20 * sand], [0, -2]], A(a)); poly(c, [[-12 * sand, 20 - 18 * sand], [12 * sand, 20 - 18 * sand], [12, 20], [-12, 20]], A(a));
    c.fillStyle = W(a); c.fillRect(-0.5, -2, 1, 22 * (1 - sand));
    c.restore();
    for (let i = 0; i < n * 6; i++) { const k = ((t * 2 + i / (n * 6)) % 1); dot(c, cx + Math.cos(i * 2.4) * 34 * (1 - k), cy + Math.sin(i * 2.4) * 26 * (1 - k), 2, A(a * k)); }
  },
  heart: (c, t, _f, w, h, n, v, A, B) => {
    const a = fadeOf(t);
    for (let k = 0; k < n; k++) {
      const cx = w / 2 + (k - (n - 1) / 2) * 24, cy = h / 2 - (v === 2 ? t * 24 : 0) + (n > 1 ? Math.sin(t * 8 + k) * 4 : 0), beat = 1 + Math.max(0, Math.sin(t * 18)) * 0.15, s = (n > 1 ? 0.6 : 1) * beat * ease(Math.min(1, t * 3));
      glow(c, cx, cy, 30 * s, a * 0.6);
      c.beginPath(); c.moveTo(cx, cy + 16 * s); c.bezierCurveTo(cx - 28 * s, cy - 2 * s, cx - 14 * s, cy - 22 * s, cx, cy - 8 * s); c.bezierCurveTo(cx + 14 * s, cy - 22 * s, cx + 28 * s, cy - 2 * s, cx, cy + 16 * s);
      c.fillStyle = A(a * 0.85); c.fill(); c.strokeStyle = W(a); c.lineWidth = 1.5; c.stroke();
      if (v === 1) { c.fillStyle = B(a); c.fillRect(cx - 1.5 * s, cy - 8 * s, 3 * s, 12 * s); c.fillRect(cx - 6 * s, cy - 3.5 * s, 12 * s, 3 * s); }
    }
    for (let i = 0; i < 8; i++) dot(c, w / 2 + Math.cos(i) * 36, h - ((t * 80 + i * 11) % h), 2, B(a));
  },
  arrowfan: (c, t, _f, w, h, n, v, A, B) => {
    const a = t > 0.75 ? (1 - t) / 0.25 : 1, ground = h - 8;
    for (let i = 0; i < n; i++) {
      let x0: number, y0: number, x1: number, y1: number;
      if (v === 1) { const x = 10 + ((i * 37) % (w - 20)); x0 = x - 30; y0 = -20; x1 = x; y1 = ground; }
      else { const q = -0.5 + (n === 1 ? 0.5 : i / (n - 1)) * 1.0 - Math.PI / 2 + Math.PI / 2; x0 = 4; y0 = ground - 30; x1 = w - 4; y1 = ground - 30 + Math.sin(q) * (n > 1 ? 40 : 0); }
      const k = Math.max(0, Math.min(1, t * (v === 1 ? 2.2 : 3) - i * (v === 1 ? 0.06 : 0.05)));
      if (!k) continue;
      const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, ang = Math.atan2(y1 - y0, x1 - x0), L = v === 2 ? 40 : 18;
      c.strokeStyle = B(a * 0.5); c.lineWidth = v === 2 ? 6 : 2; c.beginPath(); c.moveTo(x - Math.cos(ang) * L, y - Math.sin(ang) * L); c.lineTo(x, y); c.stroke();
      c.strokeStyle = W(a); c.lineWidth = 1; c.stroke();
      poly(c, tr(x, y, ang, [[0, 0], [-6, -3], [-6, 3]]), A(a));
      if (k >= 1) glow(c, x, y, 10, a);
    }
  },
  seal: (c, t, _f, w, h, n, v, A, B, glyph) => {
    const cx = w / 2, cy = h / 2, drop = t < 0.3 ? ease(t / 0.3) : 1, s = 2 - drop, a = fadeOf(t, 0.05, 0.7), R = 22 * s;
    if (v === 2) { c.save(); c.translate(cx, cy - 20 * (1 - drop)); c.rotate(-0.6 + drop * 0.6); roundRect(c, -2 * s, 6 * s, 4 * s, 24 * s, 2 * s); c.fillStyle = B(a); c.fill(); roundRect(c, -15 * s, -9 * s, 30 * s, 17 * s, 4 * s); hotFill(c, 0, 0, 16 * s, A, a); c.strokeStyle = W(a); c.lineWidth = 1; c.stroke(); c.fillStyle = W(a * 0.6); c.fillRect(-12 * s, -6 * s, 24 * s, 1.5); c.restore(); }
    else {
      c.save(); c.translate(cx, cy); c.rotate(n * 0.2 + (1 - drop));
      poly(c, Array.from({ length: Math.max(4, n + 3) }, (_, i) => { const q = (i / Math.max(4, n + 3)) * TAU; return [Math.cos(q) * R, Math.sin(q) * R] as [number, number]; }), B(a * 0.4), A(a), 3);
      c.restore();
      c.fillStyle = W(a); c.font = `bold ${Math.round(14 * s)}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(glyph, cx, cy + 1);
    }
    if (drop >= 1) { const p = (t - 0.3) / 0.7; arcBand(c, cx, cy + 6, 22 + p * 34, 0, TAU, 3 * (1 - p), A(1 - p), 0.5); for (let i = 0; i < 8; i++) { const q = (i / 8) * TAU; c.strokeStyle = W(1 - p); c.lineWidth = 1; c.beginPath(); c.moveTo(cx + Math.cos(q) * (20 + p * 10), cy + Math.sin(q) * (14 + p * 8)); c.lineTo(cx + Math.cos(q) * (28 + p * 26), cy + Math.sin(q) * (20 + p * 18)); c.stroke(); } }
  },
  clock: (c, t, _f, w, h, _n, v, A, B) => {
    const cx = w / 2, cy = h / 2, a = fadeOf(t), R = 30;
    glow(c, cx, cy, 40, a * 0.4);
    c.strokeStyle = A(a); c.lineWidth = 2.5; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    for (let i = 0; i < 12; i++) { const q = (i / 12) * TAU; c.fillStyle = (i % 3 ? B : W)(a); c.fillRect(cx + Math.cos(q) * (R - 5) - 1, cy + Math.sin(q) * (R - 5) - 1, 2, 2); }
    const m = t * TAU * (v ? -6 : 6), hr = t * TAU;
    c.strokeStyle = W(a); c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(m) * (R - 6), cy - Math.cos(m) * (R - 6)); c.stroke();
    c.strokeStyle = A(a); c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(hr) * (R - 14), cy - Math.cos(hr) * (R - 14)); c.stroke();
    for (let i = 1; i < 4; i++) { c.strokeStyle = A(a * (0.4 - i * 0.1)); c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R + i * 5, -Math.PI / 2, -Math.PI / 2 + t * TAU); c.stroke(); }
  },
  drops: (c, t, _f, w, h, n, v, A, B, _g, seed) => {
    const r = rnd(seed + 33), ground = h - 8;
    for (let i = 0; i < n; i++) {
      const x = 8 + r() * (w - 16), t0 = r() * 0.5, k = (t - t0) / 0.3;
      if (k <= 0) continue;
      if (k < 1) { const y = -6 + (ground + 6) * k * k; c.beginPath(); c.moveTo(x, y - 6); c.quadraticCurveTo(x + 4, y + 2, x, y + 3); c.quadraticCurveTo(x - 4, y + 2, x, y - 6); c.fillStyle = (i % 2 ? A : B)(0.9); c.fill(); }
      else { const p = Math.min(1, (k - 1) / 1.2), a = 1 - p; arcBand(c, x, ground, 2 + p * (v === 3 ? 14 : 9), 0, TAU, 1.5, A(a), 0.35); for (const s of [-1, 1]) dot(c, x + s * p * 8, ground - Math.sin(p * Math.PI) * 8, 2, B(a)); if (v === 3) { c.fillStyle = W(a); c.fillRect(x - 2, ground - 10 - p * 10, 4, 1); c.fillRect(x - 0.5, ground - 11.5 - p * 10, 1, 4); } }
    }
    if (v === 2) glow(c, w / 2, ground - 10, 30, 0.3 * (1 - t));
  },
};

export const SIG_W = 112, SIG_H = 112, SIG_FRAMES = 20, SIG_FPS = 28;

/**
 * Finishing pass that adds detail to a drawn frame: soft bloom around everything bright,
 * twinkling four-point glints on the hottest spots and motes orbiting with glowing tails.
 */
export function polishFrame(frame: HTMLCanvasElement, res: number, t: number, A: Col, B: Col, seed: number, orbit = true): HTMLCanvasElement {
  const w = frame.width, h = frame.height;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const c = out.getContext('2d')!;
  // Bloom: two blurred copies added under the sharp drawing.
  c.globalCompositeOperation = 'lighter';
  for (const [blur, alpha] of [[8 * res, 0.35], [3 * res, 0.4]] as [number, number][]) { c.filter = `blur(${blur}px)`; c.globalAlpha = alpha; c.drawImage(frame, 0, 0); }
  c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.drawImage(frame, 0, 0);
  // Glints on the brightest solid pixels.
  const fc = frame.getContext('2d')!, d = fc.getImageData(0, 0, w, h).data;
  const hot: [number, number][] = [];
  const step = 3 * res;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4; if (d[i + 3] > 200 && d[i] + d[i + 1] + d[i + 2] > 640) hot.push([x, y]); }
  const r = rnd(seed + 101);
  c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < Math.min(7, hot.length); k++) {
    const [x, y] = hot[Math.floor(r() * hot.length)], tw = Math.max(0, Math.sin(t * Math.PI * 6 + k * 1.9));
    if (tw < 0.2) continue;
    const L = (5 + 7 * tw) * res;
    c.fillStyle = W(0.9 * tw); c.beginPath();
    for (let i = 0; i < 8; i++) { const q = (i / 8) * TAU, rr = i % 2 ? L * 0.12 : L * (i % 4 ? 0.55 : 1); c.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr); }
    c.closePath(); c.fill();
  }
  // Orbiting motes with tails.
  if (orbit) {
    const fade = Math.min(1, t * 5) * (t > 0.75 ? (1 - t) / 0.25 : 1), cx = w / 2, cy = h / 2;
    for (let k = 0; k < 9; k++) {
      const base = (k / 9) * TAU + r() * 0.5, rad = (34 + (k % 3) * 9) * res, sp = 2.6 + (k % 4) * 0.5;
      for (let j = 0; j < 6; j++) {
        const q = base + t * sp - j * 0.07, x = cx + Math.cos(q) * rad, y = cy + Math.sin(q) * rad * 0.55;
        c.fillStyle = (k % 2 ? A : B)(fade * (1 - j / 6) * 0.9); c.beginPath(); c.arc(x, y, (1.6 - j * 0.2) * res, 0, TAU); c.fill();
      }
    }
  }
  c.globalCompositeOperation = 'source-over';
  return out;
}

/** Draws the signature sheet of a skill (frames side by side). */
export function drawSignatureSheet(sig: Signature, primary: string, glyph: string, seed: number, res = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIG_W * SIG_FRAMES * res; canvas.height = SIG_H * res;
  const out = canvas.getContext('2d')!;
  // Pure white skills would read as flat white pixels: give them a pale tint with a warm accent.
  const pale = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return Math.min((n >> 16) & 255, (n >> 8) & 255, n & 255) > 215; };
  const A = colour(pale(primary) ? '#a8d8ff' : primary), B = colour(pale(primary) && pale(sig.c2) ? '#ffd860' : sig.c2);
  const frame = document.createElement('canvas'); frame.width = SIG_W * res; frame.height = SIG_H * res;
  const c = frame.getContext('2d', { willReadFrequently: true })!;
  for (let f = 0; f < SIG_FRAMES; f++) {
    const t = f / (SIG_FRAMES - 1);
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, frame.width, frame.height);
    c.save(); c.scale(res, res); c.lineCap = 'round'; c.lineJoin = 'round';
    MOTIFS[sig.m](c, t, f, SIG_W, SIG_H, sig.n, sig.v, A, B, glyph, seed);
    c.restore();
    out.drawImage(polishFrame(frame, res, t, A, B, seed, !GROUND_MOTIFS.has(sig.m)), f * SIG_W * res, 0);
  }
  return canvas;
}

export const MOTIF_NAMES = Object.keys(MOTIFS) as Motif[];
