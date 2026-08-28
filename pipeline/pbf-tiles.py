#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cuts the missing OSM tiles out of a Geofabrik .pbf — same JSON shape as
Overpass ('elements': ways with tags + geometry), so build.mjs cannot tell the
difference. Used when Overpass is too congested to serve the 5×5 grid."""
import json, os, sys, re
import osmium

ROOT = os.path.join(os.path.dirname(__file__), '..')
PBF = os.path.join(ROOT, 'data', 'england-latest.osm.pbf')

S, N, W, E = 51.10, 51.78, -0.70, 0.45
HW = re.compile(r'^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|busway|construction|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$')
RAIL = re.compile(r'^(subway|light_rail|rail|tram|construction)$')
AERIAL = re.compile(r'^(gondola|cable_car)$')
# rails tile r6 (east London + Essex fringe)
R6 = (51.45, 51.82, 0.013333333333333197, 0.55)

road_tiles = {}
for i in range(1, 26):
    f = os.path.join(ROOT, f'data/osm/tiles/t{i}.json')
    if os.path.exists(f):
        continue
    row, col = (i - 1) // 5, (i - 1) % 5
    road_tiles[i] = (S + (N - S) * row / 5, S + (N - S) * (row + 1) / 5,
                     W + (E - W) * col / 5, W + (E - W) * (col + 1) / 5)
need_r6 = not os.path.exists(os.path.join(ROOT, 'data/osm/rail-tiles/r6.json'))
print('brakujące kafle dróg:', sorted(road_tiles), '| r6:', need_r6, flush=True)
if not road_tiles and not need_r6:
    sys.exit(0)

out = {i: [] for i in road_tiles}
out_r6 = []

class H(osmium.SimpleHandler):
    def way(self, w):
        tags = w.tags
        hw = tags.get('highway')
        rw = tags.get('railway')
        aw = tags.get('aerialway')
        is_road = hw is not None and HW.match(hw)
        is_rail = need_r6 and ((rw is not None and RAIL.match(rw)) or (aw is not None and AERIAL.match(aw)))
        if not is_road and not is_rail:
            return
        geom = []
        ids = []
        la0, la1, lo0, lo1 = 90.0, -90.0, 180.0, -180.0
        for n in w.nodes:
            try:
                lo, la = n.lon, n.lat
            except osmium.InvalidLocationError:
                continue
            # node ids ride along: buildGraph() builds topology from el.nodes
            # and SILENTLY skips ways without them (the t13 hole, 28.08.2026)
            ids.append(n.ref)
            geom.append({'lat': la, 'lon': lo})
            if la < la0: la0 = la
            if la > la1: la1 = la
            if lo < lo0: lo0 = lo
            if lo > lo1: lo1 = lo
        if len(geom) < 2:
            return
        el = None
        def make():
            nonlocal el
            if el is None:
                el = {'type': 'way', 'id': w.id, 'nodes': ids,
                      'tags': {t.k: t.v for t in tags}, 'geometry': geom}
            return el
        if is_road:
            for i, (s, n_, w_, e) in road_tiles.items():
                if la1 >= s and la0 <= n_ and lo1 >= w_ and lo0 <= e:
                    out[i].append(make())
        if is_rail:
            s, n_, w_, e = R6
            if la1 >= s and la0 <= n_ and lo1 >= w_ and lo0 <= e:
                out_r6.append(make())

H().apply_file(PBF, locations=True, idx='sparse_mem_array')

for i, els in out.items():
    f = os.path.join(ROOT, f'data/osm/tiles/t{i}.json')
    if os.path.exists(f):
        print(f't{i}: już jest (Overpass zdążył)', flush=True); continue
    json.dump({'version': 0.6, 'generator': 'pbf-tiles.py (Geofabrik england-latest)', 'elements': els}, open(f, 'w'))
    print(f't{i}: {len(els)} dróg', flush=True)
if need_r6:
    f = os.path.join(ROOT, 'data/osm/rail-tiles/r6.json')
    if not os.path.exists(f):
        json.dump({'version': 0.6, 'generator': 'pbf-tiles.py (Geofabrik england-latest)', 'elements': out_r6}, open(f, 'w'))
        print(f'r6: {len(out_r6)} szyn', flush=True)
print('gotowe', flush=True)
