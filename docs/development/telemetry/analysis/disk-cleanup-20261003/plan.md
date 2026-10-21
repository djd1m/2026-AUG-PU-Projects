# Безопасная очистка диска — 2026-10-03

Владелец явно разрешил удалить только безопасное после плана и независимых разных моделей-критиков. Это bounded ops задача M по риску, не продуктовая фича. Первый проход: только 26 records BuildKit default builder, stale >=2days по исходному reportedLastUsedAt, Reclaimable=true, Shared=false, Mutable=false, Type=regular. Точный список: candidates.json; SHA256 c5f639b271cd581319726c0cb914393e2f8e53ca68f2e8216719e3a59a17ec62. Сумма rounded logical sizes — оценка, фактическое освобождение только df.

## Что защищено

ВСЕ Docker imageIDs/tags, контейнеры/их running/start/restart состояние, тома, сети, базы/данные, пользовательские media, package-lock/source, Git worktrees, .env/credentials, raw logs/receipts, браузер и исторические baseline/current/previous runtime images. Никакой system/image/container/volume prune, docker rm/rmi, rm -rf рабочих папок, daemon restart, изменения ext4 reserve, uninstall/npmcache очистки. Никакого автоматического расширения scope ради большего места.

## Механика

Версии Docker29.8.1, buildx0.37.1, BuildKit0.33.0/default docker driver. Read-only matching id regex с якорями и type=regular реально вернул РОВНО кандидатов; boolfilters не сработали и не применяются. du until24h не годится как dry age доказательство. Upstream prune.go этого buildx переводит until24h в KeepDuration и id~=regex. Не использовать all/max-used/min-free broadpolicy. Официальные источники:
- https://docs.docker.com/reference/cli/docker/buildx/prune/
- https://docs.docker.com/reference/cli/docker/buildx/du/
- https://raw.githubusercontent.com/docker/buildx/v0.37.1/commands/prune.go

1. Три критика получают этот неизменный план+кандидатов+фильтр proof отдельно: Astra/high (риск/данные), Sol6.1/high (команда/гонки), Luna/medium (инвентарь/логическая полнота). Один за раз ≤180s/attempt, read-only/no nested workers/no Docker mutations; actualmodel/usage изhostmetadata, unknownnull. Находки исправить до исполнения; timeout/exit0 безverdict не acceptance.
2. Координаторы N8/coursepromos подтвердили no concurrent imagebuild/prune. Получить /tmp/codex-heavy-build.lock, короткое окно cleanup. Прямо внутри lock собрать dfbytes, docker imageIDs/tags, container minimal state/IDs/start/restarts, volume/network IDs/names. Никакие секреты/env/fullinspect не читаются. Проверить отсутствие dockerbuild/prune процессов.
3. Заново du всегоcache в temp/localRAM, получить ровно sealed IDs тем же idregex/typefilter. Пропавший/изменённый/новый/inuse/shared/mutable/typechanged ID → НЕ удалить: ABORT WHOLE PRUNE с записью; не удалять даже остальные IDs и не подменять новыми кандидатами. Точный prefilter должен всё ещё совпадать. Aging reported >=2days первоначальныйproof + recheck reclaimability; until24h на prune повторно обеспечивает cooldown.
4. Единственная мутация после всех PASS: subprocess argv (без shell eval):
```text
docker buildx prune --builder default --force --filter id~="^(79fh8lofoe1a5g9077d65lp5e|1zo1tfpshobn4lvv633uxynt3|ctkxp7f1x3e6oppc2xrnbgyv8|zcgt4q2xrwz9eu0ieji7si69u|382ilqq6w4qn8h5wh2mre2rzi|6j2hmj9tnhvki3k3mbrx5nwko|8g9vm6opbtmogh76b21gjqatx|exivpkyzpd0zb6zml4x4ik0wv|ht87xhl7ywm2b4tdt6sahavyd|ipr9ac8xe9klmjvxonyxlhm86|ndat5mk62s491qkpzheo1d2gh|e3dqtm3obepr5un3drxd2c8f7|tmulo5irvsa1s3asibn0ah1kv|ucnwhs60xhmewd4two8jeae7w|yr5zu7qen6zftz2nq44zx3vxc|cu8mbud1c4syq1erwc14sikkn|uxiy8dtyyeswfmx5f4jqrq5bv|q59fnt5hokot2oqnky2k83z4n|id28x1ryxdidw37qdu0r21avu|mvaxcuphit5syuhbs1zqh3ccj|1kuu5mrs79s2i0mp8cv311nyi|z2x72vhamb4j7zcl9qgesxa0y|0u11nu661fmfhzhko2fhr4u79|ae6me64nrqjqwpz7d7sir3zkh|1kromx5ae4c9ms0paupai0vfg|kva0mdsextv39kt2ixgfenb6p)$",immutable,private --filter type=regular --filter until=24h
```
До mutation сохранены JSONargv/digests. Force отключает повторный интерактивprompt, не снимает inuseguard. Широкое удаление не допускается. Команду ожидатьbounded; при error/timeout → inspectactualcache/objects, НЕ retryblindly/не обещатьrollbackcache. Cache bytes не нужны runtime images, но их rebuild может бытьмедленнее; восстановление лишь отдельной futureauthorizedbuild, не новыйspend.
5. После команды: compare cacheIDs (removed subset sealedIDs, unexpected deletions →finding), всеpreviousimageIDs/tags сохранились, allinitialcontainers exist and runtime/no newrestarts, initialvolumes/networks present; commonbrowser healthy/passive state. dfactual delta и commandexit/reclaimoutput; no externaltests/newbuild/restart. Освободитьlock, notify coordinators ресурсы. Если места недостаточно, остановить cleanupнаэтомscope и отдельно предложить следующийreviewedнабор.

## AC

Независимые criticPASS/closedfindings; mutationтолькоcache exactsealedIDs+age24h; images/runtime/userdata/evidencepreserved; actualfreebytesbefore/after reported with concurrentgrowthcaveat; noMVP/mediaquality claims. Whole operation не должна требовать rootauthorization повторно: owner alreadyrequested safe deletion.

## Учёт

3requestedmodels distinct perrole as above, officialmodelselection checked: https://developers.openai.com/api/docs/guides/model-selection . Coordinator current Sol6.1medium hostproof earlier, usage/cost unknown. Start recordingnow; исходные instruction-reading interval unknown. Artifacts в этомкаталоге, rawCLIlogs onlytemporaryoutsideGit.

## Исправления v2 после независимого REVIEW

- Sol High1: только whole-run abort при любом несоответствии preflight; никаких skipped-ID в неизменномargv.
- Sol High2: known root/N8/coursepromos launchers закрыли admission build/prune (оба coordinator explicit ACK); root удерживает heavylock непрерывно от preflight до postcheck. Главное: серверный compoundfilter теперь включает immutable и private, не только snapshot. Guard read-only controls показали отличие private-only и immutable-only, а exactID compound ровно26 records. BuildKit0.33.0 cacheManager.prune под mutex игнорирует refs>0, default !All пропускает shared/internal/frontend и применяет SAME adaptUsageInfo/filter.Match как DiskUsage. Scope не обещает заблокировать неизвестного внешнего rootоператора; serverguards сохраняются даже если внешняя build гонка возникнет.
- Sol Medium: внешняя process deadline120s; SIGTERM grace5s→SIGKILL5s. Timeout не означает stoppeddaemon: сохранить admission/lock, read-only повторcache/objects/state/activity до определённого результата, no retryblindly/no releaseclaim при неизвестномbackendstate. При неожиданномдругомDockeractor также abort beforemutation.
- Sol Low: первоначальные reported relative ages сняты не позже initialsnapshot mtime; не выдаём label≥2days за exact48h. Runtime KeepDuration24h является исполняемымageguard.
- Luna evidence: pinnedbackendsource-semantics.md даёт явный prune filterapplication подmutex и sameDiskUsageadaptor; filter-verification-v2.json — конкретный preflightс compoundmutationselectors (until выполняется толькоприprune какKeepDuration). No native prune dryrun exists, this is traced read-only admissibility + actual backendproof, не выдуманныйdryrun.
- Luna accounting: actualbefore-minus-aftercacheIDset должно совпасть с reportedremovedIDs prune и бытьподмножествомsealed26; retained/skipped записать отдельно. Если records remain duebackendguard это безопасныйskip на сторонеBuildKit, root не расширяетсписок и не retriesblindly. CacheGCconcurrentgrowth/data conflicts — findings, no falseallpass.

v2 не расширяет набор, сохраняет26IDs и scope. Требуется shortclosure тремя разными моделями дляfinalplanhash.
