'use client';

import type {
  AcceptedEnrollment,
  AcceptedPartner,
  EnrollmentPreview,
  IssueEnrollmentInput,
  IssuedEnrollment,
  MeDTO,
  MembersDTO,
  PartnerAssetsDTO,
  ProgramDTO,
  SavePolicyInput,
} from '../../../../../packages/db/src/onboarding-contract';

type ApiSuccess<T> = { data: T; meta: { request_id: string } };
type ApiFailure = { error: { code: string; message: string }; meta?: { request_id: string } };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readEnvelope<T>(response: Response): Promise<ApiSuccess<T>> {
  const body = await response.json().catch(() => null) as ApiSuccess<T> | ApiFailure | null;
  if (!response.ok || !body || !('data' in body)) {
    const failure = body && 'error' in body ? body : null;
    throw new ApiError(
      response.status,
      failure?.error.code ?? 'unavailable',
      failure?.error.message ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.',
      failure?.meta?.request_id,
    );
  }
  return body;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  return (await readEnvelope<T>(response)).data;
}

async function freshCsrf(): Promise<string> {
  const response = await fetch('/api/auth/csrf', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const envelope = await readEnvelope<{ token: string; expires_at: string }>(response);
  return envelope.data.token;
}

export async function apiMutation<T>(path: string, body: object): Promise<T> {
  const token = await freshCsrf();
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify(body),
  });
  return (await readEnvelope<T>(response)).data;
}

export const onboardingApi = {
  login: (input: { identity: string; password: string }) =>
    apiMutation<{ user_id: string }>('/api/auth/login', input),
  signup: (input: { identity: string; password: string; grant_token: string }) =>
    apiMutation<{ user_id: string }>('/api/auth/signup', input),
  logout: () => apiMutation<{ logged_out: boolean }>('/api/auth/logout', {}),
  me: (cursor?: string) => apiGet<MeDTO>(`/api/auth/me?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  bind: (grant_token: string) =>
    apiMutation<EnrollmentPreview>('/api/enrollments/bind', { grant_token }),
  preview: (grant_token: string) =>
    apiMutation<EnrollmentPreview>('/api/enrollments/preview', { grant_token }),
  acceptEnrollment: (grant_token: string) =>
    apiMutation<AcceptedEnrollment>('/api/enrollments/accept', { grant_token }),
  acceptPartner: (input: { grant_token: string; policy_id: string; terms_hash: string; accepted: true }) =>
    apiMutation<AcceptedPartner>('/api/partners/accept', input),
  program: (programId: string) => apiGet<ProgramDTO>(`/api/programs/${encodeURIComponent(programId)}`),
  savePolicy: (programId: string, input: Omit<SavePolicyInput, 'program_id' | 'sessionTokenHash'>) =>
    apiMutation<{ policy_id: string; version: number; program_status: ProgramDTO['program_status'] }>(
      `/api/programs/${encodeURIComponent(programId)}/policy`, input,
    ),
  activate: (programId: string) =>
    apiMutation<never>(`/api/programs/${encodeURIComponent(programId)}/activate`, {}),
  issue: (programId: string, input: Omit<IssueEnrollmentInput, 'program_id' | 'sessionTokenHash'>) =>
    apiMutation<IssuedEnrollment>(`/api/programs/${encodeURIComponent(programId)}/enrollments`, input),
  members: (programId: string, memberCursor?: string, grantCursor?: string) => {
    const query = new URLSearchParams({ limit: '20' });
    if (memberCursor) query.set('member_cursor', memberCursor);
    if (grantCursor) query.set('grant_cursor', grantCursor);
    return apiGet<MembersDTO>(`/api/programs/${encodeURIComponent(programId)}/members?${query}`);
  },
  revokeGrant: (programId: string, grantId: string) =>
    apiMutation<{ status: 'revoked' }>(
      `/api/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(grantId)}/revoke`, {},
    ),
  revokeOperator: (programId: string, membershipId: string) =>
    apiMutation<{ status: 'revoked' }>(
      `/api/programs/${encodeURIComponent(programId)}/members/${encodeURIComponent(membershipId)}/revoke`, {},
    ),
  setPartnerStatus: (
    programId: string,
    partnerId: string,
    status: 'active' | 'suspended',
    expected_status: 'active' | 'suspended',
  ) => apiMutation<{ status: 'active' | 'suspended' }>(
    `/api/programs/${encodeURIComponent(programId)}/partners/${encodeURIComponent(partnerId)}/status`,
    { status, expected_status },
  ),
  partnerAssets: (programId: string, partnerId?: string) => {
    const query = partnerId ? `?partner_id=${encodeURIComponent(partnerId)}` : '';
    return apiGet<PartnerAssetsDTO>(`/api/programs/${encodeURIComponent(programId)}/partner-assets${query}`);
  },
  revokeAsset: (programId: string, assetId: string) =>
    apiMutation<{ status: 'revoked' }>(
      `/api/programs/${encodeURIComponent(programId)}/assets/${encodeURIComponent(assetId)}/revoke`, {},
    ),
};

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Сервис временно недоступен. Попробуйте ещё раз.';
}
