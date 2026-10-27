// Builds web/airports.json from OurAirports (https://ourairports.com/data/: "All data is
// released to the Public Domain"). Kept: airports with an IATA code and scheduled service,
// every one in India plus the world's large airports. Run: node scripts/airports.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'airports.json');

/** RFC 4180 rows: quoted fields may hold commas, doubled quotes and newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${SOURCE}: ${res.status}`);
  const [head, ...rows] = parseCsv(await res.text());
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const keep = rows.filter((r) => /^[A-Z]{3}$/.test(r[col.iata_code] ?? '') && r[col.scheduled_service] === 'yes'
    && (r[col.type] === 'large_airport' || r[col.type] === 'medium_airport')
    && (r[col.iso_country] === 'IN' || r[col.type] === 'large_airport'));
  const airports = keep.map((r) => [r[col.iata_code], r[col.name], r[col.municipality], r[col.iso_country],
    Math.round(Number(r[col.latitude_deg]) * 1e4) / 1e4, Math.round(Number(r[col.longitude_deg]) * 1e4) / 1e4])
    .sort((a, b) => (a[3] === 'IN') === (b[3] === 'IN') ? a[0].localeCompare(b[0]) : a[3] === 'IN' ? -1 : 1);
  const body = { source: SOURCE, licence: 'Public Domain (OurAirports)', fetched: new Date().toISOString().slice(0, 10), fields: ['iata', 'name', 'city', 'country', 'lat', 'lng'], airports };
  writeFileSync(OUT, JSON.stringify(body) + '\n');
  console.log(`${airports.length} airports (${airports.filter((a) => a[3] === 'IN').length} in India) -> ${OUT} (${JSON.stringify(body).length} bytes)`);
}
