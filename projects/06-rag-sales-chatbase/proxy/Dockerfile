# N6 — дверь стека с модулем ограничения частоты (донор N4 proxy/Dockerfile, ADR-014).
#
# Почему отдельный образ: в стандартном caddy модуля ограничения частоты НЕТ, и директива
# `rate_limit` без него не загрузится — объявить защиту, которой не существует, нельзя.
# Версия Caddy — канон §6 (2.8); модуль закреплён версией, а не плавающей веткой.
FROM caddy:2.8-builder-alpine AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit@v0.1.0

FROM caddy:2.8-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
# Проверка НА СБОРКЕ: «собралось» и «ограничение частоты работает» — разные утверждения.
RUN caddy list-modules | grep -q 'http.handlers.rate_limit'
