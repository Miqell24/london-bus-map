#!/usr/bin/env bash
# Downloads input data: the BODS GTFS, the TfL rail synthesis, OSM (Overpass),
# MapLibre GL. Everything is cached — re-running only fetches what is missing.
#
# London: DfT's Bus Open Data Service publishes a regional GTFS for "london"
# that carries every TfL-contracted bus AND the Underground, DLR, Tramlink and
# cable car (OGL v3). The Overground and the Elizabeth line are National Rail,
# absent there — pipeline/rail-feed.mjs synthesizes them from the TfL API.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/gtfs data/osm/tiles web/vendor

BODS="https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/london/"

ok_json () { # $1=file  $2=minimum element count
  python3 - "$1" "$2" <<'PYEOF' 2>/dev/null
import json, sys
try:
    sys.exit(0 if len(json.load(open(sys.argv[1])).get("elements", [])) >= int(sys.argv[2]) else 1)
except Exception:
    sys.exit(1)
PYEOF
}

overpass () { # $1=outfile  $2=query  $3=minimum element count
  local out="$1" q="$2" floor="$3" round wait
  for round in 1 2 3 4 5 6 7 8; do
    for EP in "https://overpass-api.de/api/interpreter" \
              "https://maps.mail.ru/osm/tools/overpass/api/interpreter" \
              "https://overpass.kumi.systems/api/interpreter" \
              "https://overpass.private.coffee/api/interpreter"; do
      echo "-- round $round: $EP"
      if curl -fsS --max-time 1800 -o "$out" --data-urlencode "data=$q" "$EP" && ok_json "$out" "$floor"; then
        return 0
      fi
      rm -f "$out"
    done
    wait=$((round * 45))
    echo "-- all mirrors busy, waiting ${wait}s"
    sleep "$wait"
  done
  echo "Overpass: all mirrors failed for $out" >&2
  return 1
}

# 1) GTFS — the BODS regional bundle
if [ ! -f data/gtfs/routes.txt ]; then
  echo "== GTFS (BODS london) → data/gtfs =="
  curl -fL --retry 3 --max-time 1200 -A "Mozilla/5.0" -o data/bods-london.zip "$BODS"
  unzip -o data/bods-london.zip -d data/gtfs
fi

# 1b) the Overground + Elizabeth line, synthesized from the TfL API
if [ ! -f data/gtfs-rail/routes.txt ]; then
  echo "== TfL rail synthesis → data/gtfs-rail =="
  node pipeline/rail-feed.mjs
fi

# 2) OSM roads — Greater London and its fringe towns (Watford, Slough, Epsom,
#    Dorking, Brentwood), 5 × 5 tiles: one 80 × 75 km box always times out
if [ ! -f data/osm/tiles/t25.json ]; then
  echo "== Overpass (roads, 25 tiles) =="
  S=51.10; N=51.78; W=-0.70; E=0.45
  i=0
  for row in 0 1 2 3 4; do
    for col in 0 1 2 3 4; do
      i=$((i+1))
      f="data/osm/tiles/t$i.json"
      [ -f "$f" ] && continue
      s=$(python3 -c "print($S+($N-$S)*$row/5)")
      n=$(python3 -c "print($S+($N-$S)*($row+1)/5)")
      w=$(python3 -c "print($W+($E-$W)*$col/5)")
      e=$(python3 -c "print($W+($E-$W)*($col+1)/5)")
      echo "-- tile $i: $s,$w,$n,$e"
      overpass "$f" \
        "[out:json][timeout:1800][maxsize:2000000000];way($s,$w,$n,$e)[\"highway\"~\"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|busway|construction|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$\"];out geom;" 200
    done
  done
fi

# 2b) OSM rails — wider than the roads (the Elizabeth line runs to Reading,
#     -0.97 W), but one box of railway=rail over the south-east is more than
#     any mirror returns — 3 × 2 tiles, plus the cable car (aerialway)
if [ ! -f data/osm/rail-tiles/r6.json ]; then
  echo "== Overpass (rails, 6 tiles + cable car) =="
  mkdir -p data/osm/rail-tiles
  RS=51.08; RN=51.82; RW=-1.06; RE=0.55
  i=0
  for row in 0 1; do
    for col in 0 1 2; do
      i=$((i+1))
      f="data/osm/rail-tiles/r$i.json"
      [ -f "$f" ] && continue
      s=$(python3 -c "print($RS+($RN-$RS)*$row/2)")
      n=$(python3 -c "print($RS+($RN-$RS)*($row+1)/2)")
      w=$(python3 -c "print($RW+($RE-$RW)*$col/3)")
      e=$(python3 -c "print($RW+($RE-$RW)*($col+1)/3)")
      echo "-- rail tile $i: $s,$w,$n,$e"
      overpass "$f" \
        "[out:json][timeout:1800][maxsize:2000000000];(way($s,$w,$n,$e)[\"railway\"~\"^(subway|light_rail|rail|tram|construction)$\"];way($s,$w,$n,$e)[\"aerialway\"~\"^(gondola|cable_car)$\"];);out geom;" 50
    done
  done
fi

# 3) MapLibre GL (vendored, no CDN at runtime)
if [ ! -f web/vendor/maplibre-gl.js ]; then
  echo "== MapLibre GL =="
  curl -fL --retry 3 -o web/vendor/maplibre-gl.js  https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js
  curl -fL --retry 3 -o web/vendor/maplibre-gl.css https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css
fi

echo "OK — data ready:"
du -sh data/gtfs data/osm/*.json 2>/dev/null || true
