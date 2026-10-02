# F01 — подтверждённая проблема локального старта

Ревизия `db5fa90d`, Docker29.8.1: compose up --wait exit0 и internal HTTP200, но host curl127.0.0.1:18088 exit7 дважды. Inspect HostConfig.PortBindings содержит127.0.0.1:18088, фактический NetworkSettings.Ports показывает8080/tcp:null. Оба сервиса подключены только к internal:true сети. Изолированный диагностический стек удалён; настройки Docker/общие сети не менялись.

Конкретное исправление после текущего целевого ревью: Sol добавляет отдельную project-scoped bridge сеть для web; web остаётся также в private, DB — только private, DB ports отсутствуют. Loopback web binding и ресурсные ограничения сохраняются. Не добавлять sharedproxy/host networking. Повторить только config, actual port inspection и localhost HTTP smoke; исходные green9PG/14unit и audit неизменны. Fresh Astra проверит только этот Compose diff и изоляцию.

[Docker networking overview](https://docs.docker.com/engine/network/) описывает frontend, подключённый к bridge с внешним доступом и отдельной internal сети для backend. [Internal network reference](https://docs.docker.com/reference/cli/docker/network/create/#network-internal-mode---internal) описывает отсутствие default route и фильтрацию других сетей. Причина здесь подтверждается локальным inspect и будет проверена сравнением после изменения; документация не заменяет runtime test.
