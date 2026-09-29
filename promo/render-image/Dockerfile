# syntax=docker/dockerfile:1
# Среда рендера промо-роликов (пилот N6): Playwright 1.60 (Node 24 + Chromium) + FFmpeg + шрифты с кириллицей.
# hyperframes/remotion здесь НЕ ставятся: исполнители ставят их в свои проекты через `npm ci` с lockfile.

# ── Стадия 1: Onest из @fontsource-variable/onest@5.3.1 → статические TTF ─────────────────
FROM node:22.22.0-bookworm-slim AS onest
ARG ONEST_VERSION=5.3.1
# integrity из projects/06-rag-sales-chatbase/package-lock.json — та же версия, что в продукте
ARG ONEST_INTEGRITY=sha512-xaaw6G4HDB2/RczsWLD/2bnib4ykmQlTlBUN3GOEOiyErilZukQWVJG95h9zwAy0i8KY+QzDa+COPfqhI72Acw==
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3-fonttools python3-brotli \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN npm pack "@fontsource-variable/onest@${ONEST_VERSION}" --silent \
 && node -e 'const c=require("crypto"),f=require("fs");const h="sha512-"+c.createHash("sha512").update(f.readFileSync(process.argv[1])).digest("base64");if(h!==process.argv[2]){console.error("integrity mismatch",h);process.exit(1)}' \
      "fontsource-variable-onest-${ONEST_VERSION}.tgz" "${ONEST_INTEGRITY}" \
 && tar -xzf "fontsource-variable-onest-${ONEST_VERSION}.tgz"
COPY fonts/build_onest.py /build/
RUN python3 /build/build_onest.py /build/package/files /out \
 && cp /build/package/LICENSE /out/Onest-OFL-LICENSE.txt

# ── Стадия 2: образ рендера ────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.60.0-noble
# Версии пинованы: ffmpeg из noble (6.1.1), DejaVu. Noto Color Emoji, Liberation уже есть в базе.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg=7:6.1.1-3ubuntu5 \
      fonts-dejavu-core=2.37-8 \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*
# CLI playwright той же версии, что браузеры базы (chromium-1223): база его не содержит, и `npx playwright`
# без него скачал бы ПОСЛЕДНЮЮ версию из сети. Только CLI, браузеры не качаются.
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install -g --no-fund --no-audit playwright@1.60.0 \
 && npm cache clean --force
COPY --from=onest /out/ /usr/local/share/fonts/
RUN fc-cache -f
ENV HYPERFRAMES_NO_TELEMETRY=1
WORKDIR /work
# Пользователь — как в базовом образе: root (USER в базе не задан; pwuser uid 1001 существует).
# Для файлов на хосте с нужным владельцем запускать с `--user "$(id -u):$(id -g)"` — см. README.
