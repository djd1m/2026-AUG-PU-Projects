// Дочерний процесс T-9 (paid-call.test.ts): резерв и START коммитятся, затем процесс умирает внутри вызова провайдера —
// так же, как при OOM или SIGKILL контейнера. Исход не пишется никем.
import pg from 'pg';
import { PaidGateway } from '../../src/paid-call';
import type { ModelProvider } from '../../src/provider/port';

const die = (): never => process.exit(137);
const provider: ModelProvider = { embed: async () => die(), answer: async () => die() };

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.CHILD_SERVICE_URL, max: 2 });
  const limits = { answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000, sandboxAccountDay: 100,
    sandboxGlobalDay: 2000, embedTokensAccountDay: 2_000_000, embedTokensGlobalDay: 20_000_000 };
  const gw = new PaidGateway({ pool, provider, limits });
  const attempt = await gw.beginAnswer({ kind: 'sandbox', accountId: process.env.CHILD_ACCOUNT ?? '' },
    { accountId: process.env.CHILD_ACCOUNT ?? null, botId: process.env.CHILD_BOT ?? null });
  await attempt.embedQuestion('вопрос');
  process.exit(0); // сюда процесс дойти не должен
}

main().catch((error: unknown) => {
  console.error((error as Error).name);
  process.exit(1);
});
