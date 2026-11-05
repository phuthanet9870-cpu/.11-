// Language switch (English / Thai). The game text is written in English; in
// Thai mode a MutationObserver rewrites every text node and placeholder/title
// shown in the HTML UI through the dictionary in src/i18n/th.ts. Proper names
// (items, monsters, skills, maps, NPC names) are not in the dictionary and
// stay as they are. Player chat lines are never translated.
import { TH, TH_FRAGMENTS } from '../i18n/th';

export type Lang = 'en' | 'th';
export const LANGS: { id: Lang; label: string }[] = [{ id: 'en', label: 'English' }, { id: 'th', label: 'ภาษาไทย' }];

let lang: Lang = 'en';
export const getLang = () => lang;

interface Pattern { re: RegExp; out: string; strong: boolean }
const exact = new Map<string, string>();
const patterns = new Map<string, Pattern[]>(); // by first literal character
const anyPatterns: Pattern[] = [];
const fragments: Pattern[] = [];
/** Patterns with this much fixed text are specific enough to try before splitting a line into pieces. */
const STRONG = 5;
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(src: string, anchored: boolean): RegExp {
  const body = src.split('{}').map(escRe).join('(.*?)');
  return new RegExp(anchored ? `^${body}$` : body, anchored ? 's' : 'g');
}
for (const [en, th] of Object.entries(TH)) {
  if (!en.includes('{}')) { exact.set(en, th); continue; }
  const p = { re: compile(en, true), out: th, strong: en.replace(/\{\}/g, '').length >= STRONG };
  if (en.startsWith('{}')) anyPatterns.push(p);
  else { const k = en[0]; if (!patterns.has(k)) patterns.set(k, []); patterns.get(k)!.push(p); }
}
// Most specific (longest literal text) first, so "Dropped by {}. Merchants…" wins over "Dropped {}.".
const literal = (p: Pattern) => p.re.source.replace(/\(\.\*\?\)/g, '').length;
anyPatterns.sort((a, b) => literal(b) - literal(a));
for (const list of patterns.values()) list.sort((a, b) => literal(b) - literal(a));
for (const [en, th] of Object.entries(TH_FRAGMENTS).sort((a, b) => b[0].length - a[0].length)) fragments.push({ re: compile(en, false), out: th, strong: true });

/** Put the captured values into the Thai text; each value is translated too (names stay as they are). */
function fill(out: string, groups: string[], depth: number): string {
  let i = 0;
  return out.replace(/\{(\d*)\}/g, (_, n: string) => {
    const g = groups[n === '' ? i++ : Number(n)] ?? '';
    return depth < 5 ? translatePadded(g, depth + 1) : exact.get(g.trim()) ?? g;
  });
}

function tryPatterns(list: Pattern[] | undefined, s: string, depth: number, strong: boolean): string | null {
  if (!list) return null;
  for (const p of list) { if (p.strong !== strong) continue; const m = p.re.exec(s); if (m) return fill(p.out, m.slice(1), depth); }
  return null;
}

function translateLine(s: string, depth = 0): string {
  const hit = exact.get(s) ?? tryPatterns(patterns.get(s[0]), s, depth, true) ?? tryPatterns(anyPatterns, s, depth, true);
  if (hit !== null) return hit;
  if (depth < 4) {
    for (const sep of ['\n', '  ·  ', ' · ', ' — ', ', ', ' / ']) {
      if (s.includes(sep)) return s.split(sep).map((x) => translatePadded(x, depth + 1)).join(sep);
    }
  }
  const weak = tryPatterns(patterns.get(s[0]), s, depth, false) ?? tryPatterns(anyPatterns, s, depth, false);
  if (weak !== null) return weak;
  let out = s;
  for (const f of fragments) { f.re.lastIndex = 0; out = out.replace(f.re, (...m) => fill(f.out, m.slice(1, -2) as string[], 3)); }
  return out;
}

/** Keeps leading/trailing whitespace and translates the rest. */
function translatePadded(s: string, depth = 0): string {
  const m = /^([\s·]*(?:\d+\.\s+)?)([\s\S]*?)(\s*)$/.exec(s)!;
  if (!m[2] || !/[A-Za-z]/.test(m[2])) return s;
  return m[1] + translateLine(m[2], depth) + m[3];
}

const cache = new Map<string, string>();
/** Translate one piece of UI text into the current language. */
export function t(s: string): string {
  if (lang === 'en' || !s) return s;
  let r = cache.get(s);
  if (r === undefined) {
    r = translatePadded(s);
    if (cache.size > 20000) cache.clear();
    cache.set(s, r);
  }
  return r;
}

// ---------------------------------------------------------------- DOM
const original = new WeakMap<Node, string>();
const shown = new WeakMap<Node, string>();
const ATTRS = ['placeholder', 'title'] as const;
const attrOriginal = new WeakMap<Element, Record<string, string>>();

function skip(el: Element | null): boolean {
  return !!el?.closest('[data-noi18n], .m-chat, script, style, textarea');
}

function doText(n: Text) {
  const cur = n.nodeValue ?? '';
  if (shown.get(n) === cur) return; // our own write
  original.set(n, cur);
  if (skip(n.parentElement)) return;
  const tr = t(cur);
  shown.set(n, tr);
  if (tr !== cur) n.nodeValue = tr;
}

function doAttrs(el: Element) {
  if (skip(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const rec = attrOriginal.get(el) ?? {};
    if (rec[`${a}:shown`] === v) continue;
    rec[a] = v;
    const tr = t(v);
    rec[`${a}:shown`] = tr;
    attrOriginal.set(el, rec);
    if (tr !== v) el.setAttribute(a, tr);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skip(el)) return;
  doAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text); else doAttrs(n as Element);
  }
}

function restore(root: Node) {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const o = original.get(n);
      if (o !== undefined && n.nodeValue !== o && shown.get(n) === n.nodeValue) n.nodeValue = o;
      shown.delete(n);
    } else {
      const rec = attrOriginal.get(n as Element);
      if (rec) for (const a of ATTRS) if (rec[a] && (n as Element).getAttribute(a) === rec[`${a}:shown`]) (n as Element).setAttribute(a, rec[a]);
      attrOriginal.delete(n as Element);
    }
  }
}

let observer: MutationObserver | null = null;
/** Switch the language and re-translate (or restore) everything on screen. */
export function setLang(next: Lang, root?: Node) {
  if (next === lang && (next === 'en' || observer)) return;
  lang = next;
  cache.clear();
  if (typeof document === 'undefined') return; // tests / server: text only
  root ??= document.body;
  document.documentElement.lang = next;
  if (next === 'en') { observer?.disconnect(); observer = null; restore(root); return; }
  walk(root);
  if (observer) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}
