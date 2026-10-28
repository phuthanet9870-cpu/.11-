// Key names used in keybinds. Shift + a digit is stored as "shift+1" (keyboard-layout independent).
export function keyFromEvent(e: KeyboardEvent): string {
  if (e.shiftKey && /^Digit\d$/.test(e.code)) return `shift+${e.code.slice(5)}`;
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}
