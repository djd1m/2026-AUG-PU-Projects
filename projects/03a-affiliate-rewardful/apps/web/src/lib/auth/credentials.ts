import { isHash32, type IdentityContext, type IdentityRepository } from '@n3a/db';
import { AdmissionError, type AdmissionCode } from './kdf-admission';
import { isSupportedPasswordHash, isValidPassword, PasswordService, processPasswordService } from './password';
import { SessionService } from './session';
export type CredentialResult =
  | { ok: true; token: string; context: IdentityContext }
  | { ok: false; error: 'invalid_input' | 'invalid_credentials' | 'unavailable' | AdmissionCode };
export interface CredentialService {
  authenticate(identityHash: unknown, password: unknown, signal?: AbortSignal): Promise<CredentialResult>;
}
export async function createCredentialService(
  repository: IdentityRepository, secret: Buffer,
  passwords: PasswordService = processPasswordService,
): Promise<CredentialService> {
  const sessions = new SessionService(repository, secret);
  // Initialize once at auth startup, before serving credential attempts.
  const dummy = await passwords.initialize();
  if (!isSupportedPasswordHash(dummy)) throw new Error('invalid_dummy_hash');
  return {
    async authenticate(identityHash, password, signal) {
      if (!isHash32(identityHash) || !isValidPassword(password)) return { ok: false, error: 'invalid_input' };
      // Copy mutable caller bytes before asynchronous admission.
      const identity = Buffer.from(identityHash);
      try {
        return await passwords.admission.run<CredentialResult>(async () => {
          const user = await repository.findUser(identity);
          const supported = user?.enabled === true && isSupportedPasswordHash(user.password_hash);
          const verified = await passwords.verifyAdmitted(supported && user ? user.password_hash : dummy, password);
          if (!supported || !user || !verified) return { ok: false, error: 'invalid_credentials' };
          if (signal?.aborted) return { ok: false, error: 'canceled' };
          const issued = await sessions.issueIfCurrent(user.id, user.password_hash);
          return issued ? { ok: true, ...issued } : { ok: false, error: 'invalid_credentials' };
        }, signal);
      } catch (error: unknown) {
        if (!(error instanceof AdmissionError)) console.error('authentication_unavailable');
        return { ok: false, error: error instanceof AdmissionError ? error.code : 'unavailable' };
      }
    },
  };
}
