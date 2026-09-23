# Эскиз compose — проект 05a «ClipMkr»

**RUN_ID:** 20260923T173212Z-replicate-05a-475b · **WORK_UNIT_ID:** architecture · 2026-09-23
Разрезан из [`Architecture.md`](Architecture.md), раздел «Deployment Topology» (разрез объявлен координатором в
`dispatch-plan.md`). Правила топологии, сборка монорепо и деплой — там; здесь только запускаемый эскиз.
Сервисы и переменные — канон §1 и §6. Проверено 2026-09-23: `docker compose --profile prod --profile test config -q`
→ 0; без `POSTGRES_PASSWORD` → отказ «required variable POSTGRES_PASSWORD is missing a value»;
`COMPOSE_PROFILES=prod,test node .claude/hooks/check-ports.cjs <каталог эскиза>` → 0.

```yaml
name: clipmkr
# `${VAR:?}` — без дефолта (compose не соберёт конфиг); `${VAR?}` — объявить обязательно, пусто можно;
# `${VAR:-x}` — дефолт разрешён каноном §6.
x-db: &db-env { DATABASE_URL: "${DATABASE_URL:?}" }
x-redis: &redis-env { REDIS_URL: "${REDIS_URL:?}", REDIS_PASSWORD: "${REDIS_PASSWORD:?}" }
x-s3: &s3-env { S3_ENDPOINT: "${S3_ENDPOINT:?}", S3_REGION: "${S3_REGION:?}", S3_BUCKET: "${S3_BUCKET:?}",
                S3_ACCESS_KEY: "${S3_ACCESS_KEY:?}", S3_SECRET_KEY: "${S3_SECRET_KEY:?}", S3_TENANT_ID: "${S3_TENANT_ID?}" }
x-limits: &limits-env { LIMIT_STT_USER_SEC_DAY: "${LIMIT_STT_USER_SEC_DAY:?}", LIMIT_LLM_USER_KOP_DAY: "${LIMIT_LLM_USER_KOP_DAY:?}",
                        LIMIT_STT_GLOBAL_SEC_DAY: "${LIMIT_STT_GLOBAL_SEC_DAY:?}", LIMIT_LLM_GLOBAL_KOP_DAY: "${LIMIT_LLM_GLOBAL_KOP_DAY:?}",
                        LOG_LEVEL: "${LOG_LEVEL:-info}" }
x-app: &app
  build: { context: ., dockerfile: Dockerfile }            # контекст — корень монорепо
  image: clipmkr/app:${APP_VERSION:?}
  restart: unless-stopped
  depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_healthy },
                migrate: { condition: service_completed_successfully } }
services:
  caddy:
    image: caddy:2.8-alpine
    profiles: [prod]
    restart: unless-stopped
    mem_limit: 256m
    ports: ["${CADDY_HTTP_PORT:-80}:80", "${CADDY_HTTPS_PORT:-443}:443"]
    volumes: [./deploy/Caddyfile:/etc/caddy/Caddyfile:ro, caddy_data:/data, caddy_config:/config]  # без тома /data — повторный выпуск сертификата
    depends_on: { web: { condition: service_healthy } }
  web:
    <<: *app
    profiles: [prod, test]
    command: ["web"]
    mem_limit: 1g
    ports: ["127.0.0.1:${WEB_PORT:-3105}:3000"]            # только петля: снаружи обойти caddy нельзя
    environment:
      <<: [*db-env, *redis-env, *s3-env, *limits-env]
      BASE_URL: ${BASE_URL:?}
      BRAND_NAME: ${BRAND_NAME:?}
      JWT_SECRET: ${JWT_SECRET:?}
      SMTP_URL: ${SMTP_URL:?}
      MAIL_FROM: ${MAIL_FROM:?}
      LIMIT_UPLOADS_USER_DAY: ${LIMIT_UPLOADS_USER_DAY:?}
      PAYMENTS_MODE: ${PAYMENTS_MODE:?}
      PAYMENTS_PROVIDER: ${PAYMENTS_PROVIDER:-}            # три PAYMENTS_* обязательны только при live — проверяет @clipmkr/config
      PAYMENTS_SHOP_ID: ${PAYMENTS_SHOP_ID:-}
      PAYMENTS_SECRET_KEY: ${PAYMENTS_SECRET_KEY:-}
    healthcheck: { test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"], interval: 10s, retries: 6 }
  migrate:
    <<: *app
    profiles: [prod, test]
    command: ["migrate"]
    restart: "no"
    mem_limit: 512m
    environment: { <<: [*db-env, *s3-env], BASE_URL: "${BASE_URL:?}" }
    depends_on: { postgres: { condition: service_healthy } }
  worker-ai:
    <<: *app
    profiles: [prod, test]
    command: ["worker-ai"]
    stop_grace_period: 60s
    mem_limit: 1g
    environment:
      <<: [*db-env, *redis-env, *s3-env, *limits-env]
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:?}          # только здесь
      STT_PROVIDER: ${STT_PROVIDER:?}
      STT_MODEL: ${STT_MODEL:?}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}                  # обязателен только при STT_PROVIDER=openai
      LLM_MODEL: ${LLM_MODEL:?}
      FX_USD_RUB_KOP: ${FX_USD_RUB_KOP:?}
      LIMIT_LLM_ATTEMPTS_JOB: ${LIMIT_LLM_ATTEMPTS_JOB:?}
      LIMIT_LLM_KOP_JOB: ${LIMIT_LLM_KOP_JOB:?}
  worker-render:
    <<: *app
    profiles: [prod, test]
    command: ["worker-render"]
    stop_grace_period: 60s
    cpus: "${RENDER_CPUS:-2}"
    mem_limit: 3g
    environment:
      <<: [*db-env, *redis-env, *s3-env]
      BASE_URL: ${BASE_URL:?}
      WATERMARK_TEXT: ${WATERMARK_TEXT:?}
      RENDER_CONCURRENCY: ${RENDER_CONCURRENCY:-1}
      LOG_LEVEL: ${LOG_LEVEL:-info}
  postgres:                                                # ports: НЕТ — правило №0 docker-ports
    image: postgres:16-alpine
    restart: unless-stopped
    mem_limit: 1g
    environment: { POSTGRES_USER: "${POSTGRES_USER:?}", POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:?}",
                   POSTGRES_DB: "${POSTGRES_DB:?}" }       # [правка канона запрошена]; пароль случайный
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"], interval: 5s, retries: 10 }
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    mem_limit: 512m
    environment: { REDIS_PASSWORD: "${REDIS_PASSWORD:?}" }  # нужен healthcheck внутри контейнера
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD:?}", "--maxmemory", "384mb",
              "--maxmemory-policy", "noeviction", "--appendonly", "yes"]   # BullMQ требует noeviction
    volumes: [redisdata:/data]
    healthcheck: { test: ["CMD-SHELL", "redis-cli -a $$REDIS_PASSWORD ping"], interval: 5s, retries: 10 }
  minio:
    image: minio/minio:${MINIO_TAG:?}
    profiles: [test]
    restart: unless-stopped
    mem_limit: 512m
    command: ["server", "/data"]
    environment: { MINIO_ROOT_USER: "${MINIO_ROOT_USER:?}", MINIO_ROOT_PASSWORD: "${MINIO_ROOT_PASSWORD:?}" }  # [правка канона запрошена]
    volumes: [minio_data:/data]
    healthcheck: { test: ["CMD", "mc", "ready", "local"], interval: 5s, retries: 10 }
volumes: { pgdata: {}, redisdata: {}, caddy_data: {}, caddy_config: {}, minio_data: {} }
```

`deploy/Caddyfile` (домен в файле, а не в переменной: это конфигурация, прошедшая ревью):

```text
clipmkr.ru {
	encode gzip
	request_body /api/* {
		max_size 1MB
	}
	reverse_proxy web:3000
}
```
