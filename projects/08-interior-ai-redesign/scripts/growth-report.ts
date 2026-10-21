import {createPool} from '@n8/db/pool';
import {growthReport} from '@n8/db/sharing';
const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error('DATABASE_URL_REQUIRED');
const pool=createPool(databaseUrl);try{const report=await growthReport(pool);console.log(JSON.stringify({...report,interpretation:'Observed recorded events in an explicit 30-day window. share_created/export_created do not prove external sharing; no conversion forecast.'},null,2));if(report.status==='unknown')process.exitCode=2;}finally{await pool.end();}
