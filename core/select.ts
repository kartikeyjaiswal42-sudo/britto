// CSS selectors over raw HTML, without building a DOM. Every client (Worker, extension, app)
// reads pages as HTML text through this one engine, so they cannot disagree about what a
// selector means. The Worker has 10 ms of CPU per request: a selector that starts with an
// #id jumps straight to that element and scans only inside it.
//
// Supported (anything else is refused by parseSelector, so a recipe cannot silently mean
// something else): type `div` / `*`, `#id`, `.class`, `[attr]`, `[attr=v]`, `[attr~=v]`,
// `[attr^=v]`, `[attr$=v]`, `[attr*=v]`, `[attr|=v]` (values quoted or bare), and the
// descendant (space) and child (`>`) combinators. No pseudo-classes, siblings or commas:
// a recipe's fallbacks are separate Field entries, not a selector list.
import { decodeEntities, elementFrom } from './html.ts';

export interface AttrTest { name: string; op: '' | '=' | '~=' | '^=' | '$=' | '*=' | '|='; value: string }
export interface Compound { tag: string | null; id: string | null; classes: string[]; attrs: AttrTest[] }
/** combinators[i] joins parts[i] and parts[i + 1]. */
export interface Complex { parts: Compound[]; combinators: (' ' | '>')[] }

export class SelectorError extends Error {}

const IDENT = /^-?[A-Za-z_][\w-]*/;

export function parseSelector(text: string): Complex {
  const src = text.trim();
  if (!src) throw new SelectorError('empty selector');
  const parts: Compound[] = [];
  const combinators: (' ' | '>')[] = [];
  let i = 0;
  const fail = (why: string): never => { throw new SelectorError(`${why} at ${i} in "${src}"`); };
  const ident = (): string => {
    const m = IDENT.exec(src.slice(i));
    if (!m) fail('expected a name');
    i += m![0].length;
    return m![0];
  };
  while (i < src.length) {
    const c: Compound = { tag: null, id: null, classes: [], attrs: [] };
    if (src[i] === '*') i++;
    else if (/[A-Za-z]/.test(src[i]!)) c.tag = ident().toLowerCase();
    for (;;) {
      const ch = src[i];
      if (ch === '#') { i++; if (c.id) fail('two ids'); c.id = ident(); }
      else if (ch === '.') { i++; c.classes.push(ident()); }
      else if (ch === '[') {
        i++;
        const m = /^\s*([A-Za-z_][\w:-]*)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*\]/.exec(src.slice(i));
        if (!m) fail('bad attribute test');
        c.attrs.push({ name: m![1]!.toLowerCase(), op: (m![2] ?? '') as AttrTest['op'], value: m![3] ?? m![4] ?? m![5] ?? '' });
        i += m![0].length;
      } else break;
    }
    if (!c.tag && !c.id && !c.classes.length && !c.attrs.length && src[i - 1] !== '*') fail('expected a selector');
    parts.push(c);
    const ws = /^\s*/.exec(src.slice(i))![0].length;
    i += ws;
    if (i >= src.length) break;
    if (src[i] === '>') { combinators.push('>'); i++; i += /^\s*/.exec(src.slice(i))![0].length; }
    else if (ws > 0) combinators.push(' ');
    else fail(`unsupported "${src[i]}"`);
  }
  if (combinators.length !== parts.length - 1) fail('dangling combinator');
  return { parts, combinators };
}

/** Parse every attribute of an opening tag, quoted, single-quoted or bare. Names lower-cased. */
export function parseAttrs(openTag: string): Map<string, string> {
  const out = new Map<string, string>();
  const body = openTag.replace(/^<[A-Za-z][\w:-]*/, '').replace(/\/?>$/, '');
  const re = /([^\s"'=<>\/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const name = m[1]!.toLowerCase();
    if (!out.has(name)) out.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  }
  return out;
}

interface El { tag: string; open: string; start: number; parent: El | null; attrs?: Map<string, string> }
const attrsOf = (el: El) => (el.attrs ??= parseAttrs(el.open));

function matchCompound(el: El, c: Compound): boolean {
  if (c.tag && c.tag !== el.tag) return false;
  if (!c.id && !c.classes.length && !c.attrs.length) return true;
  const a = attrsOf(el);
  if (c.id && a.get('id') !== c.id) return false;
  if (c.classes.length) {
    const list = (a.get('class') ?? '').split(/\s+/);
    if (!c.classes.every((k) => list.includes(k))) return false;
  }
  for (const t of c.attrs) {
    const v = a.get(t.name);
    if (v === undefined) return false;
    switch (t.op) {
      case '': break;
      case '=': if (v !== t.value) return false; break;
      case '~=': if (!v.split(/\s+/).includes(t.value)) return false; break;
      case '^=': if (!t.value || !v.startsWith(t.value)) return false; break;
      case '$=': if (!t.value || !v.endsWith(t.value)) return false; break;
      case '*=': if (!t.value || !v.includes(t.value)) return false; break;
      case '|=': if (v !== t.value && !v.startsWith(`${t.value}-`)) return false; break;
    }
  }
  return true;
}

function matches(el: El, sel: Complex, i: number): boolean {
  if (!matchCompound(el, sel.parts[i]!)) return false;
  if (i === 0) return true;
  if (sel.combinators[i - 1] === '>') return el.parent !== null && matches(el.parent, sel, i - 1);
  for (let a = el.parent; a; a = a.parent) if (matches(a, sel, i - 1)) return true;
  return false;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param']);
// Raw-text elements: their content is never markup. noscript counts, as in a browser with
// scripting on (which is what the extension and app read).
const RAW = new Set(['script', 'style', 'noscript', 'textarea', 'title', 'template', 'xmp']);
// Elements a browser closes implicitly when a sibling of the same kind opens.
const SELF_SIBLING = new Set(['li', 'option', 'p', 'dt', 'dd', 'tr', 'td', 'th']);

const closers = new Map<string, RegExp>();
/** Offset of the first `</name` (any case) at or after `from`, or -1. Never lowercases the page. */
function closeTagAt(html: string, name: string, from: number): number {
  let re = closers.get(name);
  if (!re) closers.set(name, (re = new RegExp(`</${name}(?=[\\s/>])`, 'gi')));
  re.lastIndex = from;
  return re.exec(html)?.index ?? -1;
}

const TAG = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\?[^>]*>|<(\/?)([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

export interface Found {
  /** Offset of the element's "<" in the HTML. */
  start: number;
  tag: string;
  /** The opening tag as written, e.g. `<div id="a" class="b">`. */
  open: string;
  attrs: Map<string, string>;
}

/** First element (document order) matching `sel`, scanning html[from, to). */
function scan(html: string, sel: Complex, from: number, to: number): Found | null {
  TAG.lastIndex = from;
  let top = null as El | null;
  for (let m = TAG.exec(html); m && m.index < to; m = TAG.exec(html)) {
    const name = m[2]?.toLowerCase();
    if (!name) continue; // comment, doctype, processing instruction
    if (m[1] === '/') {
      for (let e: El | null = top; e; e = e.parent) if (e.tag === name) { top = e.parent; break; }
      continue;
    }
    if (SELF_SIBLING.has(name) && top?.tag === name) top = top.parent;
    const el: El = { tag: name, open: m[0], start: m.index, parent: top };
    if (matches(el, sel, sel.parts.length - 1)) return { start: el.start, tag: el.tag, open: el.open, attrs: attrsOf(el) };
    const selfClosing = /\/\s*>$/.test(m[0]);
    if (RAW.has(name)) {
      const close = closeTagAt(html, name, TAG.lastIndex);
      if (close === -1) return null; // the rest of the text is this element's content
      TAG.lastIndex = close;
      top = el; // the close tag pops it
    } else if (!VOID.has(name) && !selfClosing) {
      top = el;
    }
  }
  return null;
}

/**
 * Is `pos` inside a script, style or noscript body, or a comment? Those hold text, not markup:
 * a browser never matches an id written inside them. Lower-case tags only (browsers serialise
 * lower-case). <noscript> is looked for only in the 20 KB before `pos`: pages have few, short
 * ones, and an unbounded backward search for a rare tag cost ~0.12 ms per lookup on a real
 * Amazon page (measured), many times per reading. A fake id inside a noscript that opened
 * more than 20 KB earlier would be missed.
 */
function insideRawText(html: string, pos: number): boolean {
  if (html.lastIndexOf('<!--', pos) > html.lastIndexOf('-->', pos)) return true;
  const opens = (src: string, t: string, at: number) => {
    let open = src.lastIndexOf(`<${t}`, at);
    while (open !== -1 && !/[\s>/]/.test(src[open + t.length + 1] ?? '')) open = src.lastIndexOf(`<${t}`, open - 1);
    return open;
  };
  for (const t of ['script', 'style']) {
    const open = opens(html, t, pos);
    if (open !== -1 && open > html.lastIndexOf(`</${t}`, pos)) return true;
  }
  const from = Math.max(0, pos - 20_000);
  const window = html.slice(from, pos);
  const open = opens(window, 'noscript', window.length);
  return open !== -1 && open > window.lastIndexOf('</noscript');
}

/**
 * Positions (in document order) of elements carrying an id attribute equal to `id`: quoted
 * (`id="x"`, `id='x'`) or bare (`id=x`), never inside JSON, scripts or comments. Lazy: the
 * caller usually stops at the first, so the page is not scanned past it.
 */
function* idPositions(html: string, id: string): Generator<number> {
  for (let at = html.indexOf(id); at !== -1; at = html.indexOf(id, at + id.length)) {
    const q = html[at - 1];
    const after = html[at + id.length] ?? '';
    let attrStart: number;
    if (q === '"' || q === "'") {
      if (after !== q) continue;
      attrStart = at - 4;
    } else if (q === '=') {
      if (!/[\s>/]/.test(after)) continue;
      attrStart = at - 3;
    } else continue;
    if (html.slice(attrStart, attrStart + 3).toLowerCase() !== 'id=') continue;
    const before = html.charCodeAt(attrStart - 1);
    if (before !== 32 && before !== 10 && before !== 9 && before !== 13) continue;
    const open = html.lastIndexOf('<', at);
    if (open > html.lastIndexOf('>', at) && !insideRawText(html, open)) yield open;
  }
}

const cache = new Map<string, Complex>();
export function compile(selector: string): Complex {
  let c = cache.get(selector);
  if (!c) {
    c = parseSelector(selector);
    if (cache.size > 500) cache.clear();
    cache.set(selector, c);
  }
  return c;
}

/**
 * The first element matching `selector` in document order, or null. When the selector's
 * first part names an #id, only the inside of that element is scanned (the fast path; the
 * answer is the same, because every match must lie inside it).
 */
export function selectFirst(html: string, selector: string | Complex): Found | null {
  const sel = typeof selector === 'string' ? compile(selector) : selector;
  const head = sel.parts[0]!;
  if (!head.id) return scan(html, sel, 0, html.length);
  for (const start of idPositions(html, head.id)) {
    if (sel.parts.length === 1) {
      const hit = scan(html, sel, start, start + 1);
      if (hit) return hit;
      continue;
    }
    // Scan the whole element when it is complete; on a cut-off page, to the end of the text.
    const outer = elementFrom(html, start);
    const hit = scan(html, sel, start, outer ? start + outer.length : html.length);
    if (hit) return hit;
  }
  return null;
}

/** Outer HTML of a found element, or null when the page ends before it closes. */
export function outerOf(html: string, found: Found): string | null {
  if (RAW.has(found.tag)) {
    // Raw text (a script's JSON, say) is never markup: end at the first closing tag.
    const close = closeTagAt(html, found.tag, found.start + found.open.length);
    const end = close === -1 ? -1 : html.indexOf('>', close);
    return end === -1 ? null : html.slice(found.start, end + 1);
  }
  return elementFrom(html, found.start);
}

/** Inner HTML of a found element (raw source between its tags), or null when incomplete. */
export function innerOf(html: string, found: Found): string | null {
  const outer = outerOf(html, found);
  if (outer == null) return null;
  if (VOID.has(found.tag) || /\/\s*>$/.test(found.open)) return '';
  const end = outer.toLowerCase().lastIndexOf(`</${found.tag}`);
  return end === -1 ? null : outer.slice(found.open.length, end);
}
