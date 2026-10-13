import {ImapFlow} from 'imapflow';
import {readFileSync} from 'node:fs';
export async function receive(options){
 const client=new ImapFlow({host:'127.0.0.1',port:options.port,secure:true,servername:options.hostname||'fixture.invalid',auth:{user:'synthetic',pass:'local-only'},tls:{ca:options.untrusted?undefined:options.ca,rejectUnauthorized:true,minVersion:'TLSv1.2'},logger:false,logRaw:false,disableAutoIdle:true,disableCompression:true,maxLiteralSize:32768,maxLineLength:131072,maxResponseSize:1048576,connectionTimeout:1500,greetingTimeout:1500,socketTimeout:1500});
 let error=null;client.on('error',err=>{error=err;});
 const deadline=setTimeout(()=>client.close(),options.deadline||1800);
 try{
  await client.connect();const mailbox=await client.mailboxOpen('INBOX',{readOnly:true});
  if(mailbox.uidValidity!==7n)return {status:'reset',uidValidity:String(mailbox.uidValidity)};
  const horizon=Number(mailbox.uidNext)-1;if(!Number.isSafeInteger(horizon)||horizon<1||horizon>100)throw new Error('range');
  const messages=[],seen=new Set();
  for await(const message of client.fetch('1:'+horizon,{uid:true,bodyParts:[{key:'1.MIME',start:0,maxLength:8192},{key:'1',start:0,maxLength:32768}]},{uid:true})){
   if(!Number.isSafeInteger(message.uid)||message.uid<1||message.uid>horizon||seen.has(message.uid))throw new Error('UID guard');
   seen.add(message.uid);const metadata=message.bodyParts?.get('1.mime')||message.bodyParts?.get('1.MIME');if(!metadata||metadata.length>8192||!/^Content-Type: text\/plain\r?$/mi.test(metadata.toString()))throw new Error('metadata held');const body=message.bodyParts?.get('1');if(body?.length>32768)throw new Error('body limit');messages.push({uid:message.uid,bytes:body?.length||0});
  }
  await client.logout();return {status:'complete',uidValidity:'7',horizon,messages,received:client.stats().received};
 }catch(err){return {status:'rejected',code:error?.code||err.code||'guard'};}
 finally{clearTimeout(deadline);client.close();}
}
if(process.env.N7_CHILD==='imap'){
 const options=JSON.parse(process.env.N7_OPTIONS);options.ca=readFileSync(options.caPath);
 const baseline=process.memoryUsage();let peak={...baseline};const sample=()=>{const m=process.memoryUsage();for(const k of Object.keys(m))peak[k]=Math.max(peak[k],m[k]);};const timer=setInterval(sample,5);
 const result=await receive(options);sample();clearInterval(timer);process.send?.({result,baseline,peak});process.disconnect?.();
}
