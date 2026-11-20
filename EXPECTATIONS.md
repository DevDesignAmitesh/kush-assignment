# EXPECTATIONS.md: what BUILD_PLAN.md v1 must deliver

> Every expectation below comes from a section of `BUILD_PLAN.md` (section numbers in brackets).
> The plan says **how**; this file says **what must be true** at the end of v1.
> A coding session may change the *how* only if every expectation still holds, and it writes the
> change in `DEVIATIONS.md` first.
> **v1 is local-only:** it runs on `http://localhost:3000`. No deployment, no GitHub.

---

## A. Definition of done (applies to every milestone)

A milestone is done only when **all** are true, and the session says so in its report (§I):
1. `bun run build`, `bun run lint`, `bun run test` all pass.
2. **Seen working in a real browser** on `http://localhost:3000`: Amitesh's browser, or headless Chrome (playwright-core) with a screenshot saved in `app/test-artifacts/`. "It compiles" is not done (AI miss #14).
3. From M6 on, the **production build** also works locally: `bun run build && bun run start`.

## B. Stack and structure [§1, §2]

- TypeScript strict, Next.js App Router (one page, map client-only), Tailwind, Bun, MapLibre GL, terra-draw, polygon-clipping, zustand, vitest.
- No backend, no database, no auth, no paid API keys. All data in `app/public/data/`.
- Folder layout as in §2. **`src/engine/` is pure TypeScript** (no React, no MapLibre, no DOM imports) and imports rule numbers only from `src/rules/bangkok-y10.json`.
- No rule number (8, 4 %, 23 m, 6 m, 30 % …) hardcoded in UI or engine code; all from the JSON.

## C. Inputs [§3]

| Input | Expected |
|---|---|
| Plot | Draw a polygon on the Bangkok map (≥ 3 vertices, concave allowed); drag vertices to edit; "Demo plot" button loads a sample in Ari. Self-intersecting polygons are rejected with a message and the last valid plot is kept. |
| Zone | Detected automatically from the plot. Badge "ย.10 · FAR 8 · OSR 4 %". Outside ย.10 → banner "v1 covers ย.10 only; this plot is in ย.X", no ย.10 results. Plot across zones → uses the largest share and warns. |
| Road edge(s) | Click a plot edge to mark it as facing a road. The edge nearest an OSM road is pre-selected. At least 1 required (prompt if none). Multiple allowed. |
| Road width | Per road edge, 3-60 m (input + slider), prefilled from OSM `width` tag or class default and labelled "estimate, please confirm". |
| Building type | Condo / Office / Hotel. Switching changes open-space %, parking, use limits and efficiency. |
| FAR bonus | Checkboxes for ข้อ 52-56; total capped at 20 %; max FAR shown live (8 → up to 9.6). |
| Assumptions | Floor heights, unit size, efficiency, m² per parking stall, permeable share, "count parking in FAR" (default ON): all visible and editable. |
| Share | All inputs mirrored to the URL hash; reloading the URL restores the exact scenario. |

## D. Engine [§4]

1. **Local metres** for all maths (equirectangular around the plot centroid). No area or distance in degrees.
2. **Building class**: high-rise if height ≥ 23 m, extra-large if GFA ≥ 10,000 m². **Two envelopes** are computed: high-rise class and low-rise class.
3. **High-rise gate**: high-rise/extra-large allowed only if a road edge is ≥ 10 m wide and that plot edge is ≥ 12 m long (≥ 18 m road above 30,000 m²). Otherwise a red banner, and designs fall back to low-rise rules.
4. **Setbacks per edge** follow the §4.3 formulas exactly (road band, sky plane h/2 − W, clearance, MR 33 6 m, neighbour 2/3 m).
5. **Envelope = per-floor slices**: plot minus capsules of each edge at its setback, at real floor levels (ground 4.5 m, then 3.0 m). It follows the real outline of any plot shape and **steps back from the road** where the 2× rule bites.
6. **FAR**: max GFA = plot area × 8 × (1 + bonus ≤ 20 %).
7. **Open space**: required = max(30 % of plot for condo/hotel or 10 % for office, 4 % × GFA); iterated until stable (≤ 3 loops).
8. **Programme**: units/rooms/net area and parking per §4.7 (Bangkok MR 7 ratios, 30 m² per stall).

### Golden numbers (vitest must assert these)
Rectangle 40 m (road side) × 50 m = 2,000 m², ย.10, condo, no bonus.

| Case | Must equal |
|---|---|
| W = 12 m | max GFA **16,000 m²**; road band **1.2 m**; gate passes; MR 33 ⇒ **6 m** on all edges; ground slice **28 × 38 = 1,064 m²**; sky plane bites above **h = 36 m** |
| W = 8 m | gate **fails** (banner); low-rise: road setback **2 m** on low floors, **3.25 m** at the 22.5 m top floor; sides **3 m** |
| W = 4 m | road band **4 m** |
| Bonus 15 % + 10 % | capped **20 %** ⇒ FAR **9.6** ⇒ **19,200 m²** |
| Office, W = 12 m | open space ≥ **10 %** of plot (not 30 %); parking **1 per 60 m²** |
| 8 m-deep plot | high-rise envelope empty; low-rise leaves only a strip with plate < 150 m² ⇒ **"Not buildable: too narrow for setbacks"**; no NaN, no crash (corrected 2026-11-19: "envelope empty" was wrong for the low-rise class, AI miss #23) |

## E. Site context [§5]

1. Real OSM buildings within ~450 m, extruded by `height` → `building:levels × 3.2` → 9 m default. Estimated heights look lighter and the legend says so.
2. **Buildings that overlap the plot are hidden**, with a note.
3. Overpass: 3 endpoints tried in order (8 s timeout each), results cached. If all fail, use the pre-baked demo site (if within 1 km) or show "Surrounding buildings unavailable. Retry". The engine and designs keep working either way.
4. OSM roads drive the road-edge auto-suggestion and the width prefill (class defaults per §5.3).
5. Rail stations file exists (`bkk-rail-stations.geojson`) and drives the 500 m conditions.
6. ย.10 zone areas drawn faintly on the map; zone lookup correct: **Ari BTS → ย.10, Siam → พ.5**.

## F. Designs [§6]

1. **Three designs: A Terraced block, B Podium + tower, C Low-rise (< 23 m, < 10,000 m²).** At least two must work for every buildable plot.
2. Every floor lies inside its class's envelope slice and inside the ground footprint (no overhangs).
3. Ground coverage never exceeds plot area minus required open space.
4. Designs stop at max GFA or at the envelope; no floor plate under 150 m² (A); tower plate 450-1,200 m² and at least 12 m wide (B).
5. Each design card shows: name, height, storeys, GFA (and % of max), units/rooms/net area, parking provided vs required, coverage %, open space %, checklist summary (e.g. "12/12 pass"), and "Show in 3D".

## G. Checklist [§7]

1. **Independent checker**: it re-measures the final floors and never imports generator setback values.
2. **12 rows per design**: FAR · OSR · permeable (labelled as an assumption) · open space % of land · height vs road (every floor, every vertex) · road setback · boundary setback · high-rise road access · 6 m fire-truck ring · road face > 1/8 of perimeter · parking · use permitted in ย.10.
3. Each row shows value, limit, PASS / FAIL / INFO, and a clause chip that opens the rule text with source file and page.
4. Tolerance 0.01 m / 0.01 m².
5. **Random test**: 200 random plots × random widths/types: every design passes height-vs-road, road setback and boundary setback.

## H. UI, live updates, performance [§8, §9]

1. Layout as in §8: inputs left, 3D map centre, rules + design cards right.
2. Map layers: real buildings (grey), plot (red outline), setback strips coloured by governing rule with labels like "6.0 m · MR 33 ข้อ 4", envelope (translucent cyan terraces), selected design (solid, floors banded by use). Toggles: Envelope / Design / Setbacks / Rules. Legend for every colour.
3. **Rule inspector**: switching off a rule recomputes the envelope without it and shows the difference.
4. **Area statement**: plot area, max GFA, one row per floor, and **Σ rows = card GFA = GFA in the FAR check** (to 0.01 m²).
5. **Live**: any input change updates rules, envelope, designs, checklist and table with **no reload**; dragging a vertex stays smooth.
6. **Performance**: one full compute < 16 ms for plots ≤ 1 ha on a normal laptop (move to a Web Worker if > 30 ms). Plots > 5 ha warn.
7. Looks client-ready: light basemap, one accent colour, Inter font, tabular numbers, units on every number, designed loading/empty/error states. Usable at 375 px wide.

## I. Testing and break-it [§10]

All 9 vitest cases in §10 pass, plus the golden numbers in §D. Before calling v1 done, every row below behaves as stated:

| Input | Expected behaviour |
|---|---|
| Self-intersecting polygon | rejected with message; previous plot kept |
| Plot < 50 m² | "too small"; no designs; no crash |
| Plot ≥ 10 ha | works or warns; UI responsive |
| 40-vertex / very concave / triangle | correct envelope; nothing outside the plot |
| Outside Bangkok / other zone / across zones | clear banner; ย.10 rules not applied silently |
| No road edge | prompt; no results |
| Two road edges, different widths | both setbacks and both sky planes applied |
| Width 0, 3, 100 | clamped to 3-60 with a note |
| Rapid dragging | smooth; no stale or flickering results |
| Overpass down / offline | fallback or retry; engine still works |
| Reload share URL | identical scenario |
| 375 px wide | usable; no horizontal scroll |

## J. Milestones [§11]

| # | Expected at the end |
|---|---|
| M0 | localhost shows the Bangkok map (OpenFreeMap) and a drawable, editable polygon; Demo plot works |
| M1 | engine geo/polygon/setbacks/envelope/classify with tests 1-6 green; envelope slices render and follow vertex drags live |
| M2 | real buildings and roads around the plot; zone badge correct (Ari → ย.10); stations file built |
| M3 | designs A/B/C render; checker + tests 7-9 green; random-plot test passes |
| M4 | full UI: inputs, rules panel with clause popovers, design cards, area table, rule inspector, URL sharing |
| M5 | polish: legend, labels, camera presets, loading/empty/error states, mobile sheet |
| M6 | every break-it row passes; < 16 ms compute; production build works locally |
| M7 | README with screenshots and local run steps (`cd app && bun install && bun run dev`); Amitesh writes the doc |

If behind, cut in this order: rule-inspector ghost volume → Design C thumbnail → hotel type → mobile sheet → station conditions (show "unknown"). **Never cut:** accurate envelope, real buildings, 2 designs + checklist, live updates.

## K. How sessions stay in sync [§12, §13]

- Before deviating from the plan, add a line to `DEVIATIONS.md`: what changed · why · which expectation it affects.
- Changes to law or numbers also update `research/RULES.md`, the JSON and `research/AI_MISSES_LOG.md`.
- Every AI mistake that gets caught → a new row in `research/AI_MISSES_LOG.md`.
- Never: write the submission write-up (Amitesh writes it), call `start_assignment` or `submit_application`, deploy, or push to GitHub.
- The 10 decisions in plan §13 stay as decided unless Amitesh changes them.

**Milestone report format** (paste it back to the planning session):
```
M<n> status: done | partial | blocked
Verified: build ✓ lint ✓ tests ✓ (N passing) · browser ✓ (screenshot path) · prod build ✓ (M6+)
Expectations met: <section letters/items>   Golden numbers: <which pass>
Deviations: <none | DEVIATIONS.md rows>   AI misses logged: #<numbers>
Next: M<n+1>, risks: <...>
```
