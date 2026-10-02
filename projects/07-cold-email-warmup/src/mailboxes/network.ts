import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError } from '../errors.js';
export type Resolver = (host: string) => Promise<readonly {address:string; family:number}[]>;
export const publicResolver: Resolver = host => lookup(host,{all:true,verbatim:true});
export function normalizeHost(value: unknown): string {
  if (typeof value !== 'string' || value.length > 253) throw new HttpError(400,'invalid_host');
  const host = value.toLowerCase().replace(/\.$/,'');
  if (isIP(host) || !host.includes('.') || !host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new HttpError(400,'invalid_host');
  return host;
}
export function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number) as [number,number,number,number];
    return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0 || (b===88 && c===99) || (b===2 && c===0))) || (a===198 && (b===18 || b===19 || (b===51 && c===100))) || (a===203 && b===0 && c===113));
  }
  if (isIP(address) !== 6 || address.includes('.')) return false;
  const [left='',right=''] = address.toLowerCase().split('::');
  const lhs = left ? left.split(':') : []; const rhs = right ? right.split(':') : [];
  const groups = address.includes('::') ? [...lhs,...Array<string>(8-lhs.length-rhs.length).fill('0'),...rhs] : lhs;
  const [a,b] = groups.map(g=>Number.parseInt(g,16)) as [number,number];
  // Only global unicast; exclude IETF assignments, 6to4 and documentation.
  return a>=0x2000 && a<=0x3fff && !(a===0x2001 && (b<=0x1ff || b===0xdb8)) && a!==0x2002 && a!==0x3fff;
}
export async function deadline<T>(milliseconds: number, operation: (signal: AbortSignal)=>Promise<T>): Promise<T> {
  const controller = new AbortController(); let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([operation(controller.signal),new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(new HttpError(503,'provider_timeout'));},milliseconds);
    })]);
  } finally { if(timer) clearTimeout(timer); controller.abort(); }
}
export interface PinnedEndpoint { host:string; address:string; family:4|6; port:number; servername:string; rejectUnauthorized:true; requiredTLS:true; connectTimeoutMs:number }
export async function resolveEndpoint(host: string, port: number, allowlist: ReadonlyMap<string,number>, resolver: Resolver = publicResolver): Promise<PinnedEndpoint> {
  host=normalizeHost(host);
  if (!allowlist.has(host)) throw new HttpError(400,'host_denied');
  let addresses: Awaited<ReturnType<Resolver>>;
  try { addresses=await deadline(10000,()=>resolver(host)); } catch { throw new HttpError(503,'dns_unavailable'); }
  if (!addresses.length || addresses.length>32 || addresses.some(a=>!isPublicIp(a.address) || isIP(a.address)!==a.family)) throw new HttpError(400,'unsafe_address');
  const selected=addresses[0]!;
  return {host,address:selected.address,family:selected.family as 4|6,port,servername:host,rejectUnauthorized:true,requiredTLS:true,connectTimeoutMs:10000};
}
