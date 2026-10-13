# RoomKind — C4 Context and Containers

```mermaid
flowchart TB
  Owner[Room owner] --> RoomKind[RoomKind]
  Viewer[Consented share viewer] --> RoomKind
  Operator[Operator] --> RoomKind
  RoomKind --> Pay[YooKassa hosted checkout]
```

```mermaid
flowchart LR
  Browser[Native web UI] --> Web[Node web/API]
  Web --> DB[(PostgreSQL state/ledger/jobs)]
  Worker[Python GPU worker] --> DB
  Web --> Files[Private volume]
  Worker --> Files
  Web --> Provider[YooKassa API]
```

Trust boundaries: browser cannot select amount/entitlement/owner; provider event requires independent verification; worker requires active fence; public viewer receives only consented composite. PostgreSQL has no host port, model weights never browser assets. Real GPU profile and explicit fixture profile represent different evidence classes.
