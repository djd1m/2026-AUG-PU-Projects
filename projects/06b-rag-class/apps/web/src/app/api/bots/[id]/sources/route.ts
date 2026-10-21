// POST /api/bots/{id}/sources {url} → 202 {job_id} до начала работы (FR-n6b-4, ADR-005).
import { jobsRoute } from '@/server/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = jobsRoute('source');
