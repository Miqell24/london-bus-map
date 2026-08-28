# Mexico City Public Transport — interactive map

Interactive, poster-grade map of the public transport of **Mexico City**: the
concessioned corridors and RTP buses, the STE trolleybuses, the Metrobús BRT,
the Metro, the Tren Ligero, the Cablebús gondolas and the two commuter
railways — 289 lines / 8 422 km drawn along the real street and track geometry.

## Live

**https://miqell24.github.io/mexico-city-bus-map/** — GitHub Pages from `main:/docs`. Local build on port 8160 (`npm run serve`).

One bundle, every operator, told apart by `agency_id`:

| category | operators | lines | drawn |
|---|---|---|---|
| buses (navy) | corredores concesionados `C…`, RTP `R…`, Pumabús `P1–P13` | 251 | 7 206 km |
| **trolleybuses (green)** | STE `T1–T13` | 12 | 310 km |
| Metrobús BRT (amber) | `B1–B7`, `BSL01` | 8 | 291 km |
| rail & gondola | Metro `M1–M9, MA, MB, M12` · Tren Ligero `TL` · Cablebús `CB1–CB3` · Suburbano `FS` · Tren El Insurgente `TI` | 18 | 615 km |

**The trolleybuses are the reason to read the legend.** SEMOVI files eleven of
the twelve as ordinary `route_type` 3 buses — only Línea 13, the elevated one,
carries the proper trolleybus type — so the feed alone would draw the whole STE
network as diesel. Here they are picked out by `agency_id` (`TROLE`, plus
SEMOVI's TR13) and drawn in the family's trolleybus green. Note the snapshot
this build reads predates Líneas 11 (Santa Marta – Chalco) and 14 (Cetram
Huipulco – Cetram Universidad), which the operator now runs as well.

Seven operators here number their lines from 1 — Metro 1, Metrobús 1, Trolebús
1, Cablebús 1, the Tren Ligero, the Suburbano and the Tren El Insurgente all
exist — so every key carries its operator's initial. RTP's four
"Ordinario1 L1"…"Ordinario4 L1" routes are one line under four service names
and collapse into `RL1`; its Expreso/Nochebús twins merge with their ordinary
run for the same reason.

The **Cablebús** rides the same machinery as the Metro even though it is not on
rails: OSM maps its three lines as `aerialway=gondola`, and `cfg.railExtra` lets
them into the rail graph (a cabin follows its cable exactly, so the match is
1.6–25 m).

## Where the data comes from

SEMOVI's GTFS on **datos.cdmx.gob.mx** — which is unreachable from outside
Mexico. Every request times out; the Mobility Database says so in its own
words ("temporarily redirecting to old, expired feed version because the new
feed version is geo-fenced") and transit.land's fetcher logs
`dial tcp 189.240.234.183:443: i/o timeout` against the same URL. So this map
reads the last complete copy the Mobility Database managed to mirror: feed
**mdb-1830**, a snapshot of the 16.02.2026 file taken on 09.03.2026.
`pipeline/download.sh` tries the producer first every time and only falls back
to the mirror — the day datos.cdmx.gob.mx answers again, a rerun picks up the
current file.

Matching: 3.51 m mean across 564 line-directions, worst 24.8 m (a Cablebús
cable). Residue: 30 poles dropped as farther than 200 m from every line calling
there, and RTP's `R163-B` comes out in two pieces 11 km apart — its Expreso and
Nochebús variants are different corridors under one number.

## Two views

The panel's **Corridors / Lines** switch redraws the same data two ways.
*Corridors* is one stroke per roadway in the category colours, with the amber
Metrobús dashed over navy where they share a street. *Lines* draws every line
on its own — up to four coloured strands side by side, anything busier as one
grey trunk with its numbers beside it (`npm run lines`, checked by
`npm run audit`). 82 % of the 6 689 roadway runs carry four lines or fewer; the
widest trunk gathers 34. No network diagram for this city yet.

## Pipeline

`npm run download` fetches the GTFS, OSM roadways and the rail/gondola network
(Overpass) and MapLibre GL. `npm run build` map-matches every line (HMM/Viterbi
on the OSM graphs) and writes GeoJSON to `data/out/`; `npm run lines` adds the
line-by-line view, `npm run audit` checks it. `npm run serve` hosts the map at
http://localhost:8160.

Data: GTFS SEMOVI Ciudad de México (CC BY, via mobilitydatabase.org) · base map
© OpenFreeMap / OpenMapTiles / OpenStreetMap contributors.
