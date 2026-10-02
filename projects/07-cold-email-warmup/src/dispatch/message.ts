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
