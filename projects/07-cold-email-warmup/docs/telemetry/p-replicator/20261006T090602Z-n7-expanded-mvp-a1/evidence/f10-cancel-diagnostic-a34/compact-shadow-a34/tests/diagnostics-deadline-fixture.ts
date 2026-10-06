import { createServer, Socket, type Server } from 'node:net';
import { fixtureChannel, type Channel, type ChannelFactory, type Budget } from '../src/mailboxes/diagnostic-channel.js';
import { certificates,protocolFixture } from './diagnostics-fixture.js';
export function observed(factory:ChannelFactory){const channels:Channel[]=[];const budgets:Budget[]=[];return {channels,budgets,connector:(budget:Budget)=>{budgets.push(budget);const c=factory(budget);channels.push(c);return c;}};}
export async function blockedFixture(phase:'dns'|'connect'|'tls'|'greeting'|'auth'|'trickle'){
 const certificate=certificates();let release:()=>void=()=>{};let reached:()=>void=()=>{};const started=new Promise<void>(r=>{reached=r;});const barrier=new Promise<void>(r=>{release=r;});
 let server:Server|undefined;const peers=new Set<Socket>();const intervals=new Set<NodeJS.Timeout>();
 let fixture:Awaited<ReturnType<typeof protocolFixture>>|undefined;
 if(phase==='greeting'||phase==='auth'||phase==='trickle')fixture=await protocolFixture({stall:phase==='greeting',onReady:phase==='greeting'?reached:undefined,holdAuth:phase==='auth'?async()=>{reached();await barrier;}:undefined});
 if(phase==='tls'){server=createServer(socket=>{peers.add(socket);reached();socket.on('error',()=>{});socket.on('close',()=>peers.delete(socket));});await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));}
 if(phase==='trickle'){
  // A real verified TLS peer emits incomplete greeting bytes slowly; no inactivity shortcut.
  await fixture!.close();const {createServer:tlsServer}=await import('node:tls');server=tlsServer(certificate,socket=>{peers.add(socket);reached();const timer=setInterval(()=>socket.write('2'),200);intervals.add(timer);socket.on('error',()=>{});socket.on('close',()=>{clearInterval(timer);intervals.delete(timer);peers.delete(socket);});});await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));fixture=undefined;
 }
 const address=()=>({address:'127.0.0.1',port:(server!.address() as {port:number}).port});
 let connector:ChannelFactory;
 if(phase==='greeting'||phase==='auth')connector=fixture!.connector;
 else connector=fixtureChannel({ca:certificate.cert,resolver:async()=>{if(phase==='dns'){reached();await barrier;}return [{address:'8.8.8.8',family:4}];},dial:()=>phase==='connect'?{address:'127.0.0.1',port:1}:address(),...(phase==='connect'?{connectSocket:()=>{reached();return new Socket();}}:{})});
 const monitor=observed(connector);
 return {...monitor,started,release,async close(){release();for(const timer of intervals)clearInterval(timer);for(const peer of peers)peer.destroy();if(server)await new Promise<void>(r=>server!.close(()=>r()));await fixture?.close();}};
}
