// Single-file build: dist-portable/Veyloria.html works when opened straight from disk (file://),
// where browsers block module scripts loaded from files and canvas drawing of image files.
// The script, the styles and every art image (as data URLs) are put inside the HTML.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'dist-portable');
execSync('npx vite build --mode portable', { cwd: root, stdio: 'inherit' });

let html = readFileSync(join(out, 'index.html'), 'utf8');
const asset = (p) => readFileSync(join(out, p.replace(/^\.\//, '')), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>${asset(href)}</style>`); // (function replacements: the code contains `$` patterns)
let script = '';
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => { script = asset(src); return ''; });

const art = {};
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.webp')) art[relative(join(root, 'public/art'), p).replace(/\\/g, '/').replace(/\.webp$/, '')] = `data:image/webp;base64,${readFileSync(p).toString('base64')}`;
  }
};
walk(join(root, 'public/art'));
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
html = html.replace('</body>', () => `<script>window.__VEYLORIA_ART=${safe(JSON.stringify(art))};</script>\n<script type="module">${safe(script)}</script>\n</body>`);
writeFileSync(join(out, 'Veyloria.html'), html);
rmSync(join(out, 'index.html'));
rmSync(join(out, 'assets'), { recursive: true, force: true });
console.log(`dist-portable/Veyloria.html — ${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB, ${Object.keys(art).length} images inside`);
