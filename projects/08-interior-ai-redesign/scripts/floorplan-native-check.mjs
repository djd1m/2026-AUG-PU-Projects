import {dimensionedDrawing} from '../tests/space/drawing-fixture.ts';
import {recognizeDrawing} from '../packages/adapters/src/floorplan.ts';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const dir=await mkdtemp(join(tmpdir(),'n8-native-drawing-'));
try{const image=await dimensionedDrawing(),file=join(dir,'source.png');await writeFile(file,image);const start=performance.now();const result=await recognizeDrawing(file,createHash('sha256').update(image).digest('hex'),'synthetic');for(const expected of ['6000','3000','2700'])assert(result.candidates.some(c=>c.value===expected),JSON.stringify(result));const vertical=result.candidates.find(c=>c.value==='3000');assert(vertical.box.x<0.2&&vertical.box.y>0.1&&vertical.box.y<0.6,'rotated box maps to originaldrawing');const blank=await sharp({create:{width:400,height:400,channels:3,background:'white'}}).png().toBuffer();await writeFile(file,blank);const empty=await recognizeDrawing(file,createHash('sha256').update(blank).digest('hex'),'synthetic-empty');assert.equal(empty.candidates.length,0);console.log(JSON.stringify({status:'passed',imageCandidates:result.candidates,emptyCandidates:0,durationMs:performance.now()-start,source:'syntheticPNG with horizontal/vertical/heightlabels',paidCalls:'offline nativeOCR, no provider configured'}));}finally{await rm(dir,{recursive:true,force:true});}
