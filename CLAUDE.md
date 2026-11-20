# CLAUDE.md

Project: Bangkok plot-feasibility + 3D massing tool (General Machines assignment).

Read first, in order:
1. `BUILD_PLAN.md`: the engineering spec (stack, engine formulas, designs, checker, milestones). Follow it.
2. `research/RULES.md`: the law, with clause citations. Machine version: `research/rules/bangkok-y10.json`.
3. `EXPECTATIONS.md`: what "done" means, section by section against BUILD_PLAN.md. A milestone is done only when built, tested, and seen working in a real browser on localhost.
4. `DEVIATIONS.md`: log every change from the plan here before making it.
5. `ASSIGNMENT_BRIEF.md`: the brief and how it is judged (local only, gitignored).

Rules for agents:
- App lives in `app/` (Next.js + TypeScript + Tailwind, Bun). Engine in `app/src/engine` is pure and unit-tested (vitest).
- Rule numbers come only from the JSON; never hardcode them in UI code.
- The checker must measure geometry independently of the design generators.
- Do not author the submission write-up; the candidate writes it.
- Deadline 2026-11-21 09:19 UTC. Use the `time_left` MCP tool (general-machines) to check.
- Hosting (2026-11-20): Amitesh puts the repo on GitHub and deploys `app/` to Vercel himself. Agents do not push or deploy unless he asks. Keep `bun run build` working from a clean clone (no files that exist only locally).
- Log any AI mistake you or the user catch in `research/AI_MISSES_LOG.md`.
