---
name: testing-patterns
description: >
  Паттерны тестов N6b «RAG-бот для сайта»: привязка теста к SC-US-nnn-k, Gherkin из docs/test-scenarios.md,
  конкурентные тесты квот и аренды, мусорный вход перечнем, адаптер модели fake, проверка виджета на
  чужом origin, калибровка «не знаю» как ворота выпуска, мутационная проверка стражей. Загружать при
  написании тестов и перед ревью. Триггеры: «тест», «покрытие», «BDD», «калибровка», «страж».
version: "1.0"
maturity: beta
---

# N6b — паттерны тестов

Правило уровней и целей: `.claude/rules/testing.md`. Сценарии: `docs/test-scenarios.md` (Gherkin, теги `@happy-path`,
`@edge-case`, `@security`, V-1…V-9, N-2/N-3, N3-2/N3-3).

## Шаг Gherkin → тест

| Given | Setup |
|---|---|
| «бот с проиндексированным PDF "Прайс.pdf"» | фикстура `document` + `chunk` с детерминированным вектором из `fake.embed` |
| «адаптер fake возвращает cited_ids […]» | `fake.answer.mockResolvedValue({answer, cited_ids, unknown:false})` |
| «страница на "http://localhost:8099"» | Playwright: статический сервер на другом порту, CSP `script-src <стенд>; connect-src <стенд>` |
| **When** | **Action** |
| «посетитель задаёт вопрос в виджете» | `POST /api/widget/ask` с `Origin` из фикстуры |
| **Then** | **Assertion** |
| «ответ 503 "сервис ответа временно недоступен"» | статус + текст + `model_call_log.state='failed'` + счётчик квоты вырос |

Имя теста начинается с идентификатора: `it('SC-US-005-4: отказ OpenAI не уводит запрос к Azure', …)`.

## Конкурентность (не последовательность)

```ts
const results = await Promise.all(Array.from({ length: 50 }, () => ask(botId, visitorIp)));
expect(results.filter(r => r.status === 200)).toHaveLength(3);   // остаток предела 3
expect(fake.answer).toHaveBeenCalledTimes(3);
```

То же для: двух воркеров на одну задачу (fence), двойного клика источника (один `job_id`), 6-го подаккаунта (ровно 5).

## Мусорный вход перечнем

```ts
for (const bad of [null, undefined, '', 'PAID', ' paid', 'premium', 0, 1, true, {}, ['start']])
  expect(badgeRequired(bad, 'active'), JSON.stringify(bad)).toBe(true);
```

SSRF: `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `[::1]`, `100.64.0.1`, DNS-имя → частный адрес, редирект на частный.

## Тело запроса к провайдеру (SC-US-005-4)

Контрактный тест адаптера `live` на перехваченном `fetch`: оба запроса (`/embeddings`, `/chat/completions`) содержат
`provider: {order: ['openai'], allow_fallbacks: false}`; ответ 5xx шлюза → `ProviderUnavailable`, повторного запроса нет.

## Мутационная проверка стража

1. Внести дефект (например, убрать `allow_fallbacks:false` или проверку `Content-Type` демо-ручки).
2. Прогнать набор — ожидать `N failed`.
3. Вернуть код — `N passed`. Обе строки — в review-report. Страж, ни разу не покрасневший, не принят.

## Калибровка (SC-US-006-4)

`tests/calibration/questions.json` — 30 записей `{q, expect: 'cited'|'dont_know'}`; прогон на живой модели через адаптер
`live` под песочницей (≈ 30 ответов в пределах); отчёт `docs/calibration-report.md` с хэшем промпта и `MIN_SIMILARITY`.
