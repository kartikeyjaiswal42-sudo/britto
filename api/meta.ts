// Link previews (WhatsApp, Telegram, X, LinkedIn): those apps read a page's <head> without running
// its script, so every Britto link showed the same "Britto: price history…" card. The Worker now
// writes the page's own title, description and Open Graph tags into the shell (web/index.html)
// before sending it: for a product (/p/<key>), its name, its price now and the usual price, and
// its picture. Every value is escaped; nothing else in the page changes.
import { formatRupees } from '../core/money.ts';
import { STORES } from '../core/stores.ts';
import type { ProductRow } from './db.ts';

export interface Meta { title: string; description: string; image: string | null; url: string }

export const DEFAULT_META = {
  title: 'Britto: price history and real discounts',
  description: 'Price history, honest discount checks and price-drop alerts for Amazon, Flipkart and Myntra.',
};

const PAGES: Record<string, { title: string; description: string }> = {
  '/travel': { title: 'Compare flight, hotel and ride prices | Britto', description: 'One search, every site: the Britto Android app reads the fares MakeMyTrip, ixigo, Goibibo, EaseMyTrip, Booking.com, Cleartrip and Uber show on your phone and lists them side by side.' },
  '/deals': { title: 'Real price drops today | Britto', description: 'Products whose price today is below their own usual price, not below an inflated M.R.P.' },
  '/app': { title: 'The Britto Android app', description: 'Price history inside Flipkart, Myntra and grocery pages, fare and hotel compare, and price-drop alerts on your phone.' },
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The page's meta: path is the request path; product is the row for /p/<key> (or null). */
export function metaFor(path: string, origin: string, product: ProductRow | null): Meta {
  const url = `${origin}${path}`;
  const title = product?.title?.replace(/\s+/g, ' ').trim();
  if (path.startsWith('/p/') && product && title) {
    const store = STORES[product.store]?.name ?? 'the store';
    const parts = [product.price != null ? `${formatRupees(product.price)} now on ${store}` : `On ${store}`];
    if (product.usual_price != null && product.price != null && product.usual_price !== product.price) parts.push(`usually ${formatRupees(product.usual_price)}`);
    const image = product.image && /^https:\/\/[^\s"'<>]+$/.test(product.image) ? product.image : null;
    return {
      title: `${clip(title, 90)} | Britto`,
      description: `${parts.join(', ')}. Its price history and whether today’s discount is real, on Britto.`,
      image,
      url,
    };
  }
  const page = PAGES[path.replace(/\/$/, '')] ?? DEFAULT_META;
  return { ...page, image: null, url };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The shell with the page's title, description and Open Graph tags written in. */
export function withMeta(html: string, meta: Meta): string {
  const og = [
    ['og:type', 'website'], ['og:site_name', 'Britto'], ['og:title', meta.title], ['og:description', meta.description], ['og:url', meta.url],
    ...(meta.image ? [['og:image', meta.image]] : []),
  ].map(([p, c]) => `<meta property="${p}" content="${esc(c!)}">`);
  og.push(`<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">`);
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(meta.description)}">`)
    .replace('</head>', () => `  ${og.join('\n  ')}\n</head>`);
}
