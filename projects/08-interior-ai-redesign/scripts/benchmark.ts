import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus,totalmem,platform,release} from 'node:os';
import {performance} from 'node:perf_hooks';
import {canonical} from '@n8/domain/common';
import {calculateBudget} from '@n8/domain/procurement';
import {procurement200Fixture,PROCUREMENT_200_GOLDEN_SHA256} from '../tests/procurement/fixture.js';
const [output,ownerPath,projectId]=process.argv.slice(2);if(!output)throw new Error('Usage benchmark.ts fresh-output.json [private-owner.json projectId]');
try{await access(output);throw new Error('Fresh output required');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const p95=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]!;
const fixture=procurement200Fixture(),samples:number[]=[],startedAt=new Date().toISOString();let hashesMatched=0;
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
// Preserve original procurement fixture; this measured variant includes one genuinely unmatched object.
fixture.lines[199]={...fixture.lines[199]!,selection:'unmatched',snapshotId:null};
const initialFixtureHash=hash({...fixture,snapshots:[...fixture.snapshots]});
const golden='e859e7593e7ec83599a7f41435ef6db7a337f0cb481a808626b9485629706aee';
for(let index=0;index<1050;index++){const begin=performance.now();const result=calculateBudget(fixture),elapsed=performance.now()-begin;if(index>=50){samples.push(elapsed);if(hash(result)===golden)hashesMatched++;}}
const check=calculateBudget(fixture);assert.equal(check.knownSubtotalMinor,67_090_000);assert.equal(check.reserveMinor,6_709_000);assert.equal(check.scenarioTotalMinor,null);assert.equal(check.complete,false);assert.equal(check.unresolvedCount,1);assert.equal(initialFixtureHash,hash({...fixture,snapshots:[...fixture.snapshots]}));
const pure={testTitle:'SC-US-024-2 200-line budget with an unknown element preserves literal totals and golden hash at p95 under100ms',warmup:50,measured:samples.length,samplesMs:samples,p95Ms:p95(samples),hashesMatched,golden,originalKnownFixtureGolden:PROCUREMENT_200_GOLDEN_SHA256,fixtureHash:initialFixtureHash,knownMinor:check.knownSubtotalMinor,reserveMinor:check.reserveMinor,totalMinor:check.scenarioTotalMinor,passed:samples.length===1000&&hashesMatched===1000&&p95(samples)<=100};
interface Sample {client:number;index:number;path:string;ms:number;status:number|null;valid:boolean;error:string|null}
let api:unknown=null,apiPassed=true;
if(ownerPath&&projectId){
 const origin=process.env.N8_PUBLIC_ORIGIN??'http://127.0.0.1:3088';assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
 const credentials=JSON.parse(await readFile(ownerPath,'utf8'));
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:credentials.email,password:credentials.password}),signal:AbortSignal.timeout(6000)});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')?.split(';')[0];assert(cookie);
 const measured:Sample[]=[],warmup:Sample[]=[];
 await Promise.all(Array.from({length:10},async(_,client)=>{for(let index=0;index<120;index++){
  const path=index%2===0?`/api/projects/${projectId}`:'/api/projects',begin=performance.now();let status:number|null=null,valid=false,error:string|null=null;
  try{const response=await fetch(origin+path,{headers:{cookie},cache:'no-store',signal:AbortSignal.timeout(6000)});status=response.status;const body=await response.json();valid=status===200&&(path==='/api/projects'?Array.isArray(body.data?.items)&&body.data.items.some((p:{id:string})=>p.id===projectId):body.data?.id===projectId);if(!valid)error='INVALID_STATUS_OR_BODY';}catch{error='TIMEOUT_OR_RESPONSE_ERROR';}
  (index<20?warmup:measured).push({client,index,path,ms:performance.now()-begin,status,valid,error});
 }}));
 apiPassed=measured.length===1000&&warmup.length===200&&[...measured,...warmup].every(s=>s.valid)&&p95(measured.map(s=>s.ms))<=500;
 api={testTitle:'SC-US-024-1 owned project reads with ten clients retain all1000 samples at p95 under500ms',clients:10,warmupPerClient:20,measuredPerClient:100,p95Ms:p95(measured.map(s=>s.ms)),samples:measured,warmup,passed:apiPassed};
}
await writeFile(output,JSON.stringify({startedAt,finishedAt:new Date().toISOString(),node:process.version,host:{cpu:cpus()[0]?.model,logicalCpu:cpus().length,memoryBytes:totalmem(),platform:platform(),release:release()},buildRevision:process.env.N8_BUILD_REVISION??null,pure,api,liveCalls:0,status:pure.passed&&apiPassed?'passed':'failed'},null,2)+'\n',{flag:'wx'});
console.log('N8_BENCHMARK',pure.passed&&apiPassed?'PASS':'FAIL','pure_p95_ms',pure.p95Ms);if(!pure.passed||!apiPassed)process.exitCode=1;
