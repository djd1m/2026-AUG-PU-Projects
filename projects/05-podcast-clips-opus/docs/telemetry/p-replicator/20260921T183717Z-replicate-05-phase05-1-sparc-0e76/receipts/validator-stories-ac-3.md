# Квитанция — validator-stories-ac, раунд исправлений 3

WORK_UNIT_ID: validator-stories-ac-attempt-3
RUN_ID: 20260921T183717Z-replicate-05-phase05-1-sparc-0e76
Модель: Claude Sonnet 5 (заявлено средой выполнения).
Правка: перепривязка строки ревизии в `docs/test-scenarios.md` к финальной для Phase 2 редакции
Specification.md (после spec-writer-6). Правился ТОЛЬКО `docs/test-scenarios.md`.

## Проверено

- `sha256sum docs/Specification.md` → `3ac09f3dcccc354f292ac0ed0452de0e7f14f8bafd68b6f8e54354e303407532`
  (898 строк) — совпадает с числом, названным координатором.
- Текстовые правки spec-writer-6 названы координатором как не создающие новых `SC-US`: проверено
  `grep -n 'сценариев, из них'` — AUTH по-прежнему «8 сценариев, из них 3 `@security`», как и было
  в `test-scenarios.md` до этой правки, расхождения нет. `grep -n 'refused_user_llm'` — строка
  добавлена в список «Без возврата» FR-LIMIT-003 (строка 348); `test-scenarios.md` полного списка
  `refused_*` нигде не перечисляет (единственное упоминание — `refused_user_uploads` в сценарии
  возврата слота, US-001), поэтому контент не устарел и правки не потребовал.

## Что исправлено

Строка ревизии: `sha256:870424e1…` → `sha256:3ac09f3dcccc354f292ac0ed0452de0e7f14f8bafd68b6f8e54354e303407532`.
Ничего кроме этой строки в файле не менялось — содержательных расхождений раунд не внёс.

## Самопроверка

```bash
$ grep -o 'SC-US-[0-9]\{3\}-[0-9]\{1,\}' docs/Specification.md | sort -u > /tmp/a
$ grep -o 'SC-US-[0-9]\{3\}-[0-9]\{1,\}' docs/test-scenarios.md | sort -u > /tmp/b
$ comm -23 /tmp/a /tmp/b   # в Specification, но нет в test-scenarios
$ comm -13 /tmp/a /tmp/b   # в test-scenarios, но нет в Specification
```
Оба вывода пусты. `wc -l /tmp/a /tmp/b` — по 35 с каждой стороны: все 35 реальных `SC-US-nnn-k`
Specification.md названы в `test-scenarios.md`, лишних тегов нет. Уточнённый паттерн
`[0-9]\{3\}-[0-9]\{1,\}` (по просьбе координатора) сам исключает regex-артефакт прошлых раундов
(`SC-US-012-*`/`SC-US-013-*` в прозе про DEC-A-013) — с ним отчёт чище, чем с прежним `[0-9]*-[0-9]*`.

`grep -c '@security' docs/test-scenarios.md` → 14 (без изменений, ≥ 5).

Status: completed
