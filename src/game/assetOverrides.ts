// File-backed asset lookups shared by the Phaser loader and the HTML UI.
const files = new Map<string, string>();

export function setFileOverrides(entries: { key: string; file: string }[]) {
  files.clear();
  for (const e of entries) files.set(e.key, `assets/${e.file}`);
}

/** URL of real artwork for an asset key, or null when the placeholder is used. */
export function fileUrlFor(key: string): string | null {
  return files.get(key) ?? null;
}
