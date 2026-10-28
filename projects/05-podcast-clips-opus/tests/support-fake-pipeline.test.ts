import {describe,it,expect,vi} from 'vitest';
import {loadSttConfig} from '../packages/shared/src/config';
import {parseTranscript} from '../packages/shared/src/transcript';
import {validateFragments} from '../packages/shared/src/fragments';
import {createTranscriber} from '../apps/worker/src/stt/client';
import {createFakeSelector,fakeFragment} from '../apps/worker/src/llm/fake';
import {environment} from './fixtures/environment';
import {chunkBoundaries} from '../apps/worker/src/stt/chunker';
import {mergeWords} from '../apps/worker/src/stt/merge';
const config=()=>loadSttConfig(environment());
describe('explicit test-only fake STT to selection pipeline',()=>{
 it('200s fixture yields three real-validator word-snapped clips without provider/file IO',async()=>{
  const request=vi.fn<typeof fetch>(async()=>{throw new Error('Unexpected paid provider call');});
  const duration=200,signal=new AbortController().signal;
  const transcript=await createTranscriber(config(),request).transcribe('/nonexistent/synthetic.mp3',duration,signal);
  expect(parseTranscript(transcript,duration)).toEqual(transcript);
  expect(transcript.words).toHaveLength(200);expect(transcript.words.at(-1)?.end).toBe(duration);
  expect(transcript.segments).toHaveLength(1);expect(transcript.segments[0]?.end).toBe(duration);
  const selected=await createFakeSelector('valid').select(transcript,duration,signal);
  expect(validateFragments(selected,transcript,duration)).toEqual([fakeFragment(0),fakeFragment(1),fakeFragment(2)]);
  expect(request).not.toHaveBeenCalled();
 });
 it('canonical 200s chunks and overlap merge retain the three selected word intervals',async()=>{
  const duration=200,signal=new AbortController().signal,transcriber=createTranscriber(config());
  const chunks=await Promise.all(chunkBoundaries(duration,[]).map(async chunk=>({...chunk,
   result:await transcriber.transcribe('/synthetic-only',chunk.durationSeconds,signal)})));
  const transcript=mergeWords(chunks,duration);
  expect(transcript.words).toHaveLength(200);expect(transcript.words.at(-1)?.end).toBe(duration);
  const selected=await createFakeSelector('valid').select(transcript,duration,signal);
  expect(validateFragments(selected,transcript,duration)).toEqual([fakeFragment(0),fakeFragment(1),fakeFragment(2)]);
 });
 it.each([[0.2,0],[19.5,0],[24.5,0],[25,1],[54.5,1],[55,2],[84.5,2],[85,3],[200.75,3]])(
  'duration%s stays in measured bounds and accepts only%s existing selector clips',async(duration,count)=>{
   const signal=new AbortController().signal;
   const transcript=await createTranscriber(config()).transcribe('/synthetic-only',duration,signal);
   expect(parseTranscript(transcript,duration)).toEqual(transcript);
   for(const word of transcript.words){expect(word.start).toBeGreaterThanOrEqual(0);expect(word.end).toBeGreaterThan(word.start);expect(word.end).toBeLessThanOrEqual(duration);}
   expect(transcript.words.at(-1)?.end).toBe(duration);
   expect(transcript.segments.every(segment=>segment.start>=0&&segment.end<=duration)).toBe(true);
   const selected=await createFakeSelector('valid').select(transcript,duration,signal);
   expect(validateFragments(selected,transcript,duration)).toEqual(Array.from({length:count},(_,index)=>fakeFragment(index)));
  });
 it.each([0,-1,Number.NaN,Number.POSITIVE_INFINITY])('invalid duration%s fails before synthesizing timestamps',async duration=>{
  await expect(createTranscriber(config()).transcribe('/synthetic-only',duration,new AbortController().signal)).rejects.toThrow();
 });
 it('cancellation rejects both fake stages and fake configuration remains prohibited in production',async()=>{
  const controller=new AbortController();controller.abort();
  await expect(createTranscriber(config()).transcribe('/synthetic-only',200,controller.signal)).rejects.toMatchObject({name:'AbortError'});
  await expect(createFakeSelector('valid').select({language:'ru',words:[],segments:[]},200,controller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(()=>loadSttConfig({...environment(),NODE_ENV:'production',N5_MODEL_PROVIDER:'fake'})).toThrow('только в тестах');
 });
});
