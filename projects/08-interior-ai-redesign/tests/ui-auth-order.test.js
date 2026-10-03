// Deterministic local protocol doubles; no browser/business-flow acceptance.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clickAndWaitForHandler} from '../scripts/ui/browser-cases.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const drain=()=>new Promise(resolve=>setImmediate(resolve));

test('real click barrier waits beyond hidden result through DELETE and every refresh; failures propagate and handler is restored',async()=>{
  const stages=['DELETE','uploads','account','gallery'],gates=stages.map(deferred),hidden=deferred();
  const completed=[],event={type:'click',isTrusted:true};
  let clicks=0,disposed=false,handlerResult,returned;
  const element={hidden:false,onclick:function(received) {
    assert.equal(this,element);assert.equal(received,event);
    element.hidden=true;hidden.resolve();
    handlerResult=(async()=>{for(let i=0;i<stages.length;i++){await gates[i].promise;completed.push(stages[i]);}})();
    return handlerResult;
  }};
  const original=element.onclick;
  const page={locator:selector=>{
    if(selector==='#result')return {waitFor:async({state})=>{assert.equal(state,'hidden');assert.equal(element.hidden,true);}};
    assert.equal(selector,'#delete-job');
    return {
      evaluateHandle:async fn=>{
        const state=fn(element);
        return {evaluate:async fn=>fn(state),dispose:async()=>{disposed=true;}};
      },
      click:async()=>{clicks++;returned=element.onclick.call(element,event);}
    };
  }};
  let settled=false;
  const barrier=clickAndWaitForHandler(page,'#delete-job').then(()=>{settled=true;});
  await hidden.promise;await drain();
  assert.equal(element.hidden,true);assert.equal(clicks,1);assert.equal(returned,handlerResult);
  assert.equal(settled,false,'hidden result must not finish the operation barrier');
  for(let i=0;i<stages.length;i++) {
    assert.equal(settled,false,stages[i]+' remains pending');
    gates[i].resolve();await drain();assert.deepEqual(completed,stages.slice(0,i+1));
  }
  await barrier;assert.equal(settled,true);assert.equal(element.onclick,original);assert.equal(disposed,true);

  // A rejected real operation cannot become success; cleanup still restores it.
  const failure=deferred();
  element.onclick=()=>failure.promise;const failing=element.onclick;disposed=false;
  const rejected=assert.rejects(clickAndWaitForHandler(page,'#delete-job'),/backend refresh failed/);
  await drain();failure.reject(new Error('backend refresh failed'));await rejected;
  assert.equal(element.onclick,failing);assert.equal(disposed,true);

  // A handler without an operation promise must fail rather than infer completion.
  element.onclick=()=>undefined;const missing=element.onclick;
  await assert.rejects(clickAndWaitForHandler(page,'#delete-job'),/must return its operation promise/);
  assert.equal(element.onclick,missing);
});
