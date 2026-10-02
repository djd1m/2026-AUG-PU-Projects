import { readConfig } from '../web/config.js';
import { createPool } from '../web/db.js';
import { createQuality } from '../web/quality.js';

// Trusted server CLI only. Identity is operator provisioned environment, never
// an HTTP account field or caller-supplied --actor argument.
let pool;
try {
  const [jobId,decision,reason,...extra]=process.argv.slice(2);
  if(extra.length)throw new Error('usage_quality_job_decision_reason');
  const config=readConfig();pool=createPool(config.databaseUrl);
  const review=createQuality(pool,config,{operatorIdentity:process.env.QUALITY_OPERATOR_ID});
  await review.review({jobId,decision,reason,reportPath:process.env.QUALITY_CORPUS_REPORT,
    reportSha:process.env.QUALITY_CORPUS_SHA256});
  console.log('quality_review_recorded');
}catch(e){console.error(/^[a-z0-9_]{1,100}$/.test(e.message)?e.message:'quality_review_failed');process.exitCode=1;}
finally{await pool?.end();}
