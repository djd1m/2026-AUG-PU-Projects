# N8 — узкая проверка исправлений HTML-CJM

Дата: 2026-10-13. RUN_ID: `20261013T202009Z-expanded-cjm-9f69`.
WORK_UNIT_ID: `html-review`; attempt: `html-review-2`.

## Вердикт

Все семь findings из `html-review.md` закрыты на текущей сборке. Нерешённых
расхождений в scope узкой проверки нет. Повторный широкий обзор не выполнялся:
затронутые CJM-05/06/07/08/09/11/14/15 проверены заново, соседние safety/offline
состояния не регрессировали.

Исходный `html-review.md` сохранён без изменений с SHA-256
`04386421b0fdaf676489f93c0ae66ab1fa80fc28a5d52fdebcea8c729c19368a`.

## Текущая привязка к исходникам

- Baseline/HEAD: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`.

| Артефакт | SHA-256 |
|---|---|
| `docs/discovery/cjm-a.html` | `38f73f7d488d5631a16a5e26ec2154feceff5fb0aa6f7d309ebfba9eec75afd0` |
| `docs/discovery/cjm-b.html` | `99c51ab4a93c36a029fb34cf46a991c45b50c32aeac28fea7890c904e3d12b74` |
| `docs/discovery/cjm-c.html` | `c75bf1c4a8da4277e15bf24a0ccf443b445bad61e1b1563a50f9cf9bed93da07` |
| `docs/discovery/index.html` | `4b2ae201ceb8dfad3f7b5c077cf4f5a92e2886d9ec1a83151387259401e3cc63` |
| `docs/discovery/src/prototype.js` | `b5a0d78f7da7040beb6df0e31dff651d32062a3a41aec4af42c9aef2cf385b12` |
| `docs/discovery/src/prototype.css` | `2ec961e15fe1a8a1c1bc3245bf915e090e928add089221edaa6bfc925650b53b` |
| `docs/discovery/src/variants.js` | `93045b22366032b2856c2e363680b3280d7883946a84ad6ab636506b5fed10f8` |
| `scripts/build-cjm.cjs` | `4938098968e3d3f6701f87e08c28700456713e7707a68eac8766f2e4666fe4fc` |

Повторная сборка дала те же четыре generated-HTML digest.

## Закрытие findings

| Finding | Результат | Независимое доказательство |
|---|---|---|
| H1 approval/gate | **Closed** | На A/B/C неподтверждённый S6 показывает `[data-testid="unapproved-design"]`; после approval warning исчезает. Смена design создаёт v2/history и сбрасывает кнопку в «Согласовать…»; последующая смена style создаёт v3/history и снова сбрасывает approval. |
| H2 native price constraint | **Closed** | `#price=1600` и изменённое `1700` имеют `checkValidity() = true`. Submit сохраняет 10 упаковок и пересчитывает строку в `17 000 ₽`. |
| H3 incomplete total | **Closed** | После заполнения delivery=1000 и labor=2000 при двух неподобранных позициях heading остаётся «Известная часть бюджета»; B сохраняет неопределённый verdict и не пишет «Состав заполнен». |
| M1 B cap | **Closed** | На B изменение `#cap` 60 000 → 10 000 немедленно обновляет dock, показывает дефицит известной части 6 000 ₽ и сохраняет сообщение о неизвестных. |
| M2 Pinterest source | **Closed** | `#refUrl` и anchor равны `https://ru.pinterest.com/pin/1117807570051119485/`; ссылка имеет `rel="noreferrer"`. Сеть в offline-проверке не вызывалась. |
| M3 owner state | **Closed** | A помечен «выбранный путь», B/C — «вариант для сравнения»; S9 и live-status говорят, что локальная отметка не меняет выбранный A; index фиксирует выбор A и отсутствие ожидания approval. |
| L1 mobile rail | **Closed** | При 390 px rail высотой 86 px; `#steps` — горизонтальный контейнер 360/1372 px, step 130×76 px, подписи видны, sheet начинается на y=254 вместо прежней вертикальной полосы 470 px. Document width остаётся 390. |

## Статус затронутых AC

| AC | Результат после исправлений |
|---|---|
| CJM-05 | Pass — точная Pinterest-ссылка открываема, denied/fallback остаются честными. |
| CJM-06 | Pass — design/style state сохраняется, а изменения после approval создают новую версию и требуют повторного согласования. |
| CJM-07 | Pass — метаданные товара сохранены; пропущенный design gate явно виден на S6. |
| CJM-08 | Pass — 18 × 1.08 / 1.99 даёт 10 упаковок; целые цены 1600/1700 валидны, 1700 пересчитывается в 17 000 ₽. |
| CJM-09 | Pass — delivery/labor не превращают неподобранные предметы в ноль или полный состав. |
| CJM-11 | Pass — B cap реагирует сразу; C перенос этапа сохраняет общий итог 16 000 → 16 000 ₽. |
| CJM-14 | Pass — горизонтальный mobile rail, ширина документа 390 px и keyboard focus `solid 3px` подтверждены на A/B/C. |
| CJM-15 | Pass — локальная отметка остаётся demo и явно не отменяет уже выбранный владельцем A. |

Не затронутые CJM-01/02/03/04/10/12/13/16 не проходились заново в полном объёме;
их результаты остаются результатами исходного независимого обзора, а не свежей
повторной проверкой.

## Regression и проверки

- Malicious-looking note `<svg onload=window.__pwn=1>` осталась literal text:
  DOM SVG не создан, код не выполнился на A/B/C.
- В проверенных A/B/C сценариях не наблюдалось HTTP(S)-запросов, page errors или
  console errors.
- `node --check` для `prototype.js`, `variants.js`, `build-cjm.cjs`: exit `0`.
- `node scripts/build-cjm.cjs`: exit `0`; aggregate generated digest до/после
  одинаков: `e19cf7fba6981be9d9af811e9e6079c70673425ff8376a1a57f1f8ec43ae8c63`.
- `git diff --check -- projects/08-interior-ai-redesign`: exit `0`.
- Проверки выполнены в Chromium/Playwright по `file://` на desktop 1365×900 и
  mobile 390×844, без network/paid calls.

Этот документ закрывает только ранее перечисленные findings. Он не является
новым широким review, SPARC sign-off или доказательством готовности приложения.
