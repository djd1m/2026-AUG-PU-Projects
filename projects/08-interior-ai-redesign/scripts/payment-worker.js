import { createPayments } from '../web/payments.js';
// One outstanding create at a time; durable leases coordinate separate processes.
export function startPaymentWorker(pool,config) {
  if(!['live','fixture'].includes(config.providerMode))return ()=>{};
  const payments=createPayments(pool,config);let stopped=false,timer;
  async function pass() {
    try {await payments.runOne();}catch {console.error('payment_worker_retry_pending');}
    if(!stopped){timer=setTimeout(pass,1000);timer.unref();}
  }
  timer=setTimeout(pass,1000);timer.unref();
  return ()=>{stopped=true;clearTimeout(timer);};
}
