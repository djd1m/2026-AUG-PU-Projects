# C4 Diagrams — N6b «RAG-бот для сайта»

**Фаза:** 1 · **Дата:** 2026-09-30 · Текстовое описание компонентов — [`Architecture.md`](Architecture.md).

## Level 1 — System Context

```mermaid
flowchart TB
  owner([Владелец сайта / студия])
  visitor([Посетитель чужого сайта])
  operator([Оператор N6b])
  n6b[[N6b — RAG-бот для сайта]]
  site[(Сайт владельца<br/>страницы, robots.txt, sitemap)]
  openrouter[[OpenRouter API (шлюз к OpenAI)<br/>эмбеддинги и генерация]]
  owner -- "регистрирует бота, даёт URL и PDF, вставляет script" --> n6b
  visitor -- "задаёт вопрос в виджете / на демо" --> n6b
  operator -- "метрика недели, пределы, план" --> n6b
  n6b -- "обходит по RFC 9309" --> site
  n6b -- "v1/embeddings, v1/chat/completions" --> openrouter
```

## Level 2 — Containers

```mermaid
flowchart TB
  subgraph Host["Страница хозяина (чужой origin)"]
    W[w.js — виджет<br/>Shadow DOM, бейдж]
  end
  PX[Существующий TLS-прокси машины<br/>ADR-014]
  subgraph N6B["Docker Compose name: n6b"]
    WEB[web — Next.js 15<br/>кабинет, API, /api/widget, /b, /r/b, /admin]
    WRK[worker — Node 22<br/>аренда задач ADR-005]
    MIG[migrate — one-shot]
    DB[(Postgres 16 + pgvector<br/>ADR-002, без портов)]
  end
  OAI[[OpenRouter API]]
  SITE[(Сайт владельца)]
  W -- "HTTPS POST /api/widget/ask (CORS, без credentials)" --> PX
  PX --> WEB
  WEB -- "SQL, RLS" --> DB
  WRK -- "SQL, SKIP LOCKED" --> DB
  MIG --> DB
  WEB -- "эмбеддинг вопроса, генерация" --> OAI
  WRK -- "эмбеддинги фрагментов" --> OAI
  WRK -- "HTTP GET, SSRF-фильтр ADR-013" --> SITE
```

## Level 3 — Components (web: путь ответа)

```mermaid
flowchart LR
  REQ[POST /api/widget/ask] --> GATE[Origin gate<br/>ADR-007]
  GATE -->|origin ∉ allowed| F403[403 без вызова модели]
  GATE --> QUOTA[Quota reserve<br/>ADR-010, атомарно до вызова]
  QUOTA -->|предел| F429[429 + контакт]
  QUOTA --> EMB[Embed question<br/>порт провайдера ADR-004]
  EMB --> SEARCH[HNSW top-5 по bot_id]
  SEARCH -->|sim < MIN_SIMILARITY| DK[«не знаю» + контакт<br/>ADR-003]
  SEARCH --> GEN[Generate JSON<br/>gpt-4.1-mini]
  GEN -->|unknown / пустые / чужие cited_ids| DK
  GEN --> CITE[Citations из БД<br/>URL или «файл, стр. N»]
  CITE --> LOG[question_log + widget_install]
  DK --> LOG
```

## Level 3 — Components (worker: индексация)

```mermaid
flowchart LR
  LEASE[Lease job<br/>SKIP LOCKED, fence] --> KIND{kind}
  KIND -->|site| ROBOTS[robots.txt RFC 9309] --> CRAWL[Crawl same host<br/>sitemap, ≤ план]
  KIND -->|pdf| PDF[Extract PDF<br/>pdfjs-dist]
  CRAWL --> DOC[Upsert document<br/>по content_sha256]
  PDF --> DOC
  DOC --> CHUNK[Chunk ≈500 ток.] --> CACHE{text_sha256<br/>уже есть?}
  CACHE -->|да| SKIP[пропустить]
  CACHE -->|нет| QE[Quota embed<br/>до вызова] --> EMBED[v1/embeddings] --> STORE[INSERT chunk]
```
