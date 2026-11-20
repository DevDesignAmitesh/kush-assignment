# Build Plan v1: "Plotwise Bangkok" (plot feasibility + 3D massing, zone ย.10)

> Read this whole file before writing code. It is the spec. If something here conflicts with
> `research/RULES.md`, **RULES.md wins** for law, this file wins for engineering.
> Deadline: **2026-11-21 09:19 UTC (14:49 IST)**. Submissions close then. Check with the
> `time_left` MCP tool (with the email the assignment was started with).

---

## 0. Context in 60 seconds (for a fresh session)

- Assignment: General Machines / Silicon Bricks, "Founding Team Engineer, Generalist". Full brief: `ASSIGNMENT_BRIEF.md`.
- A Bangkok developer owns a plot. Before paying an architect they want: **what can I build, how big, how tall, what could it look like.**
- Build a **browser tool**: draw any plot on a real map → choose the road it faces + building type → see
  1. the **rules that apply** (FAR, open space, setbacks, height), each with its legal clause,
  2. the **allowed space** (3D envelope) that follows the plot's real outline,
  3. **at least 2 concept designs** that fit, each with a **pass/fail checklist**,
  all in **3D among the real surrounding buildings and roads**, updating **live** (no reload).
- Scope: **one zone, ย.10** (very-high-density residential, Bangkok Comprehensive Plan 2013). Primary building type **condo**; also **office** and **hotel** so "change building type" visibly changes rules.
- The judges "will try to break it". Accuracy and robustness matter more than features.
- Law research is DONE and locked: `research/RULES.md` (human) and `research/rules/bangkok-y10.json` (machine). Do not re-research; load the JSON.

## 1. Tech stack (from Amitesh's portfolio/résumé: TypeScript everywhere, Next.js, React, Tailwind, Bun, Canvas)

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | his default on every project |
| Framework | **Next.js (App Router)**, one page, client-rendered map (`dynamic(..., { ssr: false })`) | his main frontend framework |
| Package manager / runner | **Bun** (`bun install`, `bun run dev`, `bun test` not used; see testing) | his runtime of choice |
| Styling | **Tailwind CSS** | on his résumé |
| Map + 3D | **MapLibre GL JS** with `fill-extrusion` layers | free, no API key, WebGL, handles 3D extrusions of thousands of buildings smoothly; no three.js needed because every solid we draw is a stack of extruded polygons (see §4.4) |
| Base map tiles | **OpenFreeMap** style (`https://tiles.openfreemap.org/styles/positron`), its own building layer hidden | free, no key, OSM data |
| Plot drawing/editing | **terra-draw** + `terra-draw-maplibre-gl-adapter` | draw polygon, drag vertices, live change events |
| Polygon math | **polygon-clipping** (boolean ops) + own small helpers (capsule buffer, shoelace area, distances) in local metres | exact, fast, small; we control every formula |
| State | **zustand** (one store) | tiny; avoids prop-drilling between map and panels |
| Tests | **vitest** for the engine | engine is pure functions and must be proven correct |
| Site data | **Overpass API** (OSM buildings + roads, fetched on demand) + pre-baked JSON for demo sites | real surroundings; fallback if Overpass is slow/down |
| Running | **Locally only** for v1: `bun run dev` (development) and `bun run build && bun run start` (production check) on `http://localhost:3000` | v1 focus is a working local version; no deployment, no GitHub |

Pin versions at install time (`bun add <pkg>`), keep `bun.lock`. No backend server and no database: everything runs in the browser. Data files are static in `public/data/`.

## 2. Repo layout

```
E:\kush-assignment\            ← project root (local folder)
  ASSIGNMENT_BRIEF.md  ASSIGNMENT_DESCRIPTION.md  BUILD_PLAN.md  CLAUDE.md
  research\                    ← keep: shows the thinking (RULES.md, sources, logs)
  app\                         ← the Next.js project (cd app)
    package.json  next.config.ts  tsconfig.json  vitest.config.ts
    public\data\
      bkk-zoning-2556.geojson     (copy of research/data, 1.4 MB, lazy-loaded)
      bkk-rail-stations.geojson   (BTS/MRT/ARL/SRT Red stations, built by script)
      demo-ari.json, demo-thonglor.json  (pre-baked OSM buildings+roads, fallback)
    scripts\
      fetch-stations.ts           (Overpass → stations geojson, run once)
      bake-demo-site.ts           (Overpass → demo json, run once per site)
    src\
      app\page.tsx  app\layout.tsx  app\globals.css
      rules\bangkok-y10.json      (copy of research/rules; imported, typed)
      rules\types.ts              (TS types for the JSON)
      engine\                     ← PURE, no DOM, no MapLibre. 100% unit-tested.
        geo.ts          projection lon/lat ↔ local metres, area, perimeter, distances
        polygon.ts      capsule buffer, difference, inset (negative buffer), validity
        classify.ts     building class (low-rise / high-rise / extra-large) + gates
        setbacks.ts     per-edge setback for a given floor height & class
        envelope.ts     allowed space = per-floor slices
        designs\
          terracedBlock.ts   (Design A)
          podiumTower.ts     (Design B)
          lowRise.ts         (Design C)
          common.ts          floor heights, programme (units/rooms/parking)
        checker.ts      INDEPENDENT pass/fail checks from final geometry
        areaStatement.ts
        index.ts        computeAll(inputs) → { rules, envelope, designs[], checks[] }
      site\
        overpass.ts     fetch buildings/roads around plot, cache, fallback
        zone.ts         point-in-polygon zone lookup
        stations.ts     distance to nearest station
      map\
        MapView.tsx     MapLibre init, layers, terra-draw
        layers.ts       source/layer definitions (context, plot, setbacks, envelope, design)
      ui\
        InputsPanel.tsx  RulesPanel.tsx  DesignCards.tsx  Checklist.tsx
        AreaTable.tsx    RuleInspector.tsx  Legend.tsx  Toolbar.tsx
      store.ts           zustand store; URL-hash sync
    tests\  (vitest: engine/*.test.ts)
```

## 3. Inputs (exactly what the user controls)

| Input | UI | Default | Notes |
|---|---|---|---|
| **Plot** | Draw polygon on map (click vertices, double-click to finish). Drag vertices to edit. "Demo plot" button loads a sample in Ari. | demo plot | any shape, ≥ 3 vertices; reject self-intersections with a clear message |
| **Zone** | Auto from plot centroid via `bkk-zoning-2556.geojson`; badge "ย.10 · FAR 8 · OSR 4 %" | auto | if not ย.10: banner "This v1 covers zone ย.10 only. This plot is in ย.X." and results disabled (show the zone's FAR/OSR from the secondary table greyed, labelled unverified). If plot spans zones: use the zone covering the largest share, show warning |
| **Road edge(s)** | Click a plot edge to toggle "faces road". Auto-suggest: the edge nearest an OSM `highway` line gets pre-selected | auto-suggested | ≥ 1 road edge required; multiple allowed (corner plot) |
| **Road width (right-of-way, m)** per road edge | number input + slider 3-60 m. Prefill from OSM `width` tag, else class default (see §5.3), labelled "estimate, please confirm" | from OSM | the most impactful input; drives setback, sky plane, high-rise gate |
| **Building type** | segmented control: Condo / Office / Hotel | Condo | changes open-space %, parking, use limits, efficiency |
| **FAR bonus** | checkboxes (ข้อ 52-56) with % inputs, total capped at 20 % | none | show "max FAR 8 → 9.6" live |
| **Assumptions** (collapsible) | floor-to-floor heights, avg unit size, efficiency, parking m²/stall, permeable share, "count parking in FAR" | see §6.1 | every assumption visible and editable; nothing hidden |

All inputs live in the zustand store and are mirrored to the URL hash (base64 JSON), so a link reproduces the exact scenario.

## 4. Engine (the core; get this right first)

### 4.1 Coordinates
- Work in **local metres**. Origin = plot centroid (lon0, lat0).
  `x = (lon − lon0) · 111320 · cos(lat0)`, `y = (lat − lat0) · 110574`. Error < 0.1 % within 1 km. Bangkok is ~13.7° N.
- Convert back for rendering. Never do area/distance in degrees.
- Normalise plot ring: closed, counter-clockwise, remove duplicate/collinear vertices (< 0.05 m).

### 4.2 Building class (decides which rule set applies)
```
highRise   = buildingHeight >= 23        (MR 33 ข้อ 1, height to roof deck)
extraLarge = totalFloorArea >= 10000     (MR 33 ข้อ 1)
mr33       = highRise || extraLarge
```
Class depends on the design, so **the envelope is computed per class**:
- `envelope.highRise` (MR 33 applies) and `envelope.lowRise` (height < 23 m, GFA < 10,000 m²).
- **Gate (MR 33 ข้อ 2):** mr33 is only allowed if some road edge has width ≥ 10 m **and** that plot edge length ≥ 12 m (≥ 18 m road if GFA > 30,000). If the gate fails, the high-rise envelope is marked "not permitted" (red banner: "Road < 10 m: max 22.99 m and < 10,000 m²") and designs A/B are clamped to low-rise rules (they will usually collapse into the low-rise result; say so in the card).

### 4.3 Setback distance per plot edge (metres, measured from the plot boundary inward)
Inputs: edge type, road width `W`, class, the floor's **top height** `h` (from road level), total storeys.
All values come from `bangkok-y10.json`; the formulas:

**Road edge** (BMA ข้อ 50 = MR 55 ข้อ 41; MR 33 ข้อ 4; BMA ข้อ 49 sky plane; BMA ข้อ 55):
```
band(W) =  W < 10        → max(0, 6 − W/2)    // 6 m from road CENTRELINE (W<6 also: 3 m from centre, 6 is stricter)
           10 ≤ W ≤ 20   → 0.10 · W           // from road boundary
           W > 20        → 2
sky(h, W)  = max(0, h/2 − W)                  // height ≤ 2 × (W + d)  ⇒  d ≥ h/2 − W
clear(H)   = H > 15 ? 2 : 1                   // BMA ข้อ 55, H = building height
s_road(h)  = max(band(W), clear(H), mr33 ? 6 : 0, sky(h, W))
```
**Neighbour edge** (BMA ข้อ 54, ข้อ 55; MR 33 ข้อ 4). Assume all walls have windows (condo/hotel/office, conservative):
```
open(H, storeys) = (storeys >= 3 || H > 9) ? 3 : 2
s_nb = mr33 ? 6 : max(open(H, storeys), clear(H))
```
Notes:
- `sky` is the only height-dependent term, so **upper floors step back from the road**. This is the correct shape of the 2× rule.
- Multiple road edges: apply each road edge's own `W` and sky plane (conservative v1 simplification of ข้อ 45/46 "use the wider road"; document it).
- Site is assumed flat and at road level.

### 4.4 Allowed space (envelope) = per-floor slices
For floor k with base `b_k` and top `t_k`:
```
E_k = Plot  minus  UNION over edges i of capsule(edge_i, s_i(t_k))
```
`capsule(segment, r)` = all points within distance r of the segment (rectangle + two semicircle caps, 16-segment arcs). This is **exactly** "every point is at least s_i from edge i", correct for concave and odd-shaped plots, with no offset-polygon edge cases.
- Floor heights for the envelope: ground 4.5 m, then 3.0 m each (same as designs, §6.1), so the envelope shows **terraces at real floor levels**.
- Stop when `E_k` is empty, or at 300 m (no zone height cap in ย.10; airport height zones are out of scope, document it).
- Render each slice as a `fill-extrusion` feature with `base = b_k`, `height = t_k`, translucent cyan. That is the 3D envelope.
- Also compute the **ground-coverage cap**: `maxFootprint = plotArea − requiredOpenSpace` (§4.6). The envelope shows the legal outline; the designs respect the coverage cap.

### 4.5 FAR
```
maxGFA = plotArea × 8 × (1 + min(20%, Σ selected bonuses))    // ข้อ 17 (1), ข้อ 51-57
```

### 4.6 Open space (ground level, unroofed)
```
openSpace      = plotArea − area(ground footprint of every roofed part)
requiredOpen   = max( landPct × plotArea, 0.04 × GFA )
   landPct     = 0.30 for Condo and Hotel (residential: people dwell day/night, BMA ข้อ 52 (1); MR 55 ข้อ 1 definition)
               = 0.10 for Office (BMA ข้อ 52 (2))
permeable      ≥ 0.50 × (0.04 × GFA)      // ข้อ 17 (2); we model permeable = openSpace × permeableShare (assumption, default 0.6)
```
Because OSR depends on GFA, compute it iteratively: guess GFA = maxGFA → coverage cap → design → actual GFA → re-check (converges in ≤ 3 loops).

### 4.7 Programme (for the checklist and the client)
| | Condo | Office | Hotel |
|---|---|---|---|
| net/gross efficiency | 0.75 | 0.80 | 0.65 |
| unit size (NSA) | 35 m² avg (editable) | n/a | 32 m²/room |
| parking (Bangkok, MR 7 ข้อ 3 (1)) | max(units if avg unit > 60 m² else 0, GFA/120) | max(GFA/60, GFA/120) = GFA/60 | 10 for first 30 rooms + 1 per 5 rooms (≤100 rooms), then 1/10; vs GFA/120, take max |
| parking area | 30 m² per stall incl. aisles (assumption) | same | same |
| use limits in ย.10 (ข้อ 17) | none | GFA > 10,000 needs road ≥ 12 m or ≤ 500 m to a station | > 80 rooms needs road ≥ 12 m or ≤ 500 m to a station |

Parking goes in podium floors (Design B), the ground plus first floors (A), or the ground floor plus open-air lot (C). "Count parking in FAR" defaults **ON** (conservative; open question in RULES.md §7).

## 5. Site context (the "real site" requirement)

### 5.1 Buildings
On plot change (debounced 600 ms, only if centroid moved > 150 m), fetch from Overpass:
```
[out:json][timeout:25];
( way["building"](around:450,{lat},{lon}); relation["building"](around:450,{lat},{lon}); );
out geom;
```
Endpoints, in order with 8 s timeout each: `https://overpass-api.de/api/interpreter`, `https://overpass.kumi.systems/api/interpreter`, `https://overpass.private.coffee/api/interpreter`. Cache by rounded centroid in memory and `localStorage` (try/catch).
Height per building: `height` tag (m) → `building:levels × 3.2` → default 9 m. Colour estimated heights lighter and say so in the legend.
**Buildings that intersect the plot are hidden** (assumed demolished): "Existing buildings on your plot are hidden."
If all endpoints fail: load the nearest pre-baked `demo-*.json` if within 1 km, else show "Surrounding buildings unavailable (OSM server busy). Retry" and keep everything else working.

### 5.2 Roads
Same query with `way["highway"](around:450,...)`. Use them to:
- auto-suggest the road edge: the plot edge whose midpoint is nearest a highway line (≤ 25 m), roughly parallel (< 30°);
- prefill width: `width` tag → else class default.

### 5.3 Class default road widths (estimate; the user must confirm)
`motorway/trunk 40 · primary 30 · secondary 20 · tertiary 16 · residential/unclassified 10 · service/living_street 6 · soi (residential with name "ซอย"/"Soi") 8`.

### 5.4 Stations
`scripts/fetch-stations.ts` runs once: Overpass `node["railway"="station"]["station"~"subway|light_rail|monorail"]` plus `railway=station` with `network~"BTS|MRT|ARL|SRT"` inside Bangkok bbox `13.5,100.3,14.0,100.95` → `public/data/bkk-rail-stations.geojson`. Used for the 500 m conditions (distance from the plot boundary to the station point; the plan says "around the station"; document that we use the station node, not platform edges).

### 5.5 Zone lookup
Lazy-load `bkk-zoning-2556.geojson` (1.4 MB) after first paint. Point-in-polygon on the plot centroid, plus area share if the plot crosses a boundary. Draw the ย.10 polygons faintly in brown (#8B4513, 15 % opacity) so users can see where the zone is.

## 6. Concept designs (≥ 2 required; we ship 3)

Every design is a list of floors: `{ index, base, top, polygon (local m), use: 'parking'|'lobby'|'residential'|'office'|'hotel'|'amenity' }`.
**Rule: each floor polygon ⊆ the envelope slice E_k of its class, and ⊆ the ground footprint (no overhangs in v1)**, so open space is honest.

### 6.1 Floor heights (editable assumptions)
Ground 4.5 m, typical 3.0 m (condo/hotel), 3.6 m (office), parking 3.0 m.

### 6.2 Design A: "Terraced block" (max mid/high-rise mass)
- Class: high-rise (if the gate passes) else low-rise.
- Ground footprint = E_0 shrunk by a uniform inset until area ≤ coverage cap (binary search on inset, 0.1 m precision).
- Floor k polygon = E_k ∩ ground footprint. Stack floors until next floor would exceed maxGFA or E_k area < 150 m² (minimum usable plate).
- Result: building that **steps back from the road** following the sky plane. It shows the envelope's shape directly.

### 6.3 Design B: "Podium + tower"
- Podium: 3 floors (ground lobby/retail + 2 parking), footprint = coverage-capped E_k.
- Tower plate target = clamp(0.35 × plotArea, 450 m², 1,200 m²). Plate = podium ∩ E_k, then inset uniformly until area ≤ target; a plate is valid if its min width ≥ 12 m (check via inset by 6 m non-empty).
- Floors until maxGFA or the plate becomes invalid/empty. Rooftop amenity floor optional.
- Result: slimmer, taller tower; more open sky; typical Bangkok condo.

### 6.4 Design C: "Low-rise (< 23 m, < 10,000 m²)"
- Class: low-rise always. Max 6 floors (4.5 + 5 × 3.0 = 19.5 m) to stay under 23 m with roof structures margin; or 7 floors = 22.5 m, editable.
- Footprint coverage-capped E_k (low-rise envelope: smaller setbacks, no 6 m ring).
- GFA = min(maxGFA, 9,999 m², sum of floors).
- Result: the option for narrow sois (< 10 m) and the honest comparison "how much FAR you leave on the table by not going high-rise".

### 6.5 Design card (UI)
Name, mini isometric thumbnail (render the 3D map camera at that design), height, storeys, GFA (and % of max), units/rooms/NLA, parking provided vs required, coverage %, open space %, checklist summary (e.g. "11/12 pass"), button "Show in 3D".

## 7. Checklist (INDEPENDENT checker)

`checker.ts` takes only the plot, inputs and the final floors list. It must **not** reuse the generator's setback numbers; it re-measures geometry. This is what makes the tool hard to break.

| # | Check | How it is measured | Clause |
|---|---|---|---|
| 1 | FAR | Σ floor areas ÷ plot area ≤ max FAR (incl. bonus) | ข้อ 17 (1), 57 |
| 2 | OSR | open space ≥ 4 % × GFA | ข้อ 17 (2) |
| 3 | Permeable | permeable ≥ 50 % of OSR requirement (assumed share; marked "design assumption") | ข้อ 17 (2) |
| 4 | Open space % of land | open space ≥ 30 % (condo/hotel) / 10 % (office) of plot | BMA ข้อ 52 |
| 5 | Height vs road | for every floor, every vertex v: top ≤ 2 × (W + dist(v, road edge)) | BMA ข้อ 49 |
| 6 | Road setback | min distance from any floor polygon to each road edge ≥ band(W) (and ≥ 6 if MR 33) | BMA ข้อ 50, MR 33 ข้อ 4 |
| 7 | Boundary setback | min distance to each neighbour edge ≥ required | BMA ข้อ 54/55, MR 33 ข้อ 4 |
| 8 | High-rise road access | if MR 33: a road edge with W ≥ 10 and edge length ≥ 12 (≥ 18 if > 30,000 m²) | MR 33 ข้อ 2 |
| 9 | Fire-truck ring | if MR 33: 6 m clear around footprint inside plot (≈ check 7 at 6 m) | MR 33 ข้อ 3 |
| 10 | Road face | footprint sides within 20 m of a road and < 30° to it sum to > 1/8 of footprint perimeter | BMA ข้อ 53 |
| 11 | Parking | stalls provided ≥ required | MR 7 ข้อ 3 |
| 12 | Use permitted in zone | type-specific conditions in ย.10 (hotel > 80 rooms, office > 10,000 m²) | ข้อ 17 (8)(10) |

Each row shows: value, limit, PASS/FAIL/INFO, clause chip. Clicking the chip opens a popover with the rule text, the source file and page (from the JSON). Tolerance 0.01 m / 0.01 m².

## 8. UI layout (looks like something for a client)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Plotwise · Bangkok ย.10                         [Share link] [Reset]     │
├───────────────┬──────────────────────────────────────┬───────────────────┤
│ INPUTS        │                                      │ RULES THAT APPLY  │
│ Plot: 1,842m² │           3D MAP (MapLibre)          │ FAR 8 → 14,736 m² │
│ Zone ย.10 ✓   │   real buildings (grey), plot (red   │ OSR ≥ 4 % …       │
│ Road edge ▣   │   outline), setback strips (hatched, │ Setbacks per edge │
│ Width 12 m ═  │   coloured per rule), envelope       │ Height 2×(W+d) …  │
│ Type Condo ▾  │   (translucent cyan terraces),       ├───────────────────┤
│ Bonus □□□     │   selected design (solid white,      │ DESIGNS  A  B  C  │
│ Assumptions ▸ │   floors banded by use)              │ cards + checklist │
│               │  [Envelope][Design][Setbacks][Rules] │ Area statement ▸  │
└───────────────┴──────────────────────────────────────┴───────────────────┘
```
- **Rule inspector** (makes "each rule visibly changes it" obvious): a list of rules with toggles (Road setback, Boundary setback, MR 33 6 m, Sky plane, Coverage cap). Turning one off recomputes the envelope without it and shows the removed volume in red ghost. Default all on.
- Setback strips on the ground are coloured by the rule that governs that edge, with a label "6.0 m · MR 33 ข้อ 4".
- Area statement table: plot area, max GFA, per-floor rows (floor, use, area), **total = Σ rows** (shown both ways, they must match), coverage, open space, permeable.
- Mobile: panels collapse into a bottom sheet; it must not break, but desktop is the target.
- Visual tone: light, neutral basemap (positron), one accent colour, Inter font, numbers in tabular figures.

## 9. Live updates and performance

- Every input change → `computeAll()` (pure) → store → map sources `setData()`. No reload, no network on the hot path.
- Vertex drag: recompute on `requestAnimationFrame`, throttle to one compute per frame. Target **< 16 ms** per compute for plots ≤ 1 ha (≈ 60 floors × 3 classes × polygon-clipping is a few ms). If a compute exceeds 30 ms, move `computeAll` into a Web Worker (keep the API identical so this is a swap, not a rewrite).
- Overpass fetches are off the hot path, debounced, cached.
- Large plots (> 5 ha): warn and cap envelope height to keep it smooth.
- Keep context buildings in one GeoJSON source (one draw call layer).

## 10. Testing (do this as you go, not at the end)

`vitest` in `app/tests`. Required cases (hand-computed expectations in comments):
1. **Rectangle 40 × 50 m (2,000 m²), road on the 40 m side, W = 12 m, condo:** maxGFA 16,000; band = 1.2 m; MR 33 applies → road setback 6 m, sides 6 m; E_0 = 28 × 38 = 1,064 m²; sky plane starts to bite when h/2 − 12 > 6 → h > 36 m; required open = max(600, 640) = 640 → coverage cap 1,360 (E_0 smaller, so E_0 governs).
2. **Same plot, W = 8 m:** gate fails → high-rise not permitted. Low-rise (7 floors, top 22.5 m): band = 6 − 8/2 = 2 m, clear(H > 15) = 2 m, so road setback 2 m on lower floors; the sky plane bites above h = 2·(8 + 2) = 20 m, so the top floor (22.5 m) needs d ≥ 22.5/2 − 8 = 3.25 m. Sides = max(3, 2) = 3 m.
3. **W = 4 m:** band = 6 − 2 = 4 m.
4. **L-shaped concave plot:** envelope has no part closer than s to any edge (sample 2,000 random points; property test).
5. **Triangle plot**, **very thin plot (8 m deep)** → envelope empty → designs show "Not buildable: plot too narrow for setbacks" (no crash, no NaN).
6. **Self-intersecting polygon** → validation error message.
7. **Floor area adds up:** Σ floors == reported GFA for every design.
8. **Checker vs generator:** for 200 random plots (random convex + concave polygons, random W 4-40, random type), every design passes checks 5, 6, 7. Any fail = generator bug.
9. **Bonus cap:** selecting 15 % + 10 % gives 20 %, FAR 9.6.

"Try to break it" manual list before submitting: tiny plot (< 50 m²), huge plot (10 ha), 40-vertex plot, plot outside Bangkok, plot in ย.5, plot across ย.10 / พ. boundary, no road edge selected, two road edges of different widths, width 0 / 100, rapid dragging, offline (Overpass down), mobile Safari, URL reload reproduces the scenario.

## 11. Milestones (IST). Run locally, check in the browser after every milestone

| # | When (IST) | Deliverable | Done when |
|---|---|---|---|
| M0 | Thu 16:30-18:30 | `app/` scaffold (Next + TS + Tailwind + Bun), MapLibre with OpenFreeMap in Bangkok, terra-draw polygon | `http://localhost:3000` shows the map and a drawable polygon |
| M1 | Thu 18:30-00:30 | `engine/geo, polygon, setbacks, envelope, classify` + tests 1-6 | tests green; envelope slices render on map, live on vertex drag |
| M2 | Fri 00:30-02:00 | Overpass context buildings + roads, zone lookup, stations script | real buildings around the plot; zone badge correct for Ari (ย.10) |
| ~ | Fri 02:00-08:30 | sleep | |
| M3 | Fri 08:30-14:30 | designs A/B/C + `checker` + tests 7-9 | 3 designs render; checklist all-pass on random tests |
| M4 | Fri 14:30-20:30 | full UI: inputs, rules panel with clause popovers, cards, area table, rule inspector, URL sharing | a non-technical person can use it without help |
| M5 | Fri 20:30-00:30 | polish: legend, labels, camera presets, loading states, empty/error states, mobile sheet | looks client-ready |
| ~ | Sat 00:30-07:00 | sleep | |
| M6 | Sat 07:00-10:00 | break-it pass (§10 list), perf check on a normal laptop, production build check (`bun run build && bun run start`), fixes | no crash, no NaN, < 16 ms compute, production build works locally |
| M7 | Sat 10:00-13:00 | Amitesh writes the doc (one-pager, setup, about); export transcripts; README with screenshots and local run instructions | doc complete |

Cut list if behind (in this order): rule inspector ghost volume → Design C thumbnail → hotel type → mobile sheet → stations (use "unknown" for 500 m conditions). **Never cut:** accurate envelope, real buildings, 2 designs + checklist, live updates.

## 12. Things a fresh session must NOT do

- Do not re-research the law or change numbers without updating `research/RULES.md` + the JSON + `research/AI_MISSES_LOG.md`.
- Do not hardcode rule numbers in components. Read them from `rules/bangkok-y10.json`.
- Do not compute areas/distances in degrees.
- Do not let the checker import the generator's setback values.
- Do not add a backend, auth, database or paid API keys.
- Do not deploy (Vercel or anything else) and do not create/push a GitHub repo. v1 is local-only.
- Do not write the submission doc's one-pager/setup/about. Amitesh writes those (brief: "The write-up is yours to write").
- Do not call `start_assignment` again; it's started. Do not call `submit_application`.

## 13. Open decisions already made (put these in the write-up)

1. Zone ย.10, condo first (condo belt: Asok, Thonglor, Ari, Sathorn; highest residential FAR; unrestricted condos).
2. 2013 plan, not the 4th-revision draft (not law until ~mid-2027).
3. Bangkok ordinance 2544 wins over MR 55 where stricter (open space 30 % of land).
4. Envelope = per-floor slices via capsule subtraction (exact distance semantics, any plot shape).
5. Sky plane per road edge; multi-road "use the wider road" simplified (conservative).
6. All walls assumed to have openings (conservative boundary distances).
7. Parking counted in FAR by default (toggle); 30 m²/stall.
8. Existing buildings on the plot hidden (assumed cleared).
9. Airport height zones, the ล.2 planted-strip road list, the wide-road (≥ 80 m) exception and corner chamfer: out of v1, listed as "what's next".
10. Site data from OSM (heights partly estimated, shown lighter); zone polygons from the BMA service via an open mirror.
