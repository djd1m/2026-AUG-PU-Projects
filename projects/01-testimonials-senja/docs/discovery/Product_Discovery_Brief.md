# Product Discovery Brief — Senja.io clone

> Phase 0 of `/replicate`. Skill: `reverse-engineering-unicorn` (QUICK mode, modules M1/M2/M3/M4/M5).
> Все факты сопровождаются ссылками на первоисточники. Спорные утверждения помечены `⚠️ contested`.

## M1 — Intelligence

| Поле | Значение | Источник |
|---|---|---|
| Продукт | Senja — сбор, управление и публикация текстовых и видео-отзывов | [senja.io](https://senja.io/) |
| Основатели | Wilson Bright (CTO, технический кофаундер, Нигерия) + Olly Meakings (маркетинг, UK) | [Senja About](https://senja.io/about), [The Successful Projects](https://www.thesuccessfulprojects.com/how-two-indie-hackers-built-a-successful-micro-saas-senja-io-1m-arr/) |
| Первая строчка кода → первый платящий клиент | ~5 месяцев, первый клиент — июнь 2022 | [The Successful Projects](https://www.thesuccessfulprojects.com/how-two-indie-hackers-built-a-successful-micro-saas-senja-io-1m-arr/) |
| Траектория выручки | $30k MRR (май 2024) → $50k MRR (окт 2024) → **$1M ARR, ~3000 платящих (ноя 2025)**, 100% bootstrapped | [The Successful Projects](https://www.thesuccessfulprojects.com/how-two-indie-hackers-built-a-successful-micro-saas-senja-io-1m-arr/), [IndieMerger](https://indiemerger.com/success-stories/senja-growth-story) |
| Growth-движок | build in public + SEO (программные страницы `/compare/*`, `/alternative`) + PLG freemium | [Indie Hackers](https://www.indiehackers.com/post/how-a-young-entrepreneur-hit-32k-mrr-with-product-led-growth-and-seo-8nbqKzfYAYzcGVjhRb4M) |
| Оценка на G2 | 4.6 / 5 | [G2 — Senja](https://www.g2.com/products/senja/reviews) |

## M4 — Монетизация (unit economics вход)

| План | Цена | Что даёт | Источник |
|---|---|---|---|
| Free forever | $0 | 15 отзывов, базовые виджеты, брендинг Senja остаётся | [Senja Pricing](https://senja.io/pricing) |
| Starter | ~$29/мес, 2 seats | Unlimited отзывы, снятие брендинга | [Senja Pricing](https://senja.io/pricing), [ColdIQ](https://coldiq.com/tools/senja) |
| Pro | ~$59/мес, 5 seats | Расширенные виджеты, команда, автоматизации | [Senja Pricing](https://senja.io/pricing), [ColdIQ](https://coldiq.com/tools/senja) |

ARPU-ориентир: $1M ARR / ~3000 платящих ≈ **$27–28 / клиент / мес** — т.е. основная масса сидит на Starter.

## M2 — Product & Customers

**One-liner:** «Соберите видео- и текстовые отзывы за минуты и покажите их везде — без кода».

**Модули продукта**
1. **Import** — импорт с 30+ платформ (Shopify, G2, Yelp, Trustpilot, email, X, LinkedIn) + bulk CSV — [Senja Collect](https://senja.io/testimonial-software/collect)
2. **Collect** — брендированные формы для видео/текста, авто-транскрипция видео
3. **Manage** — теги, фильтры, sentiment-анализ
4. **Share** — виджеты, поп-апы, Walls of Love, image-шаблоны, no-code embed
5. **Automate** — API + Zapier

**JTBD по сегментам**

| Сегмент | Functional job | Emotional job | Social job | Триггер |
|---|---|---|---|---|
| S1. Indie hacker / solo SaaS | «Собрать отзывы в одном месте и вставить на лендинг за вечер» | «Не выглядеть пустым сайтом без единого отзыва» | «Показать, что мной пользуются» | Запуск на Product Hunt / релиз лендинга |
| S2. B2B SaaS marketing team | «Питать отзывами лендинги, кейсы, объявления» | «Не бояться, что proof примут за фейк» | «Выглядеть безопасным выбором для закупочного комитета» | Подготовка к раунду / ребрендинг |
| S3. Agency / freelancer | «Управлять proof-ом нескольких клиентов из одной панели» | «Доказывать результат, а не обещать» | «Быть агентством, у которого есть кейсы» | Питч нового клиента |
| S4. Creator / course seller | «Превратить восторги в DM в публичный soc-proof» | «Не выпрашивать отзывы вручную» | «Показать сообщество» | Запуск когорты / продукта |

**Aha Moment (по данным M1/M2):** момент, когда пользователь видит **готовую живую стену отзывов на своём сайте**, ничего не написав руками — импорт сделал всё за него.

**Что хвалят:** UX и скорость («Senja wins on UX — beautiful widgets with zero friction») — [wiserreview](https://wiserreview.com/blog/senja-alternatives/)

**Что критикуют (боли = точки входа для клона):**
- Кастомизация виджетов упирается в шаблоны: ограниченный контроль шрифтов, цветов, отступов — [VouchPost](https://vouchpost.com/blog/senja-alternative)
- Снятие бейджа Senja и часть layout-ов заперты за платными тарифами — [VouchPost](https://vouchpost.com/blog/senja-alternative)
- Free-план ограничен, особенно по видео — [ReviewNexa](https://reviewnexa.com/senja-io-review/)
- AI-редактирование отзывов требует человеческого надзора, иначе теряется аутентичность — [ReviewNexa](https://reviewnexa.com/senja-io-review/)
- ⚠️ **contested:** один конкурентский обзор утверждает, что Senja «не тянет отзывы с G2/Capterra/Google» — [VouchPost](https://vouchpost.com/blog/senja-alternative). Это прямо противоречит собственной странице Senja про импорт с 30+ платформ включая G2 и Trustpilot ([Senja Collect](https://senja.io/testimonial-software/collect)). Источник — маркетинговый материал конкурента; **проверить вручную перед тем, как строить на этом позиционирование.**

## M3 — Market & Competition

| Игрок | Позиционирование | Цена входа | Источник |
|---|---|---|---|
| **Senja** | UX + широта: импорт, виджеты, Walls of Love | $0 → $29 | [senja.io](https://senja.io/) |
| Testimonial.to | Заточен под видео-отзывы, dedicated recording pages | — | [Senja compare](https://senja.io/blog/testimonial-to-alternatives) |
| Trustmary | Виджеты соцдоказательств + импорт Google/Facebook, авто-запросы по email/SMS | от $19 | [Senja vs Trustmary](https://senja.io/trustmary-alternative) |
| Vocal Video | Marketing-grade видеопродакшн: авто-монтаж, брендинг | — | [Senja vs Vocal Video](https://senja.io/compare/vocalvideo-alternative) |
| Famewall | Бюджетный king, щедрый free, мульти-стены для агентств | от $9 | [Senja vs Famewall](https://senja.io/famewall-alternative) |

**Вывод по конкуренции:** категория «собери и покажи отзыв» — **red ocean**, дно цены уже $9. Клон-в-лоб конкурирует ценой и проигрывает. Дифференциация должна лежать в микротрендах 2026 (см. ниже).

## Micro-trends 2026 (вход в Blue Ocean)

| # | Тренд | Данные | Источник |
|---|---|---|---|
| MT-1 | **GEO/AEO: отзывы как топливо для цитирования в AI-поиске** | UGC/форумы дают 5.9–16.9% всех AI-цитат; AI-движки трактуют UGC как первичное свидетельство, а не вспомогательный сигнал | [Passionfruit](https://www.getpassionfruit.com/blog/how-ai-search-treats-user-generated-content-reviews-forums-and-community-posts) |
| MT-2 | **Zero-click + сдвиг ценности трафика** | Zero-click на Google вырос с 56% до 69% за год; конверсия LLM-визитёров: ChatGPT 15.9%, Perplexity 10.5%, Claude 5% против 1.76% у organic search | [Omnibound GEO statistics](https://www.omnibound.ai/blog/generative-engine-optimization-statistics) |
| MT-3 | **C2PA Content Credentials → «proof of human»** | C2PA идёт к ISO-стандартизации к 2026; Google читает C2PA в «About this image»; YouTube показывает лейбл «Captured with a camera» | [Content Authenticity Initiative](https://contentauthenticity.org/blog/the-state-of-content-authenticity-in-2026), [Wikipedia: Content Credentials](https://en.wikipedia.org/wiki/Content_Credentials) |
| MT-4 | **Регуляторное давление: FTC Rule о фейковых отзывах** | Правило в силе с 21.10.2024, прямо запрещает AI-сгенерированные отзывы и testimonials; штраф — **$51,744 за нарушение** | [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials), [FTC Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers), [Federal Register](https://www.federalregister.gov/documents/2024/08/22/2024-18519/trade-regulation-rule-on-the-use-of-consumer-reviews-and-testimonials) |
| MT-5 | **Agentic buying** | Gartner: AI-агенты будут опосредовать более **$15 трлн** B2B-закупок к 2028; закупщики уже используют ChatGPT/Gemini/Perplexity для discovery | [Mirakl — Top 5 AI trends in B2B 2026](https://www.mirakl.com/blog/top-5-ai-trends-in-b2b-reshaping-commerce-in-2026) |
| MT-6 | **Dark funnel / dark social** | 70–80% research происходит до контакта с продажами; средний цикл ~211 дней; разговоры уходят в приватные Slack/Discord/WhatsApp | [EWR Digital — 211-day journey](https://www.ewrdigital.com/blog/211-day-journey-dark-social-b2b-content-strategy), [12AM Agency](https://12amagency.com/blog/b2b-marketing-trends/) |
| MT-7 | **Короткое вертикальное видео как формат proof** | Видео <90 сек предпочтительно для LinkedIn-discovery; вертикальные mobile-first форматы дают максимальный engagement на LinkedIn и YouTube Shorts | [PodcastVideos — 2026 B2B video trends](https://www.podcastvideos.com/b2b-video-marketing-trends-2026/) |
| MT-8 | **Аутентичность как дефицитный ресурс** | 80% потребителей считают реальных клиентов самым достоверным источником о бренде; 60% считают UGC самой аутентичной формой маркетинга; micro-creators (1k–10k) — рабочая экономика | [Influee — UGC trends 2026](https://influee.co/blog/ugc-trends), [Moburst](https://www.moburst.com/ugc-best-practices-in-2026-what-the-data-actually-says-about-content-that-converts/) |

## Blue Ocean гипотеза

```
Убрать:     гонку за количеством виджет-шаблонов (там уже паритет и дно цены $9)
Снизить:    сложность визуального конструктора
Повысить:   верифицируемость каждого отзыва (C2PA + audit trail под FTC)
Создать:    машиночитаемый слой proof-а для AI-поиска и агентов
            (schema.org/Review + llms.txt + MCP endpoint + трекинг AI-цитирований)
```

## Что уходит в Phase 1 (sparc-prd-mini)

- `target_segments`: S1–S4 выше
- `key_competitors`: Senja, Testimonial.to, Trustmary, Vocal Video, Famewall
- `differentiation`: определяется выбранным CJM-вариантом (см. `CJM_Variants.md`)
- `monetization`: freemium, ARPU-ориентир $27–28/мес
