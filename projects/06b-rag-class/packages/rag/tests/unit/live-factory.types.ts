// Компиляционная половина F-2 (index-jobs 08_review.md): файл не исполняется, его проверяет `npm run typecheck`
// (tsconfig.json включает packages/rag/tests). Каждая строка под @ts-expect-error обязана НЕ компилироваться: если
// кто-то вернёт фабрике параметр пределов или отдаст PaidGateway значением, директива станет лишней и typecheck упадёт.

import type { ConfigValues, Pool } from '@n6b/db';
import * as rag from '../../src/index';

export function mustNotCompile(pool: Pool, config: ConfigValues): unknown[] {
  // @ts-expect-error — фабрика не принимает конфигурацию: пределы читаются только из окружения процесса
  rag.createLiveGateway({ pool, config });
  // @ts-expect-error — пределы числами не передаются
  rag.createLiveGateway({ pool, limits: { answerGlobalDay: 2_147_483_647 } });
  // Ниже — только обращение к значению, без вызова: иначе директива сработала бы и на ошибке аргументов.
  // @ts-expect-error — вход пакета отдаёт PaidGateway только типом: значения класса снаружи нет, конструировать нечего
  const cls = rag.PaidGateway;
  // @ts-expect-error — внутренняя сборка двери из входа пакета не экспортируется
  const build = rag.constructGateway;
  return [cls, build];
}
