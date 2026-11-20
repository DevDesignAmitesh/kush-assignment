# PROGRESS.md: status report for the planning session

Generated 2026-11-20 12:15 IST. Round: **planning review items 1, 2, 4 + item 3 as amended, M4 part 2, M6 break-it pass**. Evidence comes from fresh `test` / `lint` / `build` runs at **12:08** and headless Chrome on `http://localhost:3000` (dev server, 11:30-12:05). Overwritten each time. Not deployed, not pushed.

**Clock:** about 26.5 h left at 12:15 IST (deadline 2026-11-21 09:19 UTC).

**Summary:**
- **Addendum B closed on real hardware** (Amitesh, real Chrome, `?perf=1`, production build):
  - envelope 0-3 ms per drag job;
  - full job ≈ 27-31 ms (compute 2-7 ms + designs 19-24 ms).
  - Both targets met. This is the H.6 evidence. AI miss #30 confirmed: the headless timings were SwiftShader, not the engine.
- **Simple W = 8 screen:** 40 words; demo screen 38. The taller layer draws 4 rings (not 195).
- **"Updating…" shimmer:** on the result card while a newer result is on its way.
- **Edge labels:** one per run of road edges.
- **M4 part 2:**
  - KPI strip;
  - Expert numbered steps;
  - type + FAR-bonus inputs;
  - footer line;
  - per-floor area table (three totals agree to 0.01 m²);
  - full scenario in the URL hash;
  - amber only for clicked things.
- **Break-it pass:** **12 / 12 rows pass.**
  - It first caught 2 real failures (silent self-intersection, Expert at 375 px), a wrong Simple verdict with no road edge, and a false PASS in my own 375 px check.
  - All fixed and re-run (AI misses #34-#37).

---

## 1. Milestone status

| M | Status |
|---|---|
| M0-M1, M3 | done |
| M2 | partial (Overpass deferred per Q1; stations done) |
| M4 | **done for the planning list**. Not built: rule inspector (H.3), layer toggles Envelope / Design / Setbacks / Rules (H.2), editable assumptions (C) |
| M5 | partly done along the way (legend, labels, camera presets, mobile sheet, states); no dedicated pass yet |
| M6 | **break-it rows 12 / 12 pass**; < 16 ms met on real hardware; production build works locally |
| M7 | not started (README has run steps; screenshots + Amitesh's doc pending) |

```
M4 status: done (planning list); M6 break-it: 12/12
Verified: build ✓ lint ✓ tests ✓ (109 passing at 12:08: engine 35, siteChecks 34, designs 14, simple 12, history 5, roadGroups 5, scenario 2, geo 2) · browser ✓ (app/test-artifacts/R2-*.png, B-*.png) · prod build ✓
Expectations met: C (all rows; assumptions visible but read-only → Deviations), H.1, H.4, H.5, H.6 (real-Chrome numbers below), H.7 (375 px), I (all 12 rows), plus planning review items 1-4
Golden numbers: part D unchanged; area statement Σ rows = card = FAR-check GFA within 0.01 m² (new test)
Deviations: DEVIATIONS.md rows "2026-11-20 (M4 pt 2)" (8 rows)
AI misses logged: #34-#37
Next: decide on H.2 toggles / H.3 rule inspector / editable assumptions; M5 polish pass; M7 README screenshots
```

---

## 2. Planning review items

| # | Item | Result |
|---|---|---|
| 1 | Simple W = 8 ≤ 40 words | **40 words, 2 panels**. While the road step is open, the card shows 1 what-if and hides density / rules. One-sentence verdict: "Low-rise only: 8 m road allows 7 floors." The demo screen (step 3) is 38 words. `R2-simple-W8.png` |
| 2 | Taller-layer rings | Only stations within **2 km** of the plot (map centre with no plot): **4 rings** on the demo, not 195 |
| 3 | Release feedback (amended) | "Updating…" text + thin moving bar on the result card, `aria-busy`, and the KPI strip dims. Browser check: shown right after a width change, and gone after the result (`updating` false). The full job is not split |
| 4 | Grouped edge labels | One label halfway along a run of road edges: `"1–3 · 8 m road (est.) · 2.0 m"` instead of three fighting labels. `R2-grouped-label.png`; unit tests for runs (incl. wrap-around) and the midpoint |

## 3. M4 part 2

- **KPI strip** (Expert, top centre, live): max floor area · height · storeys · checks. Demo W = 12: "16,001 m² · 70.5 m · 23 · 12/12 ✓". With +10 % bonus: "17,601 m² · 79.5 m · 26 · 12/12 ✓".
- **Expert left steps:**
  - 1 Plot · 2 Road · 3 Type · 4 Bonus, each one line with ✓ when done;
  - click a step to reopen it; the first unfinished step opens by itself;
  - assumptions folded; "What the rules allow" and site checks below;
  - ALL-CAPS headers removed.
- **Type / bonus inputs:**
  - Condo · Office · Hotel.
  - Bonus: a % field for ข้อ 52, 53, 54 and 55, and a level picker for ข้อ 56. The total is capped from the JSON, and FAR is shown live (8 → 8.8 at +10 %).
  - ข้อ 54 (park & ride) is disabled unless the nearest station is one of the JSON's listed stations within 500 m.
  - The FAR check limit follows: "≤ 8.80 (17,601 m²)".
  - Bonuses are part of undo / redo.
- **Footer line:** "A feasibility study, not a design. An architect must check and sign." Bottom-left of the map in Expert, on a white backdrop; hidden below 640 px.
- **Area table** (Expert, under the section strip, folded):
  - plot area, max floor area, and one row per floor (floor, use, area);
  - the total three ways: **Σ rows 15,878.66 = design card 15,878.66 = measured by the FAR check 15,878.66 m²**;
  - coverage, open space and open-space-vs-land rows;
  - the header says "totals match ✓" (or "totals differ" in red);
  - a new vitest asserts the three-way match to 0.01 m² for every buildable design at W = 12 and 8.
- **Full scenario in the URL hash:**
  - `#mode=…&s=<base64url>` holds the plot (7 decimals), road edges (width, confirmed, road name), type and bonuses;
  - written on every change, but not mid-drag;
  - a reload or shared link restores it, fits the camera and opens Simple at step 3;
  - a broken link shows a toast and starts empty;
  - vitest round-trip + malformed-input tests.
- **Amber only for clicked things:**
  - Detailed mode's cut buildings and the plot-overlap fill are now light red (same family as "Built over");
  - road estimates were already light blue;
  - amber on the map is now only the clicked proof (and the Simple amber verdict dot);
  - panel warning chips keep amber for "check this".

## 4. M6 break-it pass (EXPECTATIONS §I), headless Chrome, 11:55-12:05

| Input | Result | Observed |
|---|---|---|
| Self-intersecting polygon | **PASS** (after fix) | A corner dragged across the opposite edge stops at its last valid spot; no crossing shape is ever accepted; toast "Plot edges can't cross: kept the last valid shape". First run: **FAIL**, no message (AI miss #35) |
| Plot < 50 m² | **PASS** | 30 m² plot: error "Plot is too small (30 m²)", 0 designs, no crash |
| Plot ≥ 10 ha | **PASS** | 10.8 ha: "Very large plot (10.8 ha)" warning plus the site warnings (crosses roads, zone boundary, …). Engine ok, 2 designs. Headless took 5-10 s to settle; on real hardware the worker keeps the UI responsive, but this size is unmeasured |
| 40-vertex / very concave / triangle | **PASS** | Every envelope vertex checked against the plot: star 15,569 / U 682 / triangle 156 vertices, **0 outside**; 3 designs each. Plus vitest: L-shape 2,000-point property test and 200 random plots |
| Outside Bangkok / other zone / across zones | **PASS** | Chonburi: blocked, "Outside Bangkok's city plan area". Zone พ.3: blocked, "Plot is in zone พ.3 (commercial)". Across the ย.10 edge: warnings "Plot crosses a zone boundary" + "46 % of the plot is outside the zoning map", ย.10 used as the largest share |
| No road edge | **PASS** (after fix) | Engine status `no-road`, 0 designs. Expert: "Which edge faces the road?" prompt. Simple: "Tap the side of the plot on the road." (was "too narrow": AI miss #36) |
| Two road edges, different widths | **PASS** | Roads 1 = 12 m, 3 = 8 m. Both edges get road terms (band + clear + sky + MR 33). The height check names edge 3 (the narrower road) as binding: "22.5 m at 3.3 m from edge 3 (allowed 22.5 m)" |
| Width 0, 3, 100 | **PASS** | 0 → 3 m, 3 → 3 m, 100 → 60 m. Toast "Road width kept within 3-60 m", plus the note under the card. (The toast seen at "3" is still the one from "0") |
| Rapid dragging | **PASS** | 60 fast moves then release: final plot 1,875.8 m² = engine result 1,875.8 m² (Δ 0.000 %); no stale result; no false "can't cross" message. Smoothness: real-Chrome timings below |
| Overpass down / offline | **PASS** | Browser offline: W 12 → 8 recomputed instantly (gate fails, only C). 0 page errors. Overpass isn't used (tile context, Q1); loaded tiles stay |
| Reload share URL | **PASS** | 281-char URL; the new tab has the identical plot, roads (10 m + 6 m), type hotel, bonus 5 %, all three GFAs and the mode. A broken link shows "That link could not be read; start a new plot" |
| 375 px wide | **PASS** (after fix) | Simple and Expert: scrollWidth 375. Expert was 553 px wide; my first check reported PASS by comparing against `innerWidth` (AI miss #34). Expert on a phone now uses a design bottom sheet. `B-12-375-*.png` |

**H.6 evidence** (Amitesh, real Chrome, `?perf=1`, production build):

| Job | Measured | Target |
|---|---|---|
| `worker:envelope:compute` (per drag frame) | 0-3 ms | < 16 ms ✓ |
| `worker:full:compute` | 2-7 ms | — |
| `worker:full:designs` | 19-24 ms | — |
| Full job total (on release) | ≈ 27-31 ms | < 50 ms ✓ |

Addendum B closed. No more perf work unless a break-it row fails (none did).

## 5. Known bugs and gaps (blunt)
- **Not built:** rule inspector (H.3: toggle a rule off and see the removed volume), layer toggles Envelope / Design / Setbacks / Rules (H.2), editable assumptions (C: shown read-only).
- **Expert on a phone** has no horizontal scroll, but the inputs panel and design sheet leave little map. Simple is the intended phone mode.
- **Bonus inputs** take the % directly. The user must meet each clause's condition (units, open space, parking, storage, rating); the panel says so.
- **10 ha plots** settle slowly headless (5-10 s, SwiftShader). Not measured on real hardware.
- **Panel warnings** (site-check "!" chips, the no-road banner) are still amber-toned; the map uses amber only for the clicked proof.
- **Not faked:** every number comes from the engine, JSON or checker. The three area totals are computed independently.

## 6. Files this round
- **New:**
  - `src/ui/ExpertSteps.tsx`, `src/ui/ExpertExtras.tsx` (KPI strip, footer), `src/ui/scenario.ts`;
  - `tests/scenario.test.ts`.
- **Changed:**
  - `ClientShell.tsx` (Expert layout, hash scenario, bonuses → engine, phone layout), `MapView.tsx` (grouped labels, rings near the plot, refused-drag toast, `fitPlot`), `layers.ts` (EdgeLabel, ring filter, colours);
  - `DesignPanel.tsx` (area table, phone sheet), `Simple.tsx` (compact card, shimmer), `verdict.ts` (one-sentence gate verdict, no-road prompt), `checker.ts` (`measured` on the FAR row), `rules.ts` (bonus options), `store.ts` (bonuses, `restoreScenario`, `updating`), `roadGroups.ts` (runs, midpoint);
  - Legend / ViewControl / StepGuide / RulesSummary / SiteChecks (phone hiding, no ALL-CAPS), `globals.css` (shimmer);
  - tests: designs, simple, roadGroups.

## 7. Next (for the planning session to choose)
1. H.2 layer toggles + H.3 rule inspector (≈ 2-3 h together), or cut them (EXPECTATIONS J cut order lists the inspector ghost first).
2. Editable assumptions (≈ 1.5 h).
3. M5 polish pass, then M7: README screenshots; Amitesh writes the doc.
4. "Go public" only after Amitesh confirms.

### How to run
```powershell
cd E:\kush-assignment\app
bun install
bun run dev                 # http://localhost:3000/tool?demo=1   (#mode=expert for Expert)
bun run test; bun run lint; bun run build
bun run start               # production; add ?perf=1 to log engine timings
```
