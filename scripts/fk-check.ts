import { readFileSync } from 'node:fs';
import { readPage } from '../core/interpret.ts';
const cfg = JSON.parse(readFileSync('readers/flipkart.mobile.json', 'utf8'));
const html = readFileSync(process.argv[2], 'utf8');
const url = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/.exec(html)?.[1] ?? /britto-saved-from:\s*(\S+)/.exec(html)?.[1] ?? '';
console.log('canonical/url', url.slice(0, 120));
console.log(JSON.stringify(readPage(cfg, html, url)).slice(0, 400));
console.log('jsonld blocks', (html.match(/application\/ld\+json/g) ?? []).length);
