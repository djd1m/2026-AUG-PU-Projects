# Source product profile

Источник: https://instantly.ai/ ; публичный landing, 2026-10-02T17:53:58.322Z.

**Статус съёмки:** СНЯТ
**Статус съёмки (путь):** НЕ ИЗМЕРЕНО
**Причина (путь):** out-of-scope
**Происхождение:** вручную

Live observation выполнено через existing codex-ui-playwright Chromium, viewport
1440×1000, HTTP 200. Один public page, без логина, форм, согласия cookies и кликов.
Путь кабинета за авторизацией не исследовался. Screenshot:
`docs/telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/source-instantly-desktop.png`.

Наблюдение: одна основная крупная hero-иерархия, короткий supporting text,
компактная верхняя навигация и заметный основной CTA. DOM сообщил h1 font-size40,
line-height44; значения приведены только как измерение, не копируются. CTA
Get Started и Start For Free видны; фактический signup flow не прокликан.
На landing выделен AI entry, который противоречит нашему explicit scope.

| ID | Требование-кандидат | Ось | Evidence | Решение | Статус |
|---|---|---|---|---|---|
| FR-LOOK-001 | Ясная иерархия заголовок → supporting text → один основной CTA | облик | source-instantly-desktop.png | Принято как regularity, собственные значения | ЧЕРНОВИК |
| FR-LOOK-002 | AI-first prompt как первая операция | облик | source-instantly-desktop.png | Отклонено: AI replies и agent-led расширения вне MVP | ЧЕРНОВИК |

Хронология: первая попытка до появления shared runtime была НЕ ИЗМЕРЕНО
(no-browser-mcp/no-browser); позднее публичный облик снят. Три CJM были созданы
до этого с явно подписанным авторским B2B fallback. Capture не требует копирования
бренда: логотип, цвета, шрифты, DOM/CSS конкурента не переносятся. Принятый принцип
иерархии уже совместим с CJM A; подтверждение не объявляет pixel-perfect clone.
