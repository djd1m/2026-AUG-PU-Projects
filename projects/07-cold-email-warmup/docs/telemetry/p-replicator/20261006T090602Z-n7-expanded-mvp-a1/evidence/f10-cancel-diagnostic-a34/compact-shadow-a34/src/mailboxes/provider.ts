// Narrow adaptation of N3 yookassa.mjs typed error/deadline boundary; no provider text.
import { HttpError } from '../errors.js';
import { deadline, resolveEndpoint, type PinnedEndpoint, type Resolver } from './network.js';
export interface Credentials { smtpUsername:string; smtpPassword:string; imapUsername:string; imapPassword:string }
export interface ConnectionSettings { smtpHost:string; smtpPort:465|587; imapHost:string; imapPort:993 }
export interface TestAdapter {
  readonly mode:'local_test';
  // Contract: connect only endpoint.address, validate TLS endpoint.servername;
  // SMTP587 requires STARTTLS before auth, no plaintext fallback, never DATA/send.
  connect(protocol:'smtp'|'imap', endpoint:PinnedEndpoint, credentials:Credentials, signal:AbortSignal):Promise<void>;
}
export const localTestAdapter: TestAdapter = {mode:'local_test',async connect(_protocol,_endpoint,_credentials,signal) {
  if(signal.aborted) throw new Error(); // Local contract fixture, no socket or provider observation.
}};
export async function verifyTest(settings:ConnectionSettings, credentials:Credentials, allowlist:ReadonlyMap<string,number>, adapter:TestAdapter, resolver?:Resolver) {
  if(adapter.mode!=='local_test') throw new HttpError(503,'live_provider_disabled');
  for(const protocol of ['smtp','imap'] as const) {
    try {
      await deadline(30000,async signal=>{
        // Resolve again on every connection; never reuse save-time addresses.
        const endpoint=await resolveEndpoint(protocol==='smtp'?settings.smtpHost:settings.imapHost,protocol==='smtp'?settings.smtpPort:settings.imapPort,allowlist,resolver);
        await deadline(10000,connectSignal=>adapter.connect(protocol,endpoint,credentials,AbortSignal.any([signal,connectSignal])));
      });
    } catch(error) {
      if(error instanceof HttpError && ['host_denied','unsafe_address','dns_unavailable','provider_timeout'].includes(error.code)) throw error;
      throw new HttpError(503,'provider_failed');
    }
  }
  return 'verified_test' as const;
}
