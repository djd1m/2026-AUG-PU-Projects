// GET /api/jobs/{job_id} → состояние задачи: running | succeeded | failed и прогресс (SC-US-004-1…3).
import { jobsRoute } from '@/server/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = jobsRoute('job');
