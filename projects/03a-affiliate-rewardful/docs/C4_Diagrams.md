# C4 — N3a, предложенная топология

Дата: 2026-09-09. План до кода. Границы согласованы с [Architecture](Architecture.md), [Pseudocode](Pseudocode.md), [ADR-001..008](ADR.md). Mermaid использует обычные flowchart/sequence для переносимого отображения C4-уровней; блоки не означают уже запущенные сервисы.

## Level 1 — Context

```mermaid
flowchart LR
  Owner[Owner and authorized operator]
  Partner[Partner]
  Customer[Referred N1 customer]
  N3a[N3a partner accounting]
  N1[N1 Proofwall billing authority]
  YK[YooKassa]
  Bank[External bank used manually]
  Owner -->|configure reconcile export report transfer| N3a
  Partner -->|accept terms assets own ledger| N3a
  Customer -->|register and intentional manual renewal| N1
  N1 -->|checkout and canonical verification| YK
  YK -->|status notification| N1
  N1 -->|signed verified business events| N3a
  N3a -->|authenticated source reconciliation| N1
  Owner -->|manual transfer outside N3a| Bank
  Bank -.->|receipt available to operator| Owner
```

N3a не вызывает банк и не подтверждает получение денег. YooKassa credentials принадлежат N1. Platform referral enrollment/leads — отдельный контекст N3a без второго денежного connector; N1 продажи не считаются продажами платформы.

## Level 2 — Containers

```mermaid
flowchart TB
  Browser[Responsive browser]
  Gateway[Existing TLS ingress]
  subgraph N3a private namespace
    Web[Web container: SSR and private API]
    Worker[Worker container: reconcile registry leases]
    DB[(Private PostgreSQL)]
    Backup[Encrypted immutable snapshot and backup storage]
    Web --> DB
    Worker --> DB
    DB --> Backup
  end
  subgraph N1 independent namespace
    N1Web[N1 checkout webhook and attribution adapter]
    N1Dispatch[N1 outbox dispatcher]
    N1DB[(N1 database)]
    N1Web -->|billing plus outbox atomic commit| N1DB
    N1DB --> N1Dispatch
  end
  Browser --> Gateway --> Web
  N1Dispatch -->|HTTPS HMAC after commit| Web
  Worker -->|scoped HTTPS feed| N1Web
```

Нет связи N3a→N1DB, cross-project runtime import или host DB port. Web — единственный участник ingress network; worker/DB приватны. Node22/TypeScript/Next.js и pg предлагаются до exact dependency audit. Изолированные test/demo namespaces не переиспользуют production volumes.

## Level 3 — Components

```mermaid
flowchart LR
  Route[HTTP boundary rate size auth]
  Identity[Sessions membership scopes]
  Program[Program policy and partner assets]
  Intake[Signed event intake and N1 attestation]
  Ledger[Payment refund immutable ledger]
  Registry[Month close allocations carry]
  Tax[Persistent all-model payer year guard plus base YTD]
  Confirm[Observe external fact and evidenced confirmation]
  Read[Scoped dashboard growth badge]
  Audit[Audit exceptions recovery gate]
  Route --> Identity
  Identity --> Program
  Route --> Intake
  Intake --> Ledger
  Ledger --> Registry
  Registry --> Tax
  Tax --> Confirm
  Ledger --> Read
  Confirm --> Read
  Route --> Audit
  Ledger --> Audit
  Confirm --> Audit
```

Финансовые модули — внутри одного приложения и одной N3a DB, не самостоятельные микросервисы. Read projections не могут изменять debt. Persistent Tax guard and observation blockers охватывают payer/person/year across programs and all tax models; program lock охватывает close и postings.

## Critical sequence — successful payment, lost ACK, repeat

```mermaid
sequenceDiagram
  participant Y as YooKassa
  participant N as N1 webhook
  participant ND as N1 DB
  participant O as N1 dispatcher
  participant A as N3a intake
  participant AD as N3a DB
  Y->>N: notification
  N->>Y: canonical GET outside transaction
  Y-->>N: merchant scoped succeeded facts
  N->>ND: BEGIN checkout lock
  N->>ND: billing update plus outbox plus legacy bypass
  N->>ND: COMMIT
  N-->>Y: 200
  O->>ND: lease committed outbox
  O->>A: raw bytes HMAC with fresh timestamp stable event UUID
  A->>A: signature then freshness then shape and attestation context
  A->>AD: BEGIN receipt plus unique payment plus commission
  A->>AD: COMMIT
  A--xO: ACK lost
  O->>A: same event new signed delivery timestamp
  A->>AD: existing receipt and body hash
  A-->>O: 200 original outcome
  O->>ND: acknowledge outbox
```

Отдельный sender event UUID не отменяет unique provider payment identity: новый transport ID той же оплаты также не начисляет повторно. Refund-before-payment ожидает parent/reconciliation; every new partial refund recomputes ALL canonical parent refund allocations, appending period differences. Prefreeze rechecks targets; semantic hash independent of delivery history, separate audit hash preserves it. Отказ до любого commit не оставляет consumed claim без денежного результата.

## Critical sequence — freeze and late refund

```mermaid
sequenceDiagram
  participant O as Operator
  participant R as Registry service
  participant DB as N3a PostgreSQL
  participant I as Refund intake
  O->>R: prepare prior month on 5th
  R->>R: reconcile source outside DB transaction
  R->>DB: program lock and period lock
  R->>DB: snapshot entries allocations carry and freeze atomically
  R->>DB: COMMIT stable hash
  I->>DB: same program lock then parent payment lock
  I->>DB: canonical all-refund targets plus append-only month differences
  I->>DB: COMMIT without editing frozen row
  R-->>O: read-only CSV
  O->>O: approved tax preparation then manual external transfer
  O->>R: report actual transfer with evidence
  R->>DB: lock persistent payer year guard then base and row record once
```

Смена фактической даты/налогового года не разрешает фиктивный sent: сохраняется external-transfer exception и нужна сверка. Из уже отправленной строки ничего не списывается повторно; следующая отрицательная сумма переносится ровно одной carry chain. Export не вызывает ConfirmManualTransfer.

## Recovery exception sequence — observation is not authorization

```mermaid
sequenceDiagram
  participant O as Authorized operator
  participant E as Observation endpoint
  participant G as Recovery gate and persistent year guards
  participant R as Evidence reconciliation
  O->>E: actual transfer evidence optional preparation
  E->>G: allowed under closed gate record blocker and immutable observation
  E-->>O: observation ID no confirmation no YTD
  O->>R: accountant approved actual date and inclusion evidence
  R->>G: lock old and actual year guards sorted then bases and row
  R->>G: atomically supersede old preparation and create corrected receipt
  R->>G: one confirmation actual year income update consume reservation
  R-->>O: operator reported sent never bank acknowledgment
```

Payment/refund/rounding/close/ordinary tax preparation/confirmation hold RecoveryGate shared lock and require normal through commit. Restore transition takes exclusive lock. Observation and evidenced recovery remain available while closed; no ordinary transfer can occupy a reserved/blocked payer-year gap. Signup yields session-only context; acceptance of the user's own trusted invitation atomically grants partner read scope and assets, then enables program reads.
