// Test-only child process. Never log input, database diagnostics or grant material.
import pg from 'pg';
import { AdmissionRepository } from '../src/admission-repository';
import { bootstrapPilotOwner, type BootstrapInput } from '../../../scripts/bootstrap-pilot-owner';

export type WorkerTask =
  | { kind: 'admission'; sourceSlot: number; sourceAttempts: number; identitySlot: number; identityAttempts: number }
  | { kind: 'bootstrap-crash'; input: BootstrapInput; identitySecret: string; outputPath: string };
export type WorkerResult =
  | { kind: 'admission'; sourceAllowed: number; identityAllowed: number }
  | { kind: 'committed' }
  | { kind: 'failed' };

function reply(result: WorkerResult, close = true): void {
  if (!process.send) throw new Error('private_ipc_required');
  process.send(result, () => { if (close && process.connected) process.disconnect(); });
}
async function execute(task: WorkerTask): Promise<void> {
  const offline = task.kind === 'bootstrap-crash';
  const url = offline ? process.env.TEST_DATABASE_URL_MIGRATE : process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).username !== (offline ? 'n3a_migrator' : 'n3a_app')) throw new Error('test_role_required');
  const pool = new pg.Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 1000,
    statement_timeout: 5000, lock_timeout: 1000 });
  try {
    if (task.kind === 'admission') {
      const repository = new AdmissionRepository(pool);
      const [source, identity] = await Promise.all([
        Promise.all(Array.from({ length: task.sourceAttempts }, (_, index) => repository.chargeSource(task.sourceSlot + Math.floor(index / 60)))),
        Promise.all(Array.from({ length: task.identityAttempts }, () => repository.chargeIdentity(task.identitySlot))),
      ]);
      await pool.end();
      reply({ kind: 'admission', sourceAllowed: source.filter(x => x.allowed).length,
        identityAllowed: identity.filter(x => x.allowed).length });
      return;
    }
    // The actual client executes COMMIT. Only its return to the bootstrap helper is paused.
    // A parent SIGKILL therefore lands after the durable receipt and before file.writeFile.
    const wrappedPool = {
      async connect() {
        const client = await pool.connect();
        const query = client.query.bind(client);
        client.query = (async (sql: string, values?: unknown[]) => {
          const result = await query(sql, values);
          if (sql === 'COMMIT') {
            reply({ kind: 'committed' }, false);
            await new Promise<void>(() => {});
          }
          return result;
        }) as typeof client.query;
        return client;
      },
    } as pg.Pool; // Test-only narrow adapter; bootstrap consumes connect/release only.
    await bootstrapPilotOwner({ pool: wrappedPool, input: task.input,
      identitySecret: Buffer.from(task.identitySecret, 'base64url'), outputPath: task.outputPath });
    throw new Error('crash_window_was_not_reached');
  } finally {
    if (!pool.ended) await pool.end();
  }
}
process.once('message', (task: WorkerTask) => { execute(task).catch(() => reply({ kind: 'failed' })); });
