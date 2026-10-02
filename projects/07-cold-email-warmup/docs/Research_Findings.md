# Research Findings

Проверено 2026-10-02. Product: N7 «Когорта», SMTP/IMAP orchestration для небольшой
B2B-команды и когорты курса. Числа TAM, CAC, payback, доли рынка не измерены.
Публичные маркетинговые утверждения конкурента не являются доказательством
эффективности прогрева для наших пользователей.

## Источники и выводы

| Источник | Наблюдение | Решение |
|---|---|---|
| [Instantly help](https://help.instantly.ai/en/articles/5975329-how-warm-up-works-and-why-it-s-important) | Описывает переписку внутри пула и claims о sender reputation | Реализовать opt-in cohort orchestration, отдельно измерять outcome; не обещать эффект |
| [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en) | Требования аутентификации, нежелательных сообщений и отписки | Настройка SPF/DKIM/DMARC и explicit consent в checklist; системная suppression |
| [Nodemailer SMTP](https://nodemailer.com/smtp) | TLS, STARTTLS, timeouts, auth, запрет file/URL attachment access | TLS обязателен, logs off, maxRecipients=1, bounded transport, credentials redaction |
| [ImapFlow quick start](https://imapflow.com/docs/getting-started/quick-start/) | Подключение IMAP и чтение сообщений | Provider adapter; reply headers и durable cursor; без AI-ответов |
| [Linear UI refresh 12.03.2026](https://linear.app/changelog/2026-03-12-ui-refresh) | Обновление для более быстрого просмотра и фокуса | Микротренд: спокойная плотная консоль, контекстная навигация, ясная иерархия |
| [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Минимальный размер или достаточные интервалы у целей ввода | Большие основные кнопки, keyboard focus, мобильные формы; standard, не выдуманный тренд |
| [OpenAI model selection](https://developers.openai.com/api/docs/guides/model-selection) | Выбирать качество под задачу и проверять tradeoff cost/latency на evals | Astra план/инварианты; Sol bounded code; independent review, без заявления экономии |

Источники открыты web tool; cryptographic issuer verification не выполнялась.
Yahoo best-practices страница не открылась; её поисковый snippet не используется
как подтверждение capability. Реальная совместимость конкретного почтового
аккаунта ещё не проверена; SMTP acceptance не гарантирует inbox placement.

## Микротренды CJM

1. **Спокойная рабочая плотность:** меньше декоративных панелей, постоянный контекст,
   одна основная операция — интерпретация Linear 2026, применяемая к A и C.
2. **Контекстное раскрытие сложности:** advanced SMTP и limits раскрываются у
   соответствующего шага; consent остаётся видимым. Это дизайн-решение на базе
   наблюдаемого акцента на workflow, не рыночная статистика.
3. **Объяснимые состояния:** unknown/waiting/blocked имеют причину и следующий шаг;
   репутация показывает источник. Это ответ на продуктовый риск, не маркетинговый score.
4. **Доступное спокойное движение:** reduced-motion и touch/keyboard parity во всех
   вариантах; accessibility основана на W3C, актуальность популярности не измерена.

## Research path

Вход: известны MVP и исключения. Пробелы: real provider constraints, seed,
репутация, code reuse, CJM. Сначала открыты первичные документы, затем проверены
локальные donors. По отсутствию универсального reputation API принято unknown
и manual source-bound observations. Исследование не запускает реальные письма,
платежи, LLM или provider authentication.

Confidence: высокое для прочитанных возможностей библиотек; среднее для
предложенной архитектуры до тестов; гипотеза для growth effect и юнит-экономики.
