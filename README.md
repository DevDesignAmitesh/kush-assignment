# Plotwise: Bangkok plot feasibility (zone ย.10)

**Live:** https://plotwise-nu.vercel.app

Draw a plot in Bangkok's ย.10 zone, mark the road side, pick a building type, and see live:
- the rules that apply, each with its clause and source;
- the 3D space the law allows (the envelope);
- three designs (terraced block, podium + tower, low-rise), each with a 12-row pass/fail checklist measured independently of the generator;
- the real buildings and roads around the site.

Simple mode explains the result in plain words; Expert mode shows every check, clause and floor. First time? The **guided tour** flies you to an empty lot and walks you through drawing a plot, step by step.

> A feasibility study, not a design. An architect must check and sign.

## Screenshots
| | |
|---|---|
| ![Landing page](docs/screenshots/0-landing.jpg) **Landing page**: what the tool does, filterable by input, rules, designs and modes | ![Guided tour: tap the corners](docs/screenshots/7-tour.jpg) **Guided tour**: an empty lot near Ari, a hand on each corner to tap, Back / Next / Skip |
| ![Simple mode, demo plot on a 12 m road](docs/screenshots/1-simple-demo.jpg) **Simple**: demo plot on a 12 m soi, plain verdict and three numbers | ![Simple mode, 8 m road](docs/screenshots/2-simple-w8-amber.jpg) **8 m road**: high-rise not allowed, low-rise only, and what a wider road would give |
| ![Expert mode with a check proven on the model](docs/screenshots/3-expert-proof.jpg) **Expert**: 12 checks with clauses; the clicked check (height vs road width) is shown in amber on the model | ![Comparing designs A, B and C](docs/screenshots/4-compare.jpg) **Compare** A / B / C side by side: floor area, height, homes, parking, what limits each, checks; "Show on map" picks one |
| ![Area statement per floor](docs/screenshots/5-area-statement.jpg) **Area statement**: floor rows, design card and the FAR check's own measurement agree | ![Simple mode on a phone](docs/screenshots/6-phone.jpg) **Phone, Simple** (390 px) |

| Phone: guided tour | Phone: Expert |
|---|---|
| <img src="docs/screenshots/8-tour-phone.jpg" alt="Guided tour on a phone" width="300"> | <img src="docs/screenshots/9-expert-phone.jpg" alt="Expert mode on a phone with the Inputs / Designs sheet" width="300"> |
| The same tour at 390 px | The map above one bottom sheet with **Inputs / Designs** tabs (Hide gives the whole screen to the map) |

## Try it
- **Demo plot:** https://plotwise-nu.vercel.app/tool?demo=1 (add `#mode=expert` for Expert mode).
- **Guided tour:** https://plotwise-nu.vercel.app/tool?tour=1, or the **Tour** button (**?** on phones) in the tool.
- **Share a scenario:** the page link holds the whole scenario (plot, roads, type, bonuses, assumptions), so copying it shares exactly what you see.

## Run locally
```bash
cd app
bun install
bun run dev        # http://localhost:3000/tool?demo=1   (?tour=1 starts the tour)
bun run test       # vitest (engine, checker, designs, site checks, UI logic)
bun run build && bun run start
```

## Where things are
| Path | What |
|---|---|
| `app/` | Next.js app (TypeScript, Tailwind, MapLibre GL, terra-draw, zustand) |
| `app/src/engine/` | Pure TypeScript engine: geometry, setbacks, envelope, designs, checker, site checks |
| `app/src/rules/bangkok-y10.json` | Every rule number used by the engine, with sources |
| `app/src/ui/` | Simple and Expert panels, Compare, the guided tour (`Tour.tsx`) |
| `research/RULES.md` | The law for ย.10 in plain English, with clause and page citations |
| `research/AI_MISSES_LOG.md` | Mistakes the AI made during the build and how they were caught |
| `BUILD_PLAN.md`, `EXPECTATIONS.md`, `DEVIATIONS.md` | The spec, the definition of done, and every change from the spec |

## Next (not in v1)
- More than one plot (combine parcels, or compare plots side by side).
- Rule inspector: open any rule with its clause text, the numbers it set on this plot and the checks that use it.
- Zones other than ย.10; Overpass as a second site-context source.

Map data © OpenStreetMap contributors, tiles by OpenFreeMap. Satellite imagery © Esri and partners.
