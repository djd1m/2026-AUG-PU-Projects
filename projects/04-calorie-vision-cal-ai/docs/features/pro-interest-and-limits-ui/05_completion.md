# Фича `pro-interest-and-limits-ui` — план завершения

## Статус документа

**ПЛАН.** Реализация не начата. Раздел `## Criterion coverage` ниже называет ПЛАНИРУЕМЫЕ файлы
тестов — Phase 3 обязана заменить их на фактические заголовки, взятые из реально существующих
файлов дословно (по образцу `foundation/05_completion.md`), а не оставить как план.

## Порядок выполнения Phase 3

1. `ClassifyContact` в `packages/shared` (чистая функция, без побочных эффектов) — юнит-тесты первыми,
   реализация по ним.
2. Обработчик `POST /api/v1/interest` в `apps/api/src/routes/interest.ts`: валидация `source`,
   вызов `ClassifyContact`, транзакционная cadence-проверка-и-вставка в `packages/db`.
3. Последовательный интеграционный тест маршрута (`201`/`422`/`429` по одному владельцу).
4. Конкурентный тест cadence (AC-8) — на настоящем PostgreSQL профиля `test`, по образцу
   `tests/concurrency/quota-parallel.test.ts` фичи `foundation`.
5. `LimitScreen` и `InterestForm` в `apps/web`: рендер по `scope`/`reset_at`, форма, состояние
   «уже записали».
6. Снимок разметки на отсутствие платёжных элементов.
7. Испытание стража cadence на внедрённом дефекте («прочитать, потом записать»).

## Команды

```bash
npm test                       # unit + integration, включая конкурентный тест cadence
npm run lint && npm run build
node ../../.claude/hooks/check-ports.cjs .
bash ../../scripts/check-port-conflicts.sh .
bash ../../scripts/complexity-router.sh                    # подтверждение тира T/S/M перед стартом
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

## Чеклист готовности (не выполнено — план)

- [ ] `ClassifyContact` покрыт таблицей примеров, включая границы длины и обе формы Telegram
      (логин и числовой `telegram_id`).
- [ ] `POST /api/v1/interest` отвечает `201`/`422`/`429` по критериям AC-5, AC-6, AC-10.
- [ ] Конкурентный прогон AC-8 зелёный; тот же прогон краснеет на редакции «прочитать-записать»
      (обе строки в квитанции, `guard-must-be-able-to-fail`).
- [ ] `LimitScreen` различает `scope = user` и `scope = global`, fail-closed на прочих значениях.
- [ ] Форматирование `reset_at`: успешный разбор → время по Москве; неразбираемое/отсутствующее →
      общий текст без выдуманного часа.
- [ ] Снимок разметки: ни одного платёжного элемента, есть текст «оплаты сейчас нет».
- [ ] `source_screen` и `partner_code_id` сохраняются верно (AC-9), неизвестный `source` отклонён
      (AC-10).
- [ ] Названо явно: сквозной путь от реального отказа `scan-pipeline` до этого экрана не проверен —
      зависимость ещё не реализована на момент этой фичи.
- [ ] `check-pipeline-gaps.sh` — контур `pro-interest-and-limits-ui` без GAP.

## Criterion coverage (ПЛАНИРУЕМАЯ, заменяется фактом в Phase 3)

| Criterion | Планируемый test file | Планируемый заголовок |
|-----------|------------------------|------------------------|
| AC-pro-interest-and-limits-ui-1 | apps/web/tests/unit/limit-screen.test.tsx | экран различает scope user и global разными текстами |
| AC-pro-interest-and-limits-ui-2 | apps/web/tests/unit/limit-screen.test.tsx | неопознанный scope рендерит общий текст и логирует аномалию |
| AC-pro-interest-and-limits-ui-3 | apps/web/tests/unit/limit-screen.test.tsx | reset_at форматируется по Москве, отсутствующее не выдумывает час |
| AC-pro-interest-and-limits-ui-4 | apps/web/tests/integration/limit-screen-no-payment.test.tsx | на экране лимита нет ни одного платёжного элемента |
| AC-pro-interest-and-limits-ui-5 | apps/api/tests/unit/classify-contact.test.ts | контакт классифицируется по форме значения, а не по намерению |
| AC-pro-interest-and-limits-ui-6 | apps/api/tests/integration/interest.test.ts | прямой запрос с пустым контактом получает 422 в обход клиента |
| AC-pro-interest-and-limits-ui-7 | apps/api/tests/integration/interest.test.ts | повторная отправка за те же сутки получает 429 и не плодит строку |
| AC-pro-interest-and-limits-ui-8 | apps/api/tests/concurrency/interest-cadence.test.ts | десять одновременных отправок одного владельца дают ровно одну запись |
| AC-pro-interest-and-limits-ui-9 | apps/api/tests/integration/interest.test.ts | source_screen и partner_code_id сохраняются или остаются NULL верно |
| AC-pro-interest-and-limits-ui-10 | apps/api/tests/integration/interest.test.ts | неизвестное значение source отклоняется с 422 |

## Что эта фича НЕ будет доказывать (называется заранее)

- Сквозной путь «реальный отказ квоты на сканировании → этот экран» — зависит от `scan-pipeline`,
  не реализованной на момент этой фичи.
- Доставляемость почты, существование Telegram-аккаунта.
- Конверсию показа в отправку контакта.
