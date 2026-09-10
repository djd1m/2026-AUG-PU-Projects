import { it,expect,vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createOnboardingService } from '../src/lib/onboarding/service';
import { createGrantToken } from '../src/lib/onboarding/identity';
import { OnboardingRepository } from '../../../packages/db/src/onboarding-repository';
import type pg from 'pg';
it('rejects foreign/missing grant before entering KDF and sanitizes DB diagnostics',async()=>{
 const pool={query:vi.fn().mockRejectedValue({code:'P0001',message:'enrollment_unavailable',detail:'private'})};
 const passwords={hashPassword:vi.fn()};
 const service=createOnboardingService({repository:new OnboardingRepository(pool as unknown as pg.Pool),passwords,identitySecret:randomBytes(32),sessionSecret:randomBytes(32)});
 await expect(service.register({identity:'a@example.com',password:'password123',grant_token:createGrantToken()})).rejects.toMatchObject({code:'enrollment_unavailable'});
 expect(passwords.hashPassword).not.toHaveBeenCalled();
});
