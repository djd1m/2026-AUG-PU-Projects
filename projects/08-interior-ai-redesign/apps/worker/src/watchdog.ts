import type {PgJobs} from '@n8/db/design';
export async function sweepJobs(deps:{jobs:PgJobs}):Promise<number>{return deps.jobs.sweep();}
