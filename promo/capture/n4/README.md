# Запись экранов N4 «Тарелка» (часть A постановки `promo/CAPTURE-BRIEF.md`)

Стенд — адрес, выданный развёртыванием: `https://tarelka.aicoding.space`. Тема продукта по умолчанию —
светлая (`colorScheme: light`). Записи лежат ВНЕ git: `/home/dz-projects-2026/.promo-assets/n4/`.
Здесь — скрипт `record-n4.mjs`, закреплённые зависимости (`playwright@1.60.0`, lockfile) и квитанция.

## Состояние: ЗАПИСЬ НЕ ВЫПОЛНЕНА — остановлено на отказе распознавания (2026-09-29 08:01 UTC)

| Шаг | Итог |
|---|---|
| Пробный кадр `/` (бесплатно) | ✅ `probe-mobile.png` 780×1688, `probe-desktop.png` 1920×1080: видоискатель показывает тарелку (поддельная камера Chromium из того же CC0-фото), без сообщения «нет доступа к камере» |
| prep: согласие | ✅ `/consent` → «Согласен(а)» → `/?consent=granted` (сессия устройства, без учётки) |
| prep: распознавание блинов (**платный вызов №1**) | ❌ скан `a3fe5ee1-7c9e-4a00-8be0-9f9451b8c831` → `failed`, `no_food_matched` за ~31 с |
| mobile / desktop / карточка | ⏸ не запускались: скрипт отказывается тратить второй вызов после `no_food_matched` на очевидном блюде |

**Почему остановлено.** `no_food_matched` на тарелке блинов с ягодами означает, что НИ ОДНА названная моделью
позиция не сопоставилась с базой USDA на стенде. Та же картина описана в
`projects/04-calorie-vision-cal-ai/docs/decisions-autonomous.md` DEC-A-051 (13.09): база продуктов оказалась
пустой после интеграционных тестов на базе стенда. Проверить `food_item` чтением базы стенда исполнителю
не разрешено (чтение боевой базы отклонено), а гнать второе распознавание вслепую — это платный вызов с
ожидаемым тем же исходом. Нужен сигнал: база продуктов на стенде наполнена (или владелец разрешает попытку).
Повтор после сигнала: `ALLOW_AFTER_PREP_FAIL=1` (см. ниже) — prep второй раз не выполняется.

## Фото (только свободные)

| Файл в `.promo-assets/n4/photos/` | Источник | Лицензия | Автор | Использование |
|---|---|---|---|---|
| `salmon-nicoise.jpg` (1280×1280, sha256 `8a54bf2f…c46f6`) | https://commons.wikimedia.org/wiki/File:Salmon_nicoise_salad_-_London,_UK.jpg | CC0 1.0 | Daderot | основное фото сцен 2–4; оно же кадр видоискателя |
| `pancakes-berries.jpg` (1280×1280) | https://commons.wikimedia.org/wiki/File:Pancakes_with_berries,_plus_avocado_-_London,_UK.jpg | CC0 1.0 | Daderot | prep вне кадра (для «итога дня») |

Лицензия проверена по `extmetadata` API Commons (`LicenseShortName = CC0`). Скачаны превью 1280 px.

## Платные вызовы

| Вызов | Сколько | Потолок постановки |
|---|---|---|
| Распознавание `POST /api/v1/scans` | **1** (prep, `no_food_matched`) | ≤ 3 на прогон — осталось 2 |

Счётчик — `paid_total` в `.state-n4.json` (600) — переживает перезапуск; при `paid_total ≥ 3` шаги с новым
распознаванием не выполняются. Desktop новых вызовов не делает: его `POST /api/v1/scans` перехватывается в
браузере и получает `scan_id` mobile, cookie сессии устройства скопированы.

## Фикстура-учётка

Не нужна и не создана: дневник, согласие и карточка работают на анонимной сессии устройства
(`/api/v1/auth/device` + согласие на `/consent`).

## Как повторить

```bash
cd promo/capture
docker run --rm --memory=1500m --cpus=2 --shm-size=1g --name promo-capture-n4 \
  -v "$PWD:/work" -v /home/dz-projects-2026/.promo-assets/n4:/assets -w /work/n4 \
  mcr.microsoft.com/playwright:v1.60.0-noble \
  bash -c "npm ci --no-audit --no-fund && node record-n4.mjs"
```

Без публикации портов. `STEPS=probe` — только кадры `/` (бесплатно). По умолчанию `prep,mobile,desktop,card`;
mobile пишется ПЕРВЫМ. После отказа prep — `-e ALLOW_AFTER_PREP_FAIL=1` (одно распознавание в кадре).
Заблокированы маршрутом: `/pro`, `/cabinet`, `/partner`, `/invite`, вход по почте/Telegram, API подписки,
кодов, партнёрки и выплат.
