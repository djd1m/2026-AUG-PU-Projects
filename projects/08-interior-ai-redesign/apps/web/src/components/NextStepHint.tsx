'use client';
import type {ProjectContext} from './project-types';
export function NextStepHint({context,to,label,children}:{context:ProjectContext;to:string;label:string;children:React.ReactNode}){return <aside className="notice" role="status"><p>{children}</p><button type="button" className="secondary compact" onClick={()=>context.goToStep?.(to)}>Перейти: {label} →</button></aside>;}
