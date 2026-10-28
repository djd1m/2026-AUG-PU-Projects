# План интерактивного доклада N5 — 28.10.2026

## Передача координатору

Заголовок: **«Что мы добавляем, для запуска проекта»**. Только исследование/план; HTML, git, production, провайдеры, БД и секреты не менялись. Следующий исполнитель: отдельный HTML coder, затем независимый review и браузерная проверка; координатор сверяет статусы с последней production-ревизией перед публикацией. Пользователь просил push GitHub, но это делает root после проверки существующего destination. Измерения токенов/стоимости/фактической модели недоступны: null. Это ограниченный research handoff, не завершение всей задачи.

## 1. Главная мысль и драматургия

Демонстрация нарезки уже существует. Запуск добавляет возможность **найти клиента → объяснить предложение → зарегистрировать → получить клип → заплатить → получить помощь → повторить**. Доклад объясняет, почему каждый элемент нужен для продажи и проверки спроса, а не перечисляет компоненты стека.

Открытие: большой заголовок, короткая реплика владельца «мы же продавать должны это решение», под ней линия клиентского пути. Вторая реплика: «если эта штука не взлетает так, то не взлетит вообще». Интерпретация: максимально узкий проверяемый бизнес-эксперимент. Отрицательный результат требует разобрать качество, активацию, канал и оффер; он не доказывает невозможность бизнеса вообще. Не превращать цитату в гарантию или рекламное обещание.

Предлагаемые главы (7, одна последовательная история):

1. **От работающей фичи к продаваемому продукту.** Показываем цепочку клиента и на каком звене домен, документы, цена, поддержка и платежи становятся необходимы. Точная шкала статусов, без общего «готово на 95%».
2. **Адрес и доверие.** clipmkr.ru уже используется; задача запуска — проверить DNS/TLS/единый бренд, support.clipmkr.ru и почтовый домен, а не изображать новую регистрацию домена. Правовые страницы из DOCX владельца, компактные реквизиты; размещённый документ не равен юридической экспертизе.
3. **Можно купить.** Каталог тарифов должен быть виден в кабинете даже при payments off; ЮKassa проверяет конкретный магазин/сайт и договор. Тестовый checkout/webhook уже доказан отдельно; боевой приём денег всё ещё требует production-shop approval, ключей, настройки webhook/return URL и разрешённого включения. Успешный return URL не выдаёт кредиты.
4. **Есть кому помочь.** Встроенная карточка аккаунта/история — read-only support_operator; Libredesk — отдельный OSS helpdesk. Чат закрывается и узнаёт пользователя по исправлениям, но отвечает человек, не круглосуточный бот. Доступ оператора не даёт право начислять деньги/кредиты. Owner billing actions, compensation grants, review queue/refunds — отдельный следующий объём.
5. **Цена в понятных единицах.** Кредиты и часы, калькулятор реального вклада, стоимость проб, влияние одного/двух серверов. Полная товарная линейка существует отдельно от одного оффера пилота.
6. **Один российский сервер сначала.** Архитектура по слоям, внешние российские API вместо GPU; сравнение с двумя серверами РФ+зарубежье. Разделение процессов не требует отдельных ВМ. Масштабировать по очереди/p95/RAM/tempdisk, а не по вымышленной ёмкости «1000 клиентов на ВМ».
7. **Один тест запуска.** Один Telegram community → Старт990/5ч → длинный разговор в вертикальные клипы с русскими пословными субтитрами → независимый русскоязычный автор еженедельного видеоподкаста. Финальная панель «что подтверждено / что открыть владельцу / что проверить перед трафиком» с владельцами следующих действий.

## 2. Интерактивность: только там, где помогает понять решение

- Вдоль пути клиента 6–7 кликабельных этапов: выбор показывает конкретное добавление, зачем оно покупателю, статус и источник. Нативные кнопки, aria-pressed, keyboard; контент доступен и без JS через обычные главы.
- **Один калькулятор экономики**, не набор разрозненных виджетов. Ввод: Start/Pro/add-on, процент использования часов, новые signup, paid conversion, стоимость signup, F инфраструктуры, budget57/62. Вывод: комиссия, обработка, вклад, пробы, acquisition, фиксированные, остаток. Каждый неизвестный ввод подписан «допущение», рядом формула/исключения. Разделить число регистраций и число платящих; add-on — покупка, не новый клиент. Нельзя рисовать положительную прибыль по умолчанию скрыв trial/CAC.
- **Переключатель архитектуры**: «1 ВМ РФ + RF API» / «РФ + зарубежная ВМ». Подсвечивает добавляющиеся маршрут, счёт, доступы, эксплуатацию. Зарубежная цена вводится пользователем, по умолчанию «нет проверенного предложения», не 0. Дополнительная сравнительная подпись: официальный Cloud.ru split 8085.67 — ОБЕ ВМ в РФ, не цена варианта РФ+зарубежье.
- Ссылки «почему такой статус» раскрывают короткие evidence details: дата, source, проверено/не проверено. Короткий общий фильтр «всё / перед запуском / после первых клиентов» допустим, но не скрывать важный блокер автоматически.
- Светлая/тёмная тема и печать. Сохранение личных данных, логин, аналитические SDK или внешние API отчёту не нужны.

## 3. Статус-срез: требуется актуализация root перед freeze

Проверенный родителем срез на 28.10 около 16:01 UTC:

| Предмет | Честная формулировка |
|---|---|
| Домен | clipmkr.ru работает; support.clipmkr.ru исправлен на production3f76ddd; не писать «домен ещё нужно зарегистрировать» |
| Политика/соглашение/реквизиты | Страницы размещены, DOCX владельца, 3 согласованные адаптации; нужна ответственность владельца за финальный текст |
| ЮKassa | production payments OFF; реальный тестовый магазин E2E прошёл: visit1/signup1/purchase990; не называть боевой выручкой |
| Цены в UI | 3344ee55+8bc2108a на интеграции; до root acceptance не писать deployed |
| Кредиты | Start990/300/5h; Pro3990/1800/30h; addon1490/600/10h; точный runtime режим проверяет root |
| Письма | Resend adapter локально проверен; реальные письма отложены до настройки домена владельцем |
| Поддержка | read-only admin + OSS Libredesk; исправления чата и бренда проверены; человеческий ответ требует оператора |
| Финансовая админка | ручного credit grant UI/API/CLI нет; needs_review/refund reconciliation не завершён |
| Owner без лимитов | e2ecc893 ожидает review/rollout; личное исключение не значит безлимитные автономные платные вызовы |
| Российский pipeline | Cloud S3 + Yandex STT реально работают; DeepSeek select завершился599.565s в15:59:10; 4 clips rendering1/4 в16:01; пока НЕТ полного принятого e2e |
| Тесты | переданный root результат1337PASS; chat79+brand105 browserchecks; не переносить результаты на ещё не принятую combined revision |

Четыре состояния отчёта: **проверено в работе / код готов, нужна настройка / ещё не квалифицировано / следующий этап**. Старое «кандидат только5 секунд» в economics doc устарело относительно root runtime; историческую стоимость можно брать, runtime статус — из свежей квитанции.

## 4. Экономика: числа, формулы и границы

Цены выбранные, 30-дневные: Start990₽/300credits/5h, Pro3990₽/1800/30h, addon1490₽/600/10h. Бонус30credits=30min=0.5h один раз после регистрации, без ежемесячного пополнения, без срока сгорания. 1credit=60sec; учёт посекундный, код фиксирует ceil trusted seconds один раз. Пакеты истекают30d; addon имеет собственные30d paid rights. Immediate upgrade/proration DISABLED; full-price next-period base switch/manual renewal, addon now. Не выдумывать автосписания или обмен20₽ на новый полный Pro.

Текущая модель затрат из unit-economics-summary.md от27.10:

- STT SpeechKit v3 streaming0.1626₽ за начатые15sec КАЖДОГО запроса сНДС. 21chunks,3640sec с перекрытием:39.5118₽; padding scenario42.9264₽. Нельзя округлять суммарный час вместо отдельных chunks.
- DeepSeek6.954₽/inputh при30kinput+2kchargedoutput включая reasoning; S3/operations2.033065₽/h первого30d.
- C=(STT+6.954)×(1+r)+2.033065; r10% это резерв дополнительного оплаченного расхода моделей, не наблюдённая вероятность отказа. Main56.901505 округлён до57₽/h; stress61.194145→62. Исторический Whisper35 не текущий бюджет. Не добавлять второй reserve поверх57.
- fee4.27% — расчётное допущение из исследования, не подтверждённая комиссия конкретного боевого магазина; её условия проверяются в договоре.
- Contribution = P×(1−fee)−C×H×usage. При100%: Start662.727; Pro2109.627; addon856.377₽. Это вклад ДО F,CAC,налога,труда,возвратов,поддержки,длительного хранения.
- Trial30min отдельной записью29₽ (stress31), а не57/2 из-за округлений requests. TrialCost=Nsignup×activationFraction×29; позднее использование бонусов не новое начисление.
- Cohort paid=Nsignup×conversion (нецелое число допустимо как математическое ожидание, подпись обязательна); residual = paid×Contribution −TrialCost −Nsignup×costPerSignup −F. F инфраструктуры за30d, не смешивать с расходом часа.
- Illustration N200,signup40₽,conversion10%,alltrial,F3000:20×662.727−5800−8000−3000=−3545.46₽. CACchannel400₽; CACwithTrial690₽. Required conversion=(F+N×(costSignup+29))/(N×662.727)=12.68%. Это сценарий, не измеренный CAC/конверсия.
- F3000 без trial/CAC:ceil(F/contribution)=5Start/2Pro/4addon purchases. С100полнымиtrial:9Start/3Pro. Стоимость труда в «органическом» канале не0, даже если закупка0₽.

### Серверы: три разных вещи

1. **Одна пилотная ВМ3000₽/30d** — выбранный сценарий/ранее предложенная VM2973.384; ресурсная ёмкость не измерена, не официальный текущий Cloud4/8 quote.
2. **Проверенный публичный Cloud.ru Compute tariff26.10**, 720h, SSD+IP+22%VAT: single4vCPU/8GB/80GB5340.67₽; single8/16/12010075.25₽; split2/4/40 +4/8/80,2IP8085.67₽. Это sizing hypotheses и обе ВМ РФ; не нужно покупать их для чтения отчёта.
3. **РФ+зарубежная ВМ** — цена и конфигурация не подтверждены. Сравнивать структуру затрат: F_RU+F_foreign+traffic+currency/payment friction+operations; плюс местонахождение данных/договоры и доступность внешних API. Не называть этот вариант8086₽ и не выводить blanket legal conclusion. Текущие RU API позволяют обойтись1ВМ; GPU не нужен, локально CPU ffmpeg.

S3 free tier условен по организации, не отдельные15GB/10TB каждому проекту; не обещать пожизненное бесплатное хранение/2027. Активные paid clips могут храниться дольше30d; бюджет1-го месяца не моделирует бесконечное продление. Cloud CPU promo50% не подтверждён.

## 5. Архитектура и следующий масштаб

Схема1ВМ: браузер→TLS proxy→Next web; privatePostgreSQL(истина/credits/audit)+Redis(queue); CPU workers probe/STT adapter/select/render; внешние Cloud S3/Yandex SpeechKit v3/Cloud DeepSeekV4Pro; YooKassa verified webhook; Resend; отдельный Libredesk. DB/Redis ports никогда публично. Не публиковать адрес машины, bucket keys, emails, owner UUID, медиа или transcript.

Почему слово-таймкоды: точные границы клипа и пословные субтитры. CloudWhisper в выполненных коротких проверках не дал нужный word contract; это не универсальное утверждение обо всех версиях Whisper. Yandex реальный STT подтверждён текущим root.

Масштаб: сначала измерить время queue wait/process, CPU/RAM/tempdisk peaks, p95 UI и стоимость accepted clip. Затем ограничить concurrency/reuse downloads, увеличить CPU/RAM или выделить renderworker. DB backups/restore, source retention и наблюдаемость — отдельные эксплуатационные обязательства; два сервера сами по себе не HA. Цель100→1000пользователей не доказанная ёмкость и не лицензия на расходы.

## 6. Источники: точные пути и публикационная гигиена

Все относительные пути ниже от `/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/`:

- `docs/research/unit-economics-20261026/unit-economics-summary.md` — C57/C62, trial29, formula, scenario.
- `docs/research/unit-economics-20261026/pricing-decisions.md` — owner prices, credits/hours; верхнее addendum важнее архива ниже.
- `docs/research/unit-economics-20261026/infra-pricing.md` и `infra-pricing-sources.json` — current public Cloud rates vs sizing assumptions.
- `docs/features/credit-packages/owner-decisions.md` — D00–D16, direct owner vs coordinator choices.
- `docs/research/acquisition-20261026/README.md`, `acquisition.md`, `similarweb-analysis.md`, `similarweb-data.json`, `economics.md` —1111 and traffic evidence.
- `docs/research/support-oss-20261027/financial-admin-audit-20261028.md` — read-only roles, credit grant missing, verified payment/refund/review semantics.
- `docs/features/legal-pages-delivery.md` — actual owner DOCX,3approved edits, public paths, historical runtime status superseded by root.
- `docs/features/support-access/05_completion.md`, `docs/features/blogger-referrals/05_completion.md`, `docs/cloudru-launch-plan.md`, `docs/BACKLOG.md` — additional readiness topics; root сверяет с текущим source.
- `docs/telemetry/p-replicator/20261028-n5-support-close/`, `20261028-n5-cloudru-transport/`, `20261028-n5-cloudru-s3-live/`, `20261028-n5-compact-footer/` — source-bound evidence, safe summary only.

Для public HTML использовать repository-relative ссылки к этим docs или full GitHub URLs после root определяет repo/branch. `/tmp` absolute links не работают у читателя GitHub. Чаты/историю/сырые telemetry payload/персональные реквизиты из нового доклада не публиковать. Реквизиты уже публичного сайта можно ссылкой, не копией персональных данных.

Проверенные primary URLs: https://aistudio.yandex.ru/ru/docs/speechkit/pricing ; https://cdn.cloud.ru/docs/legal/tariffs/evolution/current-version/evolution-compute.pdf ; https://cdn.cloud.ru/docs/legal/tariffs/evolution/current-version/object-storage.pdf ; https://cloud.ru/docs/s3e/ug/topics/overview__free-tier ; https://yookassa.ru/docs/support/payments/onboarding/arrangement ; https://yookassa.ru/docs/support/merchant/entity/contract ; https://clipmkr.ru/legal/privacy ; https://clipmkr.ru/legal/terms . ЮKassa official arrangement fetched via search28.10: accessible real site, actual service tariffs, delivery of digital product, agreement/offer, contacts/requisites. Число4.27% не переносить в реальный договор.

### Охват диалогов, честно

Прочитаны доступные локальные JSONL26–28.10:295файлов на момент сканирования. Это включает child/approval sessions; количество файлов НЕ количество диалогов владельца. Строго отфильтрованные N5 assistant conversation response_items:26th114,27th54,28th138;106matchingfiles, deduplicated. Прямые owner input в доступных response_items не восстановились без transcript wrappers. Из retained transcript извлечены только строки `user:`, без tool/raw payload:184уникальных безопасных фрагмента; оригинальная дата отдельных фраз отсутствует, только дата session26/27/28. Ключевые решения дополнительно подтверждены каноническими docs. Покрытие неполное; **нельзя писать «проанализированы все диалоги за два дня»**. Рекомендуемый текст в evidence drawer: «Сводка по доступным локальным фрагментам обсуждений26–28октября и документам проекта; полный архив диалогов недоступен». 26-е — контекст, 27–28-е — последние2дня.

Приватные временные материалы: `/tmp/n5-dialogue-coverage-20261028.json`, `/tmp/n5-sanitized-dialogue-evidence-private-20261028.json` (НЕ publish). Отчёт использует derived decisions и3коротких безопасных цитаты, не выгрузку переписки. Короткие followups без N5 anchors могут отсутствовать; approval wrapper timestamp не выдавать за timestamp сообщения владельца.

## 7. Дизайн: конкретный референс, не типовой dashboard

Прямой GET https://aicoding.space/28.10 получил200, HTML28053bytes. web.open недоступен, fallback curl успешен. Временные capture `/tmp/n5-aicoding-reference.html`, stylesheet `/tmp/n5-aicoding-reference.css`. Реальные tokens: bg#0b0e0c/background#070908, thin lines#1e2620, text#f0f5f1, signal#7cff9e, warn#ffb454; Onest display+JetBrainsMono technical metadata; square edges,1180pxmaxwidth, крупный tight heading, последовательные строки/линейки, editorial chapter numbers, меньше карточек. Заимствовать принцип «рабочая тетрадь запуска»: строгая сетка, заметки на полях, функциональные сигналы и крупные читаемые русские тезисы; не копировать личную биографию/фото/контент aicoding.

https://aicoding.space/radar/ реально fetched200, title «Радар практики ·62 исследовательских карточек». Это curated radar, не доказанная GitHubTrending ranking. Видимые реальные GitHubrefs: https://github.com/github/spec-kit ; https://github.com/browser-use/browser-use ; https://github.com/modelcontextprotocol/registry ; https://github.com/tree-sitter/tree-sitter ; https://github.com/getzep/graphiti . Для доклада полезна идея evidence cards/traceability, а не подключение этих пакетов. Дополнительный primary UI reference: https://github.com/shadcn-ui/ui/blob/main/apps/v4/app/%28app%29/charts/charts.tsx — интерактивные charts с читаемой legend; https://motion-primitives.com/docs/disclosure — progressive disclosure. Не заявлять текущие звёзды/топ/тренд без измерения. No external JS/fonts necessary: system fallbacks, standalone HTML/CSS/JS.

## 8. Приёмка HTML/root delivery

- Все7глав доступны по anchors;3functionalinteractions сохраняют смысл без hover. Tabs/buttons работают keyboard, явный focus, labels, aria-expanded; calculator result aria-live polite, inputs bounds/NaN handled. Chart имеет числовую таблицу/подписи.
- Chrome/WebKit360/900pxlight/dark, no horizontal overflow,44pxtouch, readable calculator и architecture. Длинные sourceURLs wrap. Prefers-reduced-motion отключает декоративные переходы; print раскрывает evidence и экономику. Контраст достаточный, статус не только цвет.
- Проверить формулы на main200/40/10%→−3545.46, boundary0signups/0paid/usage0, tariffaddons semantics. Не добавлять уникальный тяжёлый testengine; browser smoke+numeric checks достаточно для standalone report.
- Content review: нет «все готово», прибыли/вместимости как факта, старого35какcurrent, freeMonthly, обещаний бесплатного часа, утверждения testpayment=real revenue, splitRF=foreign. Полныйe2estatus обновляет root после принятого финала.
- Scan artifact for secrets/emails/privateuuid/rawtranscript; inspect gitdiff/links, standalone open/download. Push только согласованный HTML+safe supporting assets в правильный репозиторий. GitHubpush не автоматически включает Pages hosting; доступный URL сырого HTML/Pages сообщить честно.

Status: completed
