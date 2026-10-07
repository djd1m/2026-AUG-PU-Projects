import { generateMasterKeyHex } from '@grelka/secrets';
import { openDb } from '@grelka/db';
import { migrate } from '@grelka/db';

const env = { ...process.env };
if (!env.MASTER_KEY) env.MASTER_KEY = generateMasterKeyHex() as string;
void env;

export async function main(): Promise<void> {
  const driver = await openDb();
  if (!process.env.MASTER_KEY) {
    console.log('MASTER_KEY не задан: сгенерирован для этой сессии → сохраните его в .env:');
    console.log(`MASTER_KEY=${generateMasterKeyHex()}`);
  }
  const applied = await migrate(driver);
  console.log(applied.length ? `migrations applied: ${applied.join(', ')}` : 'migrations up to date');
  await driver.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
