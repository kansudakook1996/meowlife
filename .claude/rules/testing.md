# Testing rules

- Run `npm run verify` before reporting work as done. Paste the real command output summary.
- If something cannot be run (e.g. no Firebase project yet), say so and describe how to test it.
- Unit tests sit next to the code as `*.test.ts`. Pure logic in `src/shared/` must have tests.
- Repository tests use an in-memory database: `new DatabaseSync(':memory:')` + `migrate(db)`.
- Money tests must cover: parsing with commas, 2 decimal places, rejecting 3 decimals,
  negative values, very large values, and summing without float drift.
- Date tests must cover: month end (31 → Feb 28/29), leap years, year boundary, Buddhist-year display.
- Never weaken or delete a failing test to make CI green; fix the cause or document it in LEARNINGS.
- Manual test checklist lives in `docs/TEST_PLAN.md`; tick items only after doing them for real.
