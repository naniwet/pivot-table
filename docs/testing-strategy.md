# Testing Strategy

This project keeps tests useful by separating what each layer is allowed to prove.
The goal is a pyramid-shaped suite: most behavior in fast node tests, a smaller
jsdom layer for React wiring, and a small probe layer for real Smartbi protocol
checks.

## Layers

| Layer | Command | Scope | Purpose |
| --- | --- | --- | --- |
| Unit | `npm run test:unit` | `src/core/**`, `src/types/**` | Pure rules, query translation, parsers, reducers, serializers, render-model builders. |
| Contract | `npm run test:contract` | key `src/core/**` protocol folders | Stable payload contracts such as `ViewConfig -> Query`, drill-through, drop rules, and view-config mutations. |
| Integration | `npm run test:integration` | `src/hooks/**`, `src/components/**`, `src/api/**` | React state wiring, DOM states, callback wiring, async hook behavior, and adapter behavior. |
| Probe E2E | `npm run probe:smoke` | `scripts/probe-*.ts` | Real backend protocol smoke checks. Requires `SMARTBI_TOKEN` and backend config. |

`npm test` still runs the full automatic vitest suite.

## What Goes Where

Write a core/unit test when the assertion is about data shape or business rules:

- query payloads, `customElements`, filters, sorts, paging, and mode translation
- `CellSet -> RenderModel`
- expression parsing and generated MDX / calc column expressions
- drop rules, field usage, duplicate detection, custom field validation
- detail / adhoc behavior that can be expressed without React

Write a hook integration test when the assertion is about React state orchestration:

- reducer dispatches and controlled/uncontrolled behavior
- cache, abort, retry, and query lifecycle hooks
- hook-level menu composition when it depends on React memoization or callbacks

Write a component integration test only for UI contracts:

- visible / hidden / disabled states
- user interaction invokes the expected callback or dispatch
- loading / error / empty / ready rendering
- one or two smoke flows that prove components are wired together

Do not use component tests to re-prove query payload details. If a component click
ultimately builds a query, the component test should assert that the callback fires
with the expected broad mode, while the exact payload belongs in `src/core/**`.

## Probe E2E Policy

Probe scripts are not a replacement for unit tests. They protect protocol facts
that mocks cannot prove:

- backend accepts the emitted payload shape
- quick calculations serialize correctly
- aggregator overrides survive the adapter
- `calc_measure`, `calc_column`, and adhoc/detail queries work against a real endpoint

Keep `probe:smoke` short. Add narrow probe scripts for new backend discoveries,
then codify the resulting rule in core tests.

## Maintenance Rule

When adding a feature, start at the lowest layer that can prove the behavior.
Only add jsdom coverage for the React wiring that remains after the pure logic has
been tested.
