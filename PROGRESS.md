# PROGRESS.md: status report for the planning session

## Feedback round (20 Nov, evening)

Amitesh's feedback after v1, each item fixed, checked and pushed on his word (branch `feedback-fixes`, fast-forwarded into `main`, Vercel auto-deploy, checked on the live site):

| Feedback | Result | Commit |
|---|---|---|
| Landing page should say what the app does, to the point | Copy rewritten; "Coming next" badges removed (all 4 steps were live) | `e134e16` |
| Expert mode fills the whole phone screen | One bottom sheet (45 %) with Inputs / Designs tabs and Hide; 2-row header; map framing uses the whole map | `e134e16` |
| Fix the Compare screen | One column per design; reason shown for a design that can't be built; checks, "limited by", "Show on map"; bottom sheet on phones | `d014795` |
| Landing page in skill-issue.in's layout and styling | Framed card, dark hero with italic serif title, filter pills, row cards; own content and art | `d014795` |
| Guided tour for first-time users | 10 steps, only on request (Tour / "?" button, `/tool?tour=1`): fly to an empty lot, Draw, a hand on each corner, road, verdict, model, Expert designs, Compare | `153a363` |
| (found by the tour) | Road-edge name came from a cross street at junctions ("Soi Ari" for Phahon Yothin Road); fixed with a regression test | `153a363` |

- **Verified:** 116 tests, lint, typecheck and build pass. Headless Chrome on the dev server and the production build, desktop (1440 px) and phone (390 px); the full tour ran end to end with real mouse events, also on the live site. No page errors.
- **Screenshots:** `docs/screenshots/0-landing.jpg`, `7-tour.jpg`, `8-tour-phone.jpg`, `9-expert-phone.jpg` added and `4-compare.jpg` replaced (production build); README updated.
- **Out of date below:** §6 "Expert on a phone: still little map" (fixed above).
- **AI misses logged:** #42-#47.

---


Generated 2026-11-20 14:15 IST. Round: **planning review 12:15, decisions 1-5** (H.3 cut, H.2 toggles, editable assumptions, M5 polish, M7 screenshots). Evidence comes from fresh `test` / `lint` / `build` runs at **14:08**, a **clean-copy build at 14:12** (only files git would commit: `git ls-files -co --exclude-standard`, fresh `bun install --frozen-lockfile`), and headless Chrome on `http://localhost:3000` (dev server 13:40-13:55, production build 13:58-14:10). Overwritten each time. Not deployed, not pushed. The planning session's repo prep (root `.gitignore`, `README.md`, `research/sources/README.md`, CLAUDE.md hosting rule) is kept; README files were only added to.

**Clock:** 24 h 35 m left at 14:14 IST (deadline 2026-11-21 09:19 UTC).

**Summary:**
- **H.3 rule inspector:** cut. Listed under "Next" in `README.md` and `app/README.md`; DEVIATIONS row.
- **H.2 layer toggles:** Expert-only row Envelope / Design / Setbacks under the map-style switch. Setbacks is a new ground layer (the strip between the plot edge and the ground floor of the allowed space, dashed inner edge). The legend follows the toggles. Simple ignores them.
- **Editable assumptions:** 7 values plus "parking counted in floor area". Ranges enforced, kept in undo and in the share link, reset button, 6 new tests. Every edit reaches both the design generators and the independent checker.
- **M5 polish:** amber left the panels; the step guide follows the steps and then hides; there is no empty panel while loading; on phones the plot is now in view (it wasn't) and the map controls no longer sit under the result sheet.
- **M7:** 6 curated screenshots in `docs/screenshots/` (committed, 1.0 MB JPEG total, taken from the production build), referenced in the root README.
- **Regression:** break-it re-run is **12 / 12 PASS**, no page errors. **115 tests** pass.

---

## 1. Milestone status

| M | Status |
|---|---|
| M0-M1, M3 | done |
| M2 | partial (Overpass deferred per Q1; stations done) |
| M4 | **done.** H.3 rule inspector cut (DEVIATIONS); H.2 built as Envelope / Design / Setbacks (no Rules layer); assumptions editable |
| M5 | **done** (pass below) |
| M6 | break-it 12 / 12 (re-run this round); < 16 ms met on real hardware; clean-copy build passes |
| M7 | screenshots + README done; Amitesh writes the doc; "go public" waits for Amitesh |

```
M4/M5 status: done; M7: screenshots in README
Verified: build ✓ lint ✓ tests ✓ (115 passing at 14:08: engine 35, siteChecks 34, designs 14, simple 12, assumptions 5, history 5, roadGroups 5, scenario 3, geo 2) · clean-copy build ✓ (14:12) · browser ✓ (dev + production; app/test-artifacts/M5-*.png, S-*.png; docs/screenshots/*.jpg)
Expectations met: C (now incl. editable assumptions), H.1, H.2 (3 layers), H.4, H.5, H.6, H.7, I (12/12 re-run)
Golden numbers: part D unchanged (default assumptions give identical results: test)
Deviations: DEVIATIONS.md rows "(M5)" ×4 and "(M7)" ×1
AI misses logged: #38-#41
Next: Amitesh's doc; "go public" on his word
```

---

## 2. Decisions 1-5

| # | Decision | Result |
|---|---|---|
| 1 | H.3 rule inspector: cut | Cut. "Rule inspector" is in "Next" in both READMEs; a DEVIATIONS row says each check row's clause chip and `research/RULES.md` stand in for it |
| 2 | H.2 toggles, ≤ 30 min | Built (≈ 35 min with the setbacks layer, which did not exist). Browser: Setbacks on → layer visible with 2 features (band + edge); Design and Envelope off → both `visibility: none`; switching to Simple → envelope and design visible, setbacks hidden. `M5-setbacks.png` |
| 3 | Editable assumptions | Built, details in §3 |
| 4 | M5 polish pass | Done, details in §4 |
| 5 | M7 screenshots | 6 files in `docs/screenshots/`, a table in the root README. Checked: not git-ignored; present in the clean copy |

## 3. Editable assumptions (Expert → Assumptions)

- **Fields (range):**
  - ground floor height 4.5 m (3-8);
  - typical floor height 3.0 m, office 3.6 m (2.6-5);
  - net / gross efficiency 75 / 80 / 65 % by type (50-95);
  - condo unit 35 m² (20-300), shown for condo only;
  - hotel room 32 m² (18-120), shown for hotel only;
  - m² per stall 30 (20-45);
  - permeable share of open space 60 % (0-100);
  - "parking counted in floor area" yes / no.
- **Input rules:**
  - Out of range: the edit is refused, the field goes back to the last value and a red line says the range ("Use 2.6–5 m"). Browser check: the store is unchanged.
  - An edited value gets a dot; "Reset N edited" clears them all.
  - Floor height and efficiency defaults follow the type until edited.
- **Undo and share link:** edits are in undo / redo and in the share link. The decoder keeps only known keys with in-range values, so a hand-edited link can't inject bad values (test).
- **Engine:**
  - The resolved assumptions go into the envelope (floor heights), the generators (programme, parking, open-air stalls) and the checker's own inputs.
  - Found on the way: the envelope used 3.0 m floors for offices while the designs used 3.6 m (AI miss #40). Both now read the same value.
- **"Parking counted in floor area: no":**
  - What it affects: parking floors leave the floor area used for the **FAR limit only**. The open space ratio, the parking requirement and the 10,000 m² extra-large test still use the total.
  - The generators re-stack with the parking area as an allowance until it settles. A step is kept only if its non-parking area still fits the FAR cap.
  - The FAR row reads "(…, parking not counted)", and the area table adds "Parking, not counted for FAR" and "Counted for FAR" rows; its totals check compares against that.
  - Test: design A at W = 12 grows by more than 100 m², and FAR still passes with the checker's own measurement.
  - It is a what-if: whether parking counts is for the architect to confirm, and the panel says so.
- **Browser check (demo, W = 8):**
  - typical 3.5 m → 8,365 m², 22 m;
  - unit 60 m² → 69 homes (was 149);
  - parking not counted → FAR "2.79 (5,576 m², parking not counted)", area table "totals match ✓";
  - undo restores parking-counted;
  - a new tab from the link has the same assumptions;
  - reset brings back 9,752 m².
- **Tests:** `tests/assumptions.test.ts` (5) plus a scenario test for bad values. Default assumptions give exactly the old results.

## 4. M5 polish pass

- **Amber:** the panels no longer use amber except for the clicked check row (the proof).
  - The site-check "!" chips are now dark neutral.
  - The no-road prompt uses the road-edge blue, with `role="status"` instead of `"alert"`.
- **Step guide (Expert, bottom of the map):**
  - Before: it stayed up after the plot was finished, saying "Plot ready… Next build: …".
  - Now it follows the steps: Step 1 mark plot → Step 2 mark the road side → "Check the road width" while the width is an estimate → hidden once everything is confirmed.
- **Loading:** the Expert inputs panel was an empty white strip until the map loaded. It now appears with the map.
- **Phone:**
  - **Camera:** it used fixed desktop padding (380 px left), so on a 390 px phone the plot was off screen. The padding now scales with the map, and the plot sits between the top card and the result sheet. `docs/screenshots/6-phone.jpg`
  - **Map controls:** in Simple on phones, attribution moves top-right and starts collapsed (MapLibre opened it over the step card). The zoom buttons (pinch works) and the scale bar are hidden, so nothing shows through the sheet.
- **Copy:** the site check "You'll confirm the road edge and width in the next step" is now "Confirm the road edge and width under Road", which still reads right after the road is confirmed.
- **Checked, no change needed:** Expert empty state, Simple empty state, no-road state, broken share link, loading state (`app/test-artifacts/S-*.png`).

## 5. Break-it re-run (regression, 13:55, dev server)

All 12 rows of EXPECTATIONS §I pass again; the results match the 12:05 run (see the previous report in git history for each row's detail). Page errors: none.

## 6. Known bugs and gaps (blunt)
- **H.2 has no "Rules" layer:** rules stay in the left panel. **H.3 is cut.**
- **Toggle labels are tight:** "Envelope / Design / Setbacks" fit in the 152 px control at 10 px.
- **Setbacks layer:** shows the ground floor of the envelope class on screen (high-rise when allowed), not per design.
- **Design toggle off:** the envelope stays at the faded opacity it uses when a design is shown.
- **"Parking not counted":** has no effect on a design that is not FAR-limited (e.g. the demo's low-rise C, limited by height). This is correct, but a user may expect a change.
- **Expert on a phone:** still little map; Simple is the phone mode.
- **10 ha plots:** settle slowly headless; unmeasured on real hardware.
- **Not faked:** every number comes from the engine, JSON or checker. The README screenshots are real states; the proof shot was zoomed out 0.9 levels after the automatic framing so the tower fits.

## 7. Files this round
- **New:**
  - `app/tests/assumptions.test.ts`;
  - `docs/screenshots/1-simple-demo.jpg … 6-phone.jpg`.
- **Changed:**
  - engine: `assumptions.ts` (editable assumptions, ranges, sanitise), `designs/common.ts`, `designs/index.ts` (assumptions in context; shared envelope / region caches; parking-outside-FAR re-stack), `index.ts`, `checker.ts` (FAR without parking when set), `worker.ts`, `verdict.ts`, `siteChecks.ts` (copy);
  - `store.ts` (assumptions, layers), `ui/scenario.ts`, `site/engineClient.ts`, `app/ClientShell.tsx`, `app/globals.css`;
  - `map/MapView.tsx` (toggles, setbacks data, responsive camera padding, attribution), `map/layers.ts` (setbacks layer, `setLayerToggles`);
  - `ui/ExpertSteps.tsx` (editable assumptions), `ui/ViewControl.tsx` (toggle row), `ui/Legend.tsx`, `ui/DesignPanel.tsx` (area table), `ui/StepGuide.tsx`, `ui/RulesSummary.tsx`, `ui/SiteChecks.tsx`;
  - `tests/scenario.test.ts`;
  - `README.md` (screenshots, Next), `app/README.md` (Next), `DEVIATIONS.md`, `research/AI_MISSES_LOG.md` (#38-#41).

## 8. Next
1. Amitesh writes the submission doc (agents don't).
2. "Go public" (push + Vercel) when Amitesh says so. The clean-copy build already passes.
3. Optional, only if asked: a Rules map layer; setbacks per selected design.

### How to run
```powershell
cd E:\kush-assignment\app
bun install
bun run dev                 # http://localhost:3000/tool?demo=1   (#mode=expert for Expert)
bun run test; bun run lint; bun run build
bun run start               # production; add ?perf=1 to log engine timings
```
