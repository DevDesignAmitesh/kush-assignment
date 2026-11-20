# CLAUDE.md: start here

**Plotwise:** a Bangkok plot-feasibility and 3D massing tool for zone **ย.10** (General Machines hiring assignment).
- Draw a plot on the map and mark its road side(s).
- Pick Condo, Office or Hotel.
- The app shows, live: the rules that apply (with clause sources), the 3D allowed space (envelope), three designs, and a 12-row pass/fail checklist per design.
- A guided tour (on request only) walks first-time users from an empty lot to the designs.

**State (2026-11-20):** v1 is feature-complete.
- Building phase is over. Sessions from now on: understand, test, debug, fix bugs. **No new features unless Amitesh asks.**
- Feedback round (20 Nov evening, Amitesh asked for each): landing page restyled, Expert phone layout (tabbed bottom sheet), Compare rebuilt, guided tour, road-edge naming fix. Work goes on branch `feedback-fixes`, fast-forwarded into `main` when Amitesh says push. See `PROGRESS.md` and the "(fix)" rows in `DEVIATIONS.md`.
- Live: https://plotwise-nu.vercel.app (Vercel, root dir `app`, auto-deploys on push).
- Repo: https://github.com/DevDesignAmitesh/kush-assignment.
- Deadline: **2026-11-21 09:19 UTC** (14:49 IST). Check with the `time_left` MCP tool (general-machines), using the email the assignment was started with; ask Amitesh for it.

## Run
```bash
cd app
bun install
bun run dev            # http://localhost:3000/tool?demo=1   (add #mode=expert for Expert mode; /tool?tour=1 starts the tour)
bun run test           # vitest, 116 tests (engine, checker, designs, site checks, UI logic)
bun run lint
bun run build && bun run start   # production build; add ?perf=1 to log engine timings in window.__plotwisePerf
```
- `build` and `dev` first copy the MapLibre worker into `public/vendor/` (`scripts/copy-maplibre-worker.mjs`). It is gitignored and generated, so don't commit it.
- Next.js here is **v16**, with breaking changes: read `app/AGENTS.md` and `node_modules/next/dist/docs/` before changing framework code.

## Docs (read in this order when you need depth)
| File | What |
|---|---|
| `README.md` | Public overview with screenshots (`docs/screenshots/`) |
| `BUILD_PLAN.md` | The original engineering spec: stack, engine formulas (§4), designs (§6), checker (§7), milestones |
| `research/RULES.md` | The law for ย.10 in plain English, with clause and page citations. Machine version: `app/src/rules/bangkok-y10.json` (a copy of `research/rules/bangkok-y10.json`; keep the two identical) |
| `EXPECTATIONS.md` | Definition of done per spec section; golden numbers (§D); break-it table (§I) |
| `DEVIATIONS.md` | Every change from the plan, with the reason. **Check here before calling something a bug:** it may be a decision |
| `research/DESIGN_DIRECTION.md` | UI direction: "proof on the model", Simple vs Expert modes, screen budget, performance budgets |
| `research/AI_MISSES_LOG.md` | 47 mistakes the AI made and how each was caught (material for the submission doc). Local only (gitignored): keep logging, don't commit it |
| `PROGRESS.md` | The last status report from the build session (14:15 IST, 20 Nov), plus the feedback round on top |
| `ASSIGNMENT_BRIEF.md`, `ASSIGNMENT_DESCRIPTION.md` | The brief and role text. Local only (gitignored): don't publish them |

## Architecture
```
UI (React, zustand store)  ──inputs──▶  engineClient (Web Workers, latest job wins)
      ▲                                     │ envelope worker: every drag frame (fast)
      │                                     │ full worker: on release (designs + checker + what-ifs)
      └──────── results ◀───────────────────┘
MapView (MapLibre GL + terra-draw) draws plot, envelope, designs, labels, proofs
site/ reads OSM buildings + roads from the loaded vector tiles, zones and stations from public/data
```

### `app/src/engine/`: pure TypeScript
No React, DOM or MapLibre imports. Every rule number comes from `rules/bangkok-y10.json` via `rules/index.ts`.

| File | Role |
|---|---|
| `index.ts` | `computeAll(inputs)` (rules, gate, envelopes) and `computeDesigns`: the entry points the workers call |
| `geo.ts`, `polygon.ts` | lon/lat ↔ local metres (equirectangular around the plot centroid), area, offsets, validity |
| `setbacks.ts` | Per-edge setback: road band, sky plane `h/2 − W`, clearance, MR 33 6 m, neighbour 2/3 m |
| `classify.ts` | Building class (high-rise ≥ 23 m / extra-large ≥ 10,000 m²) and the MR 33 road-access gate |
| `envelope.ts` | Allowed space = per-floor slices: plot minus the union of edge capsules at each floor's setback |
| `far.ts` | FAR (+ bonus cap 20 %), open space (max of % of land and 4 % of GFA), parking ratios |
| `designs/` | A terraced block, B podium + tower, C low-rise. `stack.ts` stacks floors and reports *why it stopped* (`limitedBy`); parking variants until parking passes |
| `checker.ts` | **Independent** 12-row checklist. It re-measures floors and must NOT import setbacks / envelope / far / designs. Each row carries `cause` geometry for "proof on the model" |
| `verdict.ts` | Simple-mode verdict (green / amber / red) and what-ifs (re-run with one change) |
| `siteChecks.ts` | Placement sanity: zone, outside Bangkok, roads or buildings crossing the plot, stations within 500 m |
| `assumptions.ts` | Editable assumptions with ranges and sanitising |
| `units.ts`, `density.ts`, `plotSplit.ts`, `remapEdges.ts`, `roadDefaults.ts`, `zones.ts`, `worker.ts` | m² / ft² / rai; density vs neighbours; free/built split; keep road flags when corners change; road width defaults by class; zone lookup; worker entry |

### The rest of `app/src/`
| Path | Role |
|---|---|
| `app/page.tsx`, `app/LandingList.tsx` | Landing page `/` (layout after skill-issue.in; Geist + Instrument Serif on this page only) and its filterable feature list |
| `app/tool/page.tsx` | The tool at `/tool` |
| `app/ClientShell.tsx` | Main client component: modes, layout, wiring store ↔ engine ↔ map |
| `store.ts` | zustand: plot, road edges, type, bonuses, assumptions, map mode/layers, undo history (50), `tourStep` |
| `map/MapView.tsx`, `map/layers.ts` | Map, drawing, all sources/layers/colours (Simple / Detailed / Satellite styles) |
| `site/engineClient.ts` | Worker orchestration; `tileContext.ts` OSM context from tiles; `stations.ts`, `zones.ts` data loading |
| `ui/` | `Simple.tsx` (Simple mode), `ExpertSteps.tsx` (Expert inputs), `DesignPanel.tsx` (pills, checks, section, area table, Compare: one column per design), `Tour.tsx` (guided tour: steps, `TOUR_LOT`, hand overlay; targets carry `data-tour`), `scenario.ts` (URL hash share), `roadGroups.ts`, `Legend`, `ViewControl`, `StepGuide`, `Toast`, `sound.ts` |
| `public/data/` | `bkk-zoning-2556.geojson` (498 BMA zones), `bkk-rail-stations.geojson` (built by `bun run data:stations`) |
| `tests/` | vitest. Golden numbers are in `engine.test.ts`; 200-random-plot test in `designs.test.ts` |

## Rules for agents
- **Rule numbers live only in the JSON.** Never hardcode 8, 4 %, 23 m, 6 m, 30 % … in engine or UI. If the law changes, update `research/RULES.md`, both JSON copies and `AI_MISSES_LOG.md`.
- **The checker stays independent of the generators** (see its header comment). That is what makes a generator bug show up as FAIL.
- **Before fixing a "bug", check `DEVIATIONS.md` and `EXPECTATIONS.md`.** After a fix, run `bun run test`, `bun run lint` and `bun run build`, and look at it in a real browser. "It compiles" is not done.
- **Golden numbers must keep passing** (EXPECTATIONS §D). If a fix changes one, stop and explain why to Amitesh.
- **Keep a clean clone buildable:** nothing the build needs may exist only locally or in gitignored paths.
- **Log every AI mistake** you or Amitesh catch in `research/AI_MISSES_LOG.md` (next free number).
- **Never:**
  - write the submission write-up (one-pager, setup answers, about, best project): Amitesh writes it;
  - call `start_assignment`;
  - call `submit_application` without Amitesh's explicit go;
  - push or deploy unless Amitesh asks;
  - put Amitesh's emails or the assignment brief in committed files.

## Known gaps (by design, see DEVIATIONS)
- Rule inspector (H.3) cut; no "Rules" map layer.
- Overpass is not used: context comes from the vector tiles.
- Road widths are estimates until the user confirms them.
- Station classes follow a sourced allowlist.
- Expert on phones: one bottom sheet with Inputs / Designs tabs (not both at once); Simple is the main phone mode.
- 10 ha plots are unmeasured on real hardware.
- The tour lot (`TOUR_LOT`) is fixed: it was empty in the OSM tiles on 20 Nov. If OSM maps a building there, pick a new lot (the site check must say "Looks good").
