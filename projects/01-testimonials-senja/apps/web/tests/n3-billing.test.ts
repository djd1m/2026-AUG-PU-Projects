import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { type ReactElement } from 'react';
const hooks=vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
vi.mock('react',async importOriginal=>({...await importOriginal<typeof import('react')>(),
  useState:(initial:unknown)=>{
    const index=hooks.cursor++;
    if(!(index in hooks.values))hooks.values[index]=initial;
    return [hooks.values[index],(value:unknown)=>{hooks.values[index]=value;}];
  },
}));
import { BillingBlock } from '../src/app/dashboard/[slug]/billing-block';
type Element=ReactElement<{children?:unknown;onClick?:()=>Promise<void>|void}>;
function buttons(paidUntil:string|null=null):Element[]{
  hooks.cursor=0;const tree=BillingBlock({slug:'first-free',priceRub:990,paidUntil});
  const found:Element[]=[];
  function visit(value:unknown){
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(!value||typeof value!=='object')return;
    const element=value as Element;
    if(element.type==='button')found.push(element);
    visit(element.props?.children);
  }
  visit(tree);return found;
}
afterEach(()=>{hooks.values=[];hooks.cursor=0;vi.unstubAllGlobals();});
describe('free customer cancellation recovery',()=>{
  it('offers an explicit new purchase only after authoritative cancellation and keeps pending retry key',async()=>{
    vi.stubGlobal('React',React);
    const storage=new Map<string,string>(),keys:string[]=[];let canceled=false;
    vi.stubGlobal('sessionStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});
    vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{
      keys.push(JSON.parse(String(init.body)).request_key);
      return new Response(JSON.stringify(canceled?{code:'N3_PAYMENT_CANCELED',error:'canceled'}:{code:'N3_BIND_PENDING',error:'pending'}),{status:canceled?409:503});
    });
    expect(buttons()).toHaveLength(1);
    await buttons()[0]!.props.onClick!();
    expect(buttons()).toHaveLength(1);
    await buttons()[0]!.props.onClick!();
    expect(keys[1]).toBe(keys[0]);
    canceled=true;await buttons()[0]!.props.onClick!();
    expect(keys[2]).toBe(keys[0]);
    const actions=buttons();expect(actions).toHaveLength(2);
    expect(actions[1]!.props.children).toBe('Начать новую покупку после отмены');
    await actions[1]!.props.onClick!();
    expect(keys).toHaveLength(3);expect(buttons()).toHaveLength(1);
    canceled=false;await buttons()[0]!.props.onClick!();
    expect(keys[3]).not.toBe(keys[0]);
  });
});
