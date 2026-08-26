# Проекты курса — 8 недель, 8 результатов

Каждую неделю — живое занятие с экспертом и практика. Из каждого шага выходим с готовым артефактом.

**Правило репозитория:** работа по проекту ведётся ТОЛЬКО внутри его папки. Все документы проекта — там же.

| # | Папка | Неделя | Тема | Что клонируем | Ключевая техника |
|---|---|---|---|---|---|
| 01 | [`01-testimonials-senja`](01-testimonials-senja/) | отзывы | Сбор видео-отзывов и «Стена любви» | [Senja.io ↗](https://senja.io/) | Next.js + Supabase + Claude API + JS-виджет |
| 02 | [`02-review-qr-reputation`](02-review-qr-reputation/) | репутация | Умный QR для отзывов о компании | [NiceJob ↗](https://nicejob.com/) · [Birdeye ↗](https://www.birdeye.com/) · [Podium ↗](https://www.podium.com/) | роутинг по оценке, генератор QR, оплата |
| 03 | [`03-affiliate-rewardful`](03-affiliate-rewardful/) | партнёрка | Партнёрская программа за 15 минут | [Rewardful ↗](https://rewardful.com/) | cookie-трекинг, вебхуки оплаты, дашборд |
| 04 | [`04-calorie-vision-cal-ai`](04-calorie-vision-cal-ai/) | vision | ИИ-трекер калорий по фото | [Cal AI ↗](https://www.calai.app/) | мультимодель + RAG на базах калорий |
| 05 | [`05-podcast-clips-opus`](05-podcast-clips-opus/) | видео | Нарезка вирусных клипов из подкаста | [OpusClip ↗](https://www.opus.pro/) | Whisper + Claude + ffmpeg |
| 06 | [`06-rag-sales-chatbase`](06-rag-sales-chatbase/) | RAG | ИИ-продавец на данных клиента | [Chatbase ↗](https://www.chatbase.co/) | pgvector-RAG + виджет |
| 07 | [`07-cold-email-warmup`](07-cold-email-warmup/) | аутрич | Cold email с прогревом доменов | [Instantly ↗](https://instantly.ai/) · [Smartlead ↗](https://www.smartlead.ai/) | ротация ящиков, n8n |
| 08 | [`08-interior-ai-redesign`](08-interior-ai-redesign/) | генерация | Редизайн комнаты по фото за 25 секунд | [Interior AI ↗](https://interiorai.com/) | SD + depth/ControlNet + оплата |

## Главный продукт — рост, а не прототип

В каждом проекте обязательно закладываются механики роста **на этапе дизайна**:

- **ВИРАЛЬНОСТЬ** — killer-фича каждого продукта забега. Продукты подобраны так, что ценность растёт при шеринге.
- **ПАРТНЁРКА** — но работает она в связке с аудиторией партнёра.
- **БЛОГЕРЫ / ЛЮДИ С АУДИТОРИЕЙ** — «продаёшь одному, он продаёт многим» / «привлекаешь одного, он привлекает многих».

Обязательный блок требований: [`/research/GROWTH-MECHANICS-REQUIREMENTS.md`](../research/GROWTH-MECHANICS-REQUIREMENTS.md)

## Ссылки на оригиналы

Продукты, которые реплицируем. Открывать перед началом недели — смотреть на живой продукт,
а не только на его описание в discovery.

| # | Продукт | Сайт | Что смотреть в первую очередь |
|---|---|---|---|
| 01 | Senja | <https://senja.io/> | форму сбора отзыва, Wall of Love, встроенный виджет на чужих сайтах |
| 02 | — | <https://nicejob.com/> · <https://www.birdeye.com/> · <https://www.podium.com/> | как площадки решают перехват негатива **без** review gating |
| 03 | Rewardful | <https://rewardful.com/> | дашборд партнёра, страницу условий программы |
| 04 | Cal AI | <https://www.calai.app/> | момент «фото → калории», карточку результата |
| 05 | OpusClip | <https://www.opus.pro/> | оценку клипов, watermark на бесплатном тарифе |
| 06 | Chatbase | <https://www.chatbase.co/> | виджет на чужом сайте, «Powered by» |
| 07 | Instantly · Smartlead | <https://instantly.ai/> · <https://www.smartlead.ai/> | описание механики прогрева и общего пула |
| 08 | Interior AI | <https://interiorai.com/> | пары «до/после», есть ли watermark |

> **№02 — единого «оригинала» нет.** Это категория (review management для локального бизнеса),
> а не один продукт. Смотрим на нескольких игроков сразу — и отдельно на то, как они обходят
> запрет review gating (см. non-negotiable в [`/start/REPLICATE-PROMPTS.md`](../start/REPLICATE-PROMPTS.md)).

⚠️ Смотреть на оригинал полезно, но **цифры с их лендингов не переносить в требования**:
часть публичных цифр аналогов при проверке не подтвердилась. Копируем механику, не числа.

## Инструменты

- `/replicate` (p-replicator) — основной пайплайн репликации функций стартапа
- `/feature-adr` (skills-feature-adr) — по отдельному запросу, для сложных фич
