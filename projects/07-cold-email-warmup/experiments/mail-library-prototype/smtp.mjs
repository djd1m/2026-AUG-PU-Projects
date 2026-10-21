import SMTPConnection from 'nodemailer/lib/smtp-connection';
import {readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {MIME} from './fixture.mjs';
export function classify(error,info,bodyStarted=true){
 if(!error&&/^250[ -]/.test(info?.response||''))return 'accepted';
 if(error?.responseCode>=400&&error?.responseCode<600)return 'rejected';
 // The owned public Readable is the sole message source. Before its first byte
 // production no MIME body or terminator can have been submitted. A read can
 // also be a library disposal drain, so a true marker remains conservative.
 if(!bodyStarted)return 'not_accepted';
 return 'unknown_delivery';
}
export async function submit(options){
 const connection=new SMTPConnection({host:'127.0.0.1',port:options.port,secure:!options.starttls,requireTLS:true,servername:options.hostname||'fixture.invalid',tls:{ca:options.untrusted?undefined:options.ca,rejectUnauthorized:true,minVersion:'TLSv1.2'},authMethod:'PLAIN',logger:false,debug:false,connectionTimeout:1500,greetingTimeout:1500,socketTimeout:1500,disableFileAccess:true,disableUrlAccess:true});
 let settled=false;let deadline;let bodyStarted=false;let source;
 source=Readable.from((async function*(){if(options.slowBody){for(let n=0;n<MIME.length;n+=8){await new Promise(resolve=>setTimeout(resolve,50));if(settled)return;bodyStarted=true;yield MIME.subarray(n,n+8);}}else{bodyStarted=true;yield MIME;}})());
 source.on('error',()=>{});
 return new Promise(resolve=>{
  const finish=(error,info)=>{if(settled)return;settled=true;clearTimeout(deadline);source.destroy();connection.close();resolve({status:classify(error,info,bodyStarted),bodyStarted,code:error?.code||null,responseCode:error?.responseCode||null,command:error?.command||null});};
  connection.on('error',finish);connection.on('end',()=>finish(new Error('closed')));
  deadline=setTimeout(()=>finish(new Error('deadline')),options.deadline||1800);
  connection.connect(error=>{if(error)return finish(error);connection.login({user:'synthetic',pass:'local-only',method:'PLAIN'},error=>{if(error)return finish(error);connection.send({from:'sender@fixture.invalid',to:['recipient@fixture.invalid']},source,finish);});});
 });
}
if(process.env.N7_CHILD==='smtp'){
 const options=JSON.parse(process.env.N7_OPTIONS);options.ca=readFileSync(options.caPath);const result=await submit(options);process.send?.({result});process.disconnect?.();
}
