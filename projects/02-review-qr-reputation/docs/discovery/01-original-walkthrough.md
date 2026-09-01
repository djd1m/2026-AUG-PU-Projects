# Разбор сайтов-референсов: NiceJob, Birdeye, Podium

**Дата съёмки:** 2026-09-01 · **Инструмент:** Playwright 1.62.1 CLI, chromium headless, viewport 1440×1000,
UA Chrome/131, локаль en-US. MCP-сервера Playwright в окружении нет — использован собственный Node-скрипт.
**Метод дизайн-съёмки:** `getComputedStyle` в контексте страницы + чтение CSS custom properties из
`document.styleSheets`. Ни одно значение цвета или шрифта не взято «на глаз».

Пометки: `[СНЯТО С САЙТА]` — прямое измерение или цитата · `[ВЫВОД]` — интерпретация ·
`[НЕ УДАЛОСЬ]` — не загрузилось.

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

## 5. QR-коды и фильтрация отзывов — главный раздел

### 5.1. QR: у NiceJob функция ЕСТЬ (исправлено), у двух других нет `[СНЯТО С САЙТА]`

Проверено не по впечатлению, а по картам сайта: выгружены `sitemap.xml` всех трёх (427 / 369 /
109 204 URL) и отфильтрованы по `qr`.

| Сайт | Что нашлось по «qr» |
|---|---|
| NiceJob | Две **статьи блога**: `/resources/how-to-create-a-google-review-qr-code-for-your-business-step-by-step` и `/resources/how-to-create-a-qr-code-for-google-reviews-for-free` |
| Podium | Ничего |
| Birdeye | `/integration/qrs/` — интеграция с системой по имени «QRS», к QR-кодам отношения не имеет; остальные совпадения — фамилии в SEO-страницах (`laila-qrochi`, `yqr-pole-academy`) |

> **ИСПРАВЛЕНИЕ по итогам разбора справки (раздел 6).** Первая редакция этого раздела утверждала,
> что QR — тема контент-маркетинга у всех трёх. Для Podium и Birdeye это подтвердилось, **для
> NiceJob — нет**. Карта сайта маркетингового домена оказалась недостаточным источником: функция
> существует, но описана только в справке, которая в `sitemap.xml` не входит. Урок для метода:
> отсутствие в карте сайта — это отсутствие СТРАНИЦЫ, а не отсутствие ФУНКЦИИ.

`[СНЯТО С САЙТА]` Статья справки **«QR Codes for Review Generation»** (Joel Pike, **9 мая 2026** —
функции около четырёх месяцев на момент съёмки) описывает полноценный продукт:

- «Every NiceJob account now has a **unique QR code generated automatically**» — код есть у каждого
  аккаунта без настройки;
- **брендирование**: «Your QR code will automatically include your logo»;
- **два способа применения**: открыть на телефоне техника в конце работ либо скачать картинкой для
  визиток, настольных подставок и счетов;
- **Review Matching**: если клиент отсканировал и оставил отзыв **в течение 10 минут**, NiceJob
  пытается сопоставить отзыв с клиентом из CRM, у которого на сегодня или вчера есть работа или
  платёж;
- **аналитика на странице Insights**: Total Scans, Click Rate, Reviews Won, Average Rating —
  причём средняя оценка считается **отдельно по отзывам из офлайна**.

`[ВЫВОД]` Ниша **не свободна**. Это меняет позиционирование: мы не первые с QR, мы конкурируем с
функцией, которой несколько месяцев. Два следствия:

1. **Одним «у нас есть QR» отличия не будет.** Отличие придётся строить на том, чего у NiceJob нет:
   у него QR — придаток к CRM-контуру (Review Matching требует записи о работе или платеже в CRM),
   а у нас сценарий без CRM и без контакта клиента вообще.
2. **Планку задали.** Брендирование логотипом, счётчик сканов, click rate и отдельный средний балл
   по офлайн-каналу — это уже не «сгенерировать картинку», а измеримый канал. Наш минимум по
   аналитике теперь известен и он выше, чем «сколько сканов».

Механика доставки у всех трёх по-прежнему **преимущественно** SMS и e-mail по базе из CRM — это
подтверждается шагом 3 онбординга NiceJob («1 SMS + 3 письма») и цитатой клиента Podium: «we can now
easily and quickly send the patient a link at the end of their visit». QR у NiceJob позиционируется
явно как **дополнение**, а не замена: «QR codes work best alongside automated follow-ups, not
instead of them».

### 5.2. Что NiceJob пишет про QR по существу `[СНЯТО С САЙТА]`

Статья `/resources/how-to-create-a-google-review-qr-code-…` — практическая, и в ней есть вещи,
которые нам придётся учесть в продукте:

- **Целевой URL — прямая ссылка Google.** Оба описанных способа (штатный генератор в Google
  Business Profile через кнопку «Ask for reviews», либо сторонний генератор с брендированием)
  ведут **прямо на форму отзыва Google**. Никакой промежуточной страницы, никакого вопроса об
  оценке. `[ВЫВОД]` Наша страница-развилка вставляет промежуточный шаг, которого у них нет —
  значит она обязана оправдывать себя тем, что даёт выбор площадки, а не тем, что «фильтрует».
- **Раздел «How to Make Sure QR Code Reviews Don't Get Filtered»** — прямая цитата:
  *«Don't set up a tablet or scan station at your office. Multiple customers scanning the same code
  on the same network and leaving reviews within minutes of each other looks like a review ring to
  Google's filters. The code works best when customers scan it at home, on their own connection.»*
  `[ВЫВОД]` **Это требование к нашему продукту, а не совет.** Отзывы, оставленные пачкой с
  одного Wi-Fi, Google отфильтрует. Значит: стационарная табличка на стойке — рискованный сценарий,
  а сценарий «QR на счёте/визитке, клиент сканирует дома» — безопасный. Это надо заложить в
  рекомендации по размещению и, возможно, в предупреждение в интерфейсе.
- **«Don't offer anything in exchange for a review»** — вознаграждение за отзыв нарушает политику Google.
- **Ссылка ломается молча:** QR-код не истекает, но целевой URL может перестать резолвиться при
  изменениях в Business Profile, «и вы об этом не узнаете, пока кто-нибудь не скажет».
  `[ВЫВОД]` Аргумент за динамический QR через наш редирект: цель меняется без перепечатки носителя.
- Места размещения, которые они называют работающими: подвал счёта («самое конверсионное для
  подрядчиков — вы отдаёте счёт в момент максимальной удовлетворённости»), оборот визитки,
  табличка на объекте, оклейка машины, подпись в почте, карточка на стойке.
- Прямо сказано: **QR работает вместе с автоматическими напоминаниями, а не вместо них.**

### 5.3. Фильтрация отзывов (review gating) — Birdeye даёт нам готовое обоснование

Это самая ценная находка разбора. Birdeye **сам когда-то делал запрещённую механику и публично
от неё отказался**, и обе записи об этом до сих пор висят у него в журнале изменений.

**Документ 1** — `/updates/birdeye-removes-sentiment-pre-check-in-review-requests/`,
«IMPROVEMENT, Apr 23, 2018». Дословно `[СНЯТО С САЙТА]`:

> «Based on Google's new policy on review solicitation released on April 12, 2018, Google does not
> recommend sentiment pre-check for reviews. In order to ensure adherence to industry best practices,
> Birdeye has removed the sentiment pre-check in the review requests segment. Now, **all customers
> will have the option to write a review on Google (or any third-party site) irrespective of whether
> or not they are promoters or detractors.** To serve better, Birdeye has added an option to display
> **"Contact us directly"** button. This option will display under direct feedback where a customer
> can leave private feedback on Birdeye. […] Going forward, Birdeye review request templates will not
> have the option to pre-check customer sentiment before asking for a review. **The review sites
> selected by the business will be shown to all customers irrespective of their sentiment.»**

**Документ 2** — `/updates/prohibiting-review-gating-on-birdeye-surveys/`,
«IMPROVEMENT, Nov 09, 2018» `[СНЯТО С САЙТА]`:

> «Birdeye has removed sentiment pre-check for all the Birdeye surveys. […] Going forward, Birdeye
> **not allow creating any new non-compliant surveys** after this launch. Businesses will only be
> allowed to add review request question **only once and at the end of the survey**. **Display Logic
> feature will also be disabled** for Birdeye surveys.»

`[ВЫВОД]` Три вывода, каждый ложится прямо в наши требования:

1. **Наша обязательная механика — не наше изобретение и не перестраховка, а отраслевой стандарт
   с 2018 года.** «Показывать площадки ВСЕМ независимо от настроения» — формулировка Birdeye,
   не наша. На это можно ссылаться в документации продукта и в разговоре с клиентом, который
   спросит «а можно фильтровать?».
2. **Приватный канал имеет отраслевое название: «Contact us directly» / «direct feedback».**
   И — принципиально — он у Birdeye показывается **вместе** с публичными площадками, а не вместо
   них при низкой оценке. Это ровно та развилка, которую требует наше ТЗ. Название для нашей
   кнопки стоит брать отсюда, а не изобретать: «Написать нам напрямую», не «Пожаловаться».
3. **Запрет распространяется на логику показа, а не только на прямой вопрос об оценке.** Birdeye
   отключил **Display Logic** в опросах целиком и разрешил спрашивать про отзыв **только один раз
   и только в конце**. `[ВЫВОД]` Обход через «мы не спрашиваем оценку, мы просто показываем
   разные экраны по условию» — тот же gating. У нас не должно быть НИКАКОГО условного показа
   площадок: оба пути видны сразу, в одном экране, без предварительного вопроса.

**Дополнительно, FAQ на `/uk/reviews/`** (извлечён из JSON-LD `FAQPage`, на странице скрыт в
аккордеонах) `[СНЯТО С САЙТА]`:

> **«Can I exclude unhappy customers from my review campaigns?»** — «We recommend that you send
> review requests to **all** your customers so that your online reputation is a true reflection of
> your brand's customer experience. Consumers understand that no brand is perfect, and a couple of
> bad reviews actually make your business look genuine. **Excluding unhappy customers from review
> campaigns can also amount to review gating, which might lead to penalties from Google or other
> legal and financial damages** for your brand.»

> **«Can I exclude negative reviews from showing up on my website?»** — «We recommend that you
> feature **all** the latest reviews on your website, irrespective of the rating. This will help
> your brand look genuine and **prevent penalties from Google against review gating practices**.»

> **«Should I offer incentives in exchange for reviews?»** — «We strongly recommend that you don't.
> […] **Google is against review gating, which includes offering incentives for reviews.** Upon
> detection, Google might **suspend or terminate your business profile**.»

`[ВЫВОД]` Последняя цитата расширяет запрет на **наш виджет отзывов на сайте клиента**: отбор
только положительных отзывов для показа — это тоже gating. Если в продукте будет виджет
социального доказательства, фильтр «показывать только 4–5 звёзд» делать нельзя.

### 5.4. Как выглядит запрещённое — для протокола `[ВЫВОД]`

По описанию Birdeye реконструируется механика, которую они удалили и которую нам делать нельзя:

```
ЗАПРЕЩЕНО (sentiment pre-check, до апреля 2018 — стандарт отрасли):
  «Как вам всё прошло?»  →  😀 → площадки Google/Facebook
                         →  🙁 → приватная форма, площадки НЕ показаны

ЗАПРЕЩЕНО ТАКЖЕ (display logic — обход без прямого вопроса):
  любой условный показ площадок в зависимости от ответа, оценки или сегмента

ОБЯЗАТЕЛЬНО (Birdeye после 2018, наше ТЗ):
  один экран  →  [Оставить отзыв на Google]  [Оставить отзыв на Яндекс/2ГИС]
                 [Написать нам напрямую]
                 — все варианты видны сразу, без предварительного вопроса,
                   всем без исключения
```

У NiceJob и Podium `[СНЯТО С САЙТА]` признаков предварительного вопроса об оценке на публичных
страницах не обнаружено вовсе: NiceJob описывает механику как «SMS + 3 письма со ссылкой»,
Podium — как «textable review invites». Экран, который видит конечный клиент, ни у одного из трёх
на маркетинговом сайте не показан. `[НЕ УДАЛОСЬ]` увидеть реальный экран сбора отзыва — он живёт
внутри продукта за регистрацией, а регистрироваться было запрещено заданием.

---

## 6. Снимки экрана

Каталог: `projects/02-review-qr-reputation/docs/discovery/screenshots/`

| Файл | Что на нём |
|---|---|
| `nicejob-home.png` | Главная NiceJob целиком (fullPage, 7612px) |
| `nicejob-home-hero.png` | Первый экран: тёмный герой `#130a38`, serif H1, два CTA |
| `nicejob-pricing.png` | Страница тарифов целиком |
| `nicejob-pricing-plans.png` | **Блок тарифов крупно**: карточки $75 / $125, бейджи, пилюли CTA |
| `nicejob-reviews.png` | Страница про сбор отзывов целиком |
| `nicejob-reviews-steps.png` | Блок «3 easy steps» — механика подключения |
| `nicejob-socialproof.png` | Виджеты отзывов на сайт клиента |
| `nicejob-insights.png` | Аналитика и обратная связь |
| `nicejob-integrations.png` | Каталог интеграций |
| `podium-home.png`, `podium-reviews.png`, `podium-pricing.png` | Podium целиком |
| `podium-pricing-plans.png` | **Блок тарифов Podium**: $399 / $599 / Custom, все «Talk to Sales» |
| `birdeye-home.png`, `birdeye-reviews.png`, `birdeye-pricing.png` | Birdeye целиком |
| `birdeye-reviews-hero.png` | Первый экран страницы отзывов Birdeye |

Экран регистрации NiceJob снят в `nicejob-signup` (данные в разборе, раздел 3); форма открыта,
**ничего не отправлялось**.

---

## 7. Что не удалось

| Что | Причина |
|---|---|
| Экран сбора отзыва, который видит конечный клиент (все три сайта) | Живёт внутри продукта за регистрацией. Регистрация запрещена заданием. **Главный пробел разбора**: механику развилки восстанавливаем по документации Birdeye, а не по живому экрану |
| Цены Birdeye | `[СНЯТО С САЙТА]` На странице тарифов цен нет — вместо них форма захвата лида. Не «не загрузилось», а их сознательное решение |
| Поиск через DuckDuckGo Lite | Запросы возвращали пустой результат — вероятно, блокировка датацентрового IP. Обойдено выгрузкой `sitemap.xml` напрямую с сайтов, что надёжнее |
| Аккордеоны FAQ Birdeye кликом | 44 клика по заголовкам не раскрыли ответы (React-компонент без доступного триггера). Обойдено: ответы извлечены из `application/ld+json` схемы `FAQPage` — полный текст получен |
| US-версия Birdeye | Принудительный редирект на `/uk/` по геолокации IP. Тексты FAQ британские, на существо не влияет |
| 6 продуктовых страниц NiceJob (Referrals, Broadcasts, Gifts, Sites, Repeats, AI Replies) | Не открывались — за пределами задачи |
| Справочный центр `help.nicejob.com` | Отвечает 200, но не разбирался — там могла быть механика экрана отзыва. **Кандидат на добор, если нужен живой экран** |

---

## 8. Сводка: что забираем

| Что | Откуда | Как применяем |
|---|---|---|
| 85 CSS-переменных, шкалы 50…950 | NiceJob | Основа токенов нашей дизайн-системы |
| `#025bde` + `#2ce080` + `#130a38` | NiceJob | Первичный / акцент / тёмный герой |
| Bogart serif заголовки + Inter интерфейс | NiceJob | Типографическая пара; serif отличает от конкурентов |
| Пилюля `radius:100px`, `padding:12px 24px` | NiceJob | Все кнопки |
| Контейнер 1200px, gap 24px, паддинг 48/24 | NiceJob | Сетка |
| Карточка `radius:16px`, рамка 1px, без тени | NiceJob | Карточки тарифов и фич |
| Тёплый фон `#fafaf7` вместо белого | Podium | Опция для фона секций |
| Цена на видном месте + «no credit card» | NiceJob | Модель самообслуживания |
| «Contact us directly» / «direct feedback» | Birdeye | **Название приватного канала** |
| «Show to all irrespective of sentiment» | Birdeye, 2018 | **Формулировка обязательного требования** |
| Запрет Display Logic | Birdeye, 2018 | Никакого условного показа площадок |
| «Не ставьте планшет на стойке» | NiceJob | Ограничение на сценарии размещения QR |
| Динамический QR (цель меняется без перепечатки) | NiceJob (от противного) | Аргумент за редирект через нас |
