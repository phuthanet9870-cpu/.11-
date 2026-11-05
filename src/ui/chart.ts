// Small price chart drawn on a canvas: line + soft area, grid, min/max and
// the latest value; green when the price went up over the period, red when down.
export interface ChartPoint { label: string; value: number }

export function drawPriceChart(canvas: HTMLCanvasElement, points: ChartPoint[], opts: { unit?: string; mini?: boolean } = {}) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (points.length < 2) {
    ctx.fillStyle = '#8a8296'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(opts.mini ? '' : 'No data yet', W / 2, H / 2);
    return;
  }
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { hi += 1; lo = Math.max(0, lo - 1); }
  const padL = opts.mini ? 1 : 44, padR = opts.mini ? 1 : 8, padT = opts.mini ? 2 : 10, padB = opts.mini ? 2 : 18;
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const up = vals[vals.length - 1] >= vals[0];
  const col = up ? '#6fe08a' : '#ff6a6a';
  if (!opts.mini) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.fillStyle = '#9a90a8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    for (let k = 0; k <= 3; k++) {
      const v = lo + ((hi - lo) * k) / 3, yy = y(v);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillText(Math.round(v).toLocaleString(), padL - 4, yy + 3);
    }
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.round(points.length / 6));
    for (let i = 0; i < points.length; i += step) ctx.fillText(points[i].label, x(i), H - 4);
    ctx.fillText(points[points.length - 1].label, x(points.length - 1) - 8, H - 4);
  }
  // Area + line.
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.value)) : ctx.moveTo(x(i), y(p.value))));
  ctx.lineTo(x(points.length - 1), H - padB); ctx.lineTo(x(0), H - padB); ctx.closePath();
  ctx.fillStyle = up ? 'rgba(111,224,138,0.15)' : 'rgba(255,106,106,0.15)'; ctx.fill();
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.value)) : ctx.moveTo(x(i), y(p.value))));
  ctx.strokeStyle = col; ctx.lineWidth = opts.mini ? 1.5 : 2; ctx.stroke();
  if (!opts.mini) {
    const lx = x(points.length - 1), ly = y(vals[vals.length - 1]);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill();
  }
}
