"use client";
import {useId,useRef,type ReactNode} from 'react';
// Manual activation follows WAI-ARIA APG; local donor N1 IntakeTabs supplied controlled state.
export function Tabs({items,value,onChange,label,renderPanel}:{items:readonly {value:string;label:string}[];value:string;onChange:(value:string)=>void;label:string;renderPanel:(value:string)=>ReactNode}) {
 const id=useId(),buttons=useRef<(HTMLButtonElement|null)[]>([]);
 return <><nav className="tabs" role="tablist" aria-label={label}>{items.map((item,index)=><button key={item.value} type="button" ref={node=>{buttons.current[index]=node;}} id={`${id}-tab-${item.value}`} role="tab" aria-selected={value===item.value} aria-controls={`${id}-panel-${item.value}`} tabIndex={value===item.value?0:-1} onClick={()=>onChange(item.value)} onKeyDown={event=>{let next:number;if(event.key==='ArrowRight')next=(index+1)%items.length;else if(event.key==='ArrowLeft')next=(index+items.length-1)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;else return;event.preventDefault();buttons.current[next]?.focus();}}>{item.label}</button>)}</nav>{items.map(item=><div key={item.value} role="tabpanel" id={`${id}-panel-${item.value}`} aria-labelledby={`${id}-tab-${item.value}`} hidden={value!==item.value} tabIndex={0}>{value===item.value?renderPanel(item.value):null}</div>)}</>;
}
