# Разбор сайтов-референсов: NiceJob, Birdeye, Podium

**Дата съёмки:** 2026-09-01 · **Инструмент:** Playwright 1.62.1 CLI, chromium headless, viewport 1440×1000,
UA Chrome/131, локаль en-US. MCP-сервера Playwright в окружении нет — использован собственный Node-скрипт.
**Метод дизайн-съёмки:** `getComputedStyle` в контексте страницы + чтение CSS custom properties из
`document.styleSheets`. Ни одно значение цвета или шрифта не взято «на глаз».

Пометки: `[СНЯТО С САЙТА]` — прямое измерение или цитата · `[ВЫВОД]` — интерпретация ·
`[НЕ УДАЛОСЬ]` — не установлено.

**Разбор разложен на три файла** (лимит репозитория — 500 строк):

| Файл | Что внутри |
|---|---|
| **`01-original-walkthrough.md`** (этот) | Вердикт, карта страниц, пользовательский путь, снимки, что не удалось, сводка |
| [`01a-design-tokens.md`](01a-design-tokens.md) | Измеренные дизайн-токены: палитра, типографика, геометрия, кнопки, сравнение трёх |
| [`01b-review-mechanics.md`](01b-review-mechanics.md) | QR, фильтрация отзывов, **экран сбора отзыва живьём** — разделы 5 и 6 |

Нумерация разделов сквозная через все три файла, поэтому в `01b` заголовки начинаются с 5.

---

## 1. Вердикт: берём за основу дизайна NiceJob

**Решение: NiceJob (`get.nicejob.com`).** Четыре причины, в порядке убывания веса.

**1.1. У NiceJob дизайн-система выгружается целиком и машинно.** `[СНЯТО С САЙТА]`
На `:root` объявлено **85 CSS-переменных** с семантическими именами: полные шкалы
`--color-blue-50…950`, `--color-green-*`, `--color-purple-*`, плюс именованные роли бренда
(`--color-neutron-blue`, `--color-atomic-green`, `--color-electron-blue`), две семьи шрифтов
(`--primary-font-family`, `--secondary-font-family`), тень (`--elevation-one`), ширина
контейнера (`--max-content-width: 1200px`), отступы (`--container-padding`, `--gap`).

Для сравнения `[СНЯТО С САЙТА]`: у Birdeye 141 переменная — но это переменные Bootstrap
(`--bs-body-color`, `--bs-font-sans-serif`); у Podium 90 переменных — и почти все принадлежат
виджету согласия Ethyca (`--fides-overlay-*`). Собственной выгружаемой системы токенов у них нет.

`[ВЫВОД]` Разница практическая, а не эстетская: у NiceJob вёрстку воспроизводят копированием
блока переменных, у двух других — подбором цветов по скриншоту. Мы пишем ТЗ на вёрстку, а не
рисуем мудборд.

**1.2. Совпадает механика и сегмент.** `[СНЯТО С САЙТА]` NiceJob адресован «small businesses»,
цена опубликована ($75/$125 в месяц), самообслуживание: «14-day free trial, No contracts,
No credit card up front», регистрация в один экран. Podium — $399/$599 и **только «Talk to Sales»**,
кнопки самостоятельной регистрации нет вовсе. У Birdeye на странице тарифов **цен нет ни одной** —
вместо них форма захвата лида. `[ВЫВОД]` Podium и Birdeye — enterprise/multi-location с продажей
через отдел продаж; их сайты решают задачу «получить лид для сейлза», а не «дать человеку
зарегистрироваться». Наш продукт — самообслуживание, поэтому копировать надо тот сайт, который
эту задачу и решает.

**1.3. Podium как референс по отзывам устарел.** `[СНЯТО С САЙТА]` H1 главной Podium — «The #1
converting AI Employee for local businesses». Слово «review» на главной не встречается в
заголовках вообще; отзывы задвинуты в подраздел `/product/reviews`. `[ВЫВОД]` Podium перепозиционировался
в AI-агента для продаж. Брать его за основу — копировать чужой пивот.

**1.4. Birdeye — тоже про AI-агентов, но полезен как юридический источник.** `[СНЯТО С САЙТА]`
H1: «Jay turns your reputation into revenue at every location», вся страница построена вокруг
«AI Coworkers». Дизайн — корпоративный Bootstrap-нейтрал (Hanken Grotesk, синий `#1976d2`,
радиус 8px). `[ВЫВОД]` Как дизайн-основа — неинтересен. Но по вопросу фильтрации отзывов
Birdeye — самый ценный из трёх (раздел 5), и его надо цитировать в обоснование архитектуры.

**Оговорка о геолокации.** `[СНЯТО С САЙТА]` Birdeye принудительно редиректит на `/uk/` версию
(машина геолоцируется в UK), Podium и NiceJob отдают US-версию. Цены Birdeye не опубликованы,
так что расхождение US/UK на сравнение не влияет; тексты FAQ британские по орфографии
(«personalised», «customised»).

---

## 2. Карта страниц

### 2.1. NiceJob `[СНЯТО С САЙТА]`

`nicejob.com` → 302 → **`get.nicejob.com`** (HubSpot CMS). Приложение — на отдельном домене
`app.nicejob.com`. Владелец — Paystone Inc. (копирайт в футере, вакансии на `paystone.com`).

| URL | H1 | Назначение |
|---|---|---|
| `get.nicejob.com/` | Easily get more reviews. Outrank local competition. Win more sales. | Главная, продающая |
| `/pricing` | Simple pricing for small businesses | Тарифы, 2 плана + сайты, FAQ |
| `/product/reviews` | Easily win 4x more customer reviews | Ядро продукта: сбор отзывов |
| `/product/social-proof` | Get high-quality leads and boost your conversions | Виджеты отзывов на свой сайт |
| `/product/insights` | You work hard to build your business. We work hard to grow it. | Аналитика, обратная связь, лидерборд сотрудников |
| `/product/referrals`, `/broadcasts`, `/gifts`, `/sites`, `/repeats`, `/ai-review-replies` | — | Остальные 6 модулей платформы `[НЕ ОТКРЫВАЛ]` |
| `/google-review-link-generator` | GOOGLE REVIEW LINK GENERATOR | Бесплатный инструмент-магнит: даёт прямую ссылку на форму отзыва |
| `/resources/how-to-create-a-google-review-qr-code-…` | How to Create a Google Review QR Code for Your Business | Статья про QR (см. раздел 5) |
| `/home-services-…`, `/professional-services-…`, `/health-and-wellness-…`, `/hospitality-…`, `/franchises` | — | 5 отраслевых лендингов |
| `/resources` | — | Блог/ресурсы |
| `partners.nicejob.com/integrations` | — | Каталог интеграций |
| `help.nicejob.com/en/` | — | Справка (Intercom) |
| `app.nicejob.com/u/onboarding` | Let's get you 4x more reviews! | Регистрация |
| `app.nicejob.com/login` | — | Вход |

Навигация верхнего уровня — 4 пункта: **Platform · Who We Serve · Learn More · Pricing**, справа
**Log In** и **Start Free**. Футер — 5 колонок: Platform (9 продуктов) · Who We Serve (5 отраслей) ·
Resources (6) · Company (6) · Get in touch (телефон, почта, Messenger, физический адрес, часы работы).
В карте сайта `sitemap.xml` — **427 URL**.

### 2.2. Podium `[СНЯТО С САЙТА]`

| URL | H1 | Назначение |
|---|---|---|
| `www.podium.com/` | The #1 converting AI Employee for local businesses | Главная — про AI-агента, не про отзывы |
| `/pricing` | AI lead conversion with every plan | 3 тарифа, все через отдел продаж |
| `/product/reviews` | Get more reviews in less time. | Модуль отзывов |
| `/google-review-link` | — | Инструмент-магнит `[НЕ ОТКРЫВАЛ]` |

Навигация: **AI Employee · Industry Solutions · Plans · Resources**, справа телефон отдела продаж,
**Watch a demo**, **Sign in**. `sitemap/page-sitemap.xml` — 369 URL.

### 2.3. Birdeye `[СНЯТО С САЙТА]`

`www.birdeye.com` → 301 → `birdeye.com/uk/`.

| URL | H1 | Назначение |
|---|---|---|
| `birdeye.com/uk/` | AI Agents for Multi-location Brands | Главная |
| `/uk/reviews/` | Jay turns your reputation into revenue at every location. | Модуль отзывов + 15 вопросов FAQ |
| `/uk/pricing/` | Pricing built around outcomes, not seat counts. | Тарифы **без цен**, форма лида |
| `/uk/updates/birdeye-removes-sentiment-pre-check-in-review-requests/` | Birdeye removes sentiment pre-check in Review Requests | Ключевой документ, раздел 5 |
| `/uk/updates/prohibiting-review-gating-on-birdeye-surveys/` | Prohibiting review gating on Birdeye surveys | Ключевой документ, раздел 5 |
| `/review-link-generator/` | — | Инструмент-магнит `[НЕ ОТКРЫВАЛ]` |
| `/integration/qrs/` | — | Интеграция с сервисом «QRS» (не QR-коды, см. раздел 5) `[НЕ ОТКРЫВАЛ]` |

Навигация: **Platform · Solutions · Partners · Resources · Pricing**, справа телефон, **Sign In**,
**Check My AI Visibility**. В карте сайта — **109 204 URL** (в основном страницы отдельных
бизнес-профилей — SEO-масса).

---

## 3. Пользовательский путь (NiceJob) `[СНЯТО С САЙТА]`

**Шаг 1. Главная.** Два CTA рядом: **Start Free** (основной, синяя заливка `#025bde`) и
**Book a demo** (вторичный, прозрачный с белой рамкой 2px). Ведут: первый — сразу на
`app.nicejob.com/u/onboarding`, второй — на форму брони демо. Подзаголовок сразу называет
адресата: «for busy and budget-conscious business owners».
`[ВЫВОД]` Порядок кнопок — самообслуживание первым, отдел продаж вторым. У Podium ровно наоборот:
единственная кнопка «Watch a demo», зарегистрироваться самому нельзя.

**Шаг 2. Цена видна до регистрации.** `/pricing` доступна из главного меню одним кликом, цифры
на странице: **$75/мес** (Reviews) и **$125/мес** (Pro, помечен «Most Popular»), отдельно
Sites — **$99/мес + $199 setup**. Над карточками три обещания: 14-day free trial · No contracts ·
No credit card up front.

**Шаг 3. Регистрация** (`app.nicejob.com/u/onboarding`, H1 «Let's get you 4x more reviews!»).
Форму открыл, **ничего не отправлял**. Состав:
- поле телефона с сообщением «We will send you a one-time verification code» — то есть подтверждение по SMS-коду;
- **Sign up with Google** (OAuth) и **Sign up with Xero** (OAuth, бухгалтерия для малого бизнеса);
- разделитель «OR», затем Full name · Email · Password;
- два **раздельных необязательных** чекбокса согласий: маркетинговые рассылки и передача
  ограниченных данных рекламным платформам. Оба явно помечены «OPTIONAL PREFERENCES» и оба
  с правом отзыва согласия.
- кнопка **Sign up with email**.

В URL OAuth-запроса продукт и план прошиты параметром:
`products=[{"product":"reviews","plan":"STANDARD"}]`. `[ВЫВОД]` План выбирается ДО регистрации и
передаётся в онбординг — регистрация не «вообще», а сразу в выбранный тариф.

**Шаг 4. Что обещано после регистрации** (со страницы `/product/reviews`, «3 easy steps»):
1) подключить площадки отзывов (Google Business Profile, Facebook и др.);
2) подключить CRM (Jobber, HouseCall Pro, QuickBooks) для импорта клиентов — «если вы не храните
данные клиентов, можно добавить имена, e-mail и телефоны вручную»;
3) запустить кампанию: **1 SMS + последовательность из 3 писем**, тексты преднаписаны.

`[ВЫВОД]` Ключевая для нас деталь: **канал доставки у NiceJob — SMS и e-mail, то есть требуется
контакт клиента**. Это и есть их слабое место и наша ниша: QR-код работает там, где контакта нет
и просить его неуместно.

---

## 4. Дизайн-система → вынесена в отдельный файл

Полные таблицы измеренных значений (палитра из 85 CSS-переменных, типографика, геометрия,
кнопки, сравнение с Birdeye и Podium) — в [`01a-design-tokens.md`](01a-design-tokens.md).
Вынесено ради лимита в 500 строк на файл.

Кратко, чтобы не открывать второй файл ради главного `[СНЯТО С САЙТА]`:
основной `#025bde` · акцент `#2ce080` · тёмный герой `#130a38` · текст `#364459` ·
заголовки Bogart serif, интерфейс Inter · кнопки `radius:100px`, `padding:12px 24px` ·
карточки `radius:16px` · контейнер 1200px.

---

## 5. Механика отзывов → вынесена в отдельный файл

Два раздела, ради которых разбор и делался, лежат в
[`01b-review-mechanics.md`](01b-review-mechanics.md) — вынесены ради лимита в 500 строк:

- **QR-коды.** У NiceJob функция **есть** (с мая 2026: брендированный код, сопоставление отзыва
  с клиентом за 10 минут, счётчики сканов и конверсии). У Podium и Birdeye — нет. Ниша не свободна.
- **Фильтрация отзывов.** Birdeye удалил предварительный вопрос об оценке в 2018 по политике Google
  и отключил Display Logic. NiceJob сегодня продаёт «Feedback Routing» — NPS 1–10 перед развилкой,
  но **оба пути показываются в обеих ветках**, меняется только порядок и вес.
- **Экран сбора отзыва** снят живьём на `review.new/nicejob`: модалка 460×395, Roboto, строки
  площадок по 60px, приватный канал — последняя строка того же списка. Разбор десктопа и мобильного,
  обе ветки Feedback Routing, форма Birdeye, и почему экран Podium установить не удалось.

---

## 6. Снимки экрана

Каталог: `projects/02-review-qr-reputation/docs/discovery/screenshots/`

**Интерфейс продукта — то, по чему будем строить** (снято с работающей NiceJob и из её справки):

| Файл | Что на нём |
|---|---|
| `nicejob-invite-desktop-step1.png` | **Экран сбора отзыва, десктоп.** Модалка над микросайтом: название, подзаголовок, две площадки, ссылка «Other review site options» |
| `nicejob-invite-desktop-step2-other-options.png` | Он же раскрытый: Google · G2 · Capterra · **NiceJob (no account needed)** |
| `nicejob-invite-mobile-step1.png` | Тот же экран на 390×844 — модалка не на всю ширину, строки те же 60px |
| `nicejob-invite-mobile-step2-other-options.png` | Мобильный раскрытый список с логотипами площадок и шевронами |
| `nicejob-feedback-routing-both-branches.png` | **Ключевой.** Официальная схема NiceJob: вопрос NPS 1–10 и обе ветки — обе показывают и площадки, и приватный канал, меняется только порядок и вес |
| `nicejob-settings-feedback-routing.png` | Настройки: тумблер Feedback Routing, порог «7 and below», формулировка «highlight» |
| `nicejob-settings-review-invite-link.png` | Настройки: адрес приглашения `review.new/nicejob` и «Auto-publish minimum rating: 4 stars» |
| `nicejob-settings-review-sites.png` | Настройки списка площадок |
| `nicejob-settings-optimize-order.png` | Тумблер «Optimize» — автоподбор порядка площадок |
| `nicejob-qr-card.png` | **QR-карточка клиента:** логотип, «Leave us a review», код со скруглением, Share / Download |
| `nicejob-qr-app.png` | QR-функция в приложении |
| `birdeye-microsite-write-review.png` | Форма отзыва Birdeye: пять звёзд, поле, «Submit review». Выбора площадки нет |

**Маркетинговые страницы:**

| Файл | Что на нём |
|---|---|
| `nicejob-home.png`, `nicejob-home-hero.png` | Главная целиком и первый экран: тёмный герой `#130a38`, serif H1, два CTA |
| `nicejob-pricing.png`, `nicejob-pricing-plans.png` | Тарифы целиком и блок карточек $75 / $125 крупно |
| `nicejob-reviews.png`, `nicejob-reviews-steps.png` | Страница сбора отзывов и блок «3 easy steps» |
| `nicejob-socialproof.png`, `nicejob-insights.png`, `nicejob-integrations.png` | Виджеты, аналитика, интеграции |
| `podium-home.png`, `podium-reviews.png`, `podium-pricing.png`, `podium-pricing-plans.png` | Podium; в тарифах $399 / $599 / Custom, все «Talk to Sales» |
| `birdeye-home.png`, `birdeye-reviews.png`, `birdeye-reviews-hero.png`, `birdeye-pricing.png` | Birdeye |

Экран регистрации NiceJob разобран в разделе 3; форма открыта, **ничего не отправлялось**.

---

## 7. Что не удалось

| Что | Причина |
|---|---|
| **Экран сбора отзыва Podium** | База знаний на Salesforce Experience Cloud: раздел «Reviews, 18 статей» виден, но переходы обрабатываются скриптом и ссылок на статьи не отдают. Публичных микросайтов, как у Birdeye, у Podium нет. **Не установлен ни живьём, ни скриншотом.** Строить по нему нечего |
| **Экран с NPS живьём** | У аккаунта NiceJob Feedback Routing выключен, поэтому предварительный вопрос на живом экране не появляется. Обе ветки известны по **официальной схеме из справки** — это их рисунок, но не живой экран. В разделе 6.4 файла `01b` помечено явно |
| Экран сбора отзыва Birdeye по SMS-приглашению | Снята только форма на их публичном микросайте. Как выглядит именно письмо/SMS-приглашение с выбором площадки — не установлено |
| Цены Birdeye | `[СНЯТО С САЙТА]` На странице тарифов цен нет — форма захвата лида. Не «не загрузилось», а их решение |
| Поиск через DuckDuckGo Lite | Пустой результат, вероятно блокировка датацентрового IP. Обойдено выгрузкой `sitemap.xml` напрямую — надёжнее |
| Аккордеоны FAQ Birdeye кликом | 44 клика не раскрыли ответы (React без доступного триггера). Обойдено через `application/ld+json` схемы `FAQPage` — текст получен полностью |
| US-версия Birdeye | Принудительный редирект на `/uk/` по геолокации IP; на существо не влияет |
| 6 продуктовых страниц NiceJob (Referrals, Broadcasts, Gifts, Sites, Repeats, AI Replies) | Не открывались — за пределами задачи |

**Про метод, заслужено ошибкой этого разбора.** Первая редакция утверждала, что QR-функции нет ни у
кого, на основании выгрузки `sitemap.xml` трёх маркетинговых доменов. У NiceJob функция есть — она
описана только в справке, а справка в карту сайта не входит. **Отсутствие страницы в карте сайта —
это отсутствие страницы, а не отсутствие функции.** Продуктовые возможности проверяются по справке
и по живому продукту; карта сайта отвечает на другой вопрос.

---

## 8. Сводка: что забираем

**Дизайн** (подробности в `01a-design-tokens.md`):

| Что | Откуда | Как применяем |
|---|---|---|
| 85 CSS-переменных, шкалы 50…950 | NiceJob | Основа токенов нашей дизайн-системы |
| `#025bde` + `#2ce080` + `#130a38` | NiceJob | Первичный / акцент / тёмный герой |
| Bogart serif заголовки + Inter интерфейс | NiceJob | Типографическая пара; serif отличает от конкурентов |
| Пилюля `radius:100px`, `padding:12px 24px`; карточка `radius:16px`; контейнер 1200px | NiceJob | Кнопки, карточки, сетка |
| Тёплый фон `#fafaf7` вместо белого | Podium | Опция для фона секций |
| Цена на видном месте + «no credit card» | NiceJob | Модель самообслуживания |

**Экран сбора отзыва** (подробности в `01b-review-mechanics.md`):

| Что | Откуда | Как применяем |
|---|---|---|
| Строка площадки 60px: логотип · название · шеврон | NiceJob, живой экран | Базовый элемент нашего экрана; 60px и на мобильном |
| Модалка 460×395, `radius:10px`, `padding:30px`, затемнение `rgba(0,0,0,.4)` | NiceJob, живой экран | Геометрия развилки |
| Roboto на клиентском экране вместо шрифтов сайта | NiceJob | Клиентский экран **не обязан** повторять маркетинговую типографику |
| Свёрнутый список из 2 площадок + «Other options» | NiceJob | **Анти-паттерн для нас:** раскрытие скрывает часть путей |
| Приватный канал приподнят тенью и скруглением | NiceJob | **Анти-паттерн для нас:** нарушает равный вес. У нас — такая же строка |
| «(no account needed)» мелким шрифтом под названием | NiceJob | Приём для пояснения, зачем путь нужен |

**Правовое и продуктовое:**

| Что | Откуда | Как применяем |
|---|---|---|
| «Show to all irrespective of sentiment» | Birdeye, 2018 | Формулировка обязательного требования |
| Запрет Display Logic | Birdeye, 2018 | Никакого условного показа площадок |
| «Contact us directly» / «direct feedback» | Birdeye | Название приватного канала |
| Симметричная инверсия веток вместо отсечения | NiceJob, Feedback Routing | **Граница отрасли:** нарушение — когда путь исчез, а не когда он второй. Наше требование строже стандарта, и это надо называть вслух |
| «Равноправно» = равная высота, типографика, тип кнопки, без скрытых блоков | Выведено из механики NiceJob | Критерий, проверяемый скриптом, а не на глаз |
| QR: брендирование логотипом, счётчики Scans / Click Rate / Reviews Won, средний балл по офлайну | NiceJob, май 2026 | Планка по аналитике; ниша не свободна |
| Сопоставление отзыва с клиентом за 10 минут через CRM | NiceJob | Их привязка к CRM — наша точка отличия: работаем без CRM и без контакта |
| «Не ставьте планшет на стойке» | NiceJob | Ограничение на сценарии размещения QR |
| Приватная связь уходит на почту владельца; кампания не останавливается | NiceJob | Решения, которые нам придётся принять осознанно |
