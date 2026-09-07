// Splits the BODS "Tram" routes into the four Tramlink routes the network
// runs (user, 7.09.2026): BODS publishes the Croydon trams as TWO routes,
// both short-named "Tram", with no headsigns and no long names — the route
// lives only in the termini of each trip's stop sequence. This rewrites
// data/gtfs/routes.txt and trips.txt in place (idempotent):
//   1  Elmers End – West Croydon        (early mornings and late evenings)
//   2  Beckenham Junction – West Croydon (the feed runs them through to Wimbledon)
//   3  New Addington – Wimbledon
//   4  Elmers End – Wimbledon (via Therapia Lane)
// A trip is keyed by its two termini: New Addington → 3, Beckenham Junction
// → 2, Elmers End → 1 when the other end is the Croydon loop (Church Street /
// West Croydon) and 4 when it is Wimbledon; the Wimbledon – East Croydon and
// Therapia / Beddington Lane short workings fall to 3, the route they are
// short workings of. Called by download.sh after the unzip; build.mjs keys
// the result T1–T4 and prints the bare number.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { iterCsv, readCsv } from './lib/csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GD = join(ROOT, 'data/gtfs');
const log = (m) => console.log(`[tramlink] ${m}`);

const routes = await readCsv(join(GD, 'routes.txt'));
if (routes.some((r) => r.route_id === 'TRAM1')) { log('already split'); process.exit(0); }
const tramIds = new Set(routes.filter((r) => (r.route_type || '').trim() === '0').map((r) => r.route_id));
if (!tramIds.size) { log('no route_type 0 routes — nothing to do'); process.exit(0); }
const agency = routes.find((r) => tramIds.has(r.route_id)).agency_id;

const stopName = new Map();
for await (const s of iterCsv(join(GD, 'stops.txt'))) stopName.set(s.stop_id, (s.stop_name || '').replace(/ Tram Stop$/i, '').trim());

const tramTrips = new Set();
for await (const t of iterCsv(join(GD, 'trips.txt'))) if (tramIds.has(t.route_id)) tramTrips.add(t.trip_id);
log(`${tramIds.size} BODS tram routes, ${tramTrips.size} trips`);

const first = new Map(), last = new Map();
for await (const st of iterCsv(join(GD, 'stop_times.txt'))) {
  if (!tramTrips.has(st.trip_id)) continue;
  const q = Number(st.stop_sequence);
  const f = first.get(st.trip_id);
  if (!f || q < f[0]) first.set(st.trip_id, [q, st.stop_id]);
  const l = last.get(st.trip_id);
  if (!l || q > l[0]) last.set(st.trip_id, [q, st.stop_id]);
}
const routeOf = (tripId) => {
  const a = stopName.get(first.get(tripId)?.[1]) || '', b = stopName.get(last.get(tripId)?.[1]) || '';
  const S = new Set([a, b]);
  if (S.has('New Addington')) return '3';
  if (S.has('Beckenham Junction')) return '2';
  if (S.has('Elmers End')) return (S.has('Church Street') || S.has('West Croydon')) ? '1' : '4';
  return '3';
};

// routes.txt: the two "Tram" rows become four
const NAMES = { 1: 'Elmers End - West Croydon', 2: 'Beckenham Junction - West Croydon', 3: 'New Addington - Wimbledon', 4: 'Elmers End - Wimbledon' };
const routesRaw = readFileSync(join(GD, 'routes.txt'), 'utf8');
const header = routesRaw.split(/\r?\n/)[0];
const cols = header.split(',');
const kept = routesRaw.split(/\r?\n/).slice(1).filter((line) => line && !tramIds.has(line.split(',')[0]));
const mk = (n) => cols.map((c) => ({
  route_id: 'TRAM' + n, agency_id: agency, route_short_name: String(n), route_long_name: NAMES[n], route_type: '0',
}[c] ?? '')).join(',');
writeFileSync(join(GD, 'routes.txt'), [header, ...kept, ...[1, 2, 3, 4].map(mk)].join('\n') + '\n');

// trips.txt: route_id remapped per trip
const tripsRaw = readFileSync(join(GD, 'trips.txt'), 'utf8').split(/\r?\n/);
const th = tripsRaw[0].split(',');
const iRoute = th.indexOf('route_id'), iTrip = th.indexOf('trip_id');
const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
const out = tripsRaw.map((line, i) => {
  if (i === 0 || !line) return line;
  const f = line.split(',');
  if (!tramIds.has(f[iRoute])) return line;
  const n = routeOf(f[iTrip]);
  counts[n]++;
  f[iRoute] = 'TRAM' + n;
  return f.join(',');
});
writeFileSync(join(GD, 'trips.txt'), out.join('\n'));
log(`trips per route: 1 → ${counts[1]}, 2 → ${counts[2]}, 3 → ${counts[3]}, 4 → ${counts[4]}`);
