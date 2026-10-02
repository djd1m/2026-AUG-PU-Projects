# Model cost contract

**Внешние вызовы модели:** нет

Генерация self-hosted SD/ControlNet, не внешний image API. Generic external-model-call gate неприменим и код2 не объявляется pass. Расход GPU всё равно ограничен: platform200 attempts/day, account20, max2 attempts/job,180sec/attempt; missing limits fail startup. Физическая аренда требует отдельного owner cost ceiling; сейчас разрешён новый расход0. Runtime verification pending; выводы об экономии недопустимы.
