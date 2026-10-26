// Price-history chart: an SVG step line, because a price HOLDS until it changes.
// Out-of-stock stretches are drawn as gaps with a shaded band, never interpolated.
import { date, rupees } from './api.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** Spans from change points; the last holds until lastCheckedAt (never "now"). */
export function toSpans(points, lastCheckedAt) {
  const out = [];
  points.forEach((p, i) => {
    const to = points[i + 1]?.at ?? Math.max(lastCheckedAt ?? p.at, p.at);
    out.push({ from: p.at, to, price: p.inStock ? p.price : null });
  });
  return out;
}

export function drawChart(host, view, rangeDays) {
  host.textContent = '';
  const all = toSpans(view.points, view.stats.lastCheckedAt);
  if (!all.length) {
    host.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'No prices recorded yet.' }));
    return;
  }
  const end = all[all.length - 1].to;
  const start = rangeDays ? Math.max(all[0].from, end - rangeDays * 86_400_000) : all[0].from;
  // A product seen once has a zero-length span. It must still draw: give the axis an hour
  // and stretch the last span to it. (Filtering on `to > start` blanked exactly the chart
  // a shopper sees right after adding a product — caught in real Chrome.)
  const t0 = start;
  const t1 = end > start ? end : start + 3_600_000;
  const spans = all
    .filter((s) => s.to > start || (s.to === start && s === all[all.length - 1]))
    .map((s, i, arr) => ({ ...s, from: Math.max(s.from, start), to: i === arr.length - 1 ? Math.max(s.to, t1) : s.to }));

  // Draw at the host's real width so axis text stays 12px on a phone instead of shrinking.
  const W = Math.max(300, Math.round(host.clientWidth - 16) || 720), H = W < 340 ? 150 : W < 500 ? 220 : 260, L = 60, R = 12, T = 14, B = 30;
  const prices = spans.map((s) => s.price).filter((p) => p != null);
  let lo = Math.min(...prices), hi = Math.max(...prices);
  if (!prices.length) { lo = 0; hi = 1; }
  const pad = Math.max((hi - lo) * 0.15, hi * 0.03, 100);
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (p) => T + (1 - (p - lo) / (hi - lo)) * (H - T - B);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Price history' });
  for (let i = 0; i <= 3; i++) {
    const p = lo + ((hi - lo) * i) / 3;
    svg.append(el('line', { x1: L, x2: W - R, y1: y(p), y2: y(p), class: 'grid' }));
    const label = el('text', { x: L - 8, y: y(p) + 4, 'text-anchor': 'end', class: 'axis' });
    label.textContent = rupees(Math.round(p / 100) * 100);
    svg.append(label);
  }
  // Under a day of history (incl. the 1 h stretch a single reading gets) one date says it all.
  const ticks = date(t0) === date(t1) || end - start < 86_400_000 ? [t0] : W < 500 ? [t0, t1] : [t0, (t0 + t1) / 2, t1];
  for (const t of ticks) {
    const label = el('text', { x: x(t), y: H - 8, 'text-anchor': t === t0 ? 'start' : t === t1 ? 'end' : 'middle', class: 'axis' });
    label.textContent = date(t);
    svg.append(label);
  }
  for (const s of spans) {
    if (s.price == null) svg.append(el('rect', { x: x(s.from), y: T, width: Math.max(1, x(s.to) - x(s.from)), height: H - T - B, class: 'gap' }));
  }
  let d = '';
  let prev = null;
  for (const s of spans) {
    if (s.price == null) { prev = null; continue; }
    d += prev == null ? `M${x(s.from)},${y(s.price)}` : `V${y(s.price)}`;
    d += `H${Math.max(x(s.to), x(s.from) + 2)}`;
    prev = s.price;
  }
  svg.append(el('path', { d, class: 'line' }));
  const low = view.stats.lowest;
  if (low && low.at >= t0) svg.append(el('circle', { cx: x(low.at), cy: y(low.price), r: 4, class: 'low' }));

  const cursor = el('line', { y1: T, y2: H - B, class: 'cursor', visibility: 'hidden' });
  svg.append(cursor);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  svg.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const t = t0 + ((px - L) / (W - L - R)) * (t1 - t0);
    const s = spans.find((sp) => t >= sp.from && t <= sp.to);
    if (!s || px < L) { tip.hidden = true; cursor.setAttribute('visibility', 'hidden'); return; }
    cursor.setAttribute('x1', px); cursor.setAttribute('x2', px); cursor.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.textContent = `${s.price == null ? 'Out of stock' : rupees(s.price)} · ${date(t)}`;
    tip.style.left = `${Math.min(Math.max(0, e.clientX - box.left - 60), box.width - 140)}px`;
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cursor.setAttribute('visibility', 'hidden'); });
  host.append(svg, tip);
}
