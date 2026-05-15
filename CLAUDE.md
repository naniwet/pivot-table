# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                  # vitest — all 1158+ tests
npm run test:watch        # vitest in watch mode
npm run test:coverage     # vitest + v8 coverage (core/ threshold 80%)
npm run typecheck         # tsc --noEmit (strict mode)

# Run a single test file
npx vitest run src/core/queryBuilder/buildQuery.test.ts
npx vitest run src/components/PivotTable/PivotTable.test.tsx

# Dev server (vite + Express proxy in parallel)
npm run dev               # localhost:5173 — needs proxy/configs.json with backend token

# Probe scripts (validate backend protocol against live endpoint)
SMARTBI_TOKEN=xxx npx tsx scripts/probe-baseline.ts
SMARTBI_TOKEN=xxx npx tsx scripts/probe-final.ts
```

## Architecture

### Adapter pattern — the component is backend-agnostic

`PivotTable` depends on two things the host provides:

- `Metadata` — describes available fields/hierarchies/measures
- `onQuery(query, ctx) → CellSet` — executes a query and returns data

The component knows nothing about where data comes from. `src/api/smartbi/SmartbiClient.ts` is one concrete adapter implementation (used by the demo), but any data source (Excel, SQL, in-memory) can be plugged in by implementing the same protocol.

### Layered structure (inside-out)

```
types/        → shared type contracts (Query, CellSet, Metadata, ViewConfig, RenderModel)
core/         → pure functions, zero React/DOM/IO dependencies
hooks/        → React hooks (useViewConfig reducer, usePivotQuery, context menus)
components/   → React components (PivotTable, renderers, FieldTree, DropZones, etc.)
api/          → concrete backend adapters (optional, host replaces this)
fixtures/     → test metadata + CellSet builders (exported for host integration tests)
```

**Rule: `core/` must remain pure** — no React, no DOM, no IO, no `Date.now()`, no global state. Every function takes explicit inputs and returns explicit outputs. This makes core/ testable in node (fast, no jsdom) and keeps coverage at 99%+.

### Key dataflow pipelines

1. **ViewConfig → Query**: `core/queryBuilder/buildQuery.ts` composes 6 translators (rows, columns, sorts, dimensionFilter, measureFilter, pageSettings) into a single `ViewConfig + Metadata → Query` pure function. Each translator is an independent pure function in `translators/`.

2. **CellSet → RenderModel**: `core/cellSetParser/parseCellSet.ts` converts raw CellSet into a `RenderModel` (2D matrix + row/column header trees + grand totals). This is pure — the renderers only consume the RenderModel.

3. **ViewConfig state**: `hooks/useViewConfig.ts` wraps all `core/viewConfig/` pure mutators into a single `useReducer`. Supports controlled (`value` + `onChange`) and uncontrolled (`defaultValue`) modes. Undo/redo is implemented as state snapshots within the reducer.

4. **Query execution**: `usePivotQuery` (paged mode) and `useScrollPivotQuery` (infinite scroll) are separate hooks. Both handle L0 cache, AbortSignal, and error/loading states.

### ViewMode — single-source mode flag

`core/viewMode/` derives a `ViewMode` enum from ViewConfig (pivot vs adhoc × display mode) in one place. Components and hooks check `viewMode` instead of scattering `isAdhoc` / `displayMode` checks everywhere.

### Hierarchy drill (ADR-004, C2 strategy)

Drill is **global axis depth**, not per-member expansion. A hierarchy with `drillDepth: N` produces N level fieldNames in `query.rows`. Drill ▶ increments depth, drill ▼ decrements it, and each change triggers a new query. The backend returns a Cartesian product of all levels — there are no drill-related filters. See `ADR-004-finding.md` for the full investigation that led to this design.

### Field naming conventions (locked — irreversible)

- `fieldName` for field identifiers (never `field`/`name`/`id`)
- `measureName` for measure identifiers (never `measure`/`metric`)
- `drillDepth` for hierarchy axis depth (never `expandedMembers`, which is deprecated)

These are in `src/types/viewConfig.ts` and affect serialization compatibility.

## Test infrastructure

- **Environment matrix**: `core/` tests run in node (fast, no DOM). `components/` and `hooks/` tests run in jsdom. Configured in `vitest.config.ts` via `environmentMatchGlobs`.
- **Coverage threshold**: core/ must maintain 80% lines/functions/branches/statements. Measured with `@vitest/coverage-v8`.
- **ResizeObserver polyfill**: `vitest.setup.ts` stubs `ResizeObserver` for jsdom (needed by ChartRenderer).
- **TDD expectation**: write a failing test first, then the minimal implementation, then refactor. This applies to all core/ and most component/hook work.

## Demo proxy architecture

```
Browser (vite:5173) → Express proxy (3100) → Smartbi backend
```

- `/api/configs` — CRUD for backend configurations (stored in `proxy/configs.json`, gitignored)
- `/proxy/:id/*` — reverse-proxies to the configured Smartbi backend, injecting auth headers
- `proxy/server.js` body parser is scoped to `/api` only — the `/proxy` POST body passthrough is intentional (classic http-proxy-middleware pitfall)

## Development conventions

- **TDD required**: test → implement → refactor. Core code must be testable in under 5 minutes with mockable dependencies.
- **No abstraction without 3 concrete cases**: don't create base classes, registries, or config files until duplication is real.
- **Probe before guessing**: when unsure about backend behavior, write a `scripts/probe-*.ts` script and test against a real endpoint instead of assuming.
- **Trade-off comments**: key design decisions should include "收益 / 代价 / 何时翻案" rationale.
