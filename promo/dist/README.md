# Готовые промо-ролики (серия 29.09.2026, Remotion)

Каждый ролик — 45 с, без звука, H.264 yuv420p 30 fps, три формата из одного исходника. Прямые ссылки (ветка
`claude/install-npm-packages-n7l3m5`): `https://github.com/djd1m/2026-AUG-PU-Projects/raw/claude/install-npm-packages-n7l3m5/promo/dist/<proj>/<формат>.mp4`.

| Проект | 16:9 (лендинг, YouTube) | 9:16 (Telegram, VK Клипы) | 1:1 | Исходники |
|---|---|---|---|---|
| N6 «Суфлёр» | `n6/16x9.mp4` | `n6/9x16.mp4` | `n6/1x1.mp4` | `promo/remotion/n6/` |
| N4 «Тарелка» | `n4/16x9.mp4` | `n4/9x16.mp4` | `n4/1x1.mp4` | `promo/remotion/n4/` |
| N5 «КлипМейкер» | `n5/16x9.mp4` | `n5/9x16.mp4` | `n5/1x1.mp4` | `promo/remotion/n5/` |
| N1 «Proofwall» | `n1/16x9.mp4` | `n1/9x16.mp4` | `n1/1x1.mp4` | `promo/remotion/n1/` |
| N2 «ReviewQR» | `n2/16x9.mp4` | `n2/9x16.mp4` | `n2/1x1.mp4` | `promo/remotion/n2/` |
| N3 «Круг» | — | — | — | отложен: стенд недоступен (`promo/SERIES.md`, журнал) |

Воспроизвести: `REPRO=1 bash promo/remotion/shared/render.sh <proj>` в образе `promo-render:2026-09-29`
(`promo/render-image/`); записи экранов — вне git (`/home/dz-projects-2026/.promo-assets/<proj>/`), команда повтора —
`promo/capture/<proj>/README.md`. Sha256 файлов — в `promo/remotion/<proj>/MEASUREMENTS.md`.

**Круг правок 1 (29.09, после проверки Codex `VERIFY-SERIES-CODEX.md`):** N1, N2, N5, N6 перерендерены — титры без
неснятых действий, постоянная пометка «Отзывы демонстрационные» у N1, контраст финала N1 14,38 : 1, каркас «распространение»
у N2, объяснение оценки N5 целиком; каждый файл просмотрен раскадровкой fps=2, sha256 — в `MEASUREMENTS.md` (раздел
«Круг правок 1»). N4 в этот круг не входил.

**Круг правок 2 (29.09, 13:xx–14:xx UTC):** N6 — сцена 4 снята заново (экран установки в кабинете + виджет на странице с чужим адресом),
16:9 sha256 `1c4cf216…`; N1/N2/N4/N5 — по завершении круга 2A. Подробности — `promo/SERIES.md`, журнал.
