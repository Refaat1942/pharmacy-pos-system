---
name: Shared table primitives
description: Convention for adding sorting/quick-filter to data tables
---
All primary data tables route through `frontend/src/components/DataTable.tsx`:
`useSort(rows, accessors, initial?)`, `SortTh`, `useQuickFilter(rows, fields)`, `TableFilter`.

**Pipeline:** raw array → `useQuickFilter` → `useSort` → render `sorted` (use `sorted.length` for empty-state).

**Why:** there is no generic <table> component; tables are hand-written with a shared header pattern
(thead.bg-slate-50 text-xs uppercase; th.px-3 py-2.5 text-start/end/center). These primitives drop in
without restructuring markup and keep sorting/filtering purely client-side over already-loaded rows.

**How to apply:**
- Sort accessors for numeric/computed columns must return the UNDERLYING value (Number(...), days-left number), not the formatted string.
- Keep non-sortable columns (Actions, bulk-select checkbox, share/progress bars) as plain <th>.
- Quick filter is an ADDITIONAL in-memory refine box; never remove existing server-side search/date/status filters.
- Repoint derived baselines to RAW rows, not sorted: totals, share-bar max, etc. But select-all checkbox must operate on the VISIBLE sorted rows.
- Empties always sort last in both directions (comparator is direction-aware, not a blanket reverse).
- accessors/fields are read via refs so new object identity each render does NOT force a resort; deps are [rows, sort]/[rows, query]. Edge case: if accessor LOGIC changes (e.g. i18n language) without rows/sort changing, sort order lags until next interaction — acceptable for this UX feature.
- placeholder key: common.filter_placeholder (en/ar).
