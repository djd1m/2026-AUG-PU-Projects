-- packages/db/migrations/003_core.sql
--
-- Источник: docs/Architecture.md §3 (таблица "Модель данных"), §3.2 (аутентификация владельцев,
-- без Supabase Auth), §3.3 (widget_installs — вынесено в 004_growth.sql); docs/Pseudocode.md §1,
-- §1.1 (submitTestimonial/handleVideoTestimonial — точные имена и типы полей testimonials),
-- §2 (moderateTestimonial), §9 (registerAccountAndProject). Канон имён — Architecture §10.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,       -- argon2id/bcrypt, сверяется константным по времени сравнением (Architecture §3.2)
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  token_hash text not null unique,   -- хеш непрозрачного токена, НЕ сам токен (Architecture §3.2:
                                      -- компрометация БД не даёт захватить активные сессии)
  expires_at timestamptz not null,
  revoked_at timestamptz,            -- логаут = revoked_at = now(); "на всех устройствах" = revoke всех строк account_id
  created_at timestamptz not null default now()
);
-- [GAP: Architecture §3.2 — "TTL сессии/политика ротации — реализовать разумный дефолт" не
--  зафиксированы в исходных документах числом. expires_at — колонка есть и обязательна
--  (not null), конкретное значение TTL при создании сессии выбирает код apps/web.]

create index if not exists sessions_account_id_idx on sessions (account_id);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  slug text not null unique,          -- ^[a-z0-9-]{3,40}$ — валидация в коде (Pseudocode §9), не CHECK здесь
  branding jsonb not null default '{}'::jsonb,
  tier text not null default 'free' check (tier in ('free', 'paid')),
  noindex boolean not null default true,
  -- deactivated: используется в Pseudocode §5.1 (apiWidgetConfig — "project is null or
  -- project.deactivated"), но НЕ перечислено среди "Ключевые поля" Architecture §3 и не
  -- упомянуто в §10 "Канонические имена" — расхождение между Architecture и Pseudocode
  -- (см. .claude/rules/p-replicator-known-gaps.md PR-003 — сверка после Phase 1). Колонка
  -- добавлена, т.к. без неё описанный в Pseudocode запрос нереализуем; булев флаг однозначен по
  -- смыслу и не требует домысливания бизнес-правила.
  -- [GAP: кто и по какому правилу выставляет deactivated=true — не описано ни в одном документе]
  deactivated boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists projects_account_id_idx on projects (account_id);

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'hidden')),
  author_name text not null,          -- 2-80 символов — валидация на границе (Specification FR-002), не CHECK
  author_role text,                   -- опционально: роль/компания
  text text not null default '',      -- побайтово как отправлено (FR-NFR-SEC-002, security.md §1);
                                       -- '' для видео без текстовой подписи (Pseudocode §1.1:
                                       -- `text = request.text_caption or ""`)
  photo_url text,                     -- имя поля буквально из Pseudocode §1 (`photo_url = uploadIfPresent(...)`)
  video_object_key text,              -- КЛЮЧ объекта в MinIO, НЕ постоянный url (канон Architecture §10)
  transcript text,
  transcript_status text not null default 'pending'
    check (transcript_status in ('pending', 'completed', 'failed')),
  transcript_source text not null default 'machine'
    check (transcript_source = 'machine'),  -- канон Architecture §10: enum(machine) default machine
  moderated_at timestamptz,           -- проставляется moderateTestimonial (Pseudocode §2)
  created_at timestamptz not null default now()
);
-- testimonial.public_id (Pseudocode §1: "return HTTP 201 { testimonial.public_id }") не описан ни
-- в одном документе как отдельное поле — трактуется как id (uuid, непоследовательный, безопасен
-- для публичного использования). Отдельной колонки не заводим.
-- [GAP: если предполагался публичный идентификатор, отличный от id, — не описано]

create index if not exists testimonials_project_id_idx on testimonials (project_id);
create index if not exists testimonials_project_status_idx on testimonials (project_id, status);
-- Очередь транскрипции воркера (Architecture §5): `SELECT ... FOR UPDATE SKIP LOCKED WHERE
-- transcript_status = 'pending'` — частичный индекс ускоряет выборку кандидатов, не раздувая
-- индекс завершёнными/неудачными записями.
create index if not exists testimonials_transcript_pending_idx on testimonials (transcript_status)
  where transcript_status = 'pending';
