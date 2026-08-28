#!/usr/bin/env node
// Synthesizes data/gtfs-rail — the Overground's six named lines and the
// Elizabeth line — from the TfL Unified API. BODS carries the Underground,
// the DLR, the Tramlink and the cable car, but these seven are National Rail
// and missing there. The API's Route/Sequence gives ORDERED station lists per
// branch; that order is the whole point — the shapes it also returns are
// station-to-station chords and are never written (the HMM draws the line on
// OSM tracks from the stop sequence, the Rio rail treatment).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/gtfs-rail');
mkdirSync(OUT, { recursive: true });

const LINES = [
  { id: 'elizabeth', apiId: 'elizabeth', name: 'Elizabeth line', color: '6950A1' },
  { id: 'liberty', apiId: 'liberty', name: 'Liberty', color: '606667' },
  { id: 'lioness', apiId: 'lioness', name: 'Lioness', color: 'FAA61A' },
  { id: 'mildmay', apiId: 'mildmay', name: 'Mildmay', color: '0077AD' },
  { id: 'suffragette', apiId: 'suffragette', name: 'Suffragette', color: '5BBD72' },
  { id: 'weaver', apiId: 'weaver', name: 'Weaver', color: '893B67' },
  { id: 'windrush', apiId: 'windrush', name: 'Windrush', color: 'D22730' },
];

const get = async (path) => {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch('https://api.tfl.gov.uk' + path, { headers: { 'User-Agent': 'transit-maps (personal project)' } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch {}
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  throw new Error('TfL API failed: ' + path);
};

const stops = new Map(); // naptan -> {name, lat, lon}
const routesRows = [], tripRows = [], stRows = [];
const csv = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

for (const L of LINES) {
  routesRows.push([L.id, 'TFLRAIL', L.name, '', '2', L.color, 'FFFFFF']);
  let branches = 0;
  for (const dir of ['outbound', 'inbound']) {
    const seq = await get(`/Line/${L.apiId}/Route/Sequence/${dir}`);
    if (!seq) { console.log(`  ${L.name} ${dir}: 404`); continue; }
    for (const st of seq.stations || []) {
      if (!stops.has(st.id)) stops.set(st.id, { name: st.name.replace(/ Rail Station| Underground Station/g, ''), lat: st.lat, lon: st.lon });
    }
    const byId = new Map((seq.stopPointSequences || []).flatMap((s) => s.stopPoint || []).map((sp) => [sp.id, sp]));
    for (const [bi, route] of (seq.orderedLineRoutes || []).entries()) {
      const ids = (route.naptanIds || []).filter((id) => stops.has(id) || byId.has(id));
      if (ids.length < 2) continue;
      for (const id of ids) {
        if (!stops.has(id)) { const sp = byId.get(id); stops.set(id, { name: (sp.name || id).replace(/ Rail Station| Underground Station/g, ''), lat: sp.lat, lon: sp.lon }); }
      }
      const tripId = `${L.id}-${dir}-${bi}`;
      tripRows.push([L.id, 'WD', tripId, route.name || '', dir === 'inbound' ? '1' : '0']);
      ids.forEach((id, i) => {
        const t = `${String(6 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`;
        stRows.push([tripId, t, t, id, String(i + 1)]);
      });
      branches++;
    }
  }
  console.log(`  ${L.name}: ${branches} branches`);
}

writeFileSync(join(OUT, 'agency.txt'), 'agency_id,agency_name,agency_url,agency_timezone\nTFLRAIL,Transport for London,https://tfl.gov.uk,Europe/London\n');
writeFileSync(join(OUT, 'routes.txt'), 'route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color\n' + routesRows.map((r) => r.map(csv).join(',')).join('\n') + '\n');
writeFileSync(join(OUT, 'calendar.txt'), 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWD,1,1,1,1,1,1,1,20260101,20271231\n');
writeFileSync(join(OUT, 'trips.txt'), 'route_id,service_id,trip_id,trip_headsign,direction_id\n' + tripRows.map((r) => r.map(csv).join(',')).join('\n') + '\n');
writeFileSync(join(OUT, 'stop_times.txt'), 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' + stRows.map((r) => r.join(',')).join('\n') + '\n');
writeFileSync(join(OUT, 'stops.txt'), 'stop_id,stop_name,stop_lat,stop_lon\n' + [...stops.entries()].map(([id, s]) => [id, csv(s.name), s.lat, s.lon].join(',')).join('\n') + '\n');
console.log(`gtfs-rail: ${routesRows.length} lines, ${tripRows.length} branch trips, ${stops.size} stations`);
