# UI rules

- All visible text in Thai, short and friendly ("บันทึก", "ยกเลิก", "เพิ่มรายการ").
- Colors come from CSS variables in `src/renderer/src/styles/theme.css`; don't hard-code hex in components.
- Status is always color + icon + text (never color alone). See `docs/UX_GUIDELINES.md`.
- Every list needs an empty state (cat + one sentence + primary action).
- Destructive actions: confirm dialog, then an Undo toast when the action is reversible.
- Every interactive element is reachable by keyboard and has a visible focus ring.
  Icon-only buttons need `aria-label` and a `title` tooltip in Thai.
- Thai text must not be clipped: avoid fixed heights on text, use `line-height ≥ 1.5`, allow wrapping.
- Layout must work from 900×600 up; use flex/grid, no fixed pixel widths for content.
- No fake data or decorative buttons that do nothing. Unfinished features are hidden or marked
  "เร็ว ๆ นี้" and disabled.
- Cat mascot is the original SVG in `src/renderer/src/components/CatMascot.tsx`; tone is gentle,
  never guilt-tripping.
