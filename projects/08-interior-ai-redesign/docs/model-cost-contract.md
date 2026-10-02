# Model cost contract

**Внешние вызовы модели:** нет

Генерация self-hosted SD/ControlNet, не внешний image API. Generic external-model-call gate неприменим и код2 не объявляется pass. Расход GPU всё равно ограничен: platform200/account20 conservative admitted-attempt tickets per UTC day; initial ticket atomic with admission, retries/new-day starts require new ticket, unused tickets never refunded; max2 starts/job,180sec/attempt capped by360sec job deadline and60sec queue expiry; missing limits fail startup. Физическая аренда требует отдельного owner cost ceiling; сейчас разрешён новый расход0. Runtime verification pending; выводы об экономии недопустимы.
