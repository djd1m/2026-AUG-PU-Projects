import type { TestMessage } from './message.js';
// Trusted internal test seam only. No user input, socket or provider success claims.
export type TestOutcome={kind:'accepted'}|{kind:'pre_data_transient';proof:'no_data_submitted'}|{kind:'permanent';proof:'no_data_submitted'}|{kind:'rejected_after_data'}|{kind:'ambiguous'};
export interface SubmissionAdapter {readonly mode:'local_test';submit(message:TestMessage):Promise<TestOutcome>}
export const localSinkAdapter:SubmissionAdapter={mode:'local_test',async submit(){return {kind:'accepted'};}};
export function retryDelay(attempt:number,first:Date,now:Date):number|null {
 const delay=attempt===1?5000:attempt===2?30000:null;
 return delay!==null && now.getTime()>=first.getTime() && now.getTime()+delay<first.getTime()+120000?delay:null;
}
