// Small, allocation-light HTML helpers. Workers on the free plan get 10 ms of CPU per
// invocation, so pages are never parsed into a DOM: we find the one element we need by
// its id and walk only its own subtree.

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('#x')) return safeCodePoint(parseInt(lower.slice(2), 16)) ?? whole;
    if (lower.startsWith('#')) return safeCodePoint(parseInt(lower.slice(1), 10)) ?? whole;
    return NAMED[lower] ?? whole;
  });
}

function safeCodePoint(n: number): string | null {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : null;
}

/** Visible text of an HTML fragment: scripts, styles and comments dropped, whitespace collapsed. */
export function textOf(html: string): string {
  const noCode = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  return decodeEntities(noCode.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'wbr']);

/**
 * Outer HTML of the element carrying id="…", or null. Only a real attribute counts:
 * the `id="` must sit inside a tag, preceded by whitespace — "dtu":"…" in a JSON blob
 * does not match. Nested script/style/comment bodies are skipped while matching tags,
 * so a "</div>" inside inline JavaScript cannot end the element early.
 */
export function elementById(html: string, id: string, from = 0): string | null {
  const needle = `id="${id}"`;
  let at = html.indexOf(needle, from);
  while (at !== -1) {
    const open = html.lastIndexOf('<', at);
    const prevClose = html.lastIndexOf('>', at);
    const before = html.charCodeAt(at - 1);
    const isAttr = open > prevClose && (before === 32 || before === 10 || before === 9 || before === 13);
    if (isAttr) return elementFrom(html, open);
    at = html.indexOf(needle, at + needle.length);
  }
  return null;
}

/** Outer HTML of the element whose opening tag starts at `start` ("<div …"). */
export function elementFrom(html: string, start: number): string | null {
  const head = /^<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/.exec(html.slice(start, start + 4000));
  if (!head || head[1] === undefined) return null;
  const tag = head[1].toLowerCase();
  const headEnd = start + head[0].length;
  if (VOID.has(tag) || head[2] === '/') return html.slice(start, headEnd);

  const re = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/gi;
  re.lastIndex = headEnd;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const name = m[3]?.toLowerCase();
    if (!name || name !== tag) continue;
    if (m[2] === '/') depth--;
    else if (m[4] !== '/') depth++;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return null; // unbalanced: refuse rather than return half a page
}

/** The opening tag of the element carrying id="…", without needing the element to be complete. */
export function openingTagById(html: string, id: string): string | null {
  const at = html.indexOf(`id="${id}"`);
  if (at === -1) return null;
  const open = html.lastIndexOf('<', at);
  const end = html.indexOf('>', at);
  return open === -1 || end === -1 ? null : html.slice(open, end + 1);
}

/** The opening tag of an element (everything up to its first ">"). */
export function openingTag(elementHtml: string): string {
  const end = elementHtml.indexOf('>');
  return end === -1 ? elementHtml : elementHtml.slice(0, end + 1);
}

/** Value of one attribute on an opening tag, entity-decoded; null when absent. */
export function attr(tagHtml: string, name: string): string | null {
  const re = new RegExp(`\\s${name.replace(/[-]/g, '\\-')}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const m = re.exec(openingTag(tagHtml));
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? '');
}

/**
 * Inner text of the first element (inside `scope`) whose class list contains every
 * given class. Class order and extra classes do not matter.
 */
export function textOfClass(scope: string, ...classes: string[]): string | null {
  const el = elementWithClass(scope, ...classes);
  return el == null ? null : textOf(el);
}

export function elementWithClass(scope: string, ...classes: string[]): string | null {
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\sclass\s*=\s*"([^"]*)"[^>]*>/g;
  for (let m = re.exec(scope); m; m = re.exec(scope)) {
    const list = (m[2] ?? '').split(/\s+/);
    if (classes.every((c) => list.includes(c))) return elementFrom(scope, m.index);
  }
  return null;
}
