// Imports AI-generated raw images (tools/asset-studio/ai-raw/) into the game.
//   npm run assets:ai:import -- [--only <asset>] [--force] [--raw <dir>] [--no-write]
// Per asset, every animation must have a raw image; each is processed into the
// game's frame grid and QA-checked with the same pixel checks as the studio art.
// An asset is written to public/assets only when all its sheets pass QA (or with
// --force), replacing the studio sheet at the same path, and its metadata is
// marked with the source. `npm run assets:batch001` restores the studio art.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Pixmap, type Sheet } from '../pixel';
import { BASE_Y, FH, FW } from '../humanoid';
import { MB, MH, MW } from '../monsters';
import { BATCH001_VFX } from '../vfx';
import { runQa, type QaItem } from '../qa';
import { decodePng } from './png';
import { aiJobs, type AiJob } from './jobs';
import { processSheet, type Processed } from './process';

const ASSETS = join(process.cwd(), 'public/assets');
const DOCS = join(process.cwd(), 'docs/art/ai');

const target = (asset: string, j: AiJob) =>
  j.kind === 'character' ? `characters/${asset}/${asset}_${j.anim}_sheet.png`
    : j.kind === 'monster' ? `monsters/${asset}/${asset}_${j.anim}_sheet.png`
      : `vfx/${BATCH001_VFX.find((d) => d.key === asset)!.folder}/${asset}_sheet.png`;

function opts(j: AiJob) {
  if (j.kind === 'character') return { rows: 4, cols: j.frames, fw: FW, fh: FH, baseline: BASE_Y, targetH: 54, colours: 48, outline: true, mirrorRight: true };
  if (j.kind === 'monster') return { rows: 4, cols: j.frames, fw: MW, fh: MH, baseline: MB, targetH: 34, colours: 32, outline: true, mirrorRight: true };
  const d = BATCH001_VFX.find((v) => v.key === j.asset)!;
  return { rows: 1, cols: j.frames, fw: d.fw, fh: d.fh, baseline: null, targetH: d.fh - 6, colours: 24, outline: false, mirrorRight: false };
}

function write(rel: string, data: Buffer | string) {
  const f = join(ASSETS, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, data);
}

export async function main(args: string[]) {
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const force = args.includes('--force'), noWrite = args.includes('--no-write');
  const rawDir = args.includes('--raw') ? args[args.indexOf('--raw') + 1] : join(process.cwd(), 'tools/asset-studio/ai-raw');
  const jobs = aiJobs().filter((j) => j.kind !== 'reference' && (!only || j.asset === only));
  const assets = [...new Set(jobs.map((j) => j.asset))];
  mkdirSync(DOCS, { recursive: true });
  const report: { asset: string; status: string; sheets: { anim: string; method: string; scale: number; notes: string[] }[]; qa: QaItem[] }[] = [];
  for (const asset of assets) {
    const mine = jobs.filter((j) => j.asset === asset);
    const missing = mine.filter((j) => !existsSync(join(rawDir, `${j.id}.png`)));
    if (missing.length) { report.push({ asset, status: `skipped: no raw image for ${missing.map((m) => m.anim ?? m.id).join(', ')}`, sheets: [], qa: [] }); continue; }
    const done: { j: AiJob; p: Processed }[] = [];
    const qa: QaItem[] = [];
    for (const j of mine) {
      const p = processSheet(decodePng(readFileSync(join(rawDir, `${j.id}.png`))), { ...opts(j), centre: j.anim === 'idle' });
      done.push({ j, p });
      qa.push(...runQa(`${asset}_${j.anim ?? 'fx'}`, p.sheet, { kind: j.kind === 'vfx' ? 'vfx' : (j.kind as 'character' | 'monster'), anim: j.anim ?? j.id, frames: j.frames, rows: j.rows }));
    }
    const failed = qa.filter((q) => !q.pass);
    const ok = failed.length === 0 || force;
    report.push({ asset, status: ok ? `${noWrite ? 'passed QA (not written: --no-write)' : 'imported'}${failed.length ? ` with --force (${failed.length} QA failures)` : ''}` : `not imported: ${failed.length} QA failures`, sheets: done.map(({ j, p }) => ({ anim: j.anim ?? j.id, method: p.method, scale: +p.scale.toFixed(4), notes: p.notes })), qa });
    // Contact sheet for review either way.
    const sheets: Sheet[] = done.map((d) => d.p.sheet);
    const cw = Math.max(...sheets.map((s) => s.pix.w)), chh = sheets.reduce((a, s) => a + s.pix.h + 4, 4);
    const contact = new Pixmap(cw + 8, chh);
    contact.rect(0, 0, contact.w, contact.h, [92, 110, 84, 255]);
    let y = 4; for (const s of sheets) { contact.blit(s.pix, 4, y); y += s.pix.h + 4; }
    writeFileSync(join(DOCS, `contact_${asset}.png`), contact.scale(2).toPNG());
    if (!ok || noWrite) continue;
    for (const { j, p } of done) write(target(asset, j), p.sheet.pix.toPNG());
    // Metadata: AI sheets are composites, so layered recolouring no longer applies.
    const metaRel = mine[0].kind === 'character' ? `animations/${asset}.json` : mine[0].kind === 'monster' ? `animations/monsters/${asset}.json` : `vfx/${BATCH001_VFX.find((d) => d.key === asset)!.folder}/${asset}.json`;
    if (existsSync(join(ASSETS, metaRel))) {
      const meta = JSON.parse(readFileSync(join(ASSETS, metaRel), 'utf8'));
      meta.source = { generator: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1', pipeline: 'tools/asset-studio/src/ai', raw: mine.map((m) => `tools/asset-studio/ai-raw/${m.id}.png`) };
      if (meta.animations) for (const a of Object.values(meta.animations) as { layers?: unknown }[]) delete a.layers;
      write(metaRel, JSON.stringify(meta, null, 2) + '\n');
    }
  }
  writeFileSync(join(DOCS, 'import-report.json'), JSON.stringify(report, null, 2) + '\n');
  for (const r of report) {
    console.log(`${r.asset}: ${r.status}`);
    for (const q of r.qa.filter((x) => !x.pass)) console.log(`  FAIL ${q.asset} ${q.check} ${q.detail}`);
  }
}
