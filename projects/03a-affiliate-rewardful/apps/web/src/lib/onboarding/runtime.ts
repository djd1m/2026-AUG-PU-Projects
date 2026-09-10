import { AuthRepository, OnboardingRepository, AdmissionRepository, createRuntimePool } from '@n3a/db';
import { readRuntimeConfig } from '../auth/config';
import { createCredentialService } from '../auth/credentials';
import { processPasswordService } from '../auth/password';
import { SessionService } from '../auth/session';
import { DurableAdmission } from '../http/admission';
import { createApi, type ApiRuntime } from '../http/handler';
import { hashIdentity } from './identity';
import { createOnboardingService } from './service';

const state = globalThis as typeof globalThis & { __n3aRuntime?: Promise<ApiRuntime> };
async function initialize(): Promise<ApiRuntime> {
  const config = readRuntimeConfig(process.env);
  const pool = createRuntimePool(config.databaseUrl);
  try {
    const repository = new AuthRepository(pool);
    const credentials = await createCredentialService(repository, config.sessionSecret, processPasswordService);
    return {
      config, credentials, sessions: new SessionService(repository, config.sessionSecret),
      onboarding: createOnboardingService({ repository: new OnboardingRepository(pool),
        passwords: processPasswordService, sessionSecret: config.sessionSecret, identitySecret: config.identitySecret }),
      admission: new DurableAdmission(new AdmissionRepository(pool), config.admissionSecret),
      hashIdentity: value => hashIdentity(value, config.identitySecret),
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
function getRuntime(): Promise<ApiRuntime> {
  // One initialization/pool across route bundles; bounded HTTP guard enters before this factory.
  return state.__n3aRuntime ??= initialize().catch(error => {
    state.__n3aRuntime = undefined;
    throw error;
  });
}
export const handleApi = createApi(getRuntime);
