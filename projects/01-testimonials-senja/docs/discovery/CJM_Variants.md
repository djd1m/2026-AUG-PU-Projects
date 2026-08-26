# Module 2.5 — CJM Variants for Senja clone

> 3 варианта Customer Journey Map. Три развилки: **Aha Moment**, **Entry Hook**, **Monetization timing**.
> Интерактивный прототип: `docs/discovery/cjm-prototype.html` (публикуется как Artifact).
> Все микротренды пронумерованы MT-1…MT-8 и раскрыты в `Product_Discovery_Brief.md`.

## Variant Table

| | **A · Speed-to-Proof** | **B · Proof-of-Human** | **C · Proof Engine для AI** |
|---|---|---|---|
| **Aha Moment** | «Мы нашли 47 ваших отзывов по всему интернету — вот готовая Wall of Love» (ещё до регистрации) | Отзыв получает бейдж *Verified human · captured on camera* (C2PA) + скачиваемый FTC audit trail | Дашборд: «Вас процитировали 0 раз из 20 покупательских промптов. Конкурента — 14» |
| **Entry Hook** | Functional job S1: «отзывы разбросаны по 8 местам» | Emotional + регуляторный job S2/S3: «мой proof примут за AI-фейк» / «$51,744 за нарушение» | Social job S2/S4: «хочу, чтобы AI рекомендовал меня, а не конкурента» |
| **Onboarding** | Вставь домен → авто-скан 30+ платформ → показать найденное | Выбор режима записи → Verified capture с Content Credentials | Подключи домен → прогон 20 промптов через ChatGPT/Perplexity → карта пробелов |
| **Core Loop** | Еженедельный дайджест «3 новых отзыва найдено» → one-click approve | Compliance-дашборд: verified / unverified / с раскрытием incentive | Недельный AI-visibility трекер + очередь «какого отзыва не хватает под промпт X» |
| **Paywall** | **Сразу после Aha** — виджет готов, но с бейджем. Конверсия на эмоции | **После результата** — когда собран первый verified-пакет и сгенерирован compliance-отчёт | **После N дней** — когда накопился тренд цитирований, данные становятся lock-in |
| **Invite / Referral** | «Powered by» в виджете → классический вирусный контур | Verified-бейдж кликабелен → публичная страница проверки на вашем домене | Публичный `/proof` endpoint + `llms.txt` + MCP-сервер → агенты приносят трафик сами |
| **Микротренды** | MT-7, MT-8 | MT-3, MT-4, MT-7, MT-8 | MT-1, MT-2, MT-5, MT-6 |
| **Best for segment** | S1 — indie hacker / solo SaaS | S2/S3 — B2B SaaS с юристами, агентства, health/fintech | S2/S4 — growth-команды, маркетологи, creators |
| **Гипотеза** | Time-to-first-widget < 5 минут выигрывает категорию | Страх штрафа + флуд AI-фейков создают срочность, которой нет у виджет-тулов | «Меня не видит AI» — боль острее, чем «у меня некрасивый виджет» |
| **Главный риск** | Паритет фич и ценовая война: Famewall уже $9/мес | Рынок ещё не осознал боль → длинный и дорогой education cycle | Атрибуция AI-цитирований технически шаткая — метрика может оказаться шумом |

## Экраны (общий каркас, 6 шагов)

| # | Экран | CJM stage | AARRR |
|---|---|---|---|
| 1 | Landing | Awareness | Acquisition |
| 2 | Onboarding | Consideration | Activation |
| 3 | Aha Moment | Activation | Activation |
| 4 | Core Loop | Retention | Retention |
| 5 | Paywall | Purchase | Revenue |
| 6 | Share / Invite | Advocacy | Referral |

## Как выбирать

- **A** — если цель «быстро выйти на рынок и учиться на трафике». Дешевле всего построить, но дифференциации почти нет.
- **B** — если цель «продавать дорого узкому сегменту». Максимальная защищённость (регуляторика + криптография), самый долгий выход на выручку.
- **C** — если цель «оседлать сдвиг канала». Самый большой upside и самый большой технический риск: сначала надо доказать, что AI-цитирования вообще измеримы.
- **Гибрид A+C** — реалистичный дефолт: скорость A даёт вход и трафик, слой C даёт причину не уходить. B добавляется как платный add-on, когда появится первый регулируемый клиент.

## Что уходит дальше в пайплайн

Зафиксированный вариант становится `{CHOSEN_CJM}` и кормит:

| Модуль | Что берёт |
|---|---|
| M3 Market | Aha Moment → конкурентное сравнение, TRIZ «Create» |
| M4 Finance | Paywall timing → оценка конверсии → revenue model |
| M5 Growth | Тип core loop → growth engine и retention playbook |
| M6 / Phase 1 | MVP scope = экраны выбранного варианта |
