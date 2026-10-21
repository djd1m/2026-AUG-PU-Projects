# N8 — C4 views v0.1

Architecture views; names match Architecture.md. Public HTTPS deployment was authorized and delivered on 2026-10-14 via Caddy; AI remains manual and payments off. Mermaid diagrams explain flows; runtime evidence lives in telemetry.

## Context

```mermaid
flowchart LR
  H[Homeowner] --> N8[N8 renovation planner]
  C[Invited viewer] -->|revocable image link only| N8
  N8 -. optional bounded scene proposal .-> O[OpenRouter]
  N8 -. optional verified checkout .-> Y[ЮKassa]
  H -->|official product link / manual confirmation| R[Retailer]
  H -->|exports file| S[Scaniverse or existing plan]
  S -->|local file upload| N8
```

## Containers

```mermaid
flowchart TB
  B[Browser: forms + Babylon viewer] --> W[Next.js web and API]
  W --> P[(Private PostgreSQL)]
  W --> F[(Private asset volume)]
  K[Worker: bounded parsers and proposal jobs] --> P
  K --> F
  K -. off by default .-> O[OpenRouter API]
  W -. off by default .-> Y[ЮKassa API]
  P -. no published port .- W
```

## Components / dependency rule

```mermaid
flowchart LR
  UI[Routes / UI] --> CR[Composition root]
  CR --> I[identity]
  CR --> S[space]
  CR --> D[design]
  CR --> P[procurement]
  CR --> B[billing]
  CR --> H[sharing]
  D -->|public types| S
  P -->|public IDs / types| D
  H -->|capability type| I
  CR --> A[Concrete adapters]
  A -->|implements ports| I
  A --> S
  A --> D
  A --> P
  A --> B
  A --> H
```

Pure domain cannot import Next.js, PostgreSQL, fs or concrete provider clients. Database/adapter stores own I/O, public domain entrypoints own policies. Cross-module writes happen in named application services/transactions, not via ad-hoc imports of another module's SQL internals.

## Data flow: change causes revision

```mermaid
flowchart LR
  M[Measured shell v1] --> D[Design v1]
  R[References] --> D
  D --> L[Product snapshots + quantities]
  L --> B[Budget v1]
  X[New dimension / price / wish] --> M2[New source or snapshot]
  M2 --> D2[New design / validation]
  D2 --> B2[Budget v2 + delta]
  B -. retained history .-> B2
```

## Drawing import flow

| Экран | Что загрузить / выбрать | Результат |
|---|---|---|
| 01 Обмеры → Чертёж | JPG/PNG/WebP с размерными подписями и права на файл | Приватное изображение; черновик распознанных чисел |
| Проверка распознавания | Единицы без обозначений, подписи длины/ширины/высоты по номерам | «Перенести» заполняет форму; ещё не сохраняет основу |
| Форма обмеров | Отсутствующая высота, двери/окна, подтверждение размеров | Immutable основа одной комнаты, площадь и чертёж-источник |
| 02 Референсы | Собственные изображения или публичные ссылки Pinterest | Пожелания к оформлению; геометрию не меняют |
| 03 Дизайн | Ручное описание, изображения и предметы | Вариант оформления поверх подтверждённой основы |

Мебель на исходном чертеже необязательна. Числовые подписи мебели нельзя автоматически считать размером комнаты. Автоматическая рекомендация расстановки этим импортом не реализуется.

```mermaid
flowchart TD
  B[Browser: image + rights] --> C[Caddy HTTPS]
  C --> U[Owned private upload: format/hash validation]
  U --> F[(Private original image)]
  B --> R[Drawing POST: origin/auth/project/version/rate/ownership]
  R --> F
  R --> O[Isolated bounded Sharp + Tesseract child]
  O --> D[Draft numbers + units + image boxes]
  D --> B
  B --> H[Human selects dimension roles and units]
  H --> M[Editable room form + missing height/openings]
  M --> Q[Explicit confirmation + owned source revalidation + CAS]
  Q --> P[(Immutable room revision + source asset ID)]
```

OCR не сохраняет размеры и не меняет ревизию проекта. Перенос очищает старые проёмы и подтверждение. Только сохранение проверенной формы создаёт новую основу. Чертёж не публикуется автоматически и недоступен другому владельцу. OCR работает локально без LLM/API; лимиты: 10 МБ, bounded pixels, один decoder slot, 20 секунд и 256 МБ aggregate child RSS.
