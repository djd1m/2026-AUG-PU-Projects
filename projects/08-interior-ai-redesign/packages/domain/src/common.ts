import { z } from 'zod';
import stringify from 'fast-json-stable-stringify';
/** Shared pure scalar/error contract. Concrete hashing/password/IO stay in adapters. */
const DOMAIN_ERROR_BRAND=Symbol.for('n8.domain-error');
export class DomainError extends Error {
  readonly [DOMAIN_ERROR_BRAND]=true;
  constructor(readonly status:number,readonly code:string,message:string,readonly fields?:Record<string,string>){super(message);this.name='DomainError';}
}
export const uuid=z.string().uuid();
export interface Clock { now():Date }
export const systemClock:Clock={now:()=>new Date()};
export function canonical(value:unknown):string{return stringify(value);}
export function ensure(condition:unknown,status:number,code:string,message:string):asserts condition {if(!condition)throw new DomainError(status,code,message);}
export function safeInteger(value:unknown,max=100000000000000):number {const n=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>max)throw new DomainError(422,'INVALID_NUMBER','Число вне допустимого диапазона');return n;}

/** Stable across Node/Next module copies; unbranded shape lookalikes remain redacted. */
export function isDomainError(value:unknown):value is DomainError {
 if(typeof value!=='object'||value===null)return false;
 const error=value as DomainError;
 return error[DOMAIN_ERROR_BRAND]===true&&Number.isInteger(error.status)&&error.status>=400&&error.status<=599&&typeof error.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)&&typeof error.message==='string';
}
