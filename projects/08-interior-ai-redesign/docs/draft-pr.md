# Draft PR — prepared, publication blocked

Target repository: `djd1m/2026-AUG-PU-Projects`.
Base: `claude/install-npm-packages-n7l3m5`; head: `feature/08-interior-ai`; draft=true.
Suggested title: `feat(n8): RoomKind — редизайн интерьера, приватная галерея и оплата; GPU gate открыт`.

Creation attempted with the connected GitHub API after the source branch was pushed. The API returned403 `Resource not accessible by integration`; no PR was created. `gh` is unavailable; repository push uses SSH, with no configured HTTPS credential helper. No alternative credentials, key files or authorization settings were searched or changed.

## Prepared description

RoomKind реализует путь «фото → стиль → редизайн → сравнение», приватную галерею, кредиты и пакет ROOM20 (20 за900₽), проверяемые платёжные переходы, branded sharing и отдельное согласие на публикацию. Изменения ограничены `projects/08-interior-ai-redesign/`.

Это reviewable draft локального ПО. Полный MVP не принят: настоящий SD1.5+ControlNet-depth требует доступного CUDA, безопасных закреплённых весов/зависимостей и лицензированного корпуса. Реальная YooKassa-приёмка и выпуск остаются отдельными gates. Внешних расходов, GPU rental, livecharge, deployment или merge не было.

Проверено: source-bound unit/realPG/mutation/build и независимые Astra-ревью кода Sol6.1high; фактическая UI6-матрица42/42 на1440/390 за321280мс; отдельно перезапущенный disabled-provider сервер2/2 за2832мс. Пять прежних неудачных браузерных попыток сохранены. Синтетическая БД21таблица/451строка и10медиафайлов восстановлены с совпадающими digest; исходнаяБД неизменна, временные ресурсы удалены. Финальное ревью41AC/213ссылок/source-evidence hashes нашло однуP2-ошибку статуса; исправление принято свежим независимым reviewer.

Фикстуры не доказывают геометрию или реальные действия соцсетей/платёжного провайдера. Нужны≥12комнат×3стиля и≥30actualwarmGPU jobs,p95≤25с. Provider-resolved model/usage/cost неизвестны и сохраненыnull.

- [Pipeline walkthrough](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/08-interior-ai/projects/08-interior-ai-redesign/docs/pipeline-walkthrough.md)
- [README RU](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/08-interior-ai/projects/08-interior-ai-redesign/docs/README/ru.md) / [README EN](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/08-interior-ai/projects/08-interior-ai-redesign/docs/README/en.md)
- [41AC map](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/08-interior-ai/projects/08-interior-ai-redesign/docs/features/f06a/acceptance-map.md)
- [F04 acceptance](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/08-interior-ai/projects/08-interior-ai-redesign/docs/features/f04b/acceptance.md) / [F06a bounded acceptance](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/08-interior-ai/projects/08-interior-ai-redesign/docs/features/f06a/acceptance.md)
- [GPU gate](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/08-interior-ai/projects/08-interior-ai-redesign/docs/gpu-acceptance.md) / [Completion](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/08-interior-ai/projects/08-interior-ai-redesign/docs/Completion.md)
- [Telemetry](https://github.com/djd1m/2026-AUG-PU-Projects/blob/feature/08-interior-ai/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/run.json)

Runtime source8030270f023d83c9cdd597c4578517a1b58b4b35; UI snapshot19ea9d39d31aab8b2a7ce005b79e091fadce203d1272c0c44bf1396aa228c00a. Reviewed document correctionfe2572a7636537c9610ab3e044a91b2e24832499; later metadata preserves acceptance and remaining gates.
