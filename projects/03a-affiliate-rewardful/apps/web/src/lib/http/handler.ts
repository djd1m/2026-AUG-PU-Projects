import { randomBytes, randomUUID } from 'node:crypto';
import type { OnboardingService } from '../../../../../packages/db/src/onboarding-contract';
import { OnboardingError } from '../../../../../packages/db/src/onboarding-contract';
import type { RuntimeConfig } from '../auth/config';
import type { CredentialService } from '../auth/credentials';
import { isValidPassword } from '../auth/password';
import { SESSION_COOKIE, clearSessionCookie, serializeSessionCookie } from '../auth/cookie';
import { SessionService, hashSessionToken, isSessionToken } from '../auth/session';
import { DurableAdmission, HttpAdmission } from './admission';
import { ANONYMOUS_COOKIE, anonymousCookie, clearAnonymousCookie, createCsrf, csrfBinding, readCookie, verifyCsrf } from './csrf';
import { readBodyAtMost } from './body';
import { errorResponse, HttpError, jsonData } from './errors';
import * as input from './input';
export interface ApiRuntime {
  config: RuntimeConfig; sessions: SessionService; credentials: CredentialService;
  onboarding: OnboardingService; admission: DurableAdmission; hashIdentity(value: unknown): Buffer;
}
export type Action = 'csrf' | 'signup' | 'login' | 'logout' | 'me' | 'bind' | 'preview' | 'accept' | 'acceptPartner'
  | 'program' | 'policy' | 'activate' | 'issue' | 'revokeGrant' | 'members' | 'revokeOperator' | 'partnerStatus' | 'revokeAsset' | 'assets';
const reads = new Set<Action>(['csrf', 'me', 'program', 'members', 'assets']);
const processState = globalThis as typeof globalThis & { __n3aHttpGuard?: HttpAdmission };
const processAdmission = processState.__n3aHttpGuard ??= new HttpAdmission();
function grantToken(value: unknown): string {
  if (!isSessionToken(value)) return input.invalid();
  return value;
}
export function createApi(getRuntime: () => Promise<ApiRuntime>, guard = processAdmission) {
  return async (request: Request, action: Action, params: Record<string, string> = {}): Promise<Response> => {
    const requestId = randomUUID();
    try {
      return await guard.run(async () => {
        const runtime = await getRuntime();
        await runtime.admission.source(); // Short durable transaction ends before all body/KDF work.
        const { config, sessions, onboarding } = runtime;
        if (request.method !== (reads.has(action) ? 'GET' : 'POST')) throw new HttpError(405, 'invalid_input');
        const token = readCookie(request, SESSION_COOKIE);
        const tokenHash = isSessionToken(token) ? hashSessionToken(token, config.sessionSecret) : null;
        let body: unknown = {};
        if (action === 'csrf' || !reads.has(action)) {
          if (action !== 'csrf' && request.headers.get('origin') !== config.appOrigin) throw new HttpError(403, 'csrf_rejected');
          const current = await sessions.resolve(token);
          const anonymous = readCookie(request, ANONYMOUS_COOKIE);
          if (action === 'csrf') {
            const nonce = isSessionToken(anonymous) ? anonymous : randomBytes(32).toString('base64url');
            const binding = csrfBinding(current ? tokenHash : null, nonce)!;
            const response = jsonData(createCsrf(binding, config.sessionSecret), requestId);
            if (!current) response.headers.append('Set-Cookie', anonymousCookie(nonce));
            return response;
          }
          verifyCsrf(request, config.appOrigin, csrfBinding(current ? tokenHash : null, anonymous), config.sessionSecret);
          if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) input.invalid();
          const raw = await readBodyAtMost(request);
          try { body = raw ? JSON.parse(raw) : {}; } catch { input.invalid(); }
        }
        if (action === 'login' || action === 'signup') {
          const b = input.object(body, action === 'login' ? ['identity', 'password'] : ['identity', 'password', 'grant_token']);
          let identity: Buffer | null = null;
          try { identity = runtime.hashIdentity(b.identity); } catch { /* charge invalid fixed identity bucket */ }
          await runtime.admission.identity(identity);
          if (!identity || typeof b.identity !== 'string' || !isValidPassword(b.password)) input.invalid();
          let issued: { user_id: string; token: string; expires_at: string };
          if (action === 'signup') issued = await onboarding.register({ identity: b.identity, password: b.password,
            grant_token: grantToken(b.grant_token), signal: request.signal });
          else {
            const result = await runtime.credentials.authenticate(identity, b.password, request.signal);
            if (!result.ok) throw new OnboardingError(result.error);
            issued = { user_id: result.context.user_id, token: result.token, expires_at: result.context.expires_at.toISOString() };
          }
          try { await sessions.revoke(token); }
          catch (error) { await sessions.revoke(issued.token).catch(() => {}); throw error; }
          if (request.signal.aborted) { await sessions.revoke(issued.token); throw new HttpError(503, 'canceled'); }
          const response = jsonData({ user_id: issued.user_id }, requestId, action === 'signup' ? 201 : 200);
          response.headers.append('Set-Cookie', serializeSessionCookie(issued.token));
          response.headers.append('Set-Cookie', clearAnonymousCookie());
          return response;
        }
        if (action === 'logout') {
          input.object(body, []);
          await sessions.revoke(token);
          const response = jsonData({ logged_out: true }, requestId);
          response.headers.append('Set-Cookie', clearSessionCookie());
          response.headers.append('Set-Cookie', clearAnonymousCookie());
          return response;
        }
        if (!tokenHash || !await sessions.resolve(token)) throw new OnboardingError('unauthorized');
        const session = { sessionTokenHash: tokenHash };
        if (action === 'bind' || action === 'preview' || action === 'accept' || action === 'acceptPartner') {
          const b = input.object(body, action === 'acceptPartner' ? ['grant_token', 'policy_id', 'terms_hash', 'accepted'] : ['grant_token']);
          const grant = { ...session, grant_token: grantToken(b.grant_token) };
          if (action === 'bind') return jsonData(await onboarding.bindEnrollment(grant), requestId);
          if (action === 'preview') return jsonData(await onboarding.previewEnrollment(grant), requestId);
          if (action === 'accept') return jsonData(await onboarding.acceptEnrollment(grant), requestId);
          if (b.accepted !== true) input.invalid();
          return jsonData(await onboarding.acceptPartner({ ...grant, accepted: true,
            policy_id: input.uuid(b.policy_id), terms_hash: input.hash32(b.terms_hash) }), requestId);
        }
        const query = new URL(request.url).searchParams;
        if (action === 'me') return jsonData(await onboarding.getMe({ ...session, ...input.pagination(query) }), requestId);
        const program = { ...session, program_id: input.uuid(params.id) };
        if (action === 'program') { input.pagination(query, []); return jsonData(await onboarding.getProgram(program), requestId); }
        if (action === 'members') {
          const page = input.pagination(query, ['limit', 'member_cursor', 'grant_cursor']);
          return jsonData(await onboarding.listMembers({ ...program, limit: page.limit,
            ...(query.has('member_cursor') ? { member_cursor: input.uuid(query.get('member_cursor')) } : {}),
            ...(query.has('grant_cursor') ? { grant_cursor: input.uuid(query.get('grant_cursor')) } : {}) }), requestId);
        }
        if (action === 'assets') {
          input.pagination(query, ['partner_id']);
          return jsonData(await onboarding.getPartnerAssets({ ...program,
            ...(query.has('partner_id') ? { partner_id: input.uuid(query.get('partner_id')) } : {}) }), requestId);
        }
        if (action === 'policy') return jsonData(await onboarding.savePolicy(input.policyInput(body, program)), requestId, 201);
        if (action === 'issue') return jsonData(await onboarding.issueEnrollment(input.enrollmentInput(body, program)), requestId, 201);
        if (action === 'partnerStatus') {
          const b = input.object(body, ['status', 'expected_status']);
          return jsonData(await onboarding.setPartnerStatus({ ...program, partner_id: input.uuid(params.partner),
            status: input.literal(b.status, ['active', 'suspended']), expected_status: input.literal(b.expected_status, ['active', 'suspended']) }), requestId);
        }
        input.object(body, []);
        if (action === 'activate') await onboarding.activateProgram(program);
        if (action === 'revokeGrant') return jsonData(await onboarding.revokeEnrollment({ ...program, grant_id: input.uuid(params.grant) }), requestId);
        if (action === 'revokeOperator') return jsonData(await onboarding.revokeOperator({ ...program, membership_id: input.uuid(params.membership) }), requestId);
        if (action === 'revokeAsset') return jsonData(await onboarding.revokeAsset({ ...program, asset_id: input.uuid(params.asset) }), requestId);
        throw new HttpError(404, 'forbidden');
      });
    } catch (error) { return errorResponse(error, requestId); }
  };
}
