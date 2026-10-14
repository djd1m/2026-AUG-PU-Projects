# N8 — Solution Strategy

2026-10-13 · SPARC AUTO; pre-filled brief/research использованы, Explore и полный повтор исследований пропущены. Применён problem-solver-enhanced: девять линз кратко, без искусственного market benchmark.

## SCQA

- Situation: владелец дал канон и выбрал A: обмеры+референсы → визуализация → товары → бюджет.
- Complication: точность AI и live каталоги не подтверждены; scan/картинка не доказывают геометрию, 401 блокирует обе проверенные магазинные страницы.
- Question: как выпустить полезный сквозной инструмент без ложной точности и работающих только на demo интеграций?
- Answer: ручной измеренный ввод/GLB + детерминированная сцена + явные товарные снимки и exact бюджет; внешние capabilities реализовать за fail-closed adapters и включать отдельно.

## First Principles

Красота, геометрия, наличие и бюджет — разные утверждения с разными доказательствами. Цель не достигается одной картинкой. Введённые размеры и товарные поля можно детерминированно обработать без внешнего AI; это самостоятельная продуктовая способность. Высокая цена ошибки требует истории и явного согласования изменений.

## Root Cause Analysis

1. Почему образ нельзя сразу купить? Не существует подтверждённой связи элемента дизайна с продаваемой позицией.
2. Почему связь неочевидна? Нужны габариты/единицы/регион, которых в картинке нет.
3. Почему нельзя поручить всё генератору? Его изображение/JSON не являются доказательством размеров/актуальности.
4. Почему красивый demo вводит в заблуждение? Скрывает происхождение, пропуски и операции, которые не выполнялись.
5. Корневая проектная проблема: смешение представления и проверенного состояния. Решение — отдельные immutable исходники, semantic gates и provenance snapshots. Это анализ задачи, не подтверждённая причина поведения рынка.

## Game Theory / stakeholders

Homeowner хочет подходящий ремонт, магазин — продажи, провайдер — оплату запросов, оператор N8 — доверие/управляемую стоимость. Incentive продавца не подтверждает пригодность замены; предложение модели не подтверждает экономию. Контракты оставляют решение пользователю и снимают стимул скрывать unknown. Численный Nash equilibrium не рассчитывается: payoff/demand данных нет; выдуманная матрица не поможет выбрать архитектуру.

## Second-Order Effects

| Решение | Возможный побочный эффект | Защита |
|---|---|---|
| Ручное подтверждение товаров | Пользователь принимает устаревшую цифру за текущую | Контекст/дата/TTL, stale derived на чтении, повторное подтверждение |
| Иммутабельная история | Рост данных и private footprint | Квоты, archive/revoke, bounded assets; erase retention позже отдельным scope |
| Retrying AI jobs | Повторная оплата после таймаута | Once-only dispatch, uncertain reservation, операторская reconcile |
| Share как growth | Утечка геометрии/адреса | Только reencoded image+caption, preview/rights, revoke/no-store |
| Paid export entitlement | Поддельный webhook снимает watermark | Remote verification, amount/shop check, atomic ledger и refund hold |

## TRIZ

| Contradiction | Principle | Resolution |
|---|---|---|
| Хотим AI-вариативность и неизменные стены | Разделение по уровню системы | AI управляет только allowed scene data; measured shell вне его полномочий |
| Хотим полезные покупки без доступного API | Посредник/предварительное действие | CatalogueProvider + ручной source snapshot; no false automation |
| Хотим быстрый запуск и строгие платежи | Использовать ресурсы/сегментация | N6/N4 provider+tests, default off; capability ready не означает merchant ready |
| Хотим sharing и private-by-default | Разделение по условию | Явное owner действие публикует ограниченный derivative, не весь проект |

## Design Thinking / OODA

Пользователь проверяет одну понятную цепочку и может вернуться на предыдущий шаг. Manual path служит и fallback, и основанием сравнения AI. Наблюдение сейчас: канон владельца/первичные docs/два retailer 401; ориентация: независимые доказательства по слоям; решение: шесть модулей; действие: specification→six-lens validation→bounded implementation. Интервью и usability наблюдения после сборки не заменяются догадкой.

## Recommended Approach / synthesis

F1 identity → F2 space/assets → F3 scene/AI jobs → F4 procurement/budget; F5 billing и F6 sharing интегрируются через узкие ports. Один проход реализации/независимое ревью/конкретные исправления. Модели/usage/время учитываются coordinator; бюджет 8h — цель владельца, 10h — предел автономии, не доказанная оценка трудозатрат.

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Геометрическая ложная уверенность | Не измерена | Высокий | Immutable shell, user confirmation vs precision разделены, fixtures |
| Неизвестный delivery/coverage спрятан | Не измерена | Высокий | nullable fields, unknown count, exact formulas/tests |
| Издержки/credits начислены дважды | Не измерена | Высокий | Locks/fences/event unique/rollback concurrency tests |
| Разрастание stack/scope | Наблюдаемый процессный риск | Высокий | Existing donors, per-feature reuse, six boundaries, no new framework |
| Scraping блокирован | Наблюдалось на 2 URLs | Средний для manual MVP | Официальные ссылки/ручной снимок, blocked status |
