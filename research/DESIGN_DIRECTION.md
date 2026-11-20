# DESIGN_DIRECTION.md: UI direction for v1

Written 2026-11-19 by the planning session after Amitesh shared four images and one video from the founder's X account.
**Do not copy these designs.** Learn from them, fix their problems, and keep our UI simple.

## 1. What we looked at

| Reference | What it is | Keep (the idea, not the look) | Problem we fix |
|---|---|---|---|
| **Concept study, Ratchaprasong** (closest to our product) | Brief → Site and rules → Options wizard. Three option cards with paragraphs, a 3D tower in grey context, a stacked-floor section, and a 10-column comparison table with cost, income and land value. | Three options side by side; a section that stacks floors by use; labels on the model ("37 m road", "6 m setback", "107 m · 26 storeys"); the honest banner "A study, not a design. For an architect to check and sign." | (1) **Proof is hidden:** "passes every check" is just a chip and the rules sit in another tab. (2) **The same data is shown four times** (cards, table, section, 3D), so the page is dense. (3) **The envelope is off by default** behind a "Height limit" checkbox, so you can't see headroom. (4) **The wizard is not live:** changing the plot means going back a step. (5) **Cost and income have no visible source.** (6) Only one edge has a setback label. (7) It never says **what limits the design**. |
| **Aayra Crown video** (sales visualiser) | Site → Block → Floor → Flat → Inside. Breadcrumb top-left, a small step rail top-right, one glass card bottom-left, a time-of-day slider, labels on buildings. | **Drill-down with a breadcrumb.** One small card at a time. Labels sit on the objects, not in side panels. Very little chrome. | Photoreal and heavy; tiny low-contrast text on glass; built to sell, not to prove rules. |
| **Agent Studio** | Dark 3D model; each element tagged with its dimensions; an agent log; a KPI strip at the top. | **Dimension tags on geometry.** A short KPI strip. | Dark, with many competing colours; too much going on at once. |
| **Interior and climbing-gym renders** | Visual output from the founder's product. | Calm, flat, warm palette with thin outlines, which suits our Simple map. | Not relevant to feasibility. |
| **Market** (TestFit, Giraffe, Envelope, Chicago Cityscape) | TestFit: generated options sorted by goals, updating live. Giraffe: draw on a map and the numbers update as you draw. Envelope: instant 3D zoning envelope per parcel. Chicago Cityscape: setback sliders. | Live update while drawing; sort options by one goal; envelope first. | Priced for professionals with deep menus; the rules behind the number are rarely shown with their clause. |

## 2. Our one idea: **"Proof on the model"**

Every number can be clicked, and clicking it **lights up the geometry that causes it**, with the clause.
Click "Height vs road: PASS 61.5 / 64.0 m" and the sky plane on that road edge turns amber in 3D, the worst floor corner gets a dot, and a chip shows "MR 55 ข้อ 44 · BMA 2544 ข้อ 49 · p.12". This is what neither the founder's study nor TestFit or Giraffe shows.

## 3. Layout (desktop; mobile is a bottom sheet)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Plotwise  Ari, Bangkok › ย.10      Max area 16,000 m² · Height 61 m ·        │
│                                     22 storeys · Checks 12/12 ✓     [Share] │
├────────────┬───────────────────────────────────────────────┬─────────────────┤
│ 1 Plot   ✓ │                                               │  A   B   C      │
│ 2 Road   ✓ │            3D MAP (Simple style)               │ ── design pills │
│   12 m ▭── │   labels on the model:                         │ 15,400 m² · 61 m│
│ 3 Type     │   "12 m road", "6.0 m" on EVERY edge,          │ uses 96 % of max│
│  Condo ▾   │   "61 m · 22 st" on top                        │                 │
│ 4 Bonus    │                                               │ Limited by:     │
│  +0 %  ▸   │   envelope = translucent ghost (ON by default) │ sky plane, Soi  │
│            │   design   = solid, floors banded by use       │ Ari 1           │
│ Assumptions│                                               │                 │
│  (folded)  │   ↶ ↷   view: Top · 3D · Street · ⟳           │ Checks 12/12 ✓  │
│            │                                     legend ▸  │ ▸ rows (folded) │
│            │                                               │ Section ▮▮▮▮    │
└────────────┴───────────────────────────────────────────────┴─────────────────┘
                                         [Compare A/B/C] opens the table (hidden by default)
```

Rules for the layout:
1. **Top KPI strip, 4 numbers only:** max floor area, height, storeys, checks. They change live.
2. **Left = 4 numbered steps** (Plot, Road, Type, Bonus), each one line when done, with a ✓. Assumptions are folded. No paragraphs.
3. **Right = one design at a time.** Pills A / B / C, each with 2 numbers (floor area, height). Below them:
   - one line, **"Limited by: …"**: the binding rule (FAR, sky plane on edge X, open space, MR 33 gate, or plate size);
   - **Checks 12/12** folded into rows, each row PASS / FAIL / INFO with value / limit and a clause chip; clicking a row highlights the cause in 3D (§2);
   - a **section strip**: stacked floor bands by use, labelled from the area table, so Σ floors = GFA.
4. **Compare is on demand:** one button opens a 6-column table (floor area, % of max, height, storeys, units or rooms, parking). There is **no cost or income column** in v1, because we have no sourced data for it.
5. **The envelope is ON by default** as a ghost, with the design solid inside it, so headroom is always visible.
6. **Labels on the model, not in panels:** the road width on each road edge, the setback on **every** edge, and height and storeys on top. Hide labels below 14 px space; never more than ~8 labels on screen.
7. **One honest line**, bottom-left, small: "A feasibility study, not a design. An architect must check and sign."

## 4. Visual rules
- Simple map style stays the default (already built). Warm off-white ground, one grey for context buildings, **one accent colour** (plot, selected pill, highlights). Amber only for "the thing you clicked", red only for FAIL.
- The design's floor bands use 3 muted tones only: parking, podium/shops, residential/office/hotel.
- Inter, tabular numbers, a unit on every number, sentence case, no ALL-CAPS labels.
- Motion: camera eases to the highlighted cause (≤ 400 ms); no other animation.
- Empty, loading and error states follow the same rule: one icon plus one sentence plus one action.

## 5. Not in v1 (do not build now)
Photoreal rendering, interiors, cost/income/land value, a time-of-day sun slider and shadows, AI chat, and multiple zones. Put them in the README under "Next".

## 6. Two modes: Simple and Expert (added 2026-11-20, Amitesh's feedback)

Same engine, same map, same numbers. Only the words and the amount of detail change. A switch sits in the top bar: **Simple · Expert**. Simple is the default and the mode is stored in the URL hash.

**Who:** Simple is for a landowner or developer who is not an architect. Expert is for an architect or engineer checking the work.

### Simple mode shows
1. **Verdict card** (traffic light), one sentence plus three numbers:
   - green: "Yes, you can build a tall building here. Up to ~15,600 m² of floors, about 15 storeys, ~240 homes."
   - amber: "You can build here, but only low-rise (max 7 storeys). Why: the road is 8 m wide."
   - red: "You can't build on this plot. Why: it is too narrow once the required gaps are taken out."
2. **Units people know.** Land in **m², Thai rai-ngan-wah and sq ft** (1 rai = 1,600 m², 1 ngan = 400 m², 1 sq wah = 4 m², 1 m² = 10.764 sq ft). Floor area in m² and sq ft. Simple mode shows one unit at a time (a switch: m² · sq ft · rai); Expert stays in m².
3. **"The 5 big rules", in plain words.** Each rule is an icon, one sentence and one number. No clause numbers (they're in Expert).
   - How much you can build: "You can build 8 × your land area in floors."
   - How tall: "Near a narrow road, the building must step back as it rises."
   - Gaps: "Keep 6 m clear from every edge of your land."
   - Open land: "Leave 30 % of the land without a building."
   - Parking: "About 1 car space per home."
4. **"How big is this next to the neighbours?"** A density meter based on real OSM buildings within 300 m:
   - "Your building: 46 m. Most buildings around: 12 m (median of 214). About 4 × taller: a **high-density** building for this street."
   - Buckets: Low (≤ 1.5 × median), Medium (≤ 3 ×), High (> 3 ×).
   - Label it an estimate (heights come from OSM).
5. **"What would let you build more?"** The engine is re-run with one change, using real numbers only:
   - "If the road were 10 m wide, you could build about 9,800 → 15,600 m²."
   - "A plot 4 m deeper would make it buildable."
   - "A station within 500 m would allow a hotel over 80 rooms."
   - Show at most 2 lines, the biggest gains first.
6. **"Where could I build taller?"** (map layer, off by default, a button in Simple mode):
   - inside ย.10, roads whose width is probably ≥ 10 m (from road class) turn green ("tall buildings possible along this road, estimate");
   - minor sois stay grey ("low-rise only");
   - stations get a faint 500 m ring.
   - It's an estimate from road class, and the legend says so.

### Expert mode shows
Everything built so far: the 12 checks with value / limit and clause chips, proof on the model, the section strip, Compare, edge setbacks in metres, assumptions, and the area table.

### Rules for both
- Same numbers in both modes. Simple rounds (~15,600 m², "about 15 storeys"); Expert shows exact values.
- Every Simple sentence has a small "Why?" link that switches to Expert and opens the matching check row with its proof on the model.
- No paragraph longer than 2 lines. A reader in Simple mode should understand the plot in about 10 seconds.

## 7. Simple screen budget and a lightweight app (added 2026-11-20, Amitesh's feedback)

"The tool screen has a lot of boxes and text." Everything detailed moves to Expert. In Simple, the map is the product.

**Simple mode: at most 3 things on screen besides the map**
1. A thin top bar: place name, the Simple · Expert switch, and undo.
2. One input card (left, collapsible). It shows the current step only, e.g. "Draw your plot", then "Which side faces the road? (tap it)", then "What will you build? Condo · Office · Hotel". Finished steps shrink to one line.
3. One result card (right; on a phone, a bottom sheet). It holds the verdict, 3 numbers, the density meter and at most 2 "what would help" lines. The 5 big rules are folded under "Rules (5)".
- A legend with at most 5 rows, folded to an icon.

**Hidden in Simple, shown in Expert:** the 12 checks, clause chips, the section strip, Compare, the area table, assumptions, edge setback labels, site-check rows, the zone details and the FAR bonus.
- On the map in Simple: the plot, the envelope ghost, the selected design, and one label on top ("46 m · 15 floors").

**Lightweight and fast (low-end laptops and phones)**
- Engine in a **Web Worker**, so dragging never blocks the map.
- **While dragging:** compute only the envelope, throttled to one frame at a time and dropping stale jobs. **On release:** run designs, checker, what-ifs and density.
- Lazy-load Expert-only panels (Compare, area table, section, clause popovers) and the satellite source.
- On a phone or a weak GPU: cap the pixel ratio at 1.5, context buildings within 300 m (450 m on desktop), no hatch patterns, lower pitch by default, and honour reduced motion.
- **Budgets (to measure, not guess):** compute after release < 50 ms at 4× CPU throttle; envelope during drag < 16 ms; first-load JS ≤ 350 KB gzipped for `/tool` (excluding the map library chunk, reported separately); usable at 375 px.

**If time runs short, cut in this order:** the "Where could I build taller?" layer → density meter → rai units → the Compare table (Expert). **Never cut:** verdict card, plain "why" sentence, "Why?" → Expert proof, live envelope, 2 working designs plus checklist.
