# integration — adversarial checks

Read ../../Refinement.md requirement/scenario matrix and validation amendments; all relevant cases mandatory. Exact source criteria below, including negative/concurrency/state transitions, not coverage-by-title alone. Independent anti-drift after implementation+checks; fix code/spec by logged judgment. One review then concrete fixes/targeted closure, no optional polish.

- SC-US-024-1: Given exact build/fixture/host; When 10 clients каждый выполняет20 warm-up+100 measured GET owned project/list requests; Then nearest-rank p95≤500ms для1000 ответов, status/body проверены, ошибки/timeouts не удаляются и валят проверку.
- SC-US-024-2: Given immutable200-line fixture с Decimal/unknown/services/delivery/reserve; When 50 warm-up+1000 measured calculations; Then nearest-rank p95≤100ms и1000 canonical result hashes равны golden; exception/missing sample валит проверку.
