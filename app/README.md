# Plotwise: Bangkok ย.10 plot feasibility + 3D massing

Draw a plot in zone ย.10 (Bangkok), set the road width, pick a building type. The engine computes what the
rules allow (floor area, allowed space, setbacks, parking) and three designs, and an independent checker
measures each design against 12 rules. **Simple** mode gives a verdict in plain words; **Expert** shows the
checks with clause citations and the proof on the 3D model.

A feasibility study, not a design. An architect must check and sign.

## Run

```powershell
bun install
bun run dev                 # http://localhost:3000/tool?demo=1   (#mode=expert for Expert)
bun run test; bun run lint; bun run build
bun run data:stations       # rebuild public/data/bkk-rail-stations.geojson
```

`?perf=1` (also in a production build) logs engine timings to `window.__plotwisePerf`.

## Layout

- `src/engine`: pure engine (rules from `src/rules/bangkok-y10.json`), designs, independent checker, Simple
  helpers (units, density, verdict / what-ifs), Web Worker entry.
- `src/site`: tile-based site context, engine worker client (latest job wins).
- `src/map`: MapLibre + terra-draw view and layers.
- `src/ui`: Simple and Expert panels.

## Next (not in v1)

- **More than one plot.** Combine neighbouring parcels into one site, or compare separate plots side by side.
- Overpass as a second site-context source (tiles only today).
- Zones other than ย.10.
- **Rule inspector.** A panel that opens any rule with its full clause text, the numbers it set on this plot and every check that uses it. Cut from v1; today each check row links its clause, and `research/RULES.md` has the text.
