// POST /api/jobs/{job_id}/retry → тот же job_id, повтор продолжает (SC-US-004-3).
import { jobsRoute } from '@/server/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = jobsRoute('retry');
