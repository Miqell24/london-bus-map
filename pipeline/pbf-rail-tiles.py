#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cuts the MISSING rail tiles r1-r6 (the 3 x 2 grid download.sh queries
from Overpass: 51.08-51.82 N, -1.06-0.55 E, rails plus the cable car) out of
the Geofabrik england-latest.osm.pbf, in the Overpass JSON shape with node
ids. Written 7.09.2026 when no mirror answered any of the six for an hour;
pbf-tiles.py only ever knew r6."""
import json, os, re, sys
import osmium
ROOT = os.path.join(os.path.dirname(__file__), '..')
PBF = os.path.join(ROOT, 'data', 'england-latest.osm.pbf')
RS, RN, RW, RE = 51.08, 51.82, -1.06, 0.55
RAIL = re.compile(r'^(subway|light_rail|rail|tram|construction)$')
AERIAL = re.compile(r'^(gondola|cable_car)$')
tiles = {}
i = 0
for row in (0, 1):
    for col in (0, 1, 2):
        i += 1
        f = os.path.join(ROOT, f'data/osm/rail-tiles/r{i}.json')
        if os.path.exists(f):
            continue
        tiles[i] = (RS + (RN - RS) * row / 2, RS + (RN - RS) * (row + 1) / 2, RW + (RE - RW) * col / 3, RW + (RE - RW) * (col + 1) / 3)
print('brakujace kafle szyn:', sorted(tiles), flush=True)
if not tiles:
    sys.exit(0)
os.makedirs(os.path.join(ROOT, 'data/osm/rail-tiles'), exist_ok=True)
out = {i: [] for i in tiles}

class H(osmium.SimpleHandler):
    def way(self, w):
        tags = w.tags
        rw, aw = tags.get('railway'), tags.get('aerialway')
        if not ((rw is not None and RAIL.match(rw)) or (aw is not None and AERIAL.match(aw))):
            return
        geom, ids = [], []
        la0, la1, lo0, lo1 = 90.0, -90.0, 180.0, -180.0
        for n in w.nodes:
            try:
                lo, la = n.lon, n.lat
            except osmium.InvalidLocationError:
                continue
            ids.append(n.ref); geom.append({'lat': la, 'lon': lo})
            if la < la0: la0 = la
            if la > la1: la1 = la
            if lo < lo0: lo0 = lo
            if lo > lo1: lo1 = lo
        if len(geom) < 2 or la1 < RS or la0 > RN or lo1 < RW or lo0 > RE:
            return
        el = None
        for i, (s, n_, w_, e) in tiles.items():
            if la1 >= s and la0 <= n_ and lo1 >= w_ and lo0 <= e:
                if el is None:
                    el = {'type': 'way', 'id': w.id, 'nodes': ids, 'tags': {t.k: t.v for t in tags}, 'geometry': geom}
                out[i].append(el)

print('czytam', os.path.basename(PBF), flush=True)
H().apply_file(PBF, locations=True, idx='flex_mem')
for i, els in out.items():
    json.dump({'version': 0.6, 'generator': 'pbf-rail-tiles.py (Geofabrik england-latest)', 'elements': els}, open(os.path.join(ROOT, f'data/osm/rail-tiles/r{i}.json'), 'w'))
    print(f'r{i}: {len(els)} ways', flush=True)
print('gotowe', flush=True)
