import {measureEnvelope,envelopeMedian} from '/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/apps/worker/dist/src/render/envelope.js';
import {planCuts,planDuration,buildCompactionGraph} from '/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus/apps/worker/dist/src/render/compaction.js';
import {execFileSync} from 'node:child_process';
const input='/tmp/n5-support-e2e-20261028/synthetic-source-200s.mp4';
const median=envelopeMedian(await measureEnvelope(input));
console.log({median});
for(const start of [0,30,60]){
const plan=planCuts(await measureEnvelope(input,start,25),median,start,start+25).plan;
const out=`/tmp/n5-thumbnail-diag-20261028/${start}-fps-first.mp4`;
const graph=buildCompactionGraph(plan,start,0).replaceAll(/trim=([^,]+),setpts=PTS-STARTPTS,fps=25/g,'fps=25,trim=$1,setpts=PTS-STARTPTS')+';[vc]scale=64:114[v]';
console.log(JSON.stringify({start,plan,duration:planDuration(plan),graph}));
execFileSync('ffmpeg',['-v','error','-y','-ss',String(start),'-t','25','-i',input,'-filter_complex_threads','1','-filter_complex',graph,'-map','[v]','-map','[ac]','-t',String(planDuration(plan)),'-c:v','libx264','-preset','ultrafast','-c:a','aac',out]);
console.log(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,duration,nb_frames,start_time:format=duration','-of','json',out],{encoding:'utf8'}));
try{execFileSync('ffmpeg',['-v','error','-y','-ss',String(planDuration(plan)*.25),'-i',out,'-vframes','1','-vf','scale=360:-1','-q:v','3',out+'.jpg']); console.log('thumbnail pass');}catch(e){console.log('thumbnail failed',e.status,e.stderr.toString());}
}
