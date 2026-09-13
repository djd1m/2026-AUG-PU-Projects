# Квитанция: соединение кнопки съёмки с приёмом фото (N4 «Тарелка»)

Ревизия: HEAD на момент старта `66dd17e` (main, дерево было чистым при старте, каталог —
единственный писатель).

## Дефект стыка (что чинили)

`apps/web/app/page.tsx` — круглая кнопка съёмки имела ПУСТОЙ обработчик с комментарием
«Заглушка: приём кадра вводит фича scan-pipeline». Надписи «съёмка» и «галерея» были
`<span>`, не работающими режимами. Серверная часть (`POST /api/v1/scans`, `scan-pipeline`) и
экран результата (`/result/[id]`, `source-and-correct`) были рабочими каждая по отдельности —
дефект жил в стыке между тремя фичами, ни одна из которых не получила задачу «соединить».

## Что сделано

1. **Новый модуль `apps/web/app/capture-upload.ts`** — чистая функция `uploadCapture(blob)`,
   без DOM: строит `multipart/form-data` (поле `photo`), шлёт `POST /api/v1/scans` с
   `Idempotency-Key: crypto.randomUUID()` (генерируется РОВНО один раз на вызов, переживает
   единственный повтор), `credentials: 'same-origin'`, путь ТОЛЬКО относительный
   (`/api/v1/scans`, `/api/v1/auth/device` — строковые константы). Разбирает пять исходов:
   `202` → `{ kind: 'queued', scanId }`; `401` → один `POST /api/v1/auth/device`, один повтор
   ТЕМ ЖЕ ключом, дальше — как у обычного ответа (второй `401` подряд не повторяется ещё раз);
   `429` → `{ kind: 'limit', scope, resetAt }` СЫРЫМИ, без форматирования (это работа
   `limit/screen.tsx`); `413`/`422`/`400` → `{ kind: 'rejected', message }` с НАЗВАННОЙ
   причиной по коду ответа (`REJECTION_MESSAGES`, неопознанный код — самое общее сообщение, не
   молчание); сетевой сбой и неожиданный статус → `{ kind: 'error', message }`.
2. **`apps/web/app/page.tsx`**: кнопка съёмки теперь рисует кадр из ЖИВОГО `<video>` в скрытый
   `<canvas>` по РЕАЛЬНЫМ `videoWidth`/`videoHeight` (не размерам элемента разметки),
   `canvas.toBlob('image/jpeg', 0.9)` → `uploadCapture`. Кнопка недоступна (`disabled`), пока
   `state !== 'live'` или идёт отправка — двойное нажатие не создаёт второй скан (ключ
   повторности один на вызов `uploadCapture`, а не на HTTP-запрос). «Галерея» стала рабочей
   кнопкой, открывающей скрытый `<input type="file" accept="image/*">` — тот же путь отправки
   (`sendBlob`), что и у кадра из видео. `202` → `window.location.assign('/result/<id>')`
   (полная навигация, НЕ `next/navigation` `useRouter()` — см. п.3 ниже, почему). `429` →
   рендерится готовый `LimitScreen` (фича `pro-interest-and-limits-ui`) вместо камеры, сырые
   `scope`/`resetAt` передаются как есть. `rejected`/`error` — названное сообщение
   `role="alert"` поверх видоискателя, кнопки снова доступны.
3. **Находка при первом прогоне теста**: `useRouter()` из `next/navigation` падает с «invariant
   expected app router to be mounted», потому что `tests/integration/web-shell.test.tsx` (уже
   существующий, не мой) рендерит `CameraFirstScreen` напрямую через `renderToStaticMarkup`,
   БЕЗ контекста приложения Next — тем же приёмом, что `web-result-screen.test.tsx` рендерит
   `ScanResultScreen` (презентационный компонент), а не `ScanResultPage` (маршрут с `useParams`).
   Заменил на `window.location.assign(...)` — полная навигация, не требует смонтированного
   роутера, и естественно отдаёт запрос собранному серверу (`web-result-route.test.ts` уже
   проверяет, что маршрут результата существует и отвечает 200).
4. **`tests/integration/web-shell.test.tsx`** (правка существующей проверки FR-foundation-7):
   старая строка `expect(html).not.toContain('<input')` буквально запретила бы саму фичу
   «рабочая галерея», которую просила задача. Проверяемое свойство — «ни анкеты, ни
   регистрации, ни форм» (`01_specification.md` FR-foundation-7), а не «input нет вовсе».
   Заменил на явную проверку: РОВНО один `<input>`, и это `type="file"` — то есть подтверждает
   ИМЕННО отсутствие анкеты, а не запрещает поле выбора файла для съёмки.
5. **`apps/web/app/globals.css`**: `.modes__item` получил сброс кнопочных браузерных стилей
   (border/background/padding/font/cursor), чтобы кнопка «галерея» выглядела как прежний
   `<span>` — до правки надпись `<span class="modes__item">` не нуждалась в сбросе.
6. **Новые тесты**, оба в `tests/unit/` (jsdom не настроен — сеть перехвачена
   `vi.stubGlobal('fetch', …)`, тем же приёмом, что `provider-openrouter.test.ts`):
   - `capture-upload.test.ts` (13 тестов): 202 с полями запроса (multipart, `photo`,
     заголовок, `credentials`); 401 → один повтор тем же ключом (три отдельных теста: сам
     повтор, что ключ генерируется РОВНО один раз, что второй `401` подряд не повторяется ещё
     раз); 429 отдаёт `scope`/`resetAt` без изменений; 413/422/400 — по одному тесту на код
     ошибки плюс неопознанный код; сетевой сбой; неожиданный статус.
   - `capture-upload-guard.test.ts` (3 теста, страж по исходнику): нет литерала
     `http://`/`https://` в КОДЕ (не в комментариях); оба URL — строковые константы с `/`;
     испытание стража на внедрённом дефекте (мутация: `SCANS_URL` с чужим `https://` красит
     ту же проверку) — `.claude/rules/guard-must-be-able-to-fail.md`.
7. **Проверено, что FR-foundation-7 жив**: `tests/integration/web-shell.test.tsx` зелёный
   (две подписи режимов, ни `<form>`, ни анкеты, ни регистрации до съёмки — раздел 4 выше).

## Прогоны и коды возврата

| Команда | Код |
|---|---|
| `npx vitest run` (unit-слой, 45 файлов, 326 тестов, включая новые `capture-upload*`) | 0 |
| `docker compose --profile test run --rm -T test sh -lc 'npm run test:integration'` (67 файлов, 263 теста, включая конкурентные и `web-shell.test.tsx`) | 0 |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 |
| `npm run build` | 0 (все 5 пакетов, включая `next build` без предупреждений типов) |

## Стенд

Профиль `edge` НЕ останавливался в процессе работы (владелец смотрит по публичному адресу).
После зелёных прогонов выше: `docker compose build web && docker compose --profile edge up -d
web` — только сервис `web` пересобран и перезапущен.

Status: completed
