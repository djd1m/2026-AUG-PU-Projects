// Интеграционные тесты требуют настоящий Postgres + pgvector. Нет адреса — тесты ПАДАЮТ, а не пропускаются:
// пропуск читался бы как «RLS проверена» (guard-must-be-able-to-fail).
import { migrate } from '../../src/migrate';
import { env } from './helpers';

export default async function setup(): Promise<void> {
  const { ownerUrl, tenantPassword, servicePassword } = env();
  await migrate({ ownerUrl, tenantPassword, servicePassword, log: () => undefined });
  // Повторный прогон обязан быть идемпотентным: ни одной новой миграции.
  const again = await migrate({ ownerUrl, tenantPassword, servicePassword, log: () => undefined });
  if (again.length !== 0) throw new Error(`повторный migrate применил ${again.join(', ')}`);
}
