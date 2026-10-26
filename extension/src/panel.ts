// The panel Britto shows on a store's product page. Lives in a CLOSED shadow root so the
// store's CSS cannot restyle it and the store's scripts cannot read it. All store-supplied
// text goes in through textContent.
import type { Extracted, StoreId } from '../../core/types.ts';
import { date, pct, rupees } from '../../web/api.js';
import { drawChart } from '../../web/chart.js';
import type { Reply } from './messages.ts';

declare const BRITTO_API: string;
/** 'closed' in every real build; 'open' only in the test build so a browser test can read the panel. */
declare const BRITTO_SHADOW: 'open' | 'closed';

const CSS = `
:host { all: initial; }
.box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 340px; max-width: calc(100vw - 32px);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: var(--panel);
  border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18); overflow: hidden;
  --bg: #f7f6f2; --panel: #fff; --ink: #17171a; --muted: #5d5d66; --line: #e3e1da; --accent: #0f6b5c; --on-accent: #fff;
  --good: #11734b; --good-bg: #e6f4ec; --bad: #a33a1c; --bad-bg: #fbece6; --neutral-bg: #f0efe9; --gap: #f1d9cf; }
@media (prefers-color-scheme: dark) { .box { --bg: #121315; --panel: #1b1c1f; --ink: #ecebe6; --muted: #a2a1a8; --line: #2c2d31;
  --accent: #4cc3a9; --on-accent: #08201b; --good: #6fd39f; --good-bg: #16291f; --bad: #f08c6c; --bad-bg: #2d1a14; --neutral-bg: #222327; --gap: #3a2620; } }
.head { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 14px; border-bottom: 1px solid var(--line); }
.logo { font-weight: 700; } .logo span { color: var(--accent); }
.mini { flex: 1; min-width: 0; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button { font: inherit; border: 0; background: var(--neutral-bg); color: var(--ink); border-radius: 6px; padding: 2px 9px; cursor: pointer; }
.body { padding: 12px 14px 14px; display: grid; gap: 10px; }
.box.collapsed .body { display: none; }
.price { font-size: 24px; font-weight: 800; } .mrp { color: var(--muted); margin-left: 8px; font-size: 13px; }
.card { border-radius: 8px; padding: 8px 10px; background: var(--neutral-bg); }
.card b { display: block; } .card.good { background: var(--good-bg); } .card.good b { color: var(--good); }
.card.bad { background: var(--bad-bg); } .card.bad b { color: var(--bad); }
.small { font-size: 12px; color: var(--muted); }
.note { font-size: 13px; border-left: 3px solid var(--accent); padding-left: 8px; }
.chart-host { position: relative; }
.chart { width: 100%; height: auto; display: block; }
.chart .grid { stroke: var(--line); } .chart .axis { fill: var(--muted); font-size: 11px; }
.chart .line { fill: none; stroke: var(--accent); stroke-width: 2.5; }
.chart .gap { fill: var(--gap); opacity: .6; } .chart .low { fill: var(--good); }
.chart .cursor { stroke: var(--muted); stroke-dasharray: 3 3; }
.tip { position: absolute; top: 4px; background: var(--ink); color: var(--bg); font-size: 12px; padding: 3px 7px; border-radius: 6px; pointer-events: none; white-space: nowrap; }
[hidden] { display: none !important; }
a.go { display: inline-block; background: var(--accent); color: var(--on-accent); text-decoration: none; font-weight: 600; padding: 7px 12px; border-radius: 8px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
`;

const VERDICT_CLASS: Record<string, string> = { buy: 'good', wait: 'bad' };
const SALE: Record<string, [string, string]> = {
  real_drop: ['Real price drop', 'good'],
  hike_then_drop: ['Raised, then “dropped”', 'bad'],
  no_real_drop: ['No real drop', ''],
  too_early: ['Too early to check this sale', ''],
  unavailable: ['Not on sale: unavailable', ''],
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function renderPanel(store: StoreId) {
  document.querySelector('britto-panel')?.remove();
  const host = document.createElement('britto-panel');
  const root = host.attachShadow({ mode: BRITTO_SHADOW });
  const style = el('style');
  style.textContent = CSS;
  const box = el('div', 'box');
  box.setAttribute('role', 'complementary');
  box.setAttribute('aria-label', 'Britto price history');
  const head = el('div', 'head');
  const logo = el('span', 'logo', 'Brit');
  logo.append(el('span', '', 'to'));
  const mini = el('span', 'mini', 'Checking the price…');
  const toggle = el('button', '', '–');
  toggle.title = 'Collapse';
  toggle.addEventListener('click', () => {
    const collapsed = box.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '+' : '–';
    toggle.title = collapsed ? 'Expand' : 'Collapse';
  });
  const close = el('button', '', '×');
  close.title = 'Hide on this page';
  close.addEventListener('click', () => host.remove());
  head.append(logo, mini, toggle, close);
  const body = el('div', 'body');
  box.append(head, body);
  root.append(style, box);
  document.documentElement.append(host);

  return {
    loading() {
      body.replaceChildren(el('p', 'small', `Reading this ${store === 'amazon' ? 'Amazon' : store === 'flipkart' ? 'Flipkart' : 'Myntra'} page…`));
    },

    show(reply: Reply, ex: Extracted, problem: string | null) {
      body.replaceChildren();
      if (problem) {
        body.append(el('p', 'note', problem));
        const save = el('button', '', 'Save this page for Britto (stays on your computer)');
        save.addEventListener('click', () => savePage(store));
        body.append(save);
      }
      if (!reply.ok) {
        if (reply.code !== 'not_tracked') body.append(el('p', 'small', reply.message));
        mini.textContent = problem ? 'Price not read' : 'Britto is unreachable';
        return;
      }
      const v = reply.product;
      const s = v.stats;
      const priceNow = s.inStock === false ? 'Out of stock' : rupees(s.current ?? ex.price);
      mini.textContent = `${priceNow} · ${v.verdict.headline.split(':')[0]}`;

      const priceRow = el('div');
      priceRow.append(el('span', 'price', priceNow));
      if (s.currentMrp && s.current && s.currentMrp > s.current) {
        const m = el('span', 'mrp', 'M.R.P. ');
        m.append(el('s', '', rupees(s.currentMrp)));
        priceRow.append(m);
      }
      body.append(priceRow);

      if (reply.recorded === 'hold') {
        body.append(el('p', 'note', `This page shows ${rupees(ex.price)}, far from the last price we know. It will appear once another shopper sees the same.`));
      }

      const verdict = el('div', `card ${VERDICT_CLASS[v.verdict.kind] ?? ''}`);
      verdict.append(el('b', '', v.verdict.headline), el('span', 'small', v.verdict.reasons[0] ?? ''));
      const [saleTitle, saleClass] = SALE[v.sale.status] ?? ['', ''];
      const sale = el('div', `card ${saleClass}`);
      sale.append(el('b', '', saleTitle), el('span', 'small', v.sale.explanation));
      body.append(verdict, sale);

      if (v.points.length) {
        const chart = el('div', 'chart-host');
        body.append(chart);
        drawChart(chart, v, 0);
      }
      const facts = [
        s.lowest ? `Lowest ${rupees(s.lowest.price)} (${date(s.lowest.at)})` : null,
        s.median != null ? `Usual ${rupees(s.median)}` : null,
        v.sale.claimedPct != null ? `Claims ${pct(v.sale.claimedPct)} off M.R.P.` : null,
      ].filter(Boolean).join(' · ');
      if (facts) body.append(el('p', 'small', facts));

      const row = el('div', 'row');
      const go = el('a', 'go', 'Full history on Britto');
      go.href = `${BRITTO_API}/p/${encodeURIComponent(v.key)}`;
      go.target = '_blank';
      go.rel = 'noopener';
      const bell = el('a', 'go', 'Set a price alert');
      bell.href = `${BRITTO_API}/p/${encodeURIComponent(v.key)}#alert`;
      bell.target = '_blank';
      bell.rel = 'noopener';
      row.append(go, bell, el('span', 'small', s.trackedSince ? `Tracking since ${date(s.trackedSince)}` : ''));
      body.append(row);
    },
  };
}

/** Save the page as an .html file in Downloads, so a reader for it can be built. Nothing is uploaded. */
function savePage(store: StoreId): void {
  const blob = new Blob(['<!-- saved by the Britto extension from ', location.href.replace(/--/g, ''), ' -->\n', document.documentElement.outerHTML], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `britto-page-${store}-${Date.now()}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
