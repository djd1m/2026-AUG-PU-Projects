import { createHash,randomBytes,randomUUID } from 'node:crypto';
export const TEST_LABEL='N7 LOCAL TEST — NOT DELIVERY';
export interface TestMessage {
 messageId:string;sender:string;recipient:string;subject:string;body:string;
 headers:Record<string,string>;testLabel:typeof TEST_LABEL;
}
export function tokenHash(token:string) {return createHash('sha256').update(token).digest('hex');}
export function renderTestMessage(sender:string,recipient:string,payload:{subject:string;body:string},origin:string,parentMessageId?:string) {
 if([sender,recipient,payload.subject].some(x=>typeof x!=='string' || /[\r\n]/.test(x)) || typeof payload.body!=='string') throw new Error('invalid_message');
 const token=randomBytes(32).toString('base64url');const unsubscribe=new URL('/unsubscribe/'+token,origin).href;
 const messageId=`<${randomUUID()}@n7.local.test>`;
 const subject='[N7 LOCAL TEST] '+payload.subject;
 const headers:Record<string,string>={From:sender,To:recipient,Subject:subject,'Message-ID':messageId,
  'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click',
  'Content-Type':'text/plain; charset=utf-8','X-N7-Test':'local_test'};
 if(parentMessageId) {headers['In-Reply-To']=parentMessageId;headers.References=parentMessageId;}
 return {token,tokenHash:tokenHash(token),message:{messageId,sender,recipient,subject,
  body:TEST_LABEL+'\n\n'+payload.body+'\n\nUnsubscribe: '+unsubscribe,headers,testLabel:TEST_LABEL} satisfies TestMessage};
}
export interface LiveMessage {messageId:string;sender:string;recipient:string;subject:string;body:string;headers:Record<string,string>;wire:string}
export function renderLiveMessage(sender:string,recipient:string,payload:{subject:string;body:string},origin:string,parentMessageId?:string,stableMessageId?:string){
 const address=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;
 if(!address.test(sender)||!address.test(recipient)||typeof payload.subject!=='string'||[...payload.subject].length>200||/[\r\n\0]/.test(payload.subject)||typeof payload.body!=='string'||Buffer.byteLength(payload.body)>32768||payload.body.includes('\0')||parentMessageId!==undefined&&!/^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+>$/.test(parentMessageId))throw new Error('invalid_message');
 const token=randomBytes(32).toString('base64url'),unsubscribe=new URL('/unsubscribe/'+token,origin).href;
 const messageId=stableMessageId??`<${randomUUID()}@${sender.split('@')[1]}>`;
 if(!/^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+>$/.test(messageId))throw new Error('invalid_message');
 const words:string[]=[];let part='';for(const char of payload.subject){if(Buffer.byteLength(part+char)>42){words.push('=?UTF-8?B?'+Buffer.from(part).toString('base64')+'?=');part='';}part+=char;}if(part)words.push('=?UTF-8?B?'+Buffer.from(part).toString('base64')+'?=');
 const headers:Record<string,string>={From:sender,To:recipient,Subject:words.join('\r\n '),'Message-ID':messageId,'MIME-Version':'1.0','Content-Type':'text/plain; charset=utf-8','Content-Transfer-Encoding':'base64','List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'};
 if(parentMessageId){headers['In-Reply-To']=parentMessageId;headers.References=parentMessageId;}
 const body=payload.body+'\n\nUnsubscribe: '+unsubscribe,base64=Buffer.from(body).toString('base64'),lines=base64.match(/.{1,76}/g)??[''];
 const wire=Object.entries(headers).map(([key,value])=>key+': '+value).join('\r\n')+'\r\n\r\n'+lines.map(line=>line.startsWith('.')?'.'+line:line).join('\r\n')+'\r\n.\r\n';
 if(Buffer.byteLength(wire)>65536||Object.entries(headers).some(([key,value])=>key!=='Subject'&&/[\r\n\0]/.test(value)))throw new Error('invalid_message');
 return {token,tokenHash:tokenHash(token),message:{messageId,sender,recipient,subject:payload.subject,body,headers,wire} satisfies LiveMessage};
}
