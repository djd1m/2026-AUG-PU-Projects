import { singleAddress,messageId,type HeaderInput } from './input.js';
import { TransportFailure } from '../mailboxes/transport-channel.js';
export function parseTransportHeaders(uid:number,literal:Buffer):HeaderInput {
 if(literal.length>8192||literal.includes(0))throw new TransportFailure('protocol_invalid');
 const fields=new Map<string,string>();let current:string|null=null;
 const text=literal.toString('utf8');if(Buffer.from(text).compare(literal)!==0)throw new TransportFailure('protocol_invalid');
 for(const line of text.split('\r\n')){
  if(!line){current=null;continue;}
  if(/^[ \t]/.test(line)){if(!current)throw new TransportFailure('protocol_invalid');fields.set(current,fields.get(current)!+' '+line.trim());continue;}
  const match=/^([A-Za-z-]+):[ \t]*(.*)$/.exec(line);if(!match)throw new TransportFailure('protocol_invalid');const key=match[1]!.toLowerCase();
  if(!['from','message-id','in-reply-to','references'].includes(key)||fields.has(key))throw new TransportFailure('protocol_invalid');fields.set(key,match[2]!);current=key;
 }
 const from=fields.get('from');if(!from||!singleAddress(from))throw new TransportFailure('protocol_invalid');
 const ids=(value:string|undefined)=>{if(value===undefined)return [];const values=value.trim().split(/\s+/);if(!values.length||values.some(v=>!messageId(v)))throw new TransportFailure('protocol_invalid');return values;};
 const references=ids(fields.get('references')),parent=ids(fields.get('in-reply-to')),id=ids(fields.get('message-id'));
 if(references.length+parent.length>50||parent.length>1||id.length>1)throw new TransportFailure('protocol_invalid');
 return {uid,from,references,...(parent.length?{inReplyTo:parent[0]}:{}),...(id.length?{messageId:id[0]}:{})};
}
