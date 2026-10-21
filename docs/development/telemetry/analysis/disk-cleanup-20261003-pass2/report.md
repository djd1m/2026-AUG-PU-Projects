# Второй проход безопасной очистки — завершён

Проверено 2026-10-03T17:26:47.844063+00:00. Профиль bounded M ops. Владелец разрешил удалять только действительно безопасное после разных независимых моделей-критиков.

## Измеренный результат

- npm10.8.2 download cache `_cacache`: **+2.46 GB** (2.29 GiB) доступного места.
- BuildKit: **63/77** sealed private/immutable/regular records удалены, **14** оставленыbackend; **+2.36 GB** (2.20 GiB) доступного места.
- Сумма измеренных дельт двух фаз **4,828,196,864 байт ≈ 4.83 GB (4.50 GiB)**.
- После **7,776,759,808 байт ≈ 7.78 GB (7.24 GiB)** доступно. Logical cache sizes не равны физическому освобождению; statvfs включает конкурентные записи иных процессов.

Все обязательные проверки **PASS**: все141image/tagrows,57containers/state/start/restarts/health,70volumes,29networks сохранены; removedIDs=reportedIDs⊆sealed77. Protected root identities и972immutablecoursefiles неизменны,6012installednpm_npx/prebuild/logfiles и npmrcidentity сохранены. Git/worktrees/исходники/БД/media/секреты/резервext4 не удалялись. Fullinspect/env не читались.

## Проверки и реальные исправления

Actual critics: **gpt-6-astra/high** (данные/риск), **gpt-6.1-sol/high** (команды/гонки), **gpt-6-luna/medium** (набор/учёт). Три финальныхPASS привязаны к финальномуV3 plan/candidates/inventorydigests. Hostmodelproof в JSON. Отсутствиевыходногоverdict и timeout не принимались.

1. Первоначальныйreview выявил npm startup log deletion/notifier sideeffects. Отключены explicitlogs/timing/notifierflags, сохраненывсеlogs.
2. Sol boundedreviews дважды невыдалиartifact: same-thread delivery-only продолжения сохранили историю, финальныйverdictполучен. СтарыйV2 md обнаружен как непригодный для V3 binding; metadata correctedto null до actualfreshdelivery, никакихcachedelete по staleartifact не было.
3. Npmcommand с двумя /dev/nullconfig exited1 доresolving и удаления; исправлен на два разныхemptyprivatefiles, mode600, identity/emptycontents проверены. Actual read-only cachels тойжеконфигурацииexit0. Luna потребовала новуюargvproof; записанv3-npm-command-proof.json иfreshclosurePASS. Изменение не затрагивает пользовательскиеconfigfiles.
4. WholeBuildKitpreflight остановилсядоprune: шестьrecords недавноиспользовались влегитимнойN8сборке доclosedadmission. Набор уменьшен83→77 и зановопроверенмоделями; новыхID не добавлено, ageguard не ослаблялся.
5. Процессныйpreflight сначалаошибочно распозналcacheflag давно работающихnpmexecChrome какnpmcachewriter. Подтверждён actualcommandtype; толькодвеизвестныеразрешённыеexistingbrowserPID исключеныизkeywordfalsepositive, реальныйcwd/fdguard сохранился.

Npm deletion выполнена одинразпослекоррекции/новыхverdicts. BuildKitmutation выполненаодинразпослеwholeabort/новогоскоупа. Backendretainedrecords не retry. Coordinators подтвердилиadmissionclosed, heavylock удерживалсяfreshsnapshot→postchecks, затемreleaseотправленN8/promo. N6b независимыйlocalgate возобновлён: наsnapshot7.24GiB > прежнего6GiBfloor; futureactualresourcepreflight обязателен.

## Длительность и измерения

Удалениеnpm+postcheck 2.556s; BuildKit+postcheck 24.902s. Весьcycle отнаблюдавшегосяread-onlyinspection16:50:39UTC доfinish: **39.5min**. Существенное времяушло на независимыеreviews, boundedtimeouts и конкретныеисправления, а не volumeудалений. Денежная стоимость иcoordusage неизвестны; [run.json](run.json) суммируетCLIusageсdedupthread (cached/reasoningsubsets не прибавляются повторно). Остальные неизвестные интервалы не восстановлены по памяти.

Документы: [финальныйплан](plan.md), [запечатанные77records](candidates.json), [исключённые6](excluded-v3.json), [npmрезультат](npm-result.json), [BuildKitрезультат](result.json), [baseline](before.json), [post](after.json), closure-*.json/md. Историяfailedattempts/старыхbinding сохранена, rawCLIlogs внеGit. ПродуктовыеE2E/MP4 gates этимотчётом не подтверждаются.
