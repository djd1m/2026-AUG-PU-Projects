# Specification — expanded-mvp delta v1

Source: 61ea349f; RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1. Scope/assumptions: ../../plans/expanded-mvp-plan.md (coordinator relocates link on integration).

## Executive Summary
Обязательны unlimited connected, автоматический живой прогрев и OpenAI AI replies/HITL+consented autopilot. Canonical safety-v1 сохраняется, новый purpose входит в ту же общую квоту. Параметры A1–A3 предложены для checkpoint, не измеренные результаты. Commercial unlimited не отменяет finite active admission. Live billing не входит.

## User Stories and Acceptance Criteria

### FR-expanded-mvp-001 — Unlimited connected и active admission

US-101: как владелец я хочу unlimited connected и active admission, чтобы получить проверяемый безопасный результат.

### AC-expanded-mvp-001

[SC-US-101-1]
Given tenant с100 connected и30 active, When создаёт101-й и два worker одновременно активируют дополнительные, Then connected успешно создаётся без free/team cap, active≤30, лишние waiting_capacity; billing TEST semantics прежние.
Связано: FR-expanded-mvp-001.

### FR-expanded-mvp-002 — Live connection capability

US-102: как владелец я хочу live connection capability, чтобы получить проверяемый безопасный результат.

### AC-expanded-mvp-002

[SC-US-102-1]
Given allowlisted SMTP/IMAP endpoints и canary credentials, When diagnostics и fixtures TLS downgrade/DNS rebinding/AAD mismatch, Then SMTP/IMAP независимы, DATA=0, unsafe socket=0, no plaintext secret, только live-verified capability допускает live mode.
Связано: FR-expanded-mvp-002.

### FR-expanded-mvp-003 — Safe SMTP и bounded IMAP

US-103: как владелец я хочу safe smtp и bounded imap, чтобы получить проверяемый безопасный результат.

### AC-expanded-mvp-003

[SC-US-103-1]
Given submitting crash/post-DATA timeout и UIDVALIDITY reset, When restart/replay, Then unknown_delivery не retries, quota retained, stop effects уникальны, cursor/page atomic и pause до полного rescan+tail; pre-DATA max3/120s сохраняется.
Связано: FR-expanded-mvp-003.

### FR-expanded-mvp-004 — Persistent fair warmup runtime

US-104: как владелец я хочу persistent fair warmup runtime, чтобы получить проверяемый безопасный результат.

### AC-expanded-mvp-004

[SC-US-104-1]
Given30 active ящиков трёх tenant с бюджетом, When workers работают/restart при pair conflict, Then due polls≤30s healthy, fair due round≤60s, pool allocation≤5min каждому eligible, pair/day≤1 и thread≤2; без peers waiting и0 sends.
Связано: FR-expanded-mvp-004.

### FR-expanded-mvp-005 — Inbound context и retention

US-105: как владелец я хочу inbound context и retention, чтобы получить проверяемый безопасный результат.

### AC-expanded-mvp-005

[SC-US-105-1]
Given matched incoming и oversized/foreign/injection/automatic/optout input, When ingest, Then campaign stop committed first, only own thread≤5 messages/64KiB and body≤32KiB, attachments/remote fetch0, unsupported hold; terminal body deletion≤24h and absolute TTL7days.
Связано: FR-expanded-mvp-005.

### FR-expanded-mvp-006 — OpenAI draft и HITL

US-106: как владелец я хочу openai draft и hitl, чтобы получить проверяемый безопасный результат.

### AC-expanded-mvp-006

[SC-US-106-1]
Given bounded own context и explicit content-processing consent, When generation or timeout/budget saturation/replay, Then one versioned draft per event/policy, no SMTP by model, input≤8000/output≤500 tokens, timeout30s/max2 safe attempts/65s total; changed draft invalidates prior approval and UI clearly shows pending/error/hold.
Связано: FR-expanded-mvp-006. Дополнительно обязательны normative [ai-policy-v1](ai-policy-v1.md): deterministic intent/snapshot/snippet oracle и gates0 unauthorized,100% correct holds,≥90% useful supported answers; fixture pass не live model proof.

### FR-expanded-mvp-007 — Отдельное разрешение AI reply

US-107: как владелец я хочу отдельное разрешение ai reply, чтобы получить проверяемый безопасный результат.

### AC-expanded-mvp-007

[SC-US-107-1]
Given separate unexpired policy scoped by mailbox/recipient/thread/intent/business context and approved draft hash or autopilot, When enqueue/revoke/suppress race, Then explicit ai_reply purpose uses all current final fence predicates, parent campaign stays stopped, quota shared, duplicate dispatch0 and post-boundary inflight limitation disclosed.
Связано: FR-expanded-mvp-007. Дополнительно обязательны [ai-policy-v1](ai-policy-v1.md): exact approved assembly, no free-form autosend, immutable authority hashes и разрешённый actual-model gate до автопилота; ошибки/quality holds остаются в первоначальном eligible denominator.

### FR-expanded-mvp-008 — Честный full-path SLO

US-108: как владелец я хочу честный full-path slo, чтобы получить проверяемый безопасный результат.

### AC-expanded-mvp-008

[SC-US-108-1]
Given frozen7day pilot cohort300 eligible arrivals under A1 including outage/quota/error/unknown and missed deadlines, When report, Then each arrival remains counted, unknown/error/unfinished rank infinity, ≥95% proven accepted<300s and effective p95<300s required; all counts/p99/valid timestamp N published and unknown provenance never replaced by observed.
Связано: FR-expanded-mvp-008.

### NFR-expanded-mvp-001 — Безопасность и эксплуатационные ворота

US-109: как владелец я хочу безопасность и эксплуатационные ворота, чтобы получить проверяемый безопасный результат.

### AC-expanded-mvp-009

[SC-US-109-1]
Given live gates absent/revoked or model budget exhausted, When workers/start/send, Then0 unauthorized external calls, explicit blocked state; TEST billing unchanged, kill switch wins final fence before submission, no secrets/body in audit; local fixtures and live readiness independently labelled.
Связано: NFR-expanded-mvp-001.

## Feature Matrix
MVP: все FR-n7x и NFR-n7x выше, live pilot после внешнего gate. V1/v2: расширение измеренной ёмкости/OAuth/provider integrations только отдельным планом. CRM, domain purchase, fake opens, paid billing вне этого scope.

## Non-Functional Requirements
Существующие tenant/auth/AEAD/pinning/stop/quota/unknown invariants обязательны во всех новых ветвях. Poll freshness<60s и no automatic incomplete-rescan resume сохраняются. Active capacity30 globally per installation, not per tenant; SMTP2/global1/mailbox, IMAP4/global1/mailbox, LLM2/global; provider lower limits wins; input/body/token/time/retention bounds A3. До outbound AI обязательны optout/bounce/OOO/bulk/loop detection и approved scope; модель не решает свои полномочия.

## Success Metrics
| Metric | Target | Source |
|---|---|---|
| Connected entitlement | без cap3/10; tested101 | наша БД |
| Active admission | ≤30 proposed | наша БД |
| Poll cadence / pool round | ≤30s / ≤5min healthy underA1 | наша БД |
| Full reply p95 / ontime | <300s / ≥95% из всех eligible, 300events/7days | наша БД + наш журнал arrival proof |
| Safety violations |0 | наш журнал |
| Content TTL | terminal≤24h, absolute≤7days | наша БД |

SLO definition and failure denominators are normative in expanded-mvp-plan.md; fixture timing never substitutes live timing. Threshold tests assert literal values independently from production constants.
