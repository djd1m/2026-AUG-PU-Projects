import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Envelope, Keyring } from '../mailboxes/crypto.js';
import { HttpError } from '../errors.js';
export interface ContentBinding {tenant:string; mailbox:string; event:string; bindingVersion:number}
function aad(b:ContentBinding,version:string) {return Buffer.from(JSON.stringify(['n7-inbound-content-v1',b.tenant,b.mailbox,b.event,b.bindingVersion,version]));}
export function contentLengths(messages:string[]):number[] {
 const sizes=messages.map(m=>Buffer.byteLength(m,'utf8'));
 if(sizes.length<1||sizes.length>5||sizes.some(n=>n>32768)||sizes.reduce((a,b)=>a+b,0)>65536)throw new HttpError(400,'context_bounds');
 return sizes;
}
export function encryptContent(messages:string[],b:ContentBinding,ring:Keyring):Envelope {
 contentLengths(messages);const version=ring.activeVersion,key=ring.keys.get(version);if(!key)throw new HttpError(503,'context_unavailable');
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad(b,version));
 const plain=Buffer.from(JSON.stringify(messages));try {const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);return {version,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};}finally{plain.fill(0);}
}
export function decryptContent(e:Envelope,b:ContentBinding,ring:Keyring):string[] {
 try {const key=ring.keys.get(e.version);if(!key)throw new Error();
 const decode=(v:string,n?:number)=>{const x=Buffer.from(v,'base64');if(x.toString('base64')!==v||(n!==undefined&&x.length!==n))throw new Error();return x;};
 if(e.ciphertext.length>524288)throw new Error();const d=createDecipheriv('aes-256-gcm',key,decode(e.nonce,12));d.setAAD(aad(b,e.version));d.setAuthTag(decode(e.tag,16));
 const plain=Buffer.concat([d.update(decode(e.ciphertext)),d.final()]);try {const value:unknown=JSON.parse(plain.toString('utf8'));if(!Array.isArray(value)||!value.every(x=>typeof x==='string'))throw new Error();contentLengths(value);return value;}finally{plain.fill(0);}
 }catch{throw new HttpError(503,'context_unavailable');}
}
